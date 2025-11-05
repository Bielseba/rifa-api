import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired } from '../middleware/auth.js';
const router = Router();

router.get('/profile', authRequired, async (req,res,next)=>{
  try{
    const u = await pool.query('SELECT id,name,cpf,email,phone FROM users WHERE id=$1', [req.user.id]);
    if(!u.rowCount) return res.status(404).json({ error:'user not found' });
    res.json(u.rows[0]);
  } catch(e){ next(e); }
});

router.get('/my-titles', authRequired, async (req,res,next)=>{
  try{
    const p = await pool.query(`
      SELECT 
        c.title AS campaign_title,
        pt.id AS purchased_ticket_id,
        t.ticket_number,
        p.created_at AS purchase_date
      FROM purchases p
      JOIN purchased_tickets pt ON pt.purchase_id = p.id
      JOIN tickets t           ON t.id = pt.ticket_id
      JOIN campaigns c         ON c.id = p.campaign_id
      WHERE p.user_id=$1 AND p.status='completed'
      ORDER BY p.created_at DESC, c.title, t.ticket_number
    `, [req.user.id]);

    const map = new Map();
    for(const r of p.rows){
      if(!map.has(r.campaign_title)) map.set(r.campaign_title, []);
      map.get(r.campaign_title).push({
        id: r.purchased_ticket_id,
        ticketNumber: r.ticket_number,
        purchaseDate: r.purchase_date
      });
    }
    res.json(
      Array.from(map.entries()).map(([campaignTitle, tickets])=>({ campaignTitle, tickets }))
    );
  } catch(e){ next(e); }
});


router.get('/my-titles/search', authRequired, async (req,res,next)=>{
  try{
    const q = (req.query?.q || '').toString().trim();
    if (!q) return res.status(400).json({ error: 'q required' });

    const r = await pool.query(`
      SELECT 
        c.title AS campaign_title,
        t.ticket_number,
        p.created_at AS purchase_date
      FROM purchases p
      JOIN purchased_tickets pt ON pt.purchase_id = p.id
      JOIN tickets t           ON t.id = pt.ticket_id
      JOIN campaigns c         ON c.id = p.campaign_id
      WHERE p.user_id=$1
        AND p.status='completed'
        AND unaccent(lower(c.title)) LIKE unaccent(lower($2))
      ORDER BY p.created_at DESC, c.title, t.ticket_number
    `, [req.user.id, `%${q}%`]);

    res.json(r.rows.map(row => ({
      campaignTitle: row.campaign_title,
      ticketNumber: row.ticket_number,
      purchaseDate: row.purchase_date
    })));
  } catch(e){ next(e); }
});

export default router;
