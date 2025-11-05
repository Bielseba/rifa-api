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
    const cepRaw   = req.body?.cep ?? null;
    const addrRaw  = req.body?.address ?? req.body?.endereco ?? null;

    const phone = onlyDigits(phoneRaw);
    const cpf   = cpfRaw ? onlyDigits(cpfRaw) : null;
    const cep   = cepRaw ? onlyDigits(cepRaw) : null;
    const name  = nameRaw ? String(nameRaw).trim() : '';
    const addr  = addrRaw ? String(addrRaw).trim() : null;

    if (!phone) return res.status(400).json({ error: 'phone required' });

    let q = await pool.query(
      'SELECT id, phone, name, email, cpf, cep, address FROM users WHERE phone = $1',
      [phone]
    );

    let user;
    if (q.rowCount) {
      user = q.rows[0];

      
      const needEmail  = emailRaw && !user.email;
      const needCep    = cep && !user.cep;
      const needAddr   = addr && !user.address;

      if (needEmail || needCep || needAddr) {
        const upd = await pool.query(
          `UPDATE users
             SET email   = COALESCE($2, email),
                 cep     = COALESCE($3, cep),
                 address = COALESCE($4, address),
                 updated_at = NOW()
           WHERE id = $1
           RETURNING id, phone, name, email, cpf, cep, address`,
          [user.id, needEmail ? emailRaw : null, needCep ? cep : null, needAddr ? addr : null]
        );
        user = upd.rows[0];
      }
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
        `INSERT INTO users (cpf, name, email, phone, cep, address)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id, phone, name, email, cpf, cep, address`,
        [cpf, name, emailRaw || null, phone, cep || null, addr || null]
      );
      user = q.rows[0];
    }

    const token = jwt.sign(
      { id: user.id, phone: user.phone, name: user.name, cpf: user.cpf },
      process.env.JWT_SECRET || 'dev_secret',
      { expiresIn: '30d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
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
