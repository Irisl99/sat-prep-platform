import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MAX_RETRIES = 2;

const PROMPTS = {
  rw: (difficulty, count) =>
    `Generate exactly ${count} Digital SAT Reading and Writing questions.
Difficulty: ${diffDesc(difficulty)}
Include: craft and structure (30%), information and ideas (30%), expression of ideas (25%), standard English conventions (15%).
Each question MUST include a short passage (30-80 words) from literature, history, science, or social science.
Return ONLY a valid JSON array, no markdown fences, no preamble.
Schema: [{ "section":"rw","type":"mcq","difficulty":"easy"|"medium"|"hard","topic":"string","passage":"string","passageSource":"string","question":"string","options":["A text","B text","C text","D text"],"answer":"A"|"B"|"C"|"D","explanation":"string" }]`,

  math: (difficulty, count) =>
    `Generate exactly ${count} Digital SAT Math questions.
Difficulty: ${diffDesc(difficulty)}
Include: algebra (35%), advanced math (35%), problem-solving & data analysis (15%), geometry & trig (15%).
About 75% MCQ, 25% grid-in (type:"grid", options:null).
Return ONLY a valid JSON array, no markdown fences, no preamble.
Schema: [{ "section":"math","type":"mcq"|"grid","difficulty":"easy"|"medium"|"hard","topic":"string","question":"string","options":["A text","B text","C text","D text"]|null,"answer":"A"|"B"|"C"|"D"|"<number_string>","explanation":"string" }]`,
};

function diffDesc(d) {
  return {
    mixed: 'a mix of easy (40%), medium (40%), hard (20%)',
    easy:  'easy and medium difficulty (score range 200-550)',
    hard:  'medium and hard difficulty (score range 550-800)',
  }[d] ?? d;
}

async function generateRawQuestions(section, difficulty, count) {
  const prompt = PROMPTS[section]?.(difficulty, count);
  if (!prompt) throw new Error(`Unknown section: "${section}"`);

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
  });

  if (message.stop_reason === 'max_tokens') {
    throw new Error(`Generation truncated by max_tokens (section=${section}, count=${count})`);
  }

  const text = message.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const clean = text.replace(/```json|```/g, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch (err) {
    throw new Error(`JSON parse failed: ${err.message}`);
  }

  if (!Array.isArray(parsed)) throw new Error(`Response is not a JSON array (got ${typeof parsed})`);
  return parsed;
}

export function validateRWQuestion(q) {
  if (!q || typeof q !== 'object') return 'candidate is not an object';
  if (q.section !== 'rw')   return `section must be "rw", got "${q.section}"`;
  if (q.type   !== 'mcq')   return `type must be "mcq" for RW, got "${q.type}"`;
  if (!['easy','medium','hard'].includes(q.difficulty)) return `difficulty must be easy|medium|hard, got "${q.difficulty}"`;
  if (!q.topic || typeof q.topic !== 'string' || q.topic.trim() === '') return 'topic/domain metadata missing or empty';
  if (!q.passage || typeof q.passage !== 'string' || q.passage.trim() === '') return 'passage/stimulus missing or empty';
  if (!q.question || typeof q.question !== 'string' || q.question.trim() === '') return 'question stem missing or empty';
  if (!Array.isArray(q.options)) return `options must be an array, got ${typeof q.options}`;
  if (q.options.length !== 4) return `options must have exactly 4 choices, got ${q.options.length}`;
  for (let i = 0; i < 4; i++) {
    if (!q.options[i] || typeof q.options[i] !== 'string' || q.options[i].trim() === '') return `option ${i+1} is empty or invalid`;
  }
  const normalized = q.options.map(o => o.trim().toLowerCase());
  if (new Set(normalized).size !== 4) return 'duplicate answer choices detected';
  if (!['A','B','C','D'].includes(q.answer)) return `answer must be A|B|C|D, got "${q.answer}"`;
  if (!q.explanation || typeof q.explanation !== 'string' || q.explanation.trim() === '') return 'explanation missing or empty';
  return null;
}

export function validateMathQuestion(q) {
  if (!q || typeof q !== 'object') return 'candidate is not an object';
  if (q.section !== 'math') return `section must be "math", got "${q.section}"`;
  if (!['mcq','grid'].includes(q.type)) return `type must be mcq|grid, got "${q.type}"`;
  if (!['easy','medium','hard'].includes(q.difficulty)) return `difficulty must be easy|medium|hard, got "${q.difficulty}"`;
  if (!q.topic || typeof q.topic !== 'string' || q.topic.trim() === '') return 'topic/domain metadata missing or empty';
  if (!q.question || typeof q.question !== 'string' || q.question.trim() === '') return 'question stem missing or empty';
  if (q.type === 'mcq') {
    if (!Array.isArray(q.options) || q.options.length !== 4) return `MCQ options must be array of 4, got ${Array.isArray(q.options) ? q.options.length : typeof q.options}`;
    for (let i = 0; i < 4; i++) {
      if (!q.options[i] || q.options[i].trim() === '') return `option ${i+1} is empty`;
    }
    const normalized = q.options.map(o => o.trim().toLowerCase());
    if (new Set(normalized).size !== 4) return 'duplicate answer choices';
    if (!['A','B','C','D'].includes(q.answer)) return `MCQ answer must be A|B|C|D, got "${q.answer}"`;
  } else {
    if (Array.isArray(q.options) && q.options.length > 0) return 'grid-in must not have options array';
    if (!q.answer || String(q.answer).trim() === '') return 'grid-in answer missing';
  }
  if (!q.explanation || typeof q.explanation !== 'string' || q.explanation.trim() === '') return 'explanation missing or empty';
  return null;
}

export async function generateAndValidateQuestions(section, difficulty, count) {
  const validator = section === 'rw' ? validateRWQuestion : validateMathQuestion;
  const accepted  = [];
  const rejections = [];
  let attempt = 0;

  while (accepted.length < count && attempt < MAX_RETRIES) {
    attempt++;
    const needed = count - accepted.length;
    let raw;
    try {
      raw = await generateRawQuestions(section, difficulty, needed);
    } catch (err) {
      console.error(`[questionGenerator] attempt=${attempt} generation failed: ${err.message}`);
      continue;
    }
    for (const q of raw) {
      const err = validator(q);
      if (err) {
        console.warn(`[questionGenerator] attempt=${attempt} REJECT: ${err}`);
        rejections.push({ reason: err, attempt, question: q });
      } else {
        accepted.push(q);
        if (accepted.length >= count) break;
      }
    }
    console.log(`[questionGenerator] attempt=${attempt} section=${section} accepted=${accepted.length}/${count} rejected=${rejections.length}`);
  }

  return { questions: accepted, rejections };
}

export async function generateWeaknessReport(modules) {
  const summary = modules.map(m => ({
    moduleId: m.moduleId, section: m.section, difficulty: m.difficulty,
    questions: m.questions.map((q, i) => ({
      topic: q.topic, difficulty: q.difficulty,
      correct: String(m.answers?.[i]) === String(q.answer),
    })),
  }));

  const prompt = `Given this SAT exam performance data, generate a detailed weakness analysis report.
Data: ${JSON.stringify(summary)}
Return ONLY a JSON object (no markdown) with this schema:
{ "domains": [{ "name":"string","section":"rw"|"math","correct":number,"total":number,"accuracy":number,"status":"strong"|"good"|"needs_work"|"critical","subTopics":["string"],"insight":"string" }], "flags": [{ "title":"string","description":"string","priority":"high"|"medium"|"low","section":"rw"|"math","errorCount":number }], "recommendations": ["string"], "summary": "string" }`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6', max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content.filter(b => b.type === 'text').map(b => b.text).join('');
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}
