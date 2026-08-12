import { pool } from './db.js';
pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'campaign_winners'").then(res => console.log(res.rows)).catch(console.error).finally(()=>pool.end());
