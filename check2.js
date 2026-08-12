import { pool } from './db.js';

async function check() {
  try {
    const s = await pool.query('SELECT * FROM public.general_settings');
    console.log('Settings:', s.rows);
    const r = await pool.query('SELECT * FROM public.roulette_prizes');
    console.log('Prizes:', r.rows);
  } catch (e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
check();
