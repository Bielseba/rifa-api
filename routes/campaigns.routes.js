import { Router } from 'express';
import { pool } from '../db.js';
const router = Router();

router.get('/', async (req,res,next)=>{
  try{
    const { status } = req.query;
    let q = 'SELECT * FROM campaigns';
    const args = [];
    if(status){ q += ' WHERE status=$1'; args.push(status); }
    q += ' ORDER BY id DESC';
    const { rows } = await pool.query(q, args);
    const out = [];
    for(const c of rows){
      const sold = await pool.query('SELECT COUNT(*)::int AS n FROM tickets WHERE campaign_id=$1 AND status IN (\'sold\')', [c.id]);
      const reserved = await pool.query('SELECT COUNT(*)::int AS n FROM tickets WHERE campaign_id=$1 AND status IN (\'reserved\')', [c.id]);
      const progress = Math.floor(((sold.rows[0].n + reserved.rows[0].n)/c.total_tickets)*100);
      out.push({ id:c.id, title:c.title, imageUrl:c.image_url, resultDate:c.draw_date, status:c.status, progress });
    }
    res.json(out);
  } catch(e){ next(e); }
});

router.get('/:id', async (req,res,next)=>{
  try{
    const { id } = req.params;
    const camp = await pool.query('SELECT * FROM campaigns WHERE id=$1', [id]);
    if(!camp.rowCount) return res.status(404).json({ error:'campaign not found' });
    const c = camp.rows[0];
    const sold = await pool.query('SELECT COUNT(*)::int AS n FROM tickets WHERE campaign_id=$1 AND status IN (\'sold\')', [c.id]);
    const reserved = await pool.query('SELECT COUNT(*)::int AS n FROM tickets WHERE campaign_id=$1 AND status IN (\'reserved\')', [c.id]);
    const progress = Math.floor(((sold.rows[0].n + reserved.rows[0].n)/c.total_tickets)*100);
    res.json({ id:c.id, title:c.title, imageUrl:c.image_url, resultDate:c.draw_date, status:c.status,
               pricePerTicket:Number(c.ticket_price), progress, description:c.description, totalTickets:c.total_tickets });
  } catch(e){ next(e); }
});

router.get('/:id/unavailable-tickets', async (req,res,next)=>{
  try{
    const { id } = req.params;
    const { rows } = await pool.query(
      "SELECT ticket_number FROM tickets WHERE campaign_id=$1 AND status IN ('reserved','sold') ORDER BY ticket_number::int ASC",
      [id]
    );
    res.json({ unavailableNumbers: rows.map(r=>r.ticket_number) });
  } catch(e){ next(e); }
});

export default router;