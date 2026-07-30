import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const REQUIRED_FIELDS = {
  rw:   ['section', 'type', 'difficulty', 'topic', 'passage', 'question', 'options', 'answer', 'explanation'],
  math: ['section', 'type', 'difficulty', 'topic', 'question', 'answer', 'explanation'],
};

const PROMPTS = {
  rw: (difficulty, count) => `Generate exactly ${count} Digital SAT Reading and Writing questions.
Difficulty: ${diffDesc(difficulty)}
Include: craft and structure (30%), information and ideas (30%), expression of ideas (25%), standard English conventions (15%).
Each question must include a short passage (30–80 words) from literature, history, science, or social science.
Return ONLY a valid JSON array, no markdown fences, no preamble.
Schema: [{ "section":"rw","type":"mcq","difficulty":"easy"|"medium"|"hard","topic":"string","passage":"string","passageSource":"string","question":"string","options":["A text","B text","C text","D text"],"answer":"A"|"B"|"C"|"D","explanation":"string" }]`,

  math: (difficulty, count) => `Generate exactly ${count} Digital SAT Math questions.
Difficulty: ${diffDesc(difficulty)}
Include: algebra (35%), advanced math (35%), problem-solving & data analysis (15%), geometry & trig (15%).
About 75% MCQ, 25% grid-in (student-produced response, type:"grid", options:null).
Return ONLY a valid JSON array, no markdown fences, no preamble.
Schema: [{ "section":"math","type":"mcq"|"grid","difficulty":"easy"|"medium"|"hard","topic":"string","question":"string","options":["A text","B text","C text","D text"]|null,"answer":"A"|"B"|"C"|"D"|"<number_string>","explanation":"string" }]`,
};

function diffDesc(d) {
  return {
    mixed: 'a mix of easy (40%), medium (40%), hard (20%)',
    easy:  'easy and medium difficulty (score range 200-550)',
    hard:  'medium and hard difficulty (score range 550-800)',
  }[d];
}

async function attemptGeneration(section, difficulty, count, attempt) {
  const prompt = PROMPTS[section](difficulty, count);
  const t0 = Date.now();

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 16000,
    messages: [{ role: 'user', content: prompt }],
  });

  const duration = ((Date.now() - t0) / 1000).toFixed(1);
  const stopReason = message.stop_reason;

  console.log(`[questionGenerator] attempt=${attempt} section=${section} difficulty=${difficulty} count=${count} stop_reason=${stopReason} duration=${duration}s`);

  if (stopReason === 'max_tokens') {
    throw new Error(`Generation truncated by max_tokens on attempt ${attempt} (section=${section}, count=${count})`);
  }

  const raw = message.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const clean = raw.replace(/```json|```/g, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch (err) {
    throw new Error(`JSON parse failed on attempt ${attempt}: ${err.message} (section=${section})`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Response is not an array on attempt ${attempt} (section=${section}, type=${typeof parsed})`);
  }

  if (parsed.length !== count) {
    throw new Error(`Question count mismatch on attempt ${attempt}: got ${parsed.length}, expected ${count} (section=${section})`);
  }

  const required = REQUIRED_FIELDS[section];
  for (let i = 0; i < parsed.length; i++) {
    const q = parsed[i];

    const missing = required.filter(f => !(f in q) || q[f] === null || q[f] === undefined || q[f] === '');
    if (missing.length > 0) {
      throw new Error(`Question ${i + 1} missing required fields on attempt ${attempt}: [${missing.join(', ')}] (section=${section})`);
    }

    if (q.type === 'grid') {
      if (Array.isArray(q.options) && q.options.length > 0) {
        throw new Error(`Question ${i + 1} is type=grid but has non-empty options on attempt ${attempt} (section=${section})`);
      }
    } else {
      if (!Array.isArray(q.options) || q.options.length === 0) {
        throw new Error(`Question ${i + 1} is type=${q.type} but options is missing or empty on attempt ${attempt} (section=${section})`);
      }
    }
  }

  console.log(`[questionGenerator] attempt=${attempt} PASSED validation: ${parsed.length} questions returned`);
  return parsed.map((q, i) => ({ ...q, _idx: i }));
}

export async function generateQuestions(section, difficulty, count) {
  try {
    return await attemptGeneration(section, difficulty, count, 1);
  } catch (err) {
    console.warn(`[questionGenerator] attempt=1 FAILED: ${err.message} — retrying once`);
  }

  try {
    return await attemptGeneration(section, difficulty, count, 2);
  } catch (err) {
    console.error(`[questionGenerator] attempt=2 FAILED: ${err.message} — aborting`);
    throw new Error(`Question generation failed after 2 attempts (section=${section}, difficulty=${difficulty}, count=${count}): ${err.message}`);
  }
}

export async function generateWeaknessReport(modules) {
  const summary = modules.map(m => ({
    moduleId: m.moduleId,
    section: m.section,
    difficulty: m.difficulty,
    questions: m.questions.map((q, i) => ({
      topic: q.topic,
      difficulty: q.difficulty,
      correct: String(m.answers?.[i]) === String(q.answer),
    })),
  }));

  const prompt = `Given this SAT exam performance data, generate a detailed weakness analysis report.
Data: ${JSON.stringify(summary)}
Return ONLY a JSON object (no markdown) with this schema:
{
  "domains": [{ "name":"string","section":"rw"|"math","correct":number,"total":number,"accuracy":number,"status":"strong"|"good"|"needs_work"|"critical","subTopics":["string"],"insight":"string" }],
  "flags": [{ "title":"string","description":"string","priority":"high"|"medium"|"low","section":"rw"|"math","errorCount":number }],
  "recommendations": ["string"],
  "summary": "string"
}`;

  const t0 = Date.now();
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const duration = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[questionGenerator] weaknessReport stop_reason=${message.stop_reason} duration=${duration}s`);

  const text = message.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const clean = text.replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(clean);
  } catch (err) {
    throw new Error(`Weakness report JSON parse failed: ${err.message}`);
  }
}
