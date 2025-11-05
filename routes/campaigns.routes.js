import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

async function autoExpireAndDraw() {
  await pool.query(`
    UPDATE campaigns
       SET status = 'expired'
     WHERE draw_date IS NOT NULL
       AND draw_date <= now()
       AND status <> 'expired'
  `);

  const expiredNoWinner = await pool.query(`
    SELECT c.id
      FROM campaigns c
 LEFT JOIN winners w ON w.campaign_id = c.id
     WHERE c.status = 'expired'
       AND w.id IS NULL
  `);

  for (const row of expiredNoWinner.rows) {
    const cid = row.id;
    const win = await pool.query(
      `
      SELECT t.id AS ticket_id, p.user_id, t.ticket_number
        FROM tickets t
        JOIN purchased_tickets pt ON pt.ticket_id = t.id
        JOIN purchases p ON p.id = pt.purchase_id
       WHERE t.campaign_id = $1
         AND t.status = 'sold'
       ORDER BY random()
       LIMIT 1
      `,
      [cid]
    );
    if (win.rowCount) {
      const w = win.rows[0];
      await pool.query(
        `INSERT INTO winners (campaign_id, user_id, winning_ticket_id) VALUES ($1,$2,$3)`,
        [cid, w.user_id, w.ticket_id]
      );
    }
  }
}

router.get('/', async (req, res, next) => {
  try {
    try { await pool.query('SELECT expire_ticket_reservations()'); } catch {}
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
        FROM campaigns c
   LEFT JOIN winners w ON w.campaign_id = c.id
   LEFT JOIN users   u ON u.id = w.user_id
   LEFT JOIN tickets t ON t.id = w.winning_ticket_id
    `;
    const args = [];
    if (status) {
      q += ' WHERE c.status=$1';
      args.push(status);
    }
    q += ' ORDER BY c.id DESC';

    const { rows } = await pool.query(q, args);

    const out = [];
    for (const c of rows) {
      const sold = await pool.query(
        "SELECT COUNT(*)::int AS n FROM tickets WHERE campaign_id=$1 AND status IN ('sold')",
        [c.id]
      );
      const reserved = await pool.query(
        "SELECT COUNT(*)::int AS n FROM tickets WHERE campaign_id=$1 AND status IN ('reserved')",
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
    try { await pool.query('SELECT expire_ticket_reservations()'); } catch {}
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
        FROM campaigns c
   LEFT JOIN winners w ON w.campaign_id = c.id
   LEFT JOIN users   u ON u.id = w.user_id
   LEFT JOIN tickets t ON t.id = w.winning_ticket_id
       WHERE c.id=$1
      `,
      [id]
    );
    if (!camp.rowCount) return res.status(404).json({ error: 'campaign not found' });
    const c = camp.rows[0];

    const sold = await pool.query(
      "SELECT COUNT(*)::int AS n FROM tickets WHERE campaign_id=$1 AND status IN ('sold')",
      [c.id]
    );
    const reserved = await pool.query(
      "SELECT COUNT(*)::int AS n FROM tickets WHERE campaign_id=$1 AND status IN ('reserved')",
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
    try { await pool.query('SELECT expire_ticket_reservations()'); } catch {}
    await autoExpireAndDraw();

    const { rows } = await pool.query(
      `
      SELECT ticket_number, status
        FROM tickets
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
