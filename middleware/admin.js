
import jwt from 'jsonwebtoken';


export function adminRequired(req, res, next) {
  try {
    let token = null;

    const auth = req.headers.authorization || '';
    const [scheme, raw] = auth.split(' ');
    if (scheme?.toLowerCase() === 'bearer' && raw) token = raw;

    if (!token) {
      token = req.signedCookies?.admin_token || req.cookies?.admin_token || null;
    }

    if (!token) {
      return res.status(401).json({ error: 'admin token missing' });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
    if (payload?.role !== 'admin') {
      return res.status(403).json({ error: 'admin only' });
    }

    req.admin = payload; 
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid admin token' });
  }
}


export default adminRequired;
