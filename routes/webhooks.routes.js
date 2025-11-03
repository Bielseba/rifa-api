import { Router } from 'express';
import { withTx } from '../db.js';
const router = Router();

router.post('/payment-status', async (req,res,next)=>{
  try{
    const { purchaseId, status, gatewayId } = req.body;
    if(!purchaseId || !status) return res.status(400).json({ error:'purchaseId and status required' });
    const out = await withTx(async (client)=>{
      const up = await client.query(
        'UPDATE purchases SET status=$2, payment_gateway_id=COALESCE($3,payment_gateway_id) WHERE id=$1 RETURNING *',
        [purchaseId, status, gatewayId||null]
      );
      if(!up.rowCount) throw new Error('purchase not found');
      if(status==='completed'){
        const tk = await client.query(`
          SELECT t.id FROM purchased_tickets pt
          JOIN tickets t ON t.id = pt.ticket_id
          WHERE pt.purchase_id = $1
        `, [purchaseId]);
        if(tk.rowCount){
          const ids = tk.rows.map(r=>r.id);
          await client.query('UPDATE tickets SET status=\'sold\', reserved_until=NULL WHERE id = ANY($1::int[])', [ids]);
        }
      }
      return up.rows[0];
    });
    res.json({ ok:true, purchase: out });
  } catch(e){ next(e); }
});

export default router;