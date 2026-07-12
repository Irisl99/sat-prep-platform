import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// ── Verify JWT ────────────────────────────────────────────────
export async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.userId);
    if (!req.user) return res.status(401).json({ error: 'User not found' });
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ── Require premium plan ──────────────────────────────────────
export function requirePremium(req, res, next) {
  if (!req.user?.isPremium()) {
    return res.status(403).json({
      error: 'Premium feature',
      message: 'Upgrade to Premium to unlock this feature.',
      upgradeUrl: '/pricing',
    });
  }
  next();
}

// ── Check free-tier test limit ────────────────────────────────
export function checkTestLimit(req, res, next) {
  const check = req.user.canStartTest();
  if (!check.allowed) {
    return res.status(403).json({
      error: 'Free limit reached',
      message: check.reason,
      upgradeUrl: '/pricing',
    });
  }
  next();
}
