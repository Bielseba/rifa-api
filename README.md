# Melhorando Clássicos – API (Node.js + Express + Neon/Postgres)

Conforme a doc do front: auth via CPF (JWT), campanhas, tickets, compras com reserva, webhook de pagamento e winners.

## Rodando
```bash
cp .env.example .env
npm i
npm run dev
# http://localhost:4000/api/health
```

## Banco (Neon)
Execute `sql/neon_ddl.sql`. Depois:
```sql
INSERT INTO campaigns(title, description, image_url, status, draw_date, ticket_price, total_tickets)
VALUES ('PASSAT VARIANT TSI B7','Descrição...','https://picsum.photos/seed/passat/1200/800','active', NOW() + INTERVAL '7 days', 0.07, 1000)
RETURNING id;
SELECT generate_tickets(<id>);
```

## Endpoints (principais)
- POST `/api/auth/login-register`
- GET `/api/campaigns?status=active`
- GET `/api/campaigns/:id`
- GET `/api/campaigns/:id/unavailable-tickets`
- GET `/api/user/profile` (JWT)
- GET `/api/user/my-titles` (JWT)
- POST `/api/purchases` (JWT)
- POST `/api/webhooks/payment-status`
- GET `/api/winners`