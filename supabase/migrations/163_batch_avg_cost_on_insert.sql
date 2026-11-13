-- 163: середня собівартість складу після приходу (13.11.2026).
--
-- post_document_movements (144) для напрямку 'in' спершу пише рух
-- (trg на stock_movements → fn_recalc_avg_cost по партіях), а партію створює
-- ПІСЛЯ — і нової партії в перерахунку ще немає. Тригер на stock_batches (035)
-- реагував лише на UPDATE remaining_qty/cost_price, не на INSERT. Підсумок:
-- avg_cost = 0 для SKU без попередніх партій (або без нової партії — для решти),
-- а роут приходу копіює avg_cost у product_stock.price_cost → собівартість 0
-- у прогнозі прибутку (ПН-2026-0013, 2004-002: партія 626 ₴, avg_cost 0).
-- Факт COGS не зачеплено: списання йде FIFO з партій.

DROP TRIGGER IF EXISTS trg_batch_avg_cost_sync ON stock_batches;
CREATE TRIGGER trg_batch_avg_cost_sync
  AFTER INSERT OR UPDATE OF remaining_qty, cost_price ON stock_batches
  FOR EACH ROW EXECUTE FUNCTION fn_batch_avg_cost_sync();

-- Разовий перерахунок усіх залишків із партій
UPDATE stock_balance sb
SET    avg_cost   = fn_recalc_avg_cost(sb.sku, sb.warehouse_id),
       updated_at = NOW()
WHERE  sb.avg_cost IS DISTINCT FROM fn_recalc_avg_cost(sb.sku, sb.warehouse_id);

-- Закупівельна в картці, обнулена роутом приходу: беремо середню з партій
-- (лише де вона зараз 0, а на власному складі є залишок із ціною)
UPDATE product_stock ps
SET    price_cost = ROUND(b.avg_cost, 2),
       updated_at = NOW()
FROM  (SELECT sku, SUM(avg_cost * qty_total) / NULLIF(SUM(qty_total), 0) AS avg_cost
       FROM stock_balance
       WHERE qty_total > 0 AND avg_cost > 0
       GROUP BY sku) b
WHERE  ps.sku = b.sku
  AND  COALESCE(ps.price_cost, 0) = 0;
