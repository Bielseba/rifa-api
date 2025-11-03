import jwt from 'jsonwebtoken';
export function authRequired(req,res,next){
  const h = req.headers.authorization || '';
  const [,token] = h.split(' ');
  if(!token) return res.status(401).json({ error:'token missing' });
  try{ req.user = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret'); next(); }
  catch(e){ return res.status(401).json({ error:'invalid token' }); }
}