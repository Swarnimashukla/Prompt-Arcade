// Loads a rubric JSON and scores a prompt against its dimensions.
// Returns a tier badge: Draft / Solid / Sharp / Surgical.

const PA_Evaluator = (() => {
  async function loadRubric(track, subdomain, n) {
    const url = `rubrics/${track}-${subdomain}-${n}.json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not load rubric ${url}`);
    return res.json();
  }

  function tierFromScore(score10, passedBudget, responsibilityCue) {
    // Draft   : <6/10. The prompt is underspecified.
    // Solid   : ≥6/10. Rubric pass.
    // Sharp   : ≥7/10 AND under token budget.
    // Surgical: ≥8/10 AND under budget AND responsibility cue.
    if (score10 < 6) return { name: 'Draft', level: 0, blurb: 'Underspecified. Add context, constraints, or output shape.' };
    if (score10 < 7 || !passedBudget) return { name: 'Solid', level: 1, blurb: 'Rubric pass. Tighten for token efficiency to reach Sharp.' };
    if (score10 < 8 || !responsibilityCue) return { name: 'Sharp', level: 2, blurb: 'Specific and efficient. Add a refusal, citation, or fact-check to reach Surgical.' };
    return { name: 'Surgical', level: 3, blurb: 'Precise, efficient, and responsibility-aware. This prompt would survive a stakeholder review.' };
  }

  function score(prompt, rubric) {
    const text = (prompt || '').trim();
    const dimensions = rubric.dimensions.map(dim => {
      const checkResults = dim.checks.map(c => {
        const re = new RegExp(c.pattern, 'i');
        return { passed: re.test(text), tip: c.tip };
      });
      const pts = checkResults.filter(r => r.passed).length;
      return {
        key: dim.key,
        label: dim.label,
        pts,
        max: dim.checks.length,
        tips: checkResults.filter(r => !r.passed).map(r => r.tip)
      };
    });
    const totalPts = dimensions.reduce((a, b) => a + b.pts, 0);
    const totalMax = dimensions.reduce((a, b) => a + b.max, 0);
    const score10 = Math.max(1, Math.round((totalPts / totalMax) * 10));

    const tokens = (window.PA_Tokens && window.PA_Tokens.estimate(text)) || 0;
    const badTokens = (window.PA_Tokens && window.PA_Tokens.estimate(rubric.badPrompt || '')) || 0;
    const budget = rubric.tokenBudget || 300;
    const passedBudget = tokens <= budget;
    const responsibilityCue = /not |don.?t |avoid|cite|source|verbatim|flag|refus|bias|pii|privacy|hallucinat|verify|uncertain/i.test(text);

    const tier = tierFromScore(score10, passedBudget, responsibilityCue);

    return {
      score: score10,
      tier,
      dimensions,
      tokens,
      badTokens,
      budget,
      responsibilityCue,
      passedBudget
    };
  }

  return { loadRubric, score };
})();

if (typeof window !== 'undefined') window.PA_Evaluator = PA_Evaluator;
