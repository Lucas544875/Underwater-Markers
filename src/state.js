const KEY = "underwater-markers:v1";
const defaults = { visited: [1], evidenceMoves: 0, evidenceSeen: [], damage: 0, interactions: 0, endingSeen: false };

function normalize(value = {}) {
  return {
    visited: [...new Set((Array.isArray(value.visited) ? value.visited : [1]).filter((n) => n >= 1 && n <= 7))],
    evidenceMoves: Math.max(0, Number(value.evidenceMoves) || 0),
    evidenceSeen: Array.isArray(value.evidenceSeen) ? [...new Set(value.evidenceSeen)] : [],
    damage: Math.min(1, Math.max(0, Number(value.damage) || 0)),
    interactions: Math.max(0, Number(value.interactions) || 0),
    endingSeen: Boolean(value.endingSeen)
  };
}

export function loadState() {
  try { return normalize(JSON.parse(localStorage.getItem(KEY))); }
  catch { return { ...defaults, visited: [...defaults.visited], evidenceSeen: [] }; }
}

export function saveState(state) {
  localStorage.setItem(KEY, JSON.stringify(normalize(state)));
}

export function clearState() {
  localStorage.removeItem(KEY);
}
