// js/ui/searchCore.js
// Shared search scoring + suggestion building used by the left-panel search
// and the degree builder entry search widgets.

export function normalizeForSearch(s) {
  return String(s).toLowerCase().replace(/\s+/g, "");
}

export function scoreEntry(queryRaw, queryNoSpace, entry) {
  const dispLower   = entry.display.toLowerCase();
  const dispNoSpace = normalizeForSearch(entry.display);
  const codeLower   = entry.id.toLowerCase();
  const codeNoSpace = normalizeForSearch(entry.id);

  // best match
  if (
    queryRaw === dispLower ||
    queryRaw === codeLower ||
    queryNoSpace === dispNoSpace ||
    queryNoSpace === codeNoSpace
  ) return 0;

  // startsWith
  if (
    dispLower.startsWith(queryRaw)       ||
    codeLower.startsWith(queryRaw)       ||
    dispNoSpace.startsWith(queryNoSpace) ||
    codeNoSpace.startsWith(queryNoSpace)
  ) return 1;

  // substring
  if (
    dispLower.includes(queryRaw)       ||
    codeLower.includes(queryRaw)       ||
    dispNoSpace.includes(queryNoSpace) ||
    codeNoSpace.includes(queryNoSpace)
  ) return 2;

  return null;
}

export function buildSuggestions(query, SEARCH_ENTRIES, limit = 8) {
  const rawQ = String(query).toLowerCase().trim();
  const qNoSpace = normalizeForSearch(query);
  if (!rawQ) return [];

  // Deduplicate by node id, keep best (lowest) score per id
  const bestById = new Map();
  for (const entry of SEARCH_ENTRIES) {
    const sc = scoreEntry(rawQ, qNoSpace, entry);
    if (sc === null) continue;
    const prev = bestById.get(entry.id);
    if (prev === undefined || sc < prev.sc) {
      bestById.set(entry.id, { sc, entry });
    }
  }

  return Array.from(bestById.values())
    .sort((a, b) => {
      if (a.sc !== b.sc) return a.sc - b.sc;
      return a.entry.display.localeCompare(b.entry.display);
    })
    .slice(0, limit)
    .map((obj) => obj.entry);
}
