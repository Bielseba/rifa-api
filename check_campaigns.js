import { pool } from './db.js';
pool.query("SELECT id, title, status, draw_date FROM public.campaigns").then(res => console.log(res.rows)).catch(console.error).finally(()=>pool.end());
