// Token estimator + environmental cost translator.
// Sources cited inline so the numbers are auditable.

const PA_Tokens = (() => {
  // Rough heuristic: 1 token ≈ 4 chars OR ~0.75 words for English.
  // Anthropic/OpenAI tokenisers vary; this is a presentational estimate, not billing.
  function estimate(text) {
    if (!text) return 0;
    const trimmed = text.trim();
    if (!trimmed) return 0;
    const charBased = Math.ceil(trimmed.length / 4);
    const wordBased = Math.ceil(trimmed.split(/\s+/).length / 0.75);
    return Math.round((charBased + wordBased) / 2);
  }

  // Patterson et al. 2021 + Luccioni et al. 2023 give per-token energy figures
  // around 0.001–0.003 Wh for inference on mid-size LLMs. We use a conservative
  // midpoint and translate to grams CO₂ via India grid intensity (~0.71 kg/kWh, CEA 2023).
  const ENERGY_WH_PER_TOKEN = 0.0015;
  const GRID_KG_PER_KWH = 0.71;
  const ML_WATER_PER_TOKEN = 0.5; // ~500ml per ChatGPT conversation ≈ ~250 tokens (AP/UC Riverside, 2023)

  function co2Grams(tokens) {
    const wh = tokens * ENERGY_WH_PER_TOKEN;
    const kwh = wh / 1000;
    const kg = kwh * GRID_KG_PER_KWH;
    return kg * 1000;
  }
  function waterMl(tokens) {
    return tokens * ML_WATER_PER_TOKEN / 250 * 250; // explicit form, kept for clarity
  }
  function waterMlSimple(tokens) {
    return (tokens / 250) * 500;
  }

  function format(n, places = 2) {
    if (n < 0.01) return n.toFixed(3);
    if (n < 10) return n.toFixed(places);
    return Math.round(n).toString();
  }

  return {
    estimate,
    co2Grams,
    waterMl: waterMlSimple,
    format,
    constants: { ENERGY_WH_PER_TOKEN, GRID_KG_PER_KWH, ML_WATER_PER_TOKEN }
  };
})();

if (typeof window !== 'undefined') window.PA_Tokens = PA_Tokens;
