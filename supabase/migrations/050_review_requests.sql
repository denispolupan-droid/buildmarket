-- Автозбір відгуків (SEO: зірки AggregateRating у видачі).
-- Токен для посилання "оцініть покупку" в листі після доставки.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS review_token UUID DEFAULT gen_random_uuid();
ALTER TABLE orders ADD COLUMN IF NOT EXISTS review_request_sent_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_orders_review_token ON orders(review_token);
-- Відгук із листа = підтверджена покупка
ALTER TABLE product_reviews ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE product_reviews ADD COLUMN IF NOT EXISTS order_id UUID;
