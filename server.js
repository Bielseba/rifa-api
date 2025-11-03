
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();


import adminRoutes from './routes/admin.routes.js';
import authRoutes from './routes/auth.routes.js';
import campaignsRoutes from './routes/campaigns.routes.js';
import userRoutes from './routes/user.routes.js';
import purchasesRoutes from './routes/purchases.routes.js';
import winnersRoutes from './routes/winners.routes.js';
import webhooksRoutes from './routes/webhooks.routes.js';

import path from 'path';
import { fileURLToPath } from 'url';
import adminUiRoutes from './routes/admin.ui.routes.js';
import { useCookieParser } from './middleware/adminViewAuth.js'; 

const app = express();


app.use(express.urlencoded({ extended: true }))
app.use(express.json());
app.use(morgan('dev'));
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
useCookieParser(app); 
app.use('/public', express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) =>
  res.json({ ok: true, now: new Date().toISOString() })
);

app.use('/admin', adminRoutes);        
app.use('/auth', authRoutes);
app.use('/campaigns', campaignsRoutes);
app.use('/user', userRoutes);
app.use('/purchases', purchasesRoutes);
app.use('/winners', winnersRoutes);
app.use('/webhooks', webhooksRoutes);


app.use('/admin-ui', adminUiRoutes);   

app.use((req, res) => res.status(404).json({ error: 'Not found' }));


export default app;


if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => console.log(`API local em http://localhost:${PORT}`));
}
