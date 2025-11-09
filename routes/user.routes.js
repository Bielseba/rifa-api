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

async function detectRouletteUserIdType(client) {
  const q = await client.query(`
    SELECT atttypid::regtype::text AS typ
    FROM pg_attribute
    WHERE attrelid = 'public.roulette_spins_plays'::regclass
      AND attname  = 'user_id'
      AND NOT attisdropped
    LIMIT 1
  `);
  const typ = q.rows[0]?.typ || 'uuid';
  return typ;
}

function coerceUserIdForType(userId, targetType) {
  if (targetType === 'uuid') {
    return String(userId);
  }
  const n = Number(userId);
  if (!Number.isFinite(n)) {
    const onlyDigits = String(userId).replace(/\D+/g, '');
    return Number(onlyDigits || 0);
  }
  return n;
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
      WHERE p.user_id::text = $1::text
        AND p.status  = 'completed'
      ORDER BY p.purchase_date DESC, c.title, t.ticket_number
    `, [String(req.user.id)]);

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
      WHERE p.user_id::text = $1::text
        AND p.status  = 'completed'
        AND c.title ILIKE $2
      ORDER BY p.purchase_date DESC, c.title, t.ticket_number
    `, [String(req.user.id), `%${qstr}%`]);

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
    const userIdTxt = String(req.user.id);

    const a = await pool.query(`
      WITH spent AS (
        SELECT COALESCE(SUM(total_amount),0)::numeric AS total_spent
        FROM public.purchases
        WHERE user_id::text = $1::text
          AND status = 'completed'
      ),
      earned AS (
        SELECT (FLOOR((spent.total_spent / 200)))::int * 10 AS spins_earned
        FROM spent
      ),
      used AS (
        SELECT COUNT(*)::int AS spins_used
        FROM public.roulette_spins_plays
        WHERE user_id::text = $1::text
      )
      SELECT GREATEST(e.spins_earned - u.spins_used, 0) AS available
      FROM earned e, used u
    `, [userIdTxt]);

    const available = parseInt(a.rows[0]?.available || 0, 10);

    const last = await pool.query(
      `
      SELECT sp.id, sp.prize_id, sp.amount::numeric, sp.outcome, sp.created_at, rp.label
      FROM public.roulette_spins_plays sp
      LEFT JOIN public.roulette_prizes rp ON rp.id = sp.prize_id
      WHERE sp.user_id::text = $1::text
      ORDER BY sp.id DESC
      LIMIT 20
      `,
      [userIdTxt]
    );

    res.json({ available_spins: available, history: last.rows });
  } catch (e) { next(e); }
});

async function insertSpinLose(userId) {
  const client = await pool.connect();
  try {
    const typ = await detectRouletteUserIdType(client);
    const coerced = coerceUserIdForType(userId, typ);

    let sql;
    if (typ === 'uuid') {
      sql = `
        INSERT INTO public.roulette_spins_plays (user_id, outcome)
        VALUES ($1::uuid, 'lose')
        RETURNING id, created_at
      `;
    } else {
      sql = `
        INSERT INTO public.roulette_spins_plays (user_id, outcome)
        VALUES ($1::int, 'lose')
        RETURNING id, created_at
      `;
    }
    const ins = await client.query(sql, [coerced]);
    return ins.rows[0];
  } finally {
    client.release();
  }
}

async function insertSpinWin(userId, prizeId, amount) {
  const client = await pool.connect();
  try {
    const typ = await detectRouletteUserIdType(client);
    const coerced = coerceUserIdForType(userId, typ);

    let sql;
    if (typ === 'uuid') {
      sql = `
        INSERT INTO public.roulette_spins_plays (user_id, prize_id, amount, outcome)
        VALUES ($1::uuid, $2::int, $3::numeric, 'win')
        RETURNING id, created_at
      `;
    } else {
      sql = `
        INSERT INTO public.roulette_spins_plays (user_id, prize_id, amount, outcome)
        VALUES ($1::int, $2::int, $3::numeric, 'win')
        RETURNING id, created_at
      `;
    }
    const ins = await client.query(sql, [coerced, Number(prizeId), Number(amount)]);
    return ins.rows[0];
  } finally {
    client.release();
  }
}

router.post('/roulette/spin', authRequired, async (req, res, next) => {
  try {
    const userIdTxt = String(req.user.id);

    const a = await pool.query(`
      WITH spent AS (
        SELECT COALESCE(SUM(total_amount),0)::numeric AS total_spent
        FROM public.purchases
        WHERE user_id::text = $1::text
          AND status = 'completed'
      ),
      earned AS (
        SELECT (FLOOR((spent.total_spent / 200)))::int * 10 AS spins_earned
        FROM spent
      ),
      used AS (
        SELECT COUNT(*)::int AS spins_used
        FROM public.roulette_spins_plays
        WHERE user_id::text = $1::text
      )
      SELECT GREATEST(e.spins_earned - u.spins_used, 0) AS available
      FROM earned e, used u
    `, [userIdTxt]);

    const available = parseInt(a.rows[0]?.available || 0, 10);
    if (available <= 0) return res.status(403).json({ error: 'no spins available' });

    const s = await pool.query(`SELECT rtp_percent FROM public.roulette_settings WHERE id=1`);
    const rtp = Number(s.rows[0]?.rtp_percent || 0);

    const prizesQ = await pool.query(`
      SELECT id, label, amount::numeric
      FROM public.roulette_prizes
      WHERE active = true
      ORDER BY id ASC
    `);
    const prizes = prizesQ.rows;

    const winRoll = cryptoRandom(10000);
    const wins = winRoll < Math.round(rtp * 100);

    if (!wins || prizes.length === 0) {
      const row = await insertSpinLose(userIdTxt);
      return res.json({ outcome: 'lose', spin_id: row.id, created_at: row.created_at });
    }

    const idx = cryptoRandom(prizes.length);
    const chosen = prizes[idx];

    const chosenId = Number(chosen.id);
    const chosenAmount = Number(chosen.amount);

    const row = await insertSpinWin(userIdTxt, chosenId, chosenAmount);

    res.json({
      outcome: 'win',
      spin_id: row.id,
      created_at: row.created_at,
      prize: { id: chosenId, label: chosen.label, amount: Number(chosenAmount) }
    });
  } catch (e) { next(e); }
});

export default router;
