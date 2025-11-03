// src/routes/purchases.routes.js
import { Router } from 'express';
import dayjs from 'dayjs';
import { pool, withTx } from '../db.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();
const RES_MIN = parseInt(process.env.RESERVATION_MINUTES || '10', 10);

// POST /purchases  -> reserva números e cria o pedido "pending"
router.post('/', authRequired, async (req, res, next) => {
  try {
    const { campaignId, selectedNumbers } = req.body;

    // validações básicas
    if (!campaignId || !Array.isArray(selectedNumbers) || selectedNumbers.length === 0) {
      return res.status(400).json({ error: 'campaignId and selectedNumbers required' });
    }

    // normaliza números para "001", "002", ...
    const normalized = [...new Set(selectedNumbers.map((s) => String(s).padStart(3, '0')))];
    if (normalized.length === 0) {
      return res.status(400).json({ error: 'no valid numbers' });
    }

    const result = await withTx(async (client) => {
      // expira reservas vencidas antes de tentar reservar
      await client.query('SELECT expire_ticket_reservations()');

      // valida campanha
      const cmp = await client.query(
        'SELECT id, ticket_price FROM campaigns WHERE id = $1',
        [campaignId]
      );
      if (!cmp.rowCount) throw new Error('campaign not found');

      const reservedUntil = dayjs().add(RES_MIN, 'minute').toISOString();

      // tenta reservar números disponíveis (atômico)
      const upd = await client.query(
        `UPDATE tickets
           SET status = 'reserved', reserved_until = $3
         WHERE campaign_id = $1
           AND ticket_number = ANY($2)
           AND status = 'available'
         RETURNING id, ticket_number`,
        [campaignId, normalized, reservedUntil]
      );

      // se não conseguiu todos, falha a operação (rollback)
      if (upd.rowCount !== normalized.length) {
        throw new Error('some numbers unavailable');
      }

      // cria purchase pending
      const price = Number(cmp.rows[0].ticket_price);
      const subtotal = price * normalized.length;

      const ins = await client.query(
        `INSERT INTO purchases (user_id, campaign_id, total_amount, status)
         VALUES ($1, $2, $3, 'pending')
         RETURNING *`,
        [req.user.id, campaignId, subtotal]
      );
      const purchase = ins.rows[0];

      // vincula tickets à purchase
      for (const tk of upd.rows) {
        await client.query(
          'INSERT INTO purchased_tickets (purchase_id, ticket_id) VALUES ($1, $2)',
          [purchase.id, tk.id]
        );
      }

      // placeholders de pagamento — troque pelo seu gateway real
      const paymentUrl = `https://pay.example/checkout/${purchase.id}`;
      const qrCodeData = `PAYMENT|PURCHASE:${purchase.id}|AMOUNT:${subtotal.toFixed(2)}`;

      return {
        purchaseId: purchase.id,
        paymentUrl,
        qrCodeData,
        reservedUntil,
        numbers: upd.rows.map((r) => r.ticket_number),
        subtotal
      };
    });

    return res.status(201).json(result);
  } catch (e) {
    // log mínimo pra debugar em produção (Vercel)
    console.error('[PURCHASE_POST_ERROR]', e);
    // mensagens mais amigáveis
    if (e.message === 'campaign not found') {
      return res.status(404).json({ error: 'campaign not found' });
    }
    if (e.message === 'some numbers unavailable') {
      return res.status(409).json({ error: 'some numbers unavailable' });
    }
    return next(e);
  }
});

export default router;
