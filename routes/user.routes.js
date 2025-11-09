import { Router } from 'express';
import crypto from 'crypto';
import { pool } from '../db.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();

function cryptoRandom(maxExclusive) {
  if (maxExclusive <= 0) return 0;
  const buf = crypto.randomBytes(4);
  const n = buf.readUInt32BE(0);
  return n % maxExclusive;
}

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

router.get('/roulette/status', authRequired, async (req, res, next) => {
  try {
    const a = await pool.query(`SELECT public.roulette_available_spins($1) AS available`, [req.user.id]);
    const available = parseInt(a.rows[0]?.available || 0, 10);
    const last = await pool.query(
      `
      SELECT sp.id, sp.prize_id, sp.amount::numeric, sp.outcome, sp.created_at, rp.label
      FROM public.roulette_spins_plays sp
      LEFT JOIN public.roulette_prizes rp ON rp.id = sp.prize_id
      WHERE sp.user_id = $1
      ORDER BY sp.id DESC
      LIMIT 20
      `,
      [req.user.id]
    );
    res.json({ available_spins: available, history: last.rows });
  } catch (e) { next(e); }
});

router.post('/roulette/spin', authRequired, async (req, res, next) => {
  try {
    const av = await pool.query(`SELECT public.roulette_available_spins($1) AS available`, [req.user.id]);
    const available = parseInt(av.rows[0]?.available || 0, 10);
    if (available <= 0) return res.status(403).json({ error: 'no spins available' });

    const s = await pool.query(`SELECT rtp_percent FROM public.roulette_settings WHERE id=1`);
    const rtp = Number(s.rows[0]?.rtp_percent || 0);

    const prizesQ = await pool.query(`SELECT id, label, amount::numeric, weight FROM public.roulette_prizes WHERE active = true AND weight > 0 ORDER BY id ASC`);
    const prizes = prizesQ.rows;

    const winRoll = cryptoRandom(10000);
    const wins = winRoll < Math.round(rtp * 100);

    if (!wins || prizes.length === 0) {
      const ins = await pool.query(
        `INSERT INTO public.roulette_spins_plays (user_id, outcome) VALUES ($1,'lose') RETURNING id, created_at`,
        [req.user.id]
      );
      return res.json({ outcome: 'lose', spin_id: ins.rows[0].id, created_at: ins.rows[0].created_at });
    }

    let totalWeight = 0;
    for (const p of prizes) totalWeight += Number(p.weight);
    const pick = cryptoRandom(totalWeight);
    let acc = 0;
    let chosen = prizes[0];
    for (const p of prizes) {
      acc += Number(p.weight);
      if (pick < acc) { chosen = p; break; }
    }

    const chosenId = Number(chosen.id);
    const chosenAmount = Number(chosen.amount);

    const ins = await pool.query(
      `INSERT INTO public.roulette_spins_plays (user_id, prize_id, amount, outcome)
       VALUES ($1,$2,$3,'win')
       RETURNING id, created_at`,
      [req.user.id, chosenId, chosenAmount]
    );

    res.json({
      outcome: 'win',
      spin_id: ins.rows[0].id,
      created_at: ins.rows[0].created_at,
      prize: { id: chosenId, label: chosen.label, amount: Number(chosenAmount) }
    });
  } catch (e) { next(e); }
});

export default router;
