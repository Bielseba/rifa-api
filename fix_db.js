import { pool } from './db.js';

async function fix() {
  try {
    await pool.query(`
      UPDATE public.campaigns 
      SET video_status = 'generating', video_job_id = $1
      WHERE video_status = 'failed' OR video_status IS NULL OR video_status = 'pending'
    `, [`mock-job-${Date.now()}`]);
    console.log("DB Fixed: Campaigns set to generating");
  } catch (error) {
    console.error("Fix failed:", error);
  } finally {
    pool.end();
  }
}

fix();
