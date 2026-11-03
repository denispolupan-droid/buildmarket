-- 156: constraints — вирівнювання тестової бази з продом (schema-parity тепер
-- порівнює й constraints). Джерело правди — прод: 16 відсутніх у тесті
-- (FK, CHECK, UNIQUE, застосовані в проді без міграцій), 4 з іншим
-- визначенням, 3 лише в тесті (ручні/застарілі). Усе ідемпотентно: на
-- проді нічого не змінює.

-- відсутні в тесті
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acc_document_lines_po_line_id_fkey' AND conrelid = 'acc_document_lines'::regclass) THEN
    ALTER TABLE acc_document_lines ADD CONSTRAINT acc_document_lines_po_line_id_fkey FOREIGN KEY (po_line_id) REFERENCES acc_document_lines(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acc_document_lines_qty_nonzero' AND conrelid = 'acc_document_lines'::regclass) THEN
    ALTER TABLE acc_document_lines ADD CONSTRAINT acc_document_lines_qty_nonzero CHECK ((qty <> (0)::numeric));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acc_documents_landed_cost_method_check' AND conrelid = 'acc_documents'::regclass) THEN
    ALTER TABLE acc_documents ADD CONSTRAINT acc_documents_landed_cost_method_check CHECK ((landed_cost_method = ANY (ARRAY['by_cost'::text, 'by_qty'::text, 'equal'::text])));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acc_documents_po_status_check' AND conrelid = 'acc_documents'::regclass) THEN
    ALTER TABLE acc_documents ADD CONSTRAINT acc_documents_po_status_check CHECK ((po_status = ANY (ARRAY['draft'::text, 'sent'::text, 'confirmed_by_supplier'::text, 'partially_received'::text, 'received'::text, 'closed'::text, 'cancelled'::text])));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'categories_parent_slug_fkey' AND conrelid = 'categories'::regclass) THEN
    ALTER TABLE categories ADD CONSTRAINT categories_parent_slug_fkey FOREIGN KEY (parent_slug) REFERENCES categories(slug);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_amount_check' AND conrelid = 'expenses'::regclass) THEN
    ALTER TABLE expenses ADD CONSTRAINT expenses_amount_check CHECK ((amount > (0)::numeric));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'landed_cost_lines_amount_check' AND conrelid = 'landed_cost_lines'::regclass) THEN
    ALTER TABLE landed_cost_lines ADD CONSTRAINT landed_cost_lines_amount_check CHECK ((amount > (0)::numeric));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'landed_cost_lines_cost_type_check' AND conrelid = 'landed_cost_lines'::regclass) THEN
    ALTER TABLE landed_cost_lines ADD CONSTRAINT landed_cost_lines_cost_type_check CHECK ((cost_type = ANY (ARRAY['delivery'::text, 'loading'::text, 'customs'::text, 'packaging'::text, 'broker'::text, 'other'::text])));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_reviews_rating_check' AND conrelid = 'product_reviews'::regclass) THEN
    ALTER TABLE product_reviews ADD CONSTRAINT product_reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'search_queries_user_id_fkey' AND conrelid = 'search_queries'::regclass) THEN
    ALTER TABLE search_queries ADD CONSTRAINT search_queries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_qty_reserved_nonneg' AND conrelid = 'stock_balance'::regclass) THEN
    ALTER TABLE stock_balance ADD CONSTRAINT chk_qty_reserved_nonneg CHECK ((qty_reserved >= (0)::numeric));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_qty_total_nonneg' AND conrelid = 'stock_balance'::regclass) THEN
    ALTER TABLE stock_balance ADD CONSTRAINT chk_qty_total_nonneg CHECK ((qty_total >= (0)::numeric));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_reserved_lte_total' AND conrelid = 'stock_balance'::regclass) THEN
    ALTER TABLE stock_balance ADD CONSTRAINT chk_reserved_lte_total CHECK ((qty_reserved <= qty_total));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_notifications_sku_email_key' AND conrelid = 'stock_notifications'::regclass) THEN
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'stock_notifications_sku_email_key') THEN
      ALTER TABLE stock_notifications ADD CONSTRAINT stock_notifications_sku_email_key UNIQUE USING INDEX stock_notifications_sku_email_key;
    ELSE
      ALTER TABLE stock_notifications ADD CONSTRAINT stock_notifications_sku_email_key UNIQUE (sku, email);
    END IF;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wishlists_user_id_fkey' AND conrelid = 'wishlists'::regclass) THEN
    ALTER TABLE wishlists ADD CONSTRAINT wishlists_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wishlists_user_id_product_sku_key' AND conrelid = 'wishlists'::regclass) THEN
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'wishlists_user_id_product_sku_key') THEN
      ALTER TABLE wishlists ADD CONSTRAINT wishlists_user_id_product_sku_key UNIQUE USING INDEX wishlists_user_id_product_sku_key;
    ELSE
      ALTER TABLE wishlists ADD CONSTRAINT wishlists_user_id_product_sku_key UNIQUE (user_id, product_sku);
    END IF;
  END IF;
END $$;

-- Тестова база мала склад із warehouse_type = 'own' (поза списком 008; у проді
-- таких рядків немає) — зводимо до 'physical', інакше CHECK не стане.
UPDATE warehouses SET warehouse_type = 'physical' WHERE warehouse_type = 'own';

-- інше визначення: перестворюємо як у проді (лише якщо відрізняється)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname = 'acc_documents_parent_doc_id_fkey' AND c.conrelid = 'acc_documents'::regclass AND pg_get_constraintdef(c.oid) <> $def$FOREIGN KEY (parent_doc_id) REFERENCES acc_documents(id) ON DELETE SET NULL$def$) THEN
    ALTER TABLE acc_documents DROP CONSTRAINT acc_documents_parent_doc_id_fkey;
    ALTER TABLE acc_documents ADD CONSTRAINT acc_documents_parent_doc_id_fkey FOREIGN KEY (parent_doc_id) REFERENCES acc_documents(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname = 'acc_documents_procurement_status_check' AND c.conrelid = 'acc_documents'::regclass AND pg_get_constraintdef(c.oid) <> $def$CHECK (((procurement_status IS NULL) OR (procurement_status = ANY (ARRAY['draft'::text, 'ordered'::text, 'sent'::text, 'confirmed_by_supplier'::text, 'partially_received'::text, 'received'::text, 'invoiced'::text, 'paid'::text, 'cancelled'::text, 'closed'::text]))))$def$) THEN
    ALTER TABLE acc_documents DROP CONSTRAINT acc_documents_procurement_status_check;
    ALTER TABLE acc_documents ADD CONSTRAINT acc_documents_procurement_status_check CHECK (((procurement_status IS NULL) OR (procurement_status = ANY (ARRAY['draft'::text, 'ordered'::text, 'sent'::text, 'confirmed_by_supplier'::text, 'partially_received'::text, 'received'::text, 'invoiced'::text, 'paid'::text, 'cancelled'::text, 'closed'::text]))));
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname = 'orders_user_id_fkey' AND c.conrelid = 'orders'::regclass AND pg_get_constraintdef(c.oid) <> $def$FOREIGN KEY (user_id) REFERENCES auth.users(id)$def$) THEN
    ALTER TABLE orders DROP CONSTRAINT orders_user_id_fkey;
    ALTER TABLE orders ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname = 'warehouses_warehouse_type_check' AND c.conrelid = 'warehouses'::regclass AND pg_get_constraintdef(c.oid) <> $def$CHECK ((warehouse_type = ANY (ARRAY['physical'::text, 'supplier'::text, 'transit'::text])))$def$) THEN
    ALTER TABLE warehouses DROP CONSTRAINT warehouses_warehouse_type_check;
    ALTER TABLE warehouses ADD CONSTRAINT warehouses_warehouse_type_check CHECK ((warehouse_type = ANY (ARRAY['physical'::text, 'supplier'::text, 'transit'::text])));
  END IF;
END $$;

-- лише в тесті (у проді їх немає; acc_document_lines_qty_check, stock_notifications_sku_fkey, wishlists_product_sku_fkey)
ALTER TABLE acc_document_lines DROP CONSTRAINT IF EXISTS acc_document_lines_qty_check;
ALTER TABLE stock_notifications DROP CONSTRAINT IF EXISTS stock_notifications_sku_fkey;
ALTER TABLE wishlists DROP CONSTRAINT IF EXISTS wishlists_product_sku_fkey;
