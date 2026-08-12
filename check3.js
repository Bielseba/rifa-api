import { pool } from './db.js';
pool.query("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname != 'pg_catalog' AND schemaname != 'information_schema'").then(res => console.log(res.rows)).catch(console.error).finally(()=>pool.end());
