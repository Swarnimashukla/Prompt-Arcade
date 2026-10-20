// Shared rubric loading and scoring for the Netlify functions.
//
// This file lives in lib/ so Netlify does not treat it as a function of
// its own: only top-level files in the functions directory, and
// directories containing a file of the same name, become endpoints.
//
// The scoring here is deliberately identical to what js/evaluator.js used
// to do in the browser. Moving it server-side changes WHERE it runs, not
// WHAT it decides, so nobody's past tier changes meaning.

const fs = require('fs');
const path = require('path');

// track and sub are interpolated into a filename, so they are validated
// strictly rather than escaped. Anything that is not a plain lowercase
// slug is refused outright; there is no path traversal to reason about
// if '/', '.' and '\' can never appear.
const SLUG = /^[a-z][a-z0-9]{0,23}$/;

function rubricPath(track, subdomain, n) {
  if (!SLUG.test(track) || !SLUG.test(subdomain)) return null;
  const level = Number(n);
  if (!Number.isInteger(level) || level < 1 || level > 99) return null;
  const file = `${track}-${subdomain}-${level}.json`;
  // included_files places rubrics/ relative to the repo root; a couple of
  // candidates keeps this working under `netlify dev` too.
  for (const base of [process.cwd(), path.join(process.cwd(), '..'), '/var/task']) {
    const p = path.join(base, 'rubrics', file);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function loadRubric(track, subdomain, n) {
  const p = rubricPath(track, subdomain, n);
  if (!p) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
}

// Ported verbatim from js/tokens.js so the meter and the score agree.
function estimateTokens(text) {
  if (!text) return 0;
  const trimmed = String(text).trim();
  if (!trimmed) return 0;
  const charBased = Math.ceil(trimmed.length / 4);
  const wordBased = Math.ceil(trimmed.split(/\s+/).length / 0.75);
  return Math.round((charBased + wordBased) / 2);
}

function tierFromScore(score10, passedBudget, responsibilityCue) {
  if (score10 < 6) return { name: 'Draft', level: 0, blurb: 'Underspecified. Add context, constraints, or output shape.' };
  if (score10 < 7 || !passedBudget) return { name: 'Solid', level: 1, blurb: 'Rubric pass. Tighten for token efficiency to reach Sharp.' };
  if (score10 < 8 || !responsibilityCue) return { name: 'Sharp', level: 2, blurb: 'Specific and efficient. Add a refusal, citation, or fact-check to reach Surgical.' };
  return { name: 'Surgical', level: 3, blurb: 'Precise, efficient, and responsibility-aware. This prompt would survive a stakeholder review.' };
}

const RESPONSIBILITY = /not |don.?t |avoid|cite|source|verbatim|flag|refus|bias|pii|privacy|hallucinat|verify|uncertain/i;

// Does this text instruct an assistant, or only describe a situation?
//
// Every dimension above measures what a prompt INSTRUCTS, and the
// patterns were authored from each level's scenario — which makes the
// scenario a near-perfect match for its own rubric. Pasting the brief
// back scored 8/10 or better on 28 of the 45 levels and reached the top
// tier on 20 of them. No per-dimension fix reaches that, because every
// dimension is genuinely satisfied; what is missing is the ask.
//
// The judge answers this properly. This is the model-free version for
// when no key is configured, and it is tuned so its errors fall the
// safe way: across all 45 reference answers it gates none of them, and
// it catches 40 of the 45 brief-pastes. Being too generous leaves
// today's behaviour; being too strict would fail someone who did the
// work, so the first error is the one to prefer.
// Verbs that are rarely sentence-initial nouns. Opening a clause with
// one is enough on its own.
const CLEAR_VERB = [
  'write', 'rank', 'draft', 'summaris', 'summariz', 'analys', 'analyz',
  'explain', 'compare', 'identify', 'generate', 'produce', 'create',
  'suggest', 'recommend', 'rewrite', 'propose', 'cite', 'include', 'exclude',
  'avoid', 'keep', 'build', 'consider', 'assume', 'pretend', 'respond',
  'limit', 'highlight', 'critique', 'evaluate', 'verify', 'translat',
  'convert', 'extract', 'classif', 'walk', 'think', 'make', 'give', 'tell',
  'ask', 'show', 'find', 'outline', 'flag'
].join('|');

// Verbs that double as ordinary nouns. "Returns rate jumped" and "Design
// review is on Friday" both open a sentence with one and instruct
// nobody, so these only count with an object after them. Getting this
// wrong in the other direction is what made the brief you paste read as
// a prompt.
const NOUNY_VERB = [
  'design', 'review', 'answer', 'format', 'structure', 'plan', 'map',
  'turn', 'check', 'list', 'score', 'rate', 'label', 'group', 'sort',
  'focus', 'end', 'start', 'use', 'add', 'remove', 'output', 'return'
].join('|');

const OBJECT = '(the|a|an|this|that|these|those|each|every|all|any|my|your|our'
  + '|their|its|it|them|me|us|how|what|which|why|where|when|\\d+|one|two|three'
  + '|four|five|six|seven|eight|nine|ten|only|exactly|at least|no more)';

const CLAUSE_START = '(^|[.!?;:\\n]\\s*|^\\s*[-*\\d.)]+\\s*)';

const INSTRUCTION = new RegExp(
  // "Rank the five hypotheses", "Explain why"
  CLAUSE_START + '(' + CLEAR_VERB + ')(e|es|ed|ing|y)?\\b'
  // "List the three options" — but not "List price is £40"
  + '|' + CLAUSE_START + '(' + NOUNY_VERB + ')\\s+' + OBJECT + '\\b'
  // role assignment: "Act as a senior reviewer", "You're a writing partner"
  + '|\\b(act|respond|reply|behave|answer|write) as\\b'
  + '|\\byou.?(re|are|will be|act|should|must)\\b'
  // a direct ask
  + '|\\b(i want|i need|i.d like|please|your (task|job|goal|role) is)\\b'
  // a negative instruction: "do not propose redesigns"
  + '|\\bdo (not|n.t)\\b.{0,40}\\b(' + CLEAR_VERB + '|' + NOUNY_VERB + ')\\b',
  'i'
);

// `verdicts` is optional. When the evidence-grounded judge in judge.js
// has graded the attempt, it arrives here as a map of criterion id ->
// { passed, quote } and replaces the regex decision for every check.
// The arithmetic above and below it is untouched either way, so a tier
// means the same thing whichever engine decided the checks.
function scoreText(prompt, rubric, verdicts) {
  const text = String(prompt || '').trim();
  const judged = verdicts && verdicts.verdicts ? verdicts.verdicts : null;

  const dimensions = (rubric.dimensions || []).map(dim => {
    const results = dim.checks.map((c, i) => {
      const v = judged ? judged[`${dim.key}:${i}`] : null;
      return {
        passed: v ? v.passed : new RegExp(c.pattern, 'i').test(text),
        quote: v ? v.quote : null,
        tip: c.tip
      };
    });
    return {
      key: dim.key,
      label: dim.label,
      pts: results.filter(r => r.passed).length,
      max: dim.checks.length,
      // Only the tips for FAILED checks go back, and never the patterns.
      // The tip says what is missing; the pattern would say exactly which
      // characters to paste, which is the thing worth protecting.
      tips: results.filter(r => !r.passed).map(r => r.tip),
      // The learner's own words, quoted back as the reason each point was
      // awarded. Empty on the regex path, which has no evidence to show.
      evidence: results.filter(r => r.passed && r.quote).map(r => r.quote)
    };
  });

  const totalPts = dimensions.reduce((a, d) => a + d.pts, 0);
  const totalMax = dimensions.reduce((a, d) => a + d.max, 0) || 1;
  const score10 = Math.max(1, Math.round((totalPts / totalMax) * 10));

  const tokens = estimateTokens(text);
  const badTokens = estimateTokens(rubric.badPrompt || '');
  const budget = rubric.tokenBudget || 300;
  const passedBudget = tokens <= budget;

  // The token budget stays arithmetic — it needs no model and must not
  // drift. The responsibility cue is a judgement, so the judge takes it
  // when it is available; the regex is the fallback, and it is a crude
  // one, since it passes on the word "not" appearing for any reason.
  const respVerdict = judged ? judged.responsibility : null;
  const responsibilityCue = respVerdict ? respVerdict.passed : RESPONSIBILITY.test(text);

  // The gate. Every dimension above measures what the prompt INSTRUCTS,
  // so each one can be satisfied by material that instructs nothing —
  // most cheaply by pasting the brief back, which the rubric patterns
  // were written from and therefore match almost perfectly. The tier is
  // a claim about prompt quality, and no amount of right vocabulary
  // makes a description into a prompt. The dimension scores stay as the
  // judge found them, because "you had all the material and never asked
  // for anything" is the more useful thing to be shown than a zero.
  const instrVerdict = judged ? judged.instruction : null;
  const wroteAnInstruction = instrVerdict ? instrVerdict.passed : INSTRUCTION.test(text);

  const tier = wroteAnInstruction
    ? tierFromScore(score10, passedBudget, responsibilityCue)
    : {
        name: 'Draft', level: 0,
        blurb: 'This describes the situation but never asks for anything. The material below is all present — turn it into instructions and re-evaluate.'
      };

  return {
    score: score10,
    tier,
    wroteAnInstruction,
    dimensions, tokens, badTokens, budget, responsibilityCue, passedBudget,
    responsibilityQuote: respVerdict ? respVerdict.quote : null,
    engine: judged ? 'judge' : 'rubric',
    judgeModel: judged ? verdicts.model : null,
    evidenceRejected: judged ? verdicts.evidenceRejected : 0,
    // Why the regex path was taken, so the panel can say which problem
    // this is rather than guessing at one.
    fallbackReason: judged ? null : ((verdicts && verdicts.unavailable) || 'not-configured')
  };
}

// The fields safe to render BEFORE an attempt. Note what is absent:
// dimensions (and so every pattern), goldPrompt, badOutput, tipIfLow.
function briefOf(r) {
  return {
    id: r.id, track: r.track, trackLabel: r.trackLabel,
    subdomain: r.subdomain, subdomainLabel: r.subdomainLabel,
    level: r.level, title: r.title, brand: r.brand, domain: r.domain,
    persona: r.persona, scenario: r.scenario, techniques: r.techniques,
    tokenBudget: r.tokenBudget, badPrompt: r.badPrompt,
    hints: r.hints, guideAnchor: r.guideAnchor
  };
}

module.exports = { loadRubric, scoreText, estimateTokens, briefOf, SLUG };
