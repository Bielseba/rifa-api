import { Router } from 'express';
import dayjs from 'dayjs';
import { pool, withTx } from '../db.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();

function isUUID(v) {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

router.post('/', authRequired, async (req, res, next) => {
  try {
    const { campaignId, selectedNumbers } = req.body;

    if (!campaignId || !Array.isArray(selectedNumbers) || selectedNumbers.length === 0) {
      return res.status(400).json({ error: 'campaignId and selectedNumbers required' });
    }

    const result = await withTx(async (client) => {
      try { await client.query('SELECT public.expire_ticket_reservations()'); } catch {}

      const cmp = await client.query(
        'SELECT id, ticket_price FROM public.campaigns WHERE id = $1',
        [campaignId]
      );
      if (!cmp.rowCount) throw new Error('campaign not found');

      const digitsQ = await client.query(
        `SELECT COALESCE(MAX(LENGTH(ticket_number)),3) AS digits
           FROM public.tickets WHERE campaign_id = $1`,
        [campaignId]
      );
      const digits = Number(digitsQ.rows[0]?.digits || 3);

      const normalized = [...new Set(
        selectedNumbers
          .map((s) => String(s).replace(/\D+/g, ''))
          .filter((s) => s !== '')
          .map((s) => s.padStart(digits, '0'))
      )];

      if (normalized.length === 0) {
        return { error: 'no valid numbers' };
      }

      const foundAvail = await client.query(
        `
        SELECT id, ticket_number
          FROM public.tickets
         WHERE campaign_id = $1
           AND ticket_number = ANY($2)
           AND status = 'available'
         FOR UPDATE SKIP LOCKED
        `,
        [campaignId, normalized]
      );

      if (foundAvail.rowCount !== normalized.length) {
        const check = await client.query(
          `
          SELECT ticket_number, status, reserved_until
            FROM public.tickets
           WHERE campaign_id = $1
             AND ticket_number = ANY($2)
           ORDER BY LPAD(ticket_number, 12, '0')
          `,
          [campaignId, normalized]
        );

        const presentSet = new Set(check.rows.map(r => r.ticket_number));
        const notFound = normalized.filter(n => !presentSet.has(n));
        const sold = check.rows.filter(r => r.status === 'sold').map(r => r.ticket_number);
        const reserved = check.rows.filter(r => r.status === 'reserved').map(r => r.ticket_number);

        return {
          conflict: true,
          message: 'some numbers unavailable',
          requested: normalized,
          unavailable: [...sold, ...reserved, ...notFound],
          reasons: { sold, reserved, notFound }
        };
      }

      const ids = foundAvail.rows.map(r => r.id);

      await client.query(
        `UPDATE public.tickets
            SET status = 'sold', reserved_until = NULL
          WHERE id = ANY($1)`,
        [ids]
      );

      const price = Number(cmp.rows[0].ticket_price);
      const subtotal = price * ids.length;

      const ins = await client.query(
        `INSERT INTO public.purchases (user_id, campaign_id, total_amount, status)
         VALUES ($1, $2, $3, 'completed')
         RETURNING *`,
        [req.user.id, campaignId, subtotal]
      );
      const purchase = ins.rows[0];

      for (const tk of ids) {
        await client.query(
          'INSERT INTO public.purchased_tickets (purchase_id, ticket_id) VALUES ($1, $2)',
          [purchase.id, tk]
        );
      }

      let grantedSpins = 0;
      const userId = req.user.id;
      if (isUUID(userId)) {
        const g = await client.query(
          `SELECT public.roulette_grant_spins_threshold($1::uuid,$2::int) AS granted`,
          [String(userId), purchase.id]
        );
        grantedSpins = parseInt(g.rows[0]?.granted || 0, 10);
      } else {
        const g = await client.query(
          `SELECT public.roulette_grant_spins_threshold($1::int,$2::int) AS granted`,
          [Number(userId), purchase.id]
        );
        grantedSpins = parseInt(g.rows[0]?.granted || 0, 10);
      }

      return {
        message: 'purchase completed successfully',
        purchaseId: purchase.id,
        numbers: foundAvail.rows.map((r) => r.ticket_number),
        total: subtotal,
        unitPrice: price,
        digits,
        roulette: grantedSpins > 0 ? { granted_spins: grantedSpins, notice: `Você ganhou ${grantedSpins} giros grátis da roleta.` } : { granted_spins: 0 }
      };
    });

    if (result?.error === 'no valid numbers') {
      return res.status(400).json({ error: 'no valid numbers' });
    }
    if (result?.conflict) {
      return res.status(409).json(result);
    }

    return res.status(201).json(result);
  } catch (e) {
    console.error('[PURCHASE_POST_ERROR]', e);
    if (e.message === 'campaign not found') {
      return res.status(404).json({ error: 'campaign not found' });
    }
    return next(e);
  }
});

export default router;
