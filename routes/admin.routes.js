import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { adminRequired } from '../middleware/admin.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';


router.post('/auth/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password)
      return res.status(400).json({ error: 'username and password required' });

    const q = await pool.query('SELECT * FROM admin_authenticate($1,$2)', [username, password]);
    if (!q.rowCount)
      return res.status(401).json({ error: 'invalid credentials' });

    const admin = q.rows[0];
    const token = jwt.sign(
      { id: admin.id, username: admin.username, role: admin.role },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({ token, admin: { id: admin.id, username: admin.username, role: admin.role } });
  } catch (e) { next(e); }
});



router.post('/users', adminRequired, async (req, res, next) => {
  try {
    const { username, email, password, role } = req.body || {};
    if (!username || !password)
      return res.status(400).json({ error: 'username and password required' });

    const r = await pool.query('SELECT * FROM admin_create_user($1,$2,$3,$4)', [
      username,
      email || null,
      password,
      role || 'admin'
    ]);

    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});



router.post('/campaigns', adminRequired, async (req, res, next) => {
  try {
    const { title, description, image_url, ticket_price, total_tickets, draw_date, status, autoGenerateTickets, digits } = req.body || {};

    const r = await pool.query(
      'SELECT * FROM admin_create_campaign($1,$2,$3,$4,$5,$6,$7)',
      [title, description || null, image_url || null, ticket_price, total_tickets, draw_date || null, status || 'active']
    );

    const created = r.rows[0];
    if (autoGenerateTickets) {
      await pool.query('SELECT admin_generate_tickets($1,$2)', [created.id, digits || 3]);
    }

    res.status(201).json(created);
  } catch (e) { next(e); }
});


router.patch('/campaigns/:id', adminRequired, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { title, description, image_url, ticket_price, total_tickets, draw_date, status } = req.body || {};

    await pool.query(
      'SELECT admin_update_campaign($1,$2,$3,$4,$5,$6,$7,$8)',
      [id, title || null, description || null, image_url || null, ticket_price || null, total_tickets || null, draw_date || null, status || null]
    );

    res.json({ ok: true });
  } catch (e) { next(e); }
});


router.post('/campaigns/:id/generate-tickets', adminRequired, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const digits = parseInt(req.body?.digits || 3, 10);
    await pool.query('SELECT admin_generate_tickets($1,$2)', [id, digits]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});



router.get('/campaigns/:id/numbers', adminRequired, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const r = await pool.query('SELECT * FROM admin_list_numbers($1)', [id]);
    res.json(r.rows);
  } catch (e) { next(e); }
});


router.post('/campaigns/:id/reserve', adminRequired, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { ticket_number, minutes } = req.body || {};
    if (!ticket_number)
      return res.status(400).json({ error: 'ticket_number required' });

    const r = await pool.query('SELECT * FROM admin_reserve_ticket($1,$2,$3)', [
      id, ticket_number, minutes || 30
    ]);

    res.json(r.rows[0]);
  } catch (e) {
    if (String(e.message).includes('ticket not available'))
      return res.status(409).json({ error: 'ticket not available' });
    next(e);
  }
});

router.post('/campaigns/:id/release', adminRequired, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { ticket_number } = req.body || {};
    if (!ticket_number)
      return res.status(400).json({ error: 'ticket_number required' });

    await pool.query('SELECT admin_release_ticket($1,$2)', [id, ticket_number]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});


router.post('/campaigns/:id/sell', adminRequired, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { ticket_number, customer_name, customer_phone } = req.body || {};
    if (!ticket_number)
      return res.status(400).json({ error: 'ticket_number required' });

    const r = await pool.query(
      'SELECT * FROM admin_sell_ticket_manual($1,$2,$3,$4,$5)',
      [id, ticket_number, customer_name || null, customer_phone || null, req.admin?.id || null]
    );

    res.json(r.rows[0]);
  } catch (e) {
    const msg = String(e.message);
    if (msg.includes('ticket not found'))
      return res.status(404).json({ error: 'ticket not found' });
    if (msg.includes('ticket already sold'))
      return res.status(409).json({ error: 'ticket already sold' });
    next(e);
  }
});


router.post('/expire-reservations', adminRequired, async (req, res, next) => {
  try {
    const r = await pool.query('SELECT admin_expire_reservations() AS expired');
    res.json({ ok: true, expired: r.rows[0]?.expired ?? 0 });
  } catch (e) { next(e); }
});

export default router;
