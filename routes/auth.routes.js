import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
const router = Router();

router.post('/login-register', async (req,res,next)=>{
  try{
    const { cpf, name, email, phone } = req.body;
    if(!cpf) return res.status(400).json({ error:'cpf required' });
    let r = await pool.query('SELECT * FROM users WHERE cpf=$1', [cpf]);
    if(!r.rowCount){
      if(!name) return res.status(400).json({ error:'name required for registration' });
      r = await pool.query('INSERT INTO users (cpf,name,email,phone) VALUES ($1,$2,$3,$4) RETURNING *',
        [cpf, name, email||null, phone||null]);
    }
    const user = r.rows[0];
    const token = jwt.sign({ id:user.id, cpf:user.cpf, name:user.name }, process.env.JWT_SECRET || 'dev_secret', { expiresIn:'30d' });
    res.json({ token, user: { id:user.id, name:user.name, cpf:user.cpf } });
  } catch(e){ next(e); }
});

export default router;