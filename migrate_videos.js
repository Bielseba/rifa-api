import { pool } from './db.js';

async function migrate() {
  try {
    await pool.query(`
      ALTER TABLE public.campaigns 
      ADD COLUMN IF NOT EXISTS video_status VARCHAR(50) DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS video_url TEXT,
      ADD COLUMN IF NOT EXISTS video_job_id VARCHAR(255);
    `);
    console.log("Migration successful");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    pool.end();
  }
}

migrate();
