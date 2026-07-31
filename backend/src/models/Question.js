import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema({

  // ── Content ───────────────────────────────────────────────
  section:       { type: String, enum: ['rw', 'math'], required: true },
  type:          { type: String, enum: ['mcq', 'grid'], required: true },
  difficulty:    { type: String, enum: ['easy', 'medium', 'hard'], required: true },
  domain:        { type: String, required: true },
  skill:         { type: String, required: true },

  passage:       { type: String, default: null },
  passageSource: { type: String, default: null },
  question:      { type: String, required: true },
  options:       { type: [String], default: null },
  answer:        { type: String, required: true },
  explanation:   { type: String, required: true },

  // ── Provenance ────────────────────────────────────────────
  version:          { type: Number, default: 1 },
  generatedByModel: { type: String, required: true },
  generatedAt:      { type: Date, default: Date.now },

  // ── Lifecycle ─────────────────────────────────────────────
  status: {
    type: String,
    enum: ['generated', 'structurally_validated', 'ai_reviewed', 'expert_validated', 'active', 'retired'],
    default: 'generated',
    required: true,
  },

  aiReviewedAt:      { type: Date,   default: null },
  aiReviewNotes:     { type: String, default: null },
  expertValidatedAt: { type: Date,   default: null },
  expertId:          { type: String, default: null },
  expertNotes:       { type: String, default: null },
  validatedAt:       { type: Date,   default: null },
  retiredAt:         { type: Date,   default: null },
  retiredReason:     { type: String, default: null },

  // ── Usage tracking ────────────────────────────────────────
  useCount:   { type: Number, default: 0 },
  lastUsedAt: { type: Date,   default: null },

}, { timestamps: true });

// ── Indexes ───────────────────────────────────────────────────
questionSchema.index({ section: 1, domain: 1, skill: 1, difficulty: 1, type: 1, status: 1, useCount: 1 });
questionSchema.index({ status: 1 });
questionSchema.index({ generatedAt: 1 });

export default mongoose.model('Question', questionSchema);
