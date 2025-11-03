CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  cpf VARCHAR(14) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campaigns (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  image_url VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  draw_date TIMESTAMP,
  ticket_price NUMERIC(10,2) NOT NULL,
  total_tickets INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tickets (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  ticket_number VARCHAR(10) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'available',
  reserved_until TIMESTAMP,
  UNIQUE (campaign_id, ticket_number)
);

CREATE TABLE IF NOT EXISTS purchases (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  total_amount NUMERIC(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  purchase_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  payment_gateway_id VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS purchased_tickets (
  id SERIAL PRIMARY KEY,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS winners (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  winning_ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE SET NULL,
  announced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tickets_campaign ON tickets(campaign_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_purchases_user ON purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_purchases_campaign ON purchases(campaign_id);

CREATE OR REPLACE FUNCTION generate_tickets(p_campaign_id INT) RETURNS VOID AS $$
DECLARE
  v_total INT;
  i INT;
BEGIN
  SELECT total_tickets INTO v_total FROM campaigns WHERE id = p_campaign_id;
  IF v_total IS NULL THEN RAISE EXCEPTION 'Campaign not found %', p_campaign_id; END IF;
  FOR i IN 1..v_total LOOP
    INSERT INTO tickets (campaign_id, ticket_number, status)
    VALUES (p_campaign_id, LPAD(i::TEXT, 3, '0'), 'available')
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION expire_ticket_reservations() RETURNS INT AS $$
DECLARE v_count INT;
BEGIN
  UPDATE tickets
  SET status = 'available', reserved_until = NULL
  WHERE status = 'reserved' AND reserved_until IS NOT NULL AND reserved_until < NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;