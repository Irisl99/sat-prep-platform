/**
 * backend/scripts/importRWCandidates.mjs
 *
 * Reviewed RW candidate importer.
 * Mirrors importMathCandidates.mjs for the Reading & Writing section.
 *
 * Key RW differences from Math importer:
 *   - CORRECTNESS_FIELDS includes passageAppropriate + passageSourceAccurate
 *     instead of conditionsConsistent
 *   - reviewVersion: "rw-review-v1" validated in preflight
 *   - promptVersion: "rw-prompt-v1" validated in batch structure
 *   - passage and passageSource in finalContent assembly and slot consistency
 *   - passage artifact gate applied to passage field
 *   - passageSource vocabulary gate
 *   - parseNumericAnswer() NOT called
 *   - checkExplicitAnswerConsistency() NOT called
 *   - promptVersion NOT persisted to MongoDB (Option B, MVP decision)
 *
 * REVIEWER FIELD POLICY (Option A, matching Math importer):
 *   Only review.reviewer is accepted. review.reviewerId is not a fallback.
 *
 * Usage:
 *   node scripts/importRWCandidates.mjs --file <reviewed-file.json>
 *   node scripts/importRWCandidates.mjs --file <reviewed-file.json> --dry-run
 */

import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import mongoose from "mongoose";
import Question from "../src/models/Question.js";
import {
  validateQuestion,
  containsGenerationArtifacts,
  isDuplicate,
} from "./seedBank.js";

const __dirname        = dirname(fileURLToPath(import.meta.url));
const DEFAULT_MANIFEST = join(__dirname, "..", "data", "rw-imports", "imported-candidates.json");
const DEFAULT_REJ_DIR  = join(__dirname, "..", "data", "rw-rejections");

// RW-specific constants
const EXPECTED_PROMPT_VERSION  = "rw-prompt-v1";
const EXPECTED_REVIEW_VERSION  = "rw-review-v1";
const VALID_PASSAGE_SOURCES    = new Set(["Literature", "History/Social Studies", "Science", "Social Science"]);
const VALID_DECISIONS          = ["Keep", "Edit", "Reject"];
const SLOT_FIELDS              = ["section", "domain", "skill", "difficulty", "type"];

// RW correctness fields — passageAppropriate and passageSourceAccurate replace conditionsConsistent
const CORRECTNESS_FIELDS = [
  "correctAnswer",
  "uniqueAnswer",
  "passageAppropriate",
  "passageSourceAccurate",
  "explanationCorrect",
  "skillTagCorrect",
  "difficultyCorrect",
];

// ── Batch-level structure validation ─────────────────────────
export function validateBatchStructure(data) {
  if (!data || typeof data !== "object")          return "review file is not a JSON object";
  if (!data.generatorVersion)                     return "generatorVersion missing";
  if (!data.promptVersion)                        return "promptVersion missing";
  if (data.promptVersion !== EXPECTED_PROMPT_VERSION)
    return `promptVersion "${data.promptVersion}" must be "${EXPECTED_PROMPT_VERSION}"`;
  if (!data.generatedAt)                          return "generatedAt missing";
  if (!data.generatedByModel)                     return "generatedByModel missing";
  if (!data.slot || typeof data.slot !== "object") return "slot metadata missing";
  if (data.slot.section !== "rw")                return `slot.section must be "rw", got "${data.slot.section}"`;
  if (!Array.isArray(data.candidates))            return "candidates is not an array";
  return null;
}

// ── Per-candidate structure preflight ─────────────────────────
export function validateCandidateStructure(candidate, batchSlot, seenIds) {
  if (!candidate.candidateId || typeof candidate.candidateId !== "string" || candidate.candidateId.trim() === "")
    return "candidateId is missing or empty";
  if (seenIds.has(candidate.candidateId))
    return `candidateId "${candidate.candidateId}" is not unique within this batch`;

  for (const f of SLOT_FIELDS) {
    if (!candidate[f]) return `missing immutable metadata: ${f}`;
    if (batchSlot[f] && candidate[f] !== batchSlot[f])
      return `immutable metadata "${f}" ("${candidate[f]}") does not match batch slot ("${batchSlot[f]}")`;
  }

  // RW-specific required content fields
  for (const f of ["question", "answer", "explanation"]) {
    if (!(f in candidate) || candidate[f] === undefined || candidate[f] === null)
      return `original content field missing: ${f}`;
  }
  if (!("options" in candidate)) return "original content field missing: options";

  // RW-specific: passage and passageSource required
  if (!candidate.passage || typeof candidate.passage !== "string" || candidate.passage.trim() === "")
    return "passage is missing or empty";
  if (!candidate.passageSource || typeof candidate.passageSource !== "string")
    return "passageSource is missing";

  if (!candidate.review || typeof candidate.review !== "object")
    return "review object missing";

  return null;
}

// ── RW review schema validation ───────────────────────────────
export function validateRWReviewSchema(candidate) {
  const r = candidate.review;
  if (!r) return "review block missing";

  // Schema version guard
  if (!r.reviewVersion) return "review.reviewVersion is missing";
  if (r.reviewVersion !== EXPECTED_REVIEW_VERSION)
    return `review.reviewVersion "${r.reviewVersion}" must be "${EXPECTED_REVIEW_VERSION}"`;

  // Reject the wrong-schema field explicitly
  if ("conditionsConsistent" in r)
    return "review.conditionsConsistent must not appear in RW review schema (wrong reviewVersion)";

  // Decision
  const dec = r.decision;
  if (dec === null || dec === undefined) return "decision is null — not yet reviewed";
  if (!VALID_DECISIONS.includes(dec))   return `decision "${dec}" must be Keep/Edit/Reject`;

  // Reviewer field policy (Option A)
  if (!r.reviewer || String(r.reviewer).trim() === "")
    return "review.reviewer is missing or empty (Option A: only review.reviewer accepted)";
  if (!r.reviewedAt || String(r.reviewedAt).trim() === "")
    return "review.reviewedAt is missing or empty";

  // RW correctness fields — all must be explicit booleans
  for (const f of CORRECTNESS_FIELDS) {
    if (!(f in r))                 return `review missing required correctness field: ${f}`;
    if (typeof r[f] !== "boolean") return `review.${f} must be an explicit boolean, not ${JSON.stringify(r[f])}`;
  }

  // Edit requires complete reviewedContent including passage and passageSource
  if (dec === "Edit") {
    const rc = r.reviewedContent;
    if (!rc || typeof rc !== "object") return "Edit decision requires reviewedContent object";
    for (const f of ["passage", "passageSource", "question", "options", "answer", "explanation"]) {
      if (!(f in rc) || rc[f] === undefined)
        return `Edit reviewedContent missing required field: ${f}`;
    }
  }

  return null;
}

// ── Slot metadata consistency ──────────────────────────────────
export function validateSlotConsistency(finalContent, originalCandidate) {
  for (const field of SLOT_FIELDS) {
    if (finalContent[field] !== originalCandidate[field])
      return `slot field "${field}" changed: original="${originalCandidate[field]}" final="${finalContent[field]}"`;
  }
  return null;
}

// ── Full preflight ─────────────────────────────────────────────
export function preflightAllCandidates(candidates, batchSlot) {
  const seenIds = new Set();
  for (const c of candidates) {
    const structErr = validateCandidateStructure(c, batchSlot, seenIds);
    if (structErr) return `Preflight failed on candidate "${c.candidateId || "(no id)"}": ${structErr}`;
    seenIds.add(c.candidateId);
    const schemaErr = validateRWReviewSchema(c);
    if (schemaErr) return `Preflight failed on candidate "${c.candidateId}": ${schemaErr}`;
  }
  return null;
}

// ── Manifest helpers ───────────────────────────────────────────
export function readManifest(manifestPath = DEFAULT_MANIFEST) {
  if (!existsSync(manifestPath)) return [];
  try {
    const data = JSON.parse(readFileSync(manifestPath, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

export function readImportedCandidateIds(manifestPath = DEFAULT_MANIFEST) {
  return new Set(readManifest(manifestPath).map(e => e.candidateId).filter(Boolean));
}

export function appendToManifest(record, manifestPath = DEFAULT_MANIFEST) {
  const dir = dirname(manifestPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const existing = readManifest(manifestPath);
  existing.push(record);
  const tmpPath = manifestPath + ".tmp";
  writeFileSync(tmpPath, JSON.stringify(existing, null, 2), "utf8");
  renameSync(tmpPath, manifestPath);
}

// ── Rejection audit writer (atomic) ───────────────────────────
export function writeRejectionAudit(entries, reviewFile, rejDir = DEFAULT_REJ_DIR) {
  if (!existsSync(rejDir)) mkdirSync(rejDir, { recursive: true });
  const ts       = new Date().toISOString().replace(/[:.]/g, "-");
  const base     = reviewFile.split("/").pop().replace(".json", "");
  const filename = `rejection_${base}_${ts}.json`;
  const finalPath = join(rejDir, filename);
  const tmpPath   = finalPath + ".tmp";
  writeFileSync(tmpPath, JSON.stringify({
    reviewFile, rejectedAt: new Date().toISOString(), entries
  }, null, 2), "utf8");
  renameSync(tmpPath, finalPath);
  return finalPath;
}

// ── Main import logic ──────────────────────────────────────────
export async function importReviewFile(reviewFilePath, manifestPath, rejDir, { dryRun = false } = {}) {
  let reviewData;
  try { reviewData = JSON.parse(readFileSync(reviewFilePath, "utf8")); }
  catch (err) { throw new Error(`Cannot read review file: ${err.message}`); }

  // Layer 1: batch structure
  const batchErr = validateBatchStructure(reviewData);
  if (batchErr) throw new Error(`Batch validation failed: ${batchErr}`);

  const candidates = reviewData.candidates;
  if (candidates.length === 0) {
    console.log("[import] No candidates — nothing to import.");
    return { inserted: 0, reviewerRejected: 0, gateRejected: 0, skippedImported: 0, dbErrors: 0, manifestErrors: 0 };
  }

  // Layer 2: full preflight — all candidates before any insertion
  const preflightErr = preflightAllCandidates(candidates, reviewData.slot);
  if (preflightErr) throw new Error(preflightErr);

  const importedIds = readImportedCandidateIds(manifestPath);
  let inserted = 0, reviewerRejected = 0, gateRejected = 0, skippedImported = 0, dbErrors = 0, manifestErrors = 0;
  const rejectionLog = [];

  for (const candidate of candidates) {
    const { candidateId } = candidate;
    const decision = candidate.review.decision;

    // Reviewer Reject
    if (decision === "Reject") {
      const tag = dryRun ? "[dry-run][reject]" : "[reject]";
      console.log(`  ${tag} ${candidateId}: reviewer decision=Reject`);
      rejectionLog.push({
        candidateId, decision: "Reject", rejectStage: "reviewer_reject",
        rejectReason: "reviewer decision=Reject",
        reviewer: candidate.review.reviewer, reviewedAt: candidate.review.reviewedAt,
        reviewFile: reviewFilePath, recordedAt: new Date().toISOString(),
      });
      reviewerRejected++;
      continue;
    }

    // Gate 1: manifest check
    if (importedIds.has(candidateId)) {
      const tag = dryRun ? "[dry-run][skip]" : "[skip]";
      console.log(`  ${tag} ${candidateId}: already in import manifest`);
      skippedImported++;
      continue;
    }

    // Assemble finalContent
    const slot = {
      section: candidate.section, domain: candidate.domain, skill: candidate.skill,
      difficulty: candidate.difficulty, type: candidate.type,
    };
    let finalContent;
    if (decision === "Keep") {
      finalContent = {
        ...slot,
        passage: candidate.passage, passageSource: candidate.passageSource,
        question: candidate.question, options: candidate.options,
        answer: candidate.answer, explanation: candidate.explanation,
      };
    } else {
      const rc = candidate.review.reviewedContent;
      finalContent = {
        ...slot,
        passage: rc.passage, passageSource: rc.passageSource,
        question: rc.question, options: rc.options,
        answer: rc.answer, explanation: rc.explanation,
      };
    }

    const addGateReject = (stage, reason) => {
      const tag = dryRun ? "[dry-run][gate_reject]" : "[gate_reject]";
      console.warn(`  ${tag} ${candidateId}: ${stage}: ${reason}`);
      rejectionLog.push({
        candidateId, decision, rejectStage: stage, rejectReason: reason,
        reviewer: candidate.review.reviewer, reviewedAt: candidate.review.reviewedAt,
        reviewFile: reviewFilePath, recordedAt: new Date().toISOString(),
      });
      gateRejected++;
    };

    // Gate 2: slot metadata consistency
    const slotErr = validateSlotConsistency(finalContent, candidate);
    if (slotErr) { addGateReject("slot_consistency", slotErr); continue; }

    // Gate 3: structural validation
    let structErr;
    try { validateQuestion(finalContent, slot); } catch (err) { structErr = err.message; }
    if (structErr) { addGateReject("structural", structErr); continue; }

    // Gate 4: artifact detection on explanation
    const expArtifact = containsGenerationArtifacts(finalContent);
    if (expArtifact) { addGateReject("artifact", `matched "${expArtifact}"`); continue; }

    // Gate 5: passage artifact detection
    const passageArtifact = containsGenerationArtifacts({ explanation: finalContent.passage });
    if (passageArtifact) { addGateReject("passage_artifact", `matched "${passageArtifact}"`); continue; }

    // Gate 6: passageSource vocabulary
    if (!VALID_PASSAGE_SOURCES.has(finalContent.passageSource)) {
      addGateReject("passage_source_invalid",
        `passageSource "${finalContent.passageSource}" is not one of: ${[...VALID_PASSAGE_SOURCES].join(" | ")}`);
      continue;
    }

    // Gate 7: duplicate detection
    const dup = await isDuplicate(finalContent.question);
    if (dup) { addGateReject("duplicate", "question already exists in MongoDB"); continue; }

    if (dryRun) {
      console.log(`  [dry-run][would-insert] ${candidateId}: all gates pass`);
      inserted++;
      continue;
    }

    // Gate 8: Question.create
    // NOTE: promptVersion not persisted to MongoDB (Option B, MVP decision)
    // promptVersion remains in candidate JSON file. Traceable via candidateId -> manifest.
    let doc;
    try {
      doc = await Question.create({
        section:          finalContent.section,
        domain:           finalContent.domain,
        skill:            finalContent.skill,
        difficulty:       finalContent.difficulty,
        type:             finalContent.type,
        passage:          finalContent.passage,
        passageSource:    finalContent.passageSource,
        question:         finalContent.question,
        options:          finalContent.options ?? null,
        answer:           String(finalContent.answer),
        explanation:      finalContent.explanation,
        status:           "structurally_validated",
        version:          1,
        generatedByModel: reviewData.generatedByModel,
        generatedAt:      reviewData.generatedAt ? new Date(reviewData.generatedAt) : new Date(),
        useCount:         0,
        lastUsedAt:       null,
      });
    } catch (err) {
      console.error(`  [db_error] ${candidateId}: ${err.message}`);
      rejectionLog.push({
        candidateId, decision, rejectStage: "db_error", rejectReason: err.message,
        reviewer: candidate.review.reviewer, reviewedAt: candidate.review.reviewedAt,
        reviewFile: reviewFilePath, recordedAt: new Date().toISOString(),
      });
      dbErrors++;
      continue;
    }

    console.log(`  [imported] ${candidateId} -> _id=${doc._id}`);
    inserted++;
    importedIds.add(candidateId);

    // Append to manifest (atomic)
    const record = {
      candidateId, questionId: String(doc._id), reviewFile: reviewFilePath,
      reviewer: candidate.review.reviewer, decision, importedAt: new Date().toISOString(),
    };
    try {
      appendToManifest(record, manifestPath);
    } catch (err) {
      manifestErrors++;
      console.error(`\n  *** MANIFEST WRITE FAILED ***`);
      console.error(`  candidateId: ${candidateId}`);
      console.error(`  inserted _id: ${doc._id}`);
      console.error(`  error: ${err.message}`);
      console.error(`  ACTION REQUIRED: Record this import manually.\n`);
    }
  }

  // Write rejection audit (skip in dry-run)
  if (!dryRun && rejectionLog.length > 0) {
    try {
      const ap = writeRejectionAudit(rejectionLog, reviewFilePath, rejDir);
      console.log(`  [audit] Written: ${ap}`);
    } catch (err) {
      console.warn(`  [audit_warn] Could not write rejection audit: ${err.message}`);
    }
  }

  return { inserted, reviewerRejected, gateRejected, skippedImported, dbErrors, manifestErrors };
}

// ── Main ───────────────────────────────────────────────────────
export async function main() {
  const args         = process.argv.slice(2);
  const fileIdx      = args.indexOf("--file");
  const isDryRun     = args.includes("--dry-run");
  const manifestPath = process.env.RW_IMPORT_MANIFEST || DEFAULT_MANIFEST;
  const rejDir       = process.env.RW_REJECTION_DIR   || DEFAULT_REJ_DIR;

  if (fileIdx === -1 || !args[fileIdx + 1]) {
    console.error("[importRWCandidates] Usage: --file <reviewed-file.json> [--dry-run]");
    process.exit(1);
  }
  const reviewFilePath = args[fileIdx + 1];
  if (!existsSync(reviewFilePath)) {
    console.error(`[importRWCandidates] File not found: ${reviewFilePath}`);
    process.exit(1);
  }

  console.log("\n=== importRWCandidates.mjs ===");
  console.log(`Mode:        ${isDryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Review file: ${reviewFilePath}`);
  console.log(`Manifest:    ${manifestPath}`);

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("[importRWCandidates] Connected\n");

  let result;
  try {
    result = await importReviewFile(reviewFilePath, manifestPath, rejDir, { dryRun: isDryRun });
  } catch (err) {
    console.error(`[importRWCandidates] Fatal: ${err.message}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`\n=== ${isDryRun ? "DRY RUN" : "IMPORT"} COMPLETE ===`);
  console.log(`  inserted:           ${result.inserted}`);
  console.log(`  reviewer rejected:  ${result.reviewerRejected}`);
  console.log(`  gate rejected:      ${result.gateRejected}`);
  console.log(`  skipped (imported): ${result.skippedImported}`);
  console.log(`  db errors:          ${result.dbErrors}`);
  console.log(`  manifest errors:    ${result.manifestErrors}`);
  if (isDryRun)              console.log("\n  Dry run — 0 writes made.");
  if (result.manifestErrors) console.error("\n  WARNING: manifest write(s) failed — verify above candidateIds manually.");

  await mongoose.disconnect();
}

// ── Direct-execution guard ─────────────────────────────────────
// Importing this module causes ZERO side effects.
const isDirectExecution =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  main().catch(err => {
    console.error("[importRWCandidates] Fatal:", err.message);
    process.exit(1);
  });
}
