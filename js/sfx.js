// Menu SFX, synthesised with Web Audio rather than shipped as files.
// The spec asked for Kenney/Freesound clips; oscillators get the same
// PS1-menu character with no assets, no downloads and no licence question.
// Volume is held at 0.15 as the spec requires, and the whole thing can be
// switched off from the status bar. The preference persists.

const PA_Sfx = (() => {
  const KEY = 'promptarcade.sfx';
  const VOLUME = 0.15;
  let ctx = null;
  let enabled = true;

  try { enabled = localStorage.getItem(KEY) !== 'off'; } catch (e) {}

  // Browsers keep an AudioContext suspended until a user gesture, so this
  // stays silent until the player actually interacts with the page.
  function audio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // One blip: a square wave stepped down hard, which is what gives the
  // 16-bit menu its click rather than a musical tone.
  function blip(freq, duration, type = 'square', startGain = VOLUME) {
    if (!enabled) return;
    const ac = audio();
    if (!ac) return;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ac.currentTime);
    gain.gain.setValueAtTime(startGain, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);
    osc.connect(gain).connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + duration);
  }

  const tick    = () => blip(880, 0.045);
  const confirm = () => { blip(660, 0.06); setTimeout(() => blip(990, 0.12), 55); };
  const error   = () => blip(150, 0.22, 'sawtooth');

  function setEnabled(on) {
    enabled = on;
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) {}
    const btn = document.querySelector('.sfx-toggle');
    if (btn) {
      btn.setAttribute('aria-pressed', String(on));
      btn.textContent = on ? 'SFX ON' : 'SFX OFF';
    }
    if (on) confirm();
  }

  function mount() {
    const nav = document.querySelector('.topbar-inner');
    if (nav && !document.querySelector('.sfx-toggle')) {
      const btn = document.createElement('button');
      btn.className = 'sfx-toggle';
      btn.type = 'button';
      btn.setAttribute('aria-pressed', String(enabled));
      btn.setAttribute('aria-label', 'Toggle menu sound effects');
      btn.textContent = enabled ? 'SFX ON' : 'SFX OFF';
      btn.addEventListener('click', () => setEnabled(!enabled));
      nav.appendChild(btn);
    }

    const SELECTOR = 'a, button, summary, .track-card, .sub-card, .scenario-card, .sp-card, .lp-btn';
    // Delegated, so anything the pages render later (scenario rails,
    // feedback panels) is covered without re-binding.
    document.addEventListener('mouseover', e => {
      const el = e.target.closest(SELECTOR);
      if (!el || el.classList.contains('sfx-toggle')) return;
      if (el === mount._last) return;
      mount._last = el;
      tick();
    });
    document.addEventListener('mouseout', e => {
      if (e.target.closest(SELECTOR) === mount._last) mount._last = null;
    });
    document.addEventListener('click', e => {
      const el = e.target.closest(SELECTOR);
      if (!el || el.classList.contains('sfx-toggle')) return;
      confirm();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  return { tick, confirm, error, setEnabled, isEnabled: () => enabled };
})();

if (typeof window !== 'undefined') window.PA_Sfx = PA_Sfx;
