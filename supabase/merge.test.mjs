// Unit tests for the one function that can silently destroy someone's work.
import { readFileSync } from 'fs';
const src = readFileSync('new URL('../js/auth.js', import.meta.url).pathname', 'utf8');
globalThis.window = undefined; globalThis.document = undefined;
const { PA_Auth } = await import('data:text/javascript;base64,' +
  Buffer.from(src.replace(/if \(typeof document[\s\S]*?\n  }\n/, '')
                 .replace("if (typeof window !== 'undefined') window.PA_Auth = PA_Auth;", '')
                 .replace("if (typeof module !== 'undefined' && module.exports) module.exports = { PA_Auth };",
                          'export { PA_Auth };')).toString('base64'));

const { mergeProgress, xpFor } = PA_Auth;
let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
};

const L = (score, tier='Sharp', tierLevel=2) => ({ tier, tierLevel, score, tokens: 100, passedBudget: true });
const R = (id, score) => ({ level_id: id, tier: 'Sharp', tier_level: 2, score, tokens: 100, passed_budget: true, updated_at: '2026-01-01T00:00:00Z' });

console.log('\nmergeProgress');

// The core promise: anonymous play survives sign-in.
let m = mergeProgress({ 'builder-pm-1': L(8) }, []);
eq('local-only level is kept and queued to push', [Object.keys(m.levels), m.toPush], [['builder-pm-1'], ['builder-pm-1']]);

// Remote-only arrives on a fresh device.
m = mergeProgress({}, [R('builder-pm-2', 7)]);
eq('remote-only level is adopted locally, nothing pushed', [Object.keys(m.levels), m.toPush], [['builder-pm-2'], []]);

// The dangerous case: a worse local score must NOT overwrite a better remote one.
m = mergeProgress({ 'builder-pm-1': L(4) }, [R('builder-pm-1', 9)]);
eq('better remote score survives a worse local one', [m.levels['builder-pm-1'].score, m.toPush], [9, []]);

// And the mirror: a better local score wins and is pushed.
m = mergeProgress({ 'builder-pm-1': L(10) }, [R('builder-pm-1', 6)]);
eq('better local score wins and is queued', [m.levels['builder-pm-1'].score, m.toPush], [10, ['builder-pm-1']]);

// A tie must not generate pointless writes.
m = mergeProgress({ 'builder-pm-1': L(7) }, [R('builder-pm-1', 7)]);
eq('equal scores produce no push', m.toPush, []);

// Union across devices.
m = mergeProgress({ a: L(5), b: L(9) }, [R('b', 3), R('c', 8)]);
eq('union of both sides', Object.keys(m.levels).sort(), ['a','b','c']);
eq('only genuinely-better locals pushed', m.toPush.sort(), ['a','b']);

// Robustness against junk that real localStorage accumulates.
m = mergeProgress({ good: L(5), broken: null, partial: { tier: 'Draft' } }, []);
eq('malformed local entries are skipped, not crashed on', Object.keys(m.levels), ['good']);
eq('null/undefined inputs are safe', Object.keys(mergeProgress(null, null).levels), []);

console.log('\nxpFor');
eq('xp derived from tier and score', xpFor({ a: { tierLevel: 3, score: 10 }, b: { tierLevel: 1, score: 6 } }), 3*75+10*5 + 1*75+6*5);
eq('empty is zero', xpFor({}), 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
