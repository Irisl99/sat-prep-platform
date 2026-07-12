import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  email: {
    type: String, required: true, unique: true,
    lowercase: true, trim: true,
  },
  password: { type: String, required: true, select: false },
  name:  { type: String, required: true, trim: true },

  // ── Freemium plan ──────────────────────────────────────────
  plan: {
    type: String,
    enum: ['free', 'premium'],
    default: 'free',
  },
  planExpiresAt: { type: Date, default: null }, // null = never (lifetime) or free

  // ── Usage counters (free tier gating) ─────────────────────
  usage: {
    testsThisMonth:  { type: Number, default: 0 },
    usageResetAt:    { type: Date,   default: () => endOfMonth() },
  },

  // ── Stripe ────────────────────────────────────────────────
  stripeCustomerId:     { type: String, default: null },
  stripeSubscriptionId: { type: String, default: null },

  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Check if user can start a new test
userSchema.methods.canStartTest = function () {
  if (this.plan === 'premium') return { allowed: true };
  this.resetUsageIfNeeded();
  const FREE_LIMIT = 3;
  if (this.usage.testsThisMonth >= FREE_LIMIT) {
    return { allowed: false, reason: `Free plan allows ${FREE_LIMIT} tests per month.` };
  }
  return { allowed: true };
};

userSchema.methods.incrementTestCount = async function () {
  this.resetUsageIfNeeded();
  this.usage.testsThisMonth += 1;
  await this.save();
};

userSchema.methods.resetUsageIfNeeded = function () {
  if (new Date() > this.usage.usageResetAt) {
    this.usage.testsThisMonth = 0;
    this.usage.usageResetAt = endOfMonth();
  }
};

userSchema.methods.isPremium = function () {
  if (this.plan !== 'premium') return false;
  if (this.planExpiresAt && new Date() > this.planExpiresAt) return false;
  return true;
};

function endOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

export default mongoose.model('User', userSchema);
