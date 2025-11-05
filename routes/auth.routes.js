import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';

const router = Router();

const normalizeDigits = (s) => (s ? String(s).replace(/\D+/g, '') : '');
const normalizePhone  = (p) => normalizeDigits(p);          
const normalizeCPF    = (c) => normalizeDigits(c);          
const normalizeCEP    = (z) => normalizeDigits(z);          

router.post('/login-register', async (req, res, next) => {
  try {
 
    const phone      = normalizePhone(req.body?.phone || req.body?.telefone || req.body?.tel);
    const full_name  = (req.body?.full_name ?? req.body?.name ?? req.body?.fullName ?? '').trim();
    const email      = (req.body?.email ?? '').trim() || null;
    const cpf        = normalizeCPF(req.body?.cpf) || null;
    const cep        = normalizeCEP(req.body?.cep) || null;
    const address    = (req.body?.address ?? req.body?.endereco ?? '').trim() || null;

    if (!phone) {
      return res.status(400).json({ error: 'phone required' });
    }


    let q = await pool.query(
      'SELECT id, phone, full_name, email, cpf, cep, address FROM users WHERE phone = $1',
      [phone]
    );

    let user;
    if (q.rowCount) {
      
      user = q.rows[0];
    } else {
     
      if (!full_name) {
        return res.status(400).json({ error: 'full_name required for registration' });
      }

    
      if (cpf) {
        const c = await pool.query('SELECT 1 FROM users WHERE cpf = $1', [cpf]);
        if (c.rowCount) return res.status(409).json({ error: 'cpf already registered' });
      }
      if (email) {
        const e = await pool.query('SELECT 1 FROM users WHERE lower(email)=lower($1)', [email]);
        if (e.rowCount) return res.status(409).json({ error: 'email already registered' });
      }

     
      q = await pool.query(
        `INSERT INTO users (phone, full_name, email, cpf, cep, address)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id, phone, full_name, email, cpf, cep, address`,
        [phone, full_name, email, cpf, cep, address]
      );
      user = q.rows[0];
    }

    const token = jwt.sign(
      { id: user.id, phone: user.phone, full_name: user.full_name || null, cpf: user.cpf || null },
      process.env.JWT_SECRET || 'dev_secret',
      { expiresIn: '30d' }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        phone: user.phone,
        full_name: user.full_name,
        email: user.email,
        cpf: user.cpf,
        cep: user.cep,
        address: user.address
      }
    });
  } catch (e) {
    next(e);
  }
});

export default router;
