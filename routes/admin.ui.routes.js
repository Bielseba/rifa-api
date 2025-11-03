import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { adminViewRequired } from '../middleware/adminViewAuth.js';

const router = Router();

router.get('/login', (req, res) => {
  res.render('admin/login', { title: 'Admin Login', error: null });
});

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).render('admin/login', { title: 'Admin Login', error: 'Informe usuário e senha.' });
    }
    const q = await pool.query('SELECT * FROM admin_authenticate($1,$2)', [username, password]);
    if (!q.rowCount) {
      return res.status(401).render('admin/login', { title: 'Admin Login', error: 'Credenciais inválidas.' });
    }
    const admin = q.rows[0];
    const token = jwt.sign({ id: admin.id, username: admin.username, role: admin.role }, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '12h' });
    res.cookie('admin_token', token, { httpOnly: true, signed: true, sameSite: 'lax' });
    return res.redirect('/admin-ui');
  } catch (e) { next(e); }
});

router.post('/logout', (req, res) => {
  res.clearCookie('admin_token');
  res.redirect('/admin-ui/login');
});

router.get('/', adminViewRequired, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT id, title, status, ticket_price, total_tickets, draw_date FROM campaigns ORDER BY created_at DESC, id::text DESC LIMIT 100');
    res.render('admin/home', { title: 'Dashboard', admin: req.admin, campaigns: rows });
  } catch (e) { next(e); }
});

router.get('/campaigns/new', adminViewRequired, (req, res) => {
  res.render('admin/campaign_new', { title: 'Nova Campanha', admin: req.admin, error: null });
});

router.post('/campaigns/new', adminViewRequired, async (req, res, next) => {
  try {
    const { title, description, image_url, ticket_price, total_tickets, draw_date, status, auto_generate, digits } = req.body || {};
    const r = await pool.query(
      'SELECT * FROM admin_create_campaign($1,$2,$3,$4,$5,$6,$7)',
      [title, description || null, image_url || null, ticket_price, total_tickets, draw_date || null, status || 'active']
    );
    const created = r.rows[0];
    if (auto_generate) {
      const d = parseInt(digits || '3', 10);
      await pool.query('SELECT admin_generate_tickets($1,$2)', [String(created.id), d]);
    }
    return res.redirect(`/admin-ui/campaigns/${encodeURIComponent(String(created.id))}/numbers`);
  } catch (e) {
    return res.status(400).render('admin/campaign_new', { title: 'Nova Campanha', admin: req.admin, error: String(e.message) });
  }
});

router.get('/campaigns/:id/numbers', adminViewRequired, async (req, res, next) => {
  try {
    const idText = String(req.params.id);
    const campQ = await pool.query('SELECT * FROM campaigns WHERE id::text = $1', [idText]);
    if (!campQ.rowCount) {
      return res.redirect('/admin-ui');
    }
    const numbersQ = await pool.query('SELECT * FROM admin_list_numbers(($1)::text)', [idText]);
    res.render('admin/campaign_numbers', {
      title: `Números - ${campQ.rows[0].title}`,
      admin: req.admin,
      campaign: campQ.rows[0],
      numbers: numbersQ.rows
    });
  } catch (e) { next(e); }
});

router.post('/campaigns/:id/reserve', adminViewRequired, async (req, res, next) => {
  try {
    const idText = String(req.params.id);
    const { ticket_number, minutes } = req.body || {};
    await pool.query('SELECT * FROM admin_reserve_ticket(($1)::text,$2,$3)', [idText, ticket_number, minutes || 30]);
    res.redirect(`/admin-ui/campaigns/${encodeURIComponent(idText)}/numbers`);
  } catch (e) { next(e); }
});

router.post('/campaigns/:id/release', adminViewRequired, async (req, res, next) => {
  try {
    const idText = String(req.params.id);
    const { ticket_number } = req.body || {};
    await pool.query('SELECT admin_release_ticket(($1)::text,$2)', [idText, ticket_number]);
    res.redirect(`/admin-ui/campaigns/${encodeURIComponent(idText)}/numbers`);
  } catch (e) { next(e); }
});

router.post('/campaigns/:id/sell', adminViewRequired, async (req, res, next) => {
  try {
    const idText = String(req.params.id);
    const { ticket_number, customer_name, customer_phone } = req.body || {};
    await pool.query('SELECT * FROM admin_sell_ticket_manual(($1)::text,$2,$3,$4,$5)', [idText, ticket_number, customer_name || null, customer_phone || null, req.admin?.id || null]);
    res.redirect(`/admin-ui/campaigns/${encodeURIComponent(idText)}/numbers`);
  } catch (e) { next(e); }
});

router.post('/expire-reservations', adminViewRequired, async (req, res, next) => {
  try {
    await pool.query('SELECT admin_expire_reservations()');
    res.redirect('/admin-ui');
  } catch (e) { next(e); }
});

export default router;
