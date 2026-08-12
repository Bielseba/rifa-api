import { pool } from './db.js';
import crypto from 'crypto';

async function fix() {
  const client = await pool.connect();
  try {
    const campaigns = await client.query("SELECT id, draw_date FROM public.campaigns WHERE status = 'finished'");
    for (const c of campaigns.rows) {
      const existing = await client.query("SELECT * FROM public.campaign_winners WHERE campaign_id = $1", [c.id]);
      if (existing.rowCount > 0) {
        console.log(`Campaign ${c.id} already has a winner.`);
        continue;
      }
      
      const drawDate = c.draw_date;
      const dateKey = drawDate ? new Date(drawDate).toISOString().slice(0,10) : 'nodraw';
      const hash = crypto.createHash('sha256').update(`${c.id}|${process.env.DRAW_SALT || 'rifa_salt_2025'}|${dateKey}`).digest('hex');
      const seed = (parseInt(hash.slice(0, 8), 16) >>> 0);
      
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
        [c.id, seed]
      );
      
      if (r.rowCount > 0) {
        const row = r.rows[0];
        await client.query(
          "INSERT INTO public.campaign_winners (campaign_id, ticket_id, user_id, created_at) VALUES ($1, $2, $3, NOW())",
          [c.id, row.id, row.user_id]
        );
        console.log(`Inserted winner for campaign ${c.id}: User ${row.user_id}`);
      } else {
        console.log(`No sold tickets for campaign ${c.id}, cannot pick winner.`);
      }
    }
  } catch (e) {
    console.error(e);
  } finally {
    client.release();
    pool.end();
  }
}
fix();
