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

function scoreText(prompt, rubric) {
  const text = String(prompt || '').trim();

  const dimensions = (rubric.dimensions || []).map(dim => {
    const results = dim.checks.map(c => ({
      passed: new RegExp(c.pattern, 'i').test(text),
      tip: c.tip
    }));
    return {
      key: dim.key,
      label: dim.label,
      pts: results.filter(r => r.passed).length,
      max: dim.checks.length,
      // Only the tips for FAILED checks go back, and never the patterns.
      // The tip says what is missing; the pattern would say exactly which
      // characters to paste, which is the thing worth protecting.
      tips: results.filter(r => !r.passed).map(r => r.tip)
    };
  });

  const totalPts = dimensions.reduce((a, d) => a + d.pts, 0);
  const totalMax = dimensions.reduce((a, d) => a + d.max, 0) || 1;
  const score10 = Math.max(1, Math.round((totalPts / totalMax) * 10));

  const tokens = estimateTokens(text);
  const badTokens = estimateTokens(rubric.badPrompt || '');
  const budget = rubric.tokenBudget || 300;
  const passedBudget = tokens <= budget;
  const responsibilityCue = RESPONSIBILITY.test(text);

  return {
    score: score10,
    tier: tierFromScore(score10, passedBudget, responsibilityCue),
    dimensions, tokens, badTokens, budget, responsibilityCue, passedBudget
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
