import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema({
  section:    { type: String, enum: ['rw', 'math'], required: true },
  type:       { type: String, enum: ['mcq', 'grid'], required: true },
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'], required: true },
  topic:      String,
  passage:    String,
  passageSource: String,
  question:   { type: String, required: true },
  options:    [String],      // null for grid-in
  answer:     { type: String, required: true },
  explanation: String,
}, { _id: false });

const moduleResultSchema = new mongoose.Schema({
  moduleId:   String,        // rw1, rw2h, rw2e, m1, m2h, m2e
  section:    String,
  difficulty: String,
  questions:  [questionSchema],
  answers:    mongoose.Schema.Types.Mixed,  // { "0": "A", "1": "C", ... }
  correct:    Number,
  total:      Number,
  timeTaken:  Number,        // seconds
}, { _id: false });

const examSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  status: { type: String, enum: ['in_progress', 'completed'], default: 'in_progress' },

  moduleSequence: [String],  // e.g. ['rw1','rw2h','m1','m2e']
  modules:        [moduleResultSchema],

  // Final scores
  scores: {
    rw:    { type: Number, default: null },
    math:  { type: Number, default: null },
    total: { type: Number, default: null },
  },

  // Weakness analysis (premium)
  weaknessReport: { type: mongoose.Schema.Types.Mixed, default: null },

  startedAt:   { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },
}, { timestamps: true });

export default mongoose.model('Exam', examSchema);
