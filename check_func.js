import { pool } from './db.js';
pool.query("SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'admin_update_campaign'").then(res => console.log(res.rows[0].pg_get_functiondef)).catch(console.error).finally(()=>pool.end());
