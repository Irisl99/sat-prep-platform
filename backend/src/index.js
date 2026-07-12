import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';

import authRoutes from './routes/auth.js';
import examRoutes from './routes/exam.js';
import userRoutes from './routes/user.js';
import billingRoutes from './routes/billing.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();
const PORT = process.env.PORT || 3001;

// ── Security middleware ──────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));

// Stripe webhook needs raw body — mount BEFORE express.json()
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// Global rate limit: 100 req / 15 min per IP
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
}));

// ── Routes ───────────────────────────────────────────────────
app.use('/api/auth',    authRoutes);
app.use('/api/exam',    examRoutes);
app.use('/api/user',    userRoutes);
app.use('/api/billing', billingRoutes);

app.get('/health', (_, res) => res.json({ status: 'ok', ts: Date.now() }));

// ── Error handler ────────────────────────────────────────────
app.use(errorHandler);

// ── Database + Start ─────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  })
  .catch(err => { console.error('❌ MongoDB connection failed:', err); process.exit(1); });

export default app;
