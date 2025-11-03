import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';

export function useCookieParser(app){
  app.use(cookieParser(process.env.JWT_SECRET || 'dev_secret'));
}

export function adminViewRequired(req, res, next){
  try{
    const token = req.signedCookies?.admin_token || req.cookies?.admin_token;
    if(!token) return res.redirect('/admin-ui/login');
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
    if (payload?.role !== 'admin') return res.redirect('/admin-ui/login');
    req.admin = payload;
    next();
  }catch(e){
    return res.redirect('/admin-ui/login');
  }
}
