import { Router } from 'express';
import { pool } from '../db.js';
const router = Router();

router.get('/', async (req,res,next)=>{
  try{
    const q = await pool.query(`
      SELECT w.id, u.name AS winnerName, c.title AS prizeName, t.ticket_number AS luckyNumber,
             COALESCE(c.draw_date::date, w.announced_at::date) AS drawDate
      FROM winners w
      JOIN campaigns c ON c.id = w.campaign_id
      JOIN tickets t ON t.id = w.winning_ticket_id
      JOIN users u ON u.id = w.user_id
      ORDER BY w.announced_at DESC
    `);
    const out = q.rows.map(r=>({ id:r.id, winnerName:r.winnername, prizeName:r.prizename, luckyNumber:r.luckynumber, drawDate:r.drawdate }));
    res.json(out);
  } catch(e){ next(e); }
});

export default router;