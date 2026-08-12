import { pool } from './db.js';
pool.query("SELECT * FROM public.winners").then(res => console.log(res.rows)).catch(console.error).finally(()=>pool.end());
