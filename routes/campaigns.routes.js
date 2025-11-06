import { Router } from 'express';
import crypto from 'crypto';
import { pool } from '../db.js';

const router = Router();
const DRAW_SALT = process.env.DRAW_SALT || 'rifa_salt_2025';

function seedFromCampaign(id, drawDate) {
  const dateKey = drawDate ? new Date(drawDate).toISOString().slice(0, 10) : 'nodraw';
  const h = crypto.createHash('sha256').update(`${id}|${DRAW_SALT}|${dateKey}`).digest('hex');
  return parseInt(h.slice(0, 8), 16) >>> 0;
}

async function deterministicWinner(client, campaignId) {
  const cq = await client.query(`SELECT id, draw_date FROM public.campaigns WHERE id=$1`, [campaignId]);
  if (!cq.rowCount) return null;
  const drawDate = cq.rows[0].draw_date;
  const seed = seedFromCampaign(campaignId, drawDate);

  const r = await client.query(
    `
    WITH sold AS (
      SELECT
        t.id,
        t.ticket_number,
        p.user_id,
        ROW_NUMBER() OVER (ORDER BY LPAD(t.ticket_number,12,'0')) AS rn,
        COUNT(*) OVER() AS total
      FROM public.tickets t
      JOIN public.purchased_tickets pt ON pt.ticket_id = t.id
      JOIN public.purchases p ON p.id = pt.purchase_id
      WHERE t.campaign_id = $1
        AND t.status = 'sold'
        AND p.status = 'completed'
    )
    SELECT id, ticket_number, user_id, total
    FROM sold
    WHERE rn = ((($2 % GREATEST(total,1)) + 1))
    `,
    [campaignId, seed]
  );
  if (!r.rowCount) return null;
  return r.rows[0];
}

async function autoExpireAndDraw() {
  await pool.query(`
    UPDATE public.campaigns
       SET status = 'expired'
     WHERE draw_date IS NOT NULL
       AND draw_date <= now()
       AND status <> 'expired'
  `);

  const expiredNoWinner = await pool.query(`
    SELECT c.id
      FROM public.campaigns c
 LEFT JOIN public.winners w ON w.campaign_id = c.id
     WHERE c.status = 'expired'
       AND w.id IS NULL
  `);

  for (const row of expiredNoWinner.rows) {
    const cid = row.id;
    const client = await pool.connect();
    try {
      const w = await deterministicWinner(client, cid);
      if (w) {
        await client.query(
          `INSERT INTO public.winners (campaign_id, user_id, winning_ticket_id) VALUES ($1,$2,$3)`,
          [cid, w.user_id, w.id]
        );
      }
    } finally {
      client.release();
    }
  }
}

router.get('/', async (req, res, next) => {
  try {
    try { await pool.query('SELECT public.expire_ticket_reservations()'); } catch {}
    await autoExpireAndDraw();

    const { status } = req.query;
    let q = `
      SELECT c.*,
             w.id AS winner_id,
             w.user_id AS winner_user_id,
             w.winning_ticket_id,
             w.announced_at,
             u.name AS winner_name,
             t.ticket_number AS winner_ticket_number
        FROM public.campaigns c
   LEFT JOIN public.winners w ON w.campaign_id = c.id
   LEFT JOIN public.users   u ON u.id = w.user_id
   LEFT JOIN public.tickets t ON t.id = w.winning_ticket_id
    `;
    const args = [];
    if (status) {
      q += ' WHERE (c.status = $1 OR c.status = \'expired\')';
      args.push(status);
    }
    q += ' ORDER BY c.id DESC';

    const { rows } = await pool.query(q, args);

    const out = [];
    for (const c of rows) {
      const sold = await pool.query(
        "SELECT COUNT(*)::int AS n FROM public.tickets WHERE campaign_id=$1 AND status IN ('sold')",
        [c.id]
      );
      const reserved = await pool.query(
        "SELECT COUNT(*)::int AS n FROM public.tickets WHERE campaign_id=$1 AND status IN ('reserved')",
        [c.id]
      );
      const progress = Math.floor(((sold.rows[0].n + reserved.rows[0].n) / c.total_tickets) * 100);
      out.push({
        id: c.id,
        title: c.title,
        imageUrl: c.image_url,
        resultDate: c.draw_date,
        status: c.status,
        progress,
        winner: c.winner_id
          ? {
              id: c.winner_id,
              userId: c.winner_user_id,
              name: c.winner_name || null,
              ticketId: c.winning_ticket_id,
              ticketNumber: c.winner_ticket_number || null,
              announcedAt: c.announced_at
            }
          : null
      });
    }
    res.json(out);
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    try { await pool.query('SELECT public.expire_ticket_reservations()'); } catch {}
    await autoExpireAndDraw();

    const camp = await pool.query(
      `
      SELECT c.*,
             w.id AS winner_id,
             w.user_id AS winner_user_id,
             w.winning_ticket_id,
             w.announced_at,
             u.name AS winner_name,
             t.ticket_number AS winner_ticket_number
        FROM public.campaigns c
   LEFT JOIN public.winners w ON w.campaign_id = c.id
   LEFT JOIN public.users   u ON u.id = w.user_id
   LEFT JOIN public.tickets t ON t.id = w.winning_ticket_id
       WHERE c.id=$1
      `,
      [id]
    );
    if (!camp.rowCount) return res.status(404).json({ error: 'campaign not found' });
    const c = camp.rows[0];

    const sold = await pool.query(
      "SELECT COUNT(*)::int AS n FROM public.tickets WHERE campaign_id=$1 AND status IN ('sold')",
      [c.id]
    );
    const reserved = await pool.query(
      "SELECT COUNT(*)::int AS n FROM public.tickets WHERE campaign_id=$1 AND status IN ('reserved')",
      [c.id]
    );
    const progress = Math.floor(((sold.rows[0].n + reserved.rows[0].n) / c.total_tickets) * 100);

    res.json({
      id: c.id,
      title: c.title,
      imageUrl: c.image_url,
      resultDate: c.draw_date,
      status: c.status,
      pricePerTicket: Number(c.ticket_price),
      progress,
      description: c.description,
      totalTickets: c.total_tickets,
      winner: c.winner_id
        ? {
            id: c.winner_id,
            userId: c.winner_user_id,
            name: c.winner_name || null,
            ticketId: c.winning_ticket_id,
            ticketNumber: c.winner_ticket_number || null,
            announcedAt: c.announced_at
          }
        : null
    });
  } catch (e) {
    next(e);
  }
});

router.get('/:id/unavailable-tickets', async (req, res, next) => {
  try {
    const { id } = req.params;
    try { await pool.query('SELECT public.expire_ticket_reservations()'); } catch {}

    const { rows } = await pool.query(
      `
      SELECT ticket_number, status
        FROM public.tickets
       WHERE campaign_id=$1
         AND status IN ('reserved','sold')
       ORDER BY LPAD(ticket_number, 12, '0') ASC
      `,
      [id]
    );

    const unavailableNumbers = rows.map((r) => r.ticket_number);
    const reserved = rows.filter((r) => r.status === 'reserved').map((r) => r.ticket_number);
    const sold = rows.filter((r) => r.status === 'sold').map((r) => r.ticket_number);

    res.json({ unavailableNumbers, reserved, sold });
  } catch (e) {
    next(e);
  }
});

export default router;
