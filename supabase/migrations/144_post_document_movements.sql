-- 144: складська частина проведення документа — ОДНІЄЮ транзакцією (аудит 31.10.2026, C1).
--
-- Було (lib/accounting/documents.ts buildMovements): на кожен рядок окремий
-- REST-виклик consume_stock_fifo / create_stock_batch (кожен — своя транзакція),
-- а рухи вставлялись одним insert ПІСЛЯ циклу. Збій на рядку №2 залишав партії
-- рядка №1 списаними без рухів, і повторне проведення (рухів же нема) списувало
-- їх удруге. До того ж помилку consume_stock_fifo код не перевіряв: при нестачі
-- партій рух писався із собівартістю 0.
--
-- Тепер уся складська частина — ця функція: партії FIFO, нові партії й рухи
-- документа або записуються всі, або (будь-яка помилка, нестача партій,
-- закритий період, CHECK залишку) не записується нічого. Логіка по напрямках —
-- дослівний перенос buildMovements. Гроші (record_money_txn) лишаються в коді:
-- вони ідемпотентні за ключами й повторюються безпечно.
--
-- Повертає FIFO-собівартість розходу (direction = 'out', qty > 0) — як
-- totalFifoCost у старому коді; для вже проведених рухів — Σ batch_cost < 0.

create or replace function public.post_document_movements(p_doc_id uuid, p_direction text)
returns numeric
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_doc        record;
  v_line       record;
  v_qty        numeric;
  v_abs        numeric;
  v_wh         integer;
  v_cost       numeric;
  v_unit       numeric;
  v_fifo_total numeric := 0;
  v_received   timestamptz;
begin
  if p_direction not in ('in', 'out', 'transfer', 'inventory') then
    raise exception 'post_document_movements: невідомий напрямок %', p_direction;
  end if;

  -- Два паралельні проведення одного документа: другий чекає й бачить рухи першого
  perform pg_advisory_xact_lock(hashtext('post_document_movements:' || p_doc_id::text));

  if exists (select 1 from stock_movements where document_id = p_doc_id) then
    return coalesce((select sum(batch_cost) from stock_movements
                     where document_id = p_doc_id and qty < 0), 0);
  end if;

  select id, doc_type, order_id, supplier_id, warehouse_id, warehouse_to_id, doc_date
    into v_doc from acc_documents where id = p_doc_id;
  if not found then raise exception 'Документ % не знайдено', p_doc_id; end if;
  v_received := coalesce(v_doc.doc_date, now());

  for v_line in
    select id, sku, qty, qty_in_base, uom_factor, fulfillment_type, warehouse_id,
           price, cost_price, supplier_id
      from acc_document_lines
     where document_id = p_doc_id
     order by sort_order, id
  loop
    if v_line.fulfillment_type = 'dropship' then continue; end if;
    v_qty := coalesce(v_line.qty_in_base, v_line.qty * coalesce(v_line.uom_factor, 1));
    if v_qty = 0 then continue; end if;
    v_wh  := coalesce(v_line.warehouse_id, v_doc.warehouse_id);
    v_abs := abs(v_qty);

    if p_direction = 'in' then
      if v_qty > 0 then
        insert into stock_movements (document_id, document_line_id, doc_type, warehouse_id, sku, qty, cost_price, sale_price, order_id, supplier_id)
        values (p_doc_id, v_line.id, v_doc.doc_type, v_wh, v_line.sku, v_qty, v_line.cost_price, null, v_doc.order_id, v_doc.supplier_id);
        perform create_stock_batch(v_line.sku, v_wh, v_qty, coalesce(v_line.cost_price, 0), v_received,
                                   coalesce(v_doc.supplier_id, v_line.supplier_id), p_doc_id);
      else
        v_cost := consume_stock_fifo(v_line.sku, v_wh, v_abs);
        insert into stock_movements (document_id, document_line_id, doc_type, warehouse_id, sku, qty, cost_price, sale_price, order_id, supplier_id, batch_cost)
        values (p_doc_id, v_line.id, v_doc.doc_type, v_wh, v_line.sku, -v_abs, v_cost / v_abs, null, v_doc.order_id, v_doc.supplier_id, v_cost);
      end if;

    elsif p_direction = 'out' then
      if v_qty > 0 then
        v_cost := consume_stock_fifo(v_line.sku, v_wh, v_qty);
        insert into stock_movements (document_id, document_line_id, doc_type, warehouse_id, sku, qty, cost_price, sale_price, order_id, supplier_id, batch_cost)
        values (p_doc_id, v_line.id, v_doc.doc_type, v_wh, v_line.sku, -v_qty, v_cost / v_qty, v_line.price, v_doc.order_id, v_doc.supplier_id, v_cost);
        v_fifo_total := v_fifo_total + v_cost;
      else
        v_unit := coalesce(v_line.cost_price, 0);
        perform create_stock_batch(v_line.sku, v_wh, v_abs, v_unit, v_received, v_doc.supplier_id, p_doc_id);
        insert into stock_movements (document_id, document_line_id, doc_type, warehouse_id, sku, qty, cost_price, sale_price, order_id, supplier_id, batch_cost)
        values (p_doc_id, v_line.id, v_doc.doc_type, v_wh, v_line.sku, v_abs, v_unit, null, v_doc.order_id, v_doc.supplier_id, null);
      end if;

    elsif p_direction = 'transfer' then
      if v_doc.warehouse_to_id is null then
        raise exception 'Переміщення % без складу-отримувача', p_doc_id;
      end if;
      if v_qty > 0 then
        v_cost := consume_stock_fifo(v_line.sku, v_doc.warehouse_id, v_abs);
        v_unit := v_cost / v_abs;
        insert into stock_movements (document_id, document_line_id, doc_type, warehouse_id, sku, qty, cost_price, sale_price, order_id, supplier_id)
        values (p_doc_id, v_line.id, v_doc.doc_type, v_doc.warehouse_id,    v_line.sku, -v_abs, v_unit, null, v_doc.order_id, v_doc.supplier_id),
               (p_doc_id, v_line.id, v_doc.doc_type, v_doc.warehouse_to_id, v_line.sku,  v_abs, v_unit, null, v_doc.order_id, v_doc.supplier_id);
        perform create_stock_batch(v_line.sku, v_doc.warehouse_to_id, v_abs, v_unit, v_received, null, p_doc_id);
      else
        v_cost := consume_stock_fifo(v_line.sku, v_doc.warehouse_to_id, v_abs);
        v_unit := v_cost / v_abs;
        insert into stock_movements (document_id, document_line_id, doc_type, warehouse_id, sku, qty, cost_price, sale_price, order_id, supplier_id)
        values (p_doc_id, v_line.id, v_doc.doc_type, v_doc.warehouse_id,    v_line.sku,  v_abs, v_unit, null, v_doc.order_id, v_doc.supplier_id),
               (p_doc_id, v_line.id, v_doc.doc_type, v_doc.warehouse_to_id, v_line.sku, -v_abs, v_unit, null, v_doc.order_id, v_doc.supplier_id);
        perform create_stock_batch(v_line.sku, v_doc.warehouse_id, v_abs, v_unit, v_received, null, p_doc_id);
      end if;

    else -- inventory
      if v_qty < 0 then
        v_cost := consume_stock_fifo(v_line.sku, v_wh, v_abs);
        insert into stock_movements (document_id, document_line_id, doc_type, warehouse_id, sku, qty, cost_price, sale_price, order_id, supplier_id, batch_cost)
        values (p_doc_id, v_line.id, v_doc.doc_type, v_wh, v_line.sku, -v_abs, v_line.cost_price, null, v_doc.order_id, v_doc.supplier_id, v_cost);
      else
        insert into stock_movements (document_id, document_line_id, doc_type, warehouse_id, sku, qty, cost_price, sale_price, order_id, supplier_id)
        values (p_doc_id, v_line.id, v_doc.doc_type, v_wh, v_line.sku, v_qty, v_line.cost_price, null, v_doc.order_id, v_doc.supplier_id);
        perform create_stock_batch(v_line.sku, v_wh, v_qty, coalesce(v_line.cost_price, 0), v_received, null, p_doc_id);
      end if;
    end if;
  end loop;

  return v_fifo_total;
end;
$$;

grant  execute on function public.post_document_movements(uuid, text) to service_role;
revoke execute on function public.post_document_movements(uuid, text) from public, anon, authenticated;
