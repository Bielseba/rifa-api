import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import dotenv from 'dotenv';
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

app.get('/api/health', (req,res)=> res.json({ ok:true, now:new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/campaigns', campaignsRoutes);
app.use('/api/user', userRoutes);
app.use('/api/purchases', purchasesRoutes);
app.use('/api/winners', winnersRoutes);
app.use('/api/webhooks', webhooksRoutes);

app.use((req,res)=> res.status(404).json({ error:'Not found' }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, ()=> console.log(`API ON http://localhost:${PORT}`));