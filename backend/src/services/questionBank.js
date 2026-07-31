import Question from '../models/Question.js';
import Exam from '../models/Exam.js';

// ─────────────────────────────────────────────────────────────
// MVP SAT-ALIGNED ASSESSMENT BLUEPRINT
//
// Six explicit per-module blueprints — one per module ID.
// M2 Easy and M2 Hard are NOT derived by filtering M1.
// Each is an independent distribution that:
//   - totals exactly 27 (RW) or 22 (Math)
//   - covers all required domains and skills
//   - shifts difficulty composition appropriately
//   - contains no hard questions (M2 Easy)
//   - contains no easy questions (M2 Hard)
//
// Note: aligned with SAT skill taxonomy but not claimed to
// replicate the exact College Board specification until
// verified against official documentation.
// ─────────────────────────────────────────────────────────────

const RW_M1_BLUEPRINT = [
  { domain:'Craft and Structure',     skill:'Words in Context',           difficulty:'easy',   type:'mcq', count:1 },
  { domain:'Craft and Structure',     skill:'Words in Context',           difficulty:'medium', type:'mcq', count:1 },
  { domain:'Craft and Structure',     skill:'Words in Context',           difficulty:'hard',   type:'mcq', count:1 },
  { domain:'Craft and Structure',     skill:'Text Structure and Purpose', difficulty:'easy',   type:'mcq', count:1 },
  { domain:'Craft and Structure',     skill:'Text Structure and Purpose', difficulty:'medium', type:'mcq', count:1 },
  { domain:'Craft and Structure',     skill:'Cross-Text Connections',     difficulty:'medium', type:'mcq', count:1 },
  { domain:'Craft and Structure',     skill:'Cross-Text Connections',     difficulty:'hard',   type:'mcq', count:1 },
  { domain:'Information and Ideas',   skill:'Central Ideas and Details',  difficulty:'easy',   type:'mcq', count:1 },
  { domain:'Information and Ideas',   skill:'Central Ideas and Details',  difficulty:'medium', type:'mcq', count:2 },
  { domain:'Information and Ideas',   skill:'Central Ideas and Details',  difficulty:'hard',   type:'mcq', count:1 },
  { domain:'Information and Ideas',   skill:'Command of Evidence',        difficulty:'easy',   type:'mcq', count:1 },
  { domain:'Information and Ideas',   skill:'Command of Evidence',        difficulty:'medium', type:'mcq', count:1 },
  { domain:'Information and Ideas',   skill:'Command of Evidence',        difficulty:'hard',   type:'mcq', count:1 },
  { domain:'Information and Ideas',   skill:'Inferences',                 difficulty:'easy',   type:'mcq', count:1 },
  { domain:'Information and Ideas',   skill:'Inferences',                 difficulty:'medium', type:'mcq', count:1 },
  { domain:'Information and Ideas',   skill:'Inferences',                 difficulty:'hard',   type:'mcq', count:1 },
  { domain:'Expression of Ideas',     skill:'Rhetorical Synthesis',       difficulty:'easy',   type:'mcq', count:1 },
  { domain:'Expression of Ideas',     skill:'Rhetorical Synthesis',       difficulty:'medium', type:'mcq', count:1 },
  { domain:'Expression of Ideas',     skill:'Transitions',                difficulty:'easy',   type:'mcq', count:1 },
  { domain:'Expression of Ideas',     skill:'Transitions',                difficulty:'medium', type:'mcq', count:1 },
  { domain:'Expression of Ideas',     skill:'Transitions',                difficulty:'hard',   type:'mcq', count:1 },
  { domain:'Std English Conventions', skill:'Boundaries',                 difficulty:'easy',   type:'mcq', count:1 },
  { domain:'Std English Conventions', skill:'Boundaries',                 difficulty:'medium', type:'mcq', count:1 },
  { domain:'Std English Conventions', skill:'Form Structure and Sense',   difficulty:'easy',   type:'mcq', count:1 },
  { domain:'Std English Conventions', skill:'Form Structure and Sense',   difficulty:'medium', type:'mcq', count:1 },
  { domain:'Std English Conventions', skill:'Form Structure and Sense',   difficulty:'hard',   type:'mcq', count:1 },
];

const RW_M2E_BLUEPRINT = [
  { domain:'Craft and Structure',     skill:'Words in Context',           difficulty:'easy',   type:'mcq', count:1 },
  { domain:'Craft and Structure',     skill:'Words in Context',           difficulty:'medium', type:'mcq', count:2 },
  { domain:'Craft and Structure',     skill:'Text Structure and Purpose', difficulty:'easy',   type:'mcq', count:1 },
  { domain:'Craft and Structure',     skill:'Text Structure and Purpose', difficulty:'medium', type:'mcq', count:1 },
  { domain:'Craft and Structure',     skill:'Cross-Text Connections',     difficulty:'easy',   type:'mcq', count:1 },
  { domain:'Craft and Structure',     skill:'Cross-Text Connections',     difficulty:'medium', type:'mcq', count:1 },
  { domain:'Information and Ideas',   skill:'Central Ideas and Details',  difficulty:'easy',   type:'mcq', count:2 },
  { domain:'Information and Ideas',   skill:'Central Ideas and Details',  difficulty:'medium', type:'mcq', count:2 },
  { domain:'Information and Ideas',   skill:'Command of Evidence',        difficulty:'easy',   type:'mcq', count:1 },
  { domain:'Information and Ideas',   skill:'Command of Evidence',        difficulty:'medium', type:'mcq', count:2 },
  { domain:'Information and Ideas',   skill:'Inferences',                 difficulty:'easy',   type:'mcq', count:2 },
  { domain:'Information and Ideas',   skill:'Inferences',                 difficulty:'medium', type:'mcq', count:1 },
  { domain:'Expression of Ideas',     skill:'Rhetorical Synthesis',       difficulty:'easy',   type:'mcq', count:1 },
  { domain:'Expression of Ideas',     skill:'Rhetorical Synthesis',       difficulty:'medium', type:'mcq', count:1 },
  { domain:'Expression of Ideas',     skill:'Transitions',                difficulty:'easy',   type:'mcq', count:1 },
  { domain:'Expression of Ideas',     skill:'Transitions',                difficulty:'medium', type:'mcq', count:2 },
  { domain:'Std English Conventions', skill:'Boundaries',                 difficulty:'easy',   type:'mcq', count:1 },
  { domain:'Std English Conventions', skill:'Boundaries',                 difficulty:'medium', type:'mcq', count:1 },
  { domain:'Std English Conventions', skill:'Form Structure and Sense',   difficulty:'easy',   type:'mcq', count:1 },
  { domain:'Std English Conventions', skill:'Form Structure and Sense',   difficulty:'medium', type:'mcq', count:2 },
];

const RW_M2H_BLUEPRINT = [
  { domain:'Craft and Structure',     skill:'Words in Context',           difficulty:'medium', type:'mcq', count:2 },
  { domain:'Craft and Structure',     skill:'Words in Context',           difficulty:'hard',   type:'mcq', count:1 },
  { domain:'Craft and Structure',     skill:'Text Structure and Purpose', difficulty:'medium', type:'mcq', count:1 },
  { domain:'Craft and Structure',     skill:'Text Structure and Purpose', difficulty:'hard',   type:'mcq', count:1 },
  { domain:'Craft and Structure',     skill:'Cross-Text Connections',     difficulty:'medium', type:'mcq', count:1 },
  { domain:'Craft and Structure',     skill:'Cross-Text Connections',     difficulty:'hard',   type:'mcq', count:1 },
  { domain:'Information and Ideas',   skill:'Central Ideas and Details',  difficulty:'medium', type:'mcq', count:3 },
  { domain:'Information and Ideas',   skill:'Central Ideas and Details',  difficulty:'hard',   type:'mcq', count:1 },
  { domain:'Information and Ideas',   skill:'Command of Evidence',        difficulty:'medium', type:'mcq', count:2 },
  { domain:'Information and Ideas',   skill:'Command of Evidence',        difficulty:'hard',   type:'mcq', count:1 },
  { domain:'Information and Ideas',   skill:'Inferences',                 difficulty:'medium', type:'mcq', count:1 },
  { domain:'Information and Ideas',   skill:'Inferences',                 difficulty:'hard',   type:'mcq', count:2 },
  { domain:'Expression of Ideas',     skill:'Rhetorical Synthesis',       difficulty:'medium', type:'mcq', count:1 },
  { domain:'Expression of Ideas',     skill:'Rhetorical Synthesis',       difficulty:'hard',   type:'mcq', count:1 },
  { domain:'Expression of Ideas',     skill:'Transitions',                difficulty:'medium', type:'mcq', count:1 },
  { domain:'Expression of Ideas',     skill:'Transitions',                difficulty:'hard',   type:'mcq', count:2 },
  { domain:'Std English Conventions', skill:'Boundaries',                 difficulty:'medium', type:'mcq', count:2 },
  { domain:'Std English Conventions', skill:'Form Structure and Sense',   difficulty:'medium', type:'mcq', count:1 },
  { domain:'Std English Conventions', skill:'Form Structure and Sense',   difficulty:'hard',   type:'mcq', count:2 },
];

const MATH_M1_BLUEPRINT = [
  { domain:'Algebra',              skill:'Linear Equations 1-var',     difficulty:'easy',   type:'mcq',  count:1 },
  { domain:'Algebra',              skill:'Linear Equations 1-var',     difficulty:'easy',   type:'grid', count:1 },
  { domain:'Algebra',              skill:'Linear Equations 1-var',     difficulty:'medium', type:'mcq',  count:1 },
  { domain:'Algebra',              skill:'Linear Equations 2-var',     difficulty:'easy',   type:'mcq',  count:1 },
  { domain:'Algebra',              skill:'Linear Equations 2-var',     difficulty:'medium', type:'mcq',  count:1 },
  { domain:'Algebra',              skill:'Linear Equations 2-var',     difficulty:'hard',   type:'grid', count:1 },
  { domain:'Algebra',              skill:'Linear Inequalities',        difficulty:'easy',   type:'mcq',  count:1 },
  { domain:'Algebra',              skill:'Linear Inequalities',        difficulty:'medium', type:'grid', count:1 },
  { domain:'Advanced Math',        skill:'Nonlinear Equations',        difficulty:'medium', type:'mcq',  count:2 },
  { domain:'Advanced Math',        skill:'Nonlinear Equations',        difficulty:'hard',   type:'mcq',  count:1 },
  { domain:'Advanced Math',        skill:'Nonlinear Equations',        difficulty:'hard',   type:'grid', count:1 },
  { domain:'Advanced Math',        skill:'Nonlinear Functions',        difficulty:'medium', type:'mcq',  count:1 },
  { domain:'Advanced Math',        skill:'Nonlinear Functions',        difficulty:'hard',   type:'mcq',  count:1 },
  { domain:'Advanced Math',        skill:'Nonlinear Functions',        difficulty:'hard',   type:'grid', count:1 },
  { domain:'Problem Solving Data', skill:'Ratios Rates Proportions',   difficulty:'easy',   type:'mcq',  count:1 },
  { domain:'Problem Solving Data', skill:'Ratios Rates Proportions',   difficulty:'medium', type:'mcq',  count:1 },
  { domain:'Problem Solving Data', skill:'Statistics and Probability', difficulty:'medium', type:'mcq',  count:1 },
  { domain:'Problem Solving Data', skill:'Statistics and Probability', difficulty:'hard',   type:'mcq',  count:1 },
  { domain:'Geometry Trig',        skill:'Area and Volume',            difficulty:'easy',   type:'mcq',  count:1 },
  { domain:'Geometry Trig',        skill:'Area and Volume',            difficulty:'medium', type:'grid', count:1 },
  { domain:'Geometry Trig',        skill:'Circles and Angles',         difficulty:'hard',   type:'grid', count:1 },
];

const MATH_M2E_BLUEPRINT = [
  { domain:'Algebra',              skill:'Linear Equations 1-var',     difficulty:'easy',   type:'mcq',  count:1 },
  { domain:'Algebra',              skill:'Linear Equations 1-var',     difficulty:'easy',   type:'grid', count:1 },
  { domain:'Algebra',              skill:'Linear Equations 1-var',     difficulty:'medium', type:'mcq',  count:1 },
  { domain:'Algebra',              skill:'Linear Equations 2-var',     difficulty:'easy',   type:'mcq',  count:1 },
  { domain:'Algebra',              skill:'Linear Equations 2-var',     difficulty:'medium', type:'mcq',  count:1 },
  { domain:'Algebra',              skill:'Linear Equations 2-var',     difficulty:'medium', type:'grid', count:1 },
  { domain:'Algebra',              skill:'Linear Inequalities',        difficulty:'easy',   type:'mcq',  count:1 },
  { domain:'Algebra',              skill:'Linear Inequalities',        difficulty:'medium', type:'grid', count:1 },
  { domain:'Advanced Math',        skill:'Nonlinear Equations',        difficulty:'medium', type:'mcq',  count:3 },
  { domain:'Advanced Math',        skill:'Nonlinear Equations',        difficulty:'medium', type:'grid', count:1 },
  { domain:'Advanced Math',        skill:'Nonlinear Functions',        difficulty:'medium', type:'mcq',  count:2 },
  { domain:'Advanced Math',        skill:'Nonlinear Functions',        difficulty:'medium', type:'grid', count:1 },
  { domain:'Problem Solving Data', skill:'Ratios Rates Proportions',   difficulty:'easy',   type:'mcq',  count:1 },
  { domain:'Problem Solving Data', skill:'Ratios Rates Proportions',   difficulty:'medium', type:'mcq',  count:1 },
  { domain:'Problem Solving Data', skill:'Statistics and Probability', difficulty:'medium', type:'mcq',  count:2 },
  { domain:'Geometry Trig',        skill:'Area and Volume',            difficulty:'easy',   type:'mcq',  count:1 },
  { domain:'Geometry Trig',        skill:'Area and Volume',            difficulty:'medium', type:'grid', count:1 },
  { domain:'Geometry Trig',        skill:'Circles and Angles',         difficulty:'medium', type:'grid', count:1 },
];

const MATH_M2H_BLUEPRINT = [
  { domain:'Algebra',              skill:'Linear Equations 1-var',     difficulty:'medium', type:'mcq',  count:2 },
  { domain:'Algebra',              skill:'Linear Equations 1-var',     difficulty:'medium', type:'grid', count:1 },
  { domain:'Algebra',              skill:'Linear Equations 2-var',     difficulty:'medium', type:'mcq',  count:2 },
  { domain:'Algebra',              skill:'Linear Equations 2-var',     difficulty:'hard',   type:'grid', count:1 },
  { domain:'Algebra',              skill:'Linear Inequalities',        difficulty:'medium', type:'grid', count:1 },
  { domain:'Algebra',              skill:'Linear Inequalities',        difficulty:'hard',   type:'mcq',  count:1 },
  { domain:'Advanced Math',        skill:'Nonlinear Equations',        difficulty:'medium', type:'mcq',  count:2 },
  { domain:'Advanced Math',        skill:'Nonlinear Equations',        difficulty:'hard',   type:'mcq',  count:1 },
  { domain:'Advanced Math',        skill:'Nonlinear Equations',        difficulty:'hard',   type:'grid', count:1 },
  { domain:'Advanced Math',        skill:'Nonlinear Functions',        difficulty:'medium', type:'mcq',  count:1 },
  { domain:'Advanced Math',        skill:'Nonlinear Functions',        difficulty:'hard',   type:'mcq',  count:1 },
  { domain:'Advanced Math',        skill:'Nonlinear Functions',        difficulty:'hard',   type:'grid', count:1 },
  { domain:'Problem Solving Data', skill:'Ratios Rates Proportions',   difficulty:'medium', type:'mcq',  count:2 },
  { domain:'Problem Solving Data', skill:'Statistics and Probability', difficulty:'medium', type:'mcq',  count:1 },
  { domain:'Problem Solving Data', skill:'Statistics and Probability', difficulty:'hard',   type:'mcq',  count:1 },
  { domain:'Geometry Trig',        skill:'Area and Volume',            difficulty:'medium', type:'grid', count:1 },
  { domain:'Geometry Trig',        skill:'Area and Volume',            difficulty:'hard',   type:'mcq',  count:1 },
  { domain:'Geometry Trig',        skill:'Circles and Angles',         difficulty:'hard',   type:'grid', count:1 },
];

const MODULE_BLUEPRINTS = {
  rw1:  RW_M1_BLUEPRINT,
  rw2e: RW_M2E_BLUEPRINT,
  rw2h: RW_M2H_BLUEPRINT,
  m1:   MATH_M1_BLUEPRINT,
  m2e:  MATH_M2E_BLUEPRINT,
  m2h:  MATH_M2H_BLUEPRINT,
};

const MODULE_SECTIONS = {
  rw1:'rw', rw2e:'rw', rw2h:'rw',
  m1:'math', m2e:'math', m2h:'math',
};

const EXPECTED_TOTALS = {
  rw1:27, rw2e:27, rw2h:27,
  m1:22,  m2e:22,  m2h:22,
};

// Verify all blueprint totals at module load time
for (const [moduleId, blueprint] of Object.entries(MODULE_BLUEPRINTS)) {
  const total    = blueprint.reduce((s, b) => s + b.count, 0);
  const expected = EXPECTED_TOTALS[moduleId];
  if (total !== expected) {
    throw new Error(`Blueprint integrity failure: ${moduleId} totals ${total}, expected ${expected}`);
  }
}

async function getExposedQuestionIds(userId) {
  const exams = await Exam.find({ userId }).select('modules.questionIds').lean();
  return exams.flatMap(e => e.modules.flatMap(m => m.questionIds || []));
}

export async function selectFromBank(moduleId, userId) {
  const blueprint = MODULE_BLUEPRINTS[moduleId];
  if (!blueprint) throw new Error(`Unknown moduleId: ${moduleId}`);

  const section    = MODULE_SECTIONS[moduleId];
  const exposedIds = await getExposedQuestionIds(userId);
  const selected   = [];
  const shortages  = [];

  for (const bucket of blueprint) {
    const needed = bucket.count;

    const unseen = await Question.find({
      section,
      domain:     bucket.domain,
      skill:      bucket.skill,
      difficulty: bucket.difficulty,
      type:       bucket.type,
      status:     'active',
      _id:        { $nin: exposedIds },
    })
      .sort({ useCount: 1, lastUsedAt: 1 })
      .limit(needed)
      .lean();

    if (unseen.length >= needed) {
      selected.push(...unseen);
      continue;
    }

    const seen = await Question.find({
      section,
      domain:     bucket.domain,
      skill:      bucket.skill,
      difficulty: bucket.difficulty,
      type:       bucket.type,
      status:     'active',
      _id:        { $in: exposedIds },
    })
      .sort({ lastUsedAt: 1 })
      .limit(needed - unseen.length)
      .lean();

    const combined = [...unseen, ...seen];

    if (combined.length < needed) {
      shortages.push({
        section,
        domain:     bucket.domain,
        skill:      bucket.skill,
        difficulty: bucket.difficulty,
        type:       bucket.type,
        needed,
        available:  combined.length,
      });
    }

    selected.push(...combined);
  }

  if (shortages.length > 0) {
    console.error('[questionBank] bank_insufficient', JSON.stringify(shortages));
    const err      = new Error('Question bank has insufficient active questions for one or more blueprint buckets.');
    err.code       = 'BANK_INSUFFICIENT';
    err.shortages  = shortages;
    throw err;
  }

  const unseenCount = selected.filter(
    q => !exposedIds.some(id => id.toString() === q._id.toString())
  ).length;

  if (unseenCount < selected.length) {
    console.warn(`[questionBank] moduleId=${moduleId} userId=${userId} fallback_used: ${selected.length - unseenCount} seen questions included`);
  }

  console.log(`[questionBank] moduleId=${moduleId} userId=${userId} selected=${selected.length} unseen=${unseenCount}`);

  for (let i = selected.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [selected[i], selected[j]] = [selected[j], selected[i]];
  }

  return selected;
}

export async function markQuestionsUsed(questionIds) {
  await Question.updateMany(
    { _id: { $in: questionIds } },
    { $inc: { useCount: 1 }, $set: { lastUsedAt: new Date() } }
  );
}

export async function getBankHealth() {
  const results = [];
  for (const [moduleId, blueprint] of Object.entries(MODULE_BLUEPRINTS)) {
    const section = MODULE_SECTIONS[moduleId];
    for (const bucket of blueprint) {
      const count = await Question.countDocuments({
        section,
        domain:     bucket.domain,
        skill:      bucket.skill,
        difficulty: bucket.difficulty,
        type:       bucket.type,
        status:     'active',
      });
      results.push({
        moduleId,
        section,
        domain:     bucket.domain,
        skill:      bucket.skill,
        difficulty: bucket.difficulty,
        type:       bucket.type,
        needed:     bucket.count,
        active:     count,
        sufficient: count >= bucket.count,
      });
    }
  }
  return results;
}

export { MODULE_BLUEPRINTS, MODULE_SECTIONS, EXPECTED_TOTALS };
