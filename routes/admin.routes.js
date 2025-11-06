import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { adminRequired } from '../middleware/admin.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'secret2025!@';

router.post('/auth/login', async (req, res, next) => {
  try {
    const usernameRaw = String(req.body?.username || '');
    const password = String(req.body?.password || '');
    const username = usernameRaw.trim().toLowerCase();
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });

    const q = await pool.query(
      `
      SELECT id, username, role
      FROM public.admin_users
      WHERE LOWER(username) = $1
        AND password_hash = crypt($2, password_hash)
      LIMIT 1
      `,
      [username, password]
    );

    if (!q.rowCount) return res.status(401).json({ error: 'invalid credentials' });

    const admin = q.rows[0];
    const token = jwt.sign(
      { id: admin.id, username: admin.username, role: admin.role },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({ token, admin });
  } catch (e) { next(e); }
});

router.get('/campaigns', adminRequired, async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
    const offset = parseInt(req.query.offset || '0', 10);
    const r = await pool.query(
      `
      SELECT id, title, status, ticket_price, total_tickets, draw_date, created_at, updated_at, image_url, description
      FROM public.campaigns
      WHERE status <> 'deleted'
      ORDER BY created_at DESC, id::text DESC
      LIMIT $1 OFFSET $2
      `,
      [limit, offset]
    );
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.get('/campaigns/:id', adminRequired, async (req, res, next) => {
  try {
    const idText = String(req.params.id);
    const r = await pool.query(
      `
      SELECT id, title, description, image_url, ticket_price, total_tickets, draw_date, status, created_at, updated_at
      FROM public.campaigns
      WHERE id::text = $1
      `,
      [idText]
    );
    if (!r.rowCount) return res.status(404).json({ error: 'campaign not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.post('/users', adminRequired, async (req, res, next) => {
  try {
    const { username, email, password, role } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });
    const r = await pool.query(
      `SELECT * FROM public.admin_create_user($1::text,$2::text,$3::text,$4::text)`,
      [username, email || null, password, role || 'admin']
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.post('/campaigns', adminRequired, async (req, res, next) => {
  try {
    const { title, description, image_url, ticket_price, total_tickets, draw_date, status, autoGenerateTickets, digits } = req.body || {};
    const r = await pool.query(
      `SELECT * FROM public.admin_create_campaign(
        $1::text,$2::text,$3::text,$4::numeric,$5::int,$6::timestamptz,$7::text
      )`,
      [title, description || null, image_url || null, ticket_price, total_tickets, draw_date || null, status || 'active']
    );
    const created = r.rows[0];
    if (autoGenerateTickets) {
      await pool.query(`SELECT public.admin_generate_tickets($1::int,$2::int)`, [created.id, digits || 3]);
    }
    res.status(201).json(created);
  } catch (e) { next(e); }
});

router.patch('/campaigns/:id', adminRequired, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { title, description, image_url, ticket_price, total_tickets, draw_date, status } = req.body || {};
    await pool.query(
      `SELECT public.admin_update_campaign(
        $1::int,$2::text,$3::text,$4::text,$5::numeric,$6::int,$7::timestamptz,$8::text
      )`,
      [
        id,
        title ?? null,
        description ?? null,
        image_url ?? null,
        ticket_price ?? null,
        total_tickets ?? null,
        draw_date ?? null,
        status ?? null
      ]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/campaigns/:id', adminRequired, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const hard = String(req.query.hard || '').trim() === '1';
    if (Number.isNaN(id)) return res.status(400).json({ error: 'invalid id' });

    if (hard) {
      const r = await pool.query(
        `DELETE FROM public.campaigns WHERE id = $1 RETURNING id`,
        [id]
      );
      if (!r.rowCount) return res.status(404).json({ error: 'campaign not found' });
      return res.status(204).end();
    }

    const r = await pool.query(
      `UPDATE public.campaigns
         SET status = 'deleted', updated_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [id]
    );
    if (!r.rowCount) return res.status(404).json({ error: 'campaign not found' });
    return res.status(204).end();
  } catch (e) { next(e); }
});

router.post('/campaigns/:id/generate-tickets', adminRequired, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const digits = parseInt(req.body?.digits || 3, 10);
    await pool.query(`SELECT public.admin_generate_tickets($1::int,$2::int)`, [id, digits]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/campaigns/:id/numbers', adminRequired, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const r = await pool.query(`SELECT * FROM public.admin_list_numbers($1::int)`, [id]);
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.post('/campaigns/:id/reserve', adminRequired, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { ticket_number, minutes } = req.body || {};
    if (!ticket_number) return res.status(400).json({ error: 'ticket_number required' });
    const r = await pool.query(
      `SELECT * FROM public.admin_reserve_ticket($1::int,$2::text,$3::int)`,
      [id, ticket_number, minutes || 30]
    );
    res.json(r.rows[0]);
  } catch (e) {
    if (String(e.message).includes('ticket not available')) return res.status(409).json({ error: 'ticket not available' });
    next(e);
  }
});

router.post('/campaigns/:id/release', adminRequired, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { ticket_number } = req.body || {};
    if (!ticket_number) return res.status(400).json({ error: 'ticket_number required' });
    await pool.query(`SELECT public.admin_release_ticket($1::int,$2::text)`, [id, ticket_number]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/campaigns/:id/sell', adminRequired, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { ticket_number, customer_name, customer_phone } = req.body || {};
    if (!ticket_number) return res.status(400).json({ error: 'ticket_number required' });
    const r = await pool.query(
      `SELECT * FROM public.admin_sell_ticket_manual($1::int,$2::text,$3::text,$4::text,$5::uuid)`,
      [id, ticket_number, customer_name || null, customer_phone || null, req.admin?.id || null]
    );
    res.json(r.rows[0]);
  } catch (e) {
    const msg = String(e.message);
    if (msg.includes('ticket not found')) return res.status(404).json({ error: 'ticket not found' });
    if (msg.includes('ticket already sold')) return res.status(409).json({ error: 'ticket already sold' });
    next(e);
  }
});

router.post('/expire-reservations', adminRequired, async (req, res, next) => {
  try {
    const r = await pool.query(`SELECT public.admin_expire_reservations() AS expired`);
    res.json({ ok: true, expired: r.rows[0]?.expired ?? 0 });
  } catch (e) { next(e); }
});

router.get('/campaigns/:id/metrics', adminRequired, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const r = await pool.query(
      `
      WITH t AS (
        SELECT
          COUNT(*)::int AS tickets_total,
          COUNT(*) FILTER (WHERE status='sold')::int AS tickets_sold,
          COUNT(*) FILTER (WHERE status='reserved')::int AS tickets_reserved,
          COUNT(*) FILTER (WHERE status='available')::int AS tickets_available
        FROM public.tickets
        WHERE campaign_id = $1
      ),
      p AS (
        SELECT
          COALESCE(SUM(total_amount),0)::numeric AS revenue_total,
          COUNT(*) FILTER (WHERE status='completed')::int AS purchases_completed
        FROM public.purchases
        WHERE campaign_id = $1 AND status='completed'
      ),
      c AS (
        SELECT id, title, ticket_price::numeric, total_tickets::int, status, draw_date, created_at, updated_at
        FROM public.campaigns
        WHERE id = $1
      )
      SELECT
        c.id, c.title, c.ticket_price, c.total_tickets, c.status, c.draw_date, c.created_at, c.updated_at,
        t.tickets_total, t.tickets_sold, t.tickets_reserved, t.tickets_available,
        p.revenue_total, p.purchases_completed,
        CASE WHEN t.tickets_total > 0 THEN ROUND((t.tickets_sold::numeric / t.tickets_total::numeric)*100,2) ELSE 0 END AS sold_percent
      FROM c, t, p
      `,
      [id]
    );
    if (!r.rowCount) return res.status(404).json({ error: 'campaign not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.get('/campaigns/:id/sales', adminRequired, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
    const offset = parseInt(req.query.offset || '0', 10);
    const r = await pool.query(
      `
      SELECT
        p.id AS purchase_id,
        p.user_id,
        p.total_amount::numeric,
        p.status,
        ARRAY_AGG(t.ticket_number ORDER BY LPAD(t.ticket_number,12,'0')) AS numbers
      FROM public.purchases p
      JOIN public.purchased_tickets pt ON pt.purchase_id = p.id
      JOIN public.tickets t ON t.id = pt.ticket_id
      WHERE p.campaign_id = $1 AND p.status = 'completed'
      GROUP BY p.id, p.user_id, p.total_amount, p.status
      ORDER BY p.id DESC
      LIMIT $2 OFFSET $3
      `,
      [id, limit, offset]
    );
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.get('/stats/overview', adminRequired, async (req, res, next) => {
  try {
    const r = await pool.query(
      `
      WITH c AS (
        SELECT
          COUNT(*)::int AS campaigns_count,
          COALESCE(SUM(total_tickets),0)::int AS total_tickets_planned,
          COALESCE(SUM((ticket_price::numeric) * (total_tickets::numeric)),0)::numeric AS gross_potential
        FROM public.campaigns
        WHERE status <> 'deleted'
      ),
      t AS (
        SELECT
          COUNT(*)::int AS tickets_total,
          COUNT(*) FILTER (WHERE status='sold')::int AS tickets_sold,
          COUNT(*) FILTER (WHERE status='reserved')::int AS tickets_reserved,
          COUNT(*) FILTER (WHERE status='available')::int AS tickets_available
        FROM public.tickets
      ),
      p AS (
        SELECT
          COALESCE(SUM(total_amount),0)::numeric AS revenue_total,
          COUNT(*) FILTER (WHERE status='completed')::int AS purchases_completed
        FROM public.purchases
        WHERE status='completed'
      )
      SELECT c.campaigns_count, c.total_tickets_planned, c.gross_potential,
             t.tickets_total, t.tickets_sold, t.tickets_reserved, t.tickets_available,
             p.revenue_total, p.purchases_completed
      FROM c, t, p
      `
    );
    res.json(r.rows[0] || {});
  } catch (e) { next(e); }
});

export default router;
