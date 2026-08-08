import { Router } from 'express';
import Exam from '../models/Exam.js';
import { requireAuth, requirePremium, checkTestLimit } from '../middleware/auth.js';
import { generateWeaknessReport } from '../services/questionGenerator.js';
import { getModuleQuestions } from '../services/questionSource.js';
import { calcSectionScore, shouldRouteHard } from '../services/scoring.js';

const router = Router();

// All exam routes require auth
router.use(requireAuth);

// ── POST /api/exam/start ──────────────────────────────────────
// Creates a new exam, generates RW Module 1 questions
router.post('/start', checkTestLimit, async (req, res, next) => {
  try {
    const questions = await getModuleQuestions('rw', 'mixed', 27, 'rw1');

    const exam = await Exam.create({
      userId: req.user._id,
      moduleSequence: ['rw1'],
      modules: [{
        moduleId: 'rw1',
        section: 'rw',
        difficulty: 'mixed',
        questions,
        answers: {},
        correct: 0,
        total: questions.length,
      }],
    });

    await req.user.incrementTestCount();

    res.status(201).json({
      examId: exam._id,
      moduleId: 'rw1',
      questions: stripAnswers(questions),
      timeSeconds: 32 * 60,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/exam/:id/submit-module ─────────────────────────
// Submits a module's answers, returns next module (or 'done')
router.post('/:id/submit-module', async (req, res, next) => {
  try {
    const { moduleId, answers } = req.body;
    const exam = await Exam.findOne({ _id: req.params.id, userId: req.user._id });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    // Save answers for this module
    const modIdx = exam.modules.findIndex(m => m.moduleId === moduleId);
    if (modIdx === -1) return res.status(400).json({ error: 'Module not found in exam' });
    exam.modules[modIdx].answers = answers;

    // Determine next step via adaptive routing
    const next_ = await routeNext(exam, moduleId, answers);

    if (next_.done) {
      // All 4 modules complete — calculate final scores
      const rwMods  = exam.modules.filter(m => m.section === 'rw');
      const mathMods = exam.modules.filter(m => m.section === 'math');
      const rwHard   = exam.moduleSequence.includes('rw2h');
      const mathHard = exam.moduleSequence.includes('m2h');

      exam.scores.rw    = calcSectionScore(rwMods,   rwHard);
      exam.scores.math  = calcSectionScore(mathMods, mathHard);
      exam.scores.total = exam.scores.rw + exam.scores.math;
      exam.status       = 'completed';
      exam.completedAt  = new Date();

      // Generate weakness report (always stored; gated on read)
      exam.weaknessReport = await generateWeaknessReport(exam.modules);

      await exam.save();
      return res.json({ done: true, examId: exam._id });
    }

    // Add next module to exam
    exam.modules.push({
      moduleId: next_.moduleId,
      section:  next_.section,
      difficulty: next_.difficulty,
      questions: next_.questions,
      answers: {},
      correct: 0,
      total: next_.questions.length,
    });
    exam.moduleSequence.push(next_.moduleId);
    await exam.save();

    res.json({
      done: false,
      moduleId:    next_.moduleId,
      questions:   stripAnswers(next_.questions),
      timeSeconds: next_.timeSeconds,
      isBreak:     next_.isBreak || false,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/exam/:id/results ─────────────────────────────────
router.get('/:id/results', async (req, res, next) => {
  try {
    const exam = await Exam.findOne({ _id: req.params.id, userId: req.user._id });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    if (exam.status !== 'completed') return res.status(400).json({ error: 'Exam not completed' });

    const isPremium = req.user.isPremium();

    // Always return scores + basic module summary
    const result = {
      scores:         exam.scores,
      moduleSequence: exam.moduleSequence,
      completedAt:    exam.completedAt,
      // Basic question review (all users)
      modules: exam.modules.map(m => ({
        moduleId:   m.moduleId,
        section:    m.section,
        difficulty: m.difficulty,
        questions:  m.questions.map((q, i) => ({
          ...q,
          userAnswer: m.answers?.[i],
          isCorrect:  isCorrect(m.answers?.[i], q),
        })),
      })),
      // Premium-only fields
      weaknessReport: isPremium ? exam.weaknessReport : null,
      premiumLocked:  !isPremium,
    };

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/exam/history ─────────────────────────────────────
// Premium only — full score history
router.get('/history', requirePremium, async (req, res, next) => {
  try {
    const exams = await Exam.find({ userId: req.user._id, status: 'completed' })
      .sort({ completedAt: -1 })
      .limit(50)
      .select('scores moduleSequence completedAt');
    res.json({ exams });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

async function routeNext(exam, completedModuleId, answers) {
  const mod = exam.modules.find(m => m.moduleId === completedModuleId);

  if (completedModuleId === 'rw1') {
    const goHard = shouldRouteHard({ questions: mod.questions, answers });
    const nextId = goHard ? 'rw2h' : 'rw2e';
    const questions = await getModuleQuestions('rw', goHard ? 'hard' : 'easy', 27, nextId);
    return { moduleId: nextId, section: 'rw', difficulty: goHard ? 'hard' : 'easy', questions, timeSeconds: 32 * 60 };
  }

  if (completedModuleId === 'rw2h' || completedModuleId === 'rw2e') {
    // Generate Math M1 in advance, signal a break
    const questions = await getModuleQuestions('math', 'mixed', 22, 'm1');
    return { moduleId: 'm1', section: 'math', difficulty: 'mixed', questions, timeSeconds: 35 * 60, isBreak: true };
  }

  if (completedModuleId === 'm1') {
    const goHard = shouldRouteHard({ questions: mod.questions, answers });
    const nextId = goHard ? 'm2h' : 'm2e';
    const questions = await getModuleQuestions('math', goHard ? 'hard' : 'easy', 22, nextId);
    return { moduleId: nextId, section: 'math', difficulty: goHard ? 'hard' : 'easy', questions, timeSeconds: 35 * 60 };
  }

  return { done: true };
}

function stripAnswers(questions) {
  return questions.map(({ answer, explanation, ...q }) => q);
}

function isCorrect(answer, question) {
  if (!answer) return false;
  if (question.type === 'grid') return String(answer).trim() === String(question.answer).trim();
  return answer === question.answer;
}

export default router;
