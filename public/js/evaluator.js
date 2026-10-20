// Talks to the scoring API. The rubric no longer reaches the browser:
// patterns and the reference answer stay server-side, so the only way to
// learn what a level rewards is to attempt it.
//
// Both calls are same-origin absolute paths, so the archived iterations
// under /iterations/ reach them too.

const PA_Evaluator = (() => {
  // The brief: everything needed to RENDER a level, nothing that would
  // give the answer away.
  async function loadRubric(track, subdomain, n) {
    const url = `/api/brief?track=${encodeURIComponent(track)}&sub=${encodeURIComponent(subdomain)}&n=${encodeURIComponent(n)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not load level ${track}/${subdomain}/${n}`);
    return res.json();
  }

  // Scoring is now a round-trip, so this is async where it used to be
  // synchronous. Callers must await it.
  async function score(prompt, rubric) {
    const res = await fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        track: rubric.track, sub: rubric.subdomain, n: rubric.level, prompt
      })
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw new Error(detail.error || `Scoring failed (${res.status})`);
    }
    return res.json();
  }

  return { loadRubric, score };
})();

if (typeof window !== 'undefined') window.PA_Evaluator = PA_Evaluator;
