// localStorage-backed state for XP, completed levels, accumulated tokens.

const PA_State = (() => {
  const KEY = 'promptarcade.v2';

  const empty = () => ({
    xp: 0,
    levels: {}, // id → { tier, score, tokens, savedTokens }
    sessionTokens: 0,
    sessionPromptTokens: 0,
    badPromptTokens: 0,
    selectedTrack: null,
    selectedSubdomain: null,
    firstSeen: Date.now()
  });

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return empty();
      const parsed = JSON.parse(raw);
      return Object.assign(empty(), parsed);
    } catch (e) {
      return empty();
    }
  }

  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  function get() { return load(); }

  function setSelection(track, subdomain) {
    const s = load();
    s.selectedTrack = track || null;
    s.selectedSubdomain = subdomain || null;
    save(s);
  }

  function recordLevel(id, result) {
    const s = load();
    const prev = s.levels[id] || { tierLevel: 0, score: 0, tokens: 0, savedTokens: 0 };
    if (result.score > prev.score) {
      s.levels[id] = result;
      const xpGain = (result.tierLevel * 75) + (result.score * 5);
      const prevGain = (prev.tierLevel * 75) + (prev.score * 5);
      s.xp = (s.xp || 0) + xpGain - prevGain;
      if (s.xp < 0) s.xp = 0;
    }
    s.sessionTokens += result.tokens;
    s.sessionPromptTokens += result.tokens;
    s.badPromptTokens += result.badTokens || 0;
    save(s);
    return s;
  }

  function reset() { save(empty()); }

  function levelsCompleted() {
    const s = load();
    return Object.keys(s.levels || {}).length;
  }

  return { get, setSelection, recordLevel, reset, levelsCompleted };
})();

if (typeof window !== 'undefined') window.PA_State = PA_State;
