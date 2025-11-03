import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import dotenv from 'dotenv';
import adminRoutes from './routes/admin.routes.js';
dotenv.config();

import authRoutes from './routes/auth.routes.js';
import campaignsRoutes from './routes/campaigns.routes.js';
import userRoutes from './routes/user.routes.js';
import purchasesRoutes from './routes/purchases.routes.js';
import winnersRoutes from './routes/winners.routes.js';
import webhooksRoutes from './routes/webhooks.routes.js';

const app = express();
app.use(express.json());
app.use(morgan('dev'));
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));

app.get('/health', (req, res) => res.json({ ok: true, now: new Date().toISOString() }));
app.use('/admin', adminRoutes);
app.use('/auth', authRoutes);
app.use('/campaigns', campaignsRoutes);
app.use('/user', userRoutes);
app.use('/purchases', purchasesRoutes);
app.use('/winners', winnersRoutes);
app.use('/webhooks', webhooksRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

export default app;


if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => console.log(`API local em http://localhost:${PORT}`));
}
