import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';

const router = Router();

const onlyDigits = (s) => (s ? String(s).replace(/\D+/g, '') : '');

router.post('/login-register', async (req, res, next) => {
  try {
    const phoneRaw = req.body?.phone || req.body?.telefone || req.body?.tel;
    const nameRaw  = req.body?.name ?? req.body?.full_name ?? req.body?.fullName;
    const emailRaw = req.body?.email ?? null;
    const cpfRaw   = req.body?.cpf ?? null;

    const phone = onlyDigits(phoneRaw);
    const cpf   = cpfRaw ? onlyDigits(cpfRaw) : null;
    const name  = nameRaw ? String(nameRaw).trim() : '';

    if (!phone) {
      return res.status(400).json({ error: 'phone required' });
    }

 
    let q = await pool.query(
      'SELECT id, phone, name, email, cpf FROM users WHERE phone = $1',
      [phone]
    );

    let user;
    if (q.rowCount) {
      user = q.rows[0];
    } else {
      
      if (!name) return res.status(400).json({ error: 'name required for registration' });
      if (!cpf)  return res.status(400).json({ error: 'cpf required for registration' });

     
      if (cpf) {
        const c = await pool.query('SELECT 1 FROM users WHERE cpf = $1', [cpf]);
        if (c.rowCount) return res.status(409).json({ error: 'cpf already registered' });
      }
      if (emailRaw) {
        const e = await pool.query('SELECT 1 FROM users WHERE lower(email)=lower($1)', [emailRaw]);
        if (e.rowCount) return res.status(409).json({ error: 'email already registered' });
      }

      q = await pool.query(
        `INSERT INTO users (cpf, name, email, phone)
         VALUES ($1,$2,$3,$4)
         RETURNING id, phone, name, email, cpf`,
        [cpf, name, emailRaw || null, phone]
      );
      user = q.rows[0];
    }

    const token = jwt.sign(
      { id: user.id, phone: user.phone, name: user.name, cpf: user.cpf },
      process.env.JWT_SECRET || 'dev_secret',
      { expiresIn: '30d' }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        email: user.email,
        cpf: user.cpf
      }
    });
  } catch (e) {
    next(e);
  }
});

export default router;
