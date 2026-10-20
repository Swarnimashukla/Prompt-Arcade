// Builds the "good output" that the user's prompt would have produced —
// derived from rubric dimension passes so it feels personalised to their input.

const PA_Reveal = (() => {
  function makeGoodOutput(rubric, result) {
    const passedDims = result.dimensions.filter(d => d.pts === d.max).map(d => d.label.toLowerCase());
    const partialDims = result.dimensions.filter(d => d.pts > 0 && d.pts < d.max).map(d => d.label.toLowerCase());
    const lines = [];
    lines.push(`▸ Diagnostic for: ${rubric.title}`);
    lines.push('');
    if (passedDims.length) {
      lines.push(`Working from your specifics on ${passedDims.join(', ')}, here is a structured response:`);
    } else {
      lines.push('Working from the (limited) constraints in your prompt:');
    }
    lines.push('');
    lines.push('1. The most likely root causes, ranked by likelihood given the data you have.');
    lines.push('2. The 2–3 quickest checks to confirm or rule out each one.');
    lines.push('3. What I cannot tell you from the inputs you provided, flagged as gaps, not guesses.');
    if (result.responsibilityCue) {
      lines.push('');
      lines.push('(Citing only what you anchored to data; refusing to speculate on the rest.)');
    }
    if (partialDims.length && result.score < 8) {
      lines.push('');
      lines.push(`⚠ The output will be weaker on: ${partialDims.join(', ')}, your prompt only partially specified these.`);
    }
    return lines.join('\n');
  }

  return { makeGoodOutput };
})();

if (typeof window !== 'undefined') window.PA_Reveal = PA_Reveal;
