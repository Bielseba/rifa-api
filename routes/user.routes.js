import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';

const router = Router();

function normalizePhone(p) {
  if (!p) return '';
  return String(p).replace(/\D+/g, '');
}

router.post('/login-register', async (req, res, next) => {
  try {
    const { phone, full_name, email, cpf, cep, address } = req.body || {};
    const normPhone = normalizePhone(phone);

    if (!normPhone) {
      return res.status(400).json({ error: 'phone required' });
    }

 
    let q = await pool.query(
      'SELECT id, phone, full_name, email, cpf, cep, address FROM users WHERE phone = $1',
      [normPhone]
    );

    let user;
    if (q.rowCount) {
      user = q.rows[0];
    } else {
     
      if (!full_name || !String(full_name).trim()) {
        return res.status(400).json({ error: 'full_name required for registration' });
      }

      q = await pool.query(
        `INSERT INTO users (phone, full_name, email, cpf, cep, address)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id, phone, full_name, email, cpf, cep, address`,
        [normPhone, String(full_name).trim(), email || null, cpf || null, cep || null, address || null]
      );
      user = q.rows[0];
    }

    const token = jwt.sign(
      {
        id: user.id,
        phone: user.phone,
        full_name: user.full_name || null,
        cpf: user.cpf || null
      },
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
