import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();

router.get('/profile', authRequired, async (req, res, next) => {
  try {
    const u = await pool.query(
      'SELECT id, name, cpf, email, phone FROM public.users WHERE id=$1',
      [req.user.id]
    );
    if (!u.rowCount) return res.status(404).json({ error: 'user not found' });
    res.json(u.rows[0]);
  } catch (e) { next(e); }
});

router.get('/my-titles', authRequired, async (req, res, next) => {
  try {
    const q = await pool.query(`
      SELECT 
        c.id   AS campaign_id,
        c.title AS campaign_title,
        pt.id   AS purchased_ticket_id,
        t.ticket_number,
        p.purchase_date
      FROM public.purchases p
      JOIN public.purchased_tickets pt ON pt.purchase_id = p.id
      JOIN public.tickets t           ON t.id = pt.ticket_id
      JOIN public.campaigns c         ON c.id = p.campaign_id
      WHERE p.user_id = $1
        AND p.status  = 'completed'
      ORDER BY p.purchase_date DESC, c.title, t.ticket_number
    `, [req.user.id]);

    const map = new Map();
    for (const r of q.rows) {
      const key = `${r.campaign_id}::${r.campaign_title}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({
        id: r.purchased_ticket_id,
        ticketNumber: r.ticket_number,
        purchaseDate: r.purchase_date
      });
    }

    const out = Array.from(map.entries()).map(([key, tickets]) => {
      const [campaignIdStr, campaignTitle] = key.split('::');
      return {
        campaignId: Number(campaignIdStr),
        campaignTitle,
        tickets
      };
    });

    res.json(out);
  } catch (e) { next(e); }
});

router.get('/my-titles/search', authRequired, async (req, res, next) => {
  try {
    const qstr = (req.query?.q || '').toString().trim();
    if (!qstr) return res.status(400).json({ error: 'q required' });

    const q = await pool.query(`
      SELECT 
        c.id   AS campaign_id,
        c.title AS campaign_title,
        t.ticket_number,
        p.purchase_date
      FROM public.purchases p
      JOIN public.purchased_tickets pt ON pt.purchase_id = p.id
      JOIN public.tickets t           ON t.id = pt.ticket_id
      JOIN public.campaigns c         ON c.id = p.campaign_id
      WHERE p.user_id = $1
        AND p.status  = 'completed'
        AND c.title ILIKE $2
      ORDER BY p.purchase_date DESC, c.title, t.ticket_number
    `, [req.user.id, `%${qstr}%`]);

    res.json(q.rows.map(row => ({
      campaignId: row.campaign_id,
      campaignTitle: row.campaign_title,
      ticketNumber: row.ticket_number,
      purchaseDate: row.purchase_date
    })));
  } catch (e) { next(e); }
});

export default router;
