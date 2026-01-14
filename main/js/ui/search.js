// js/ui/search.js
// Search box + suggestions dropdown + "Go" behavior.
//
// This version positions the suggestions dropdown as a floating element
// (appended to <body>) so it can overflow the left panel instead of being
// clipped by #legend-body's overflow scrolling.
//
// Requires: SEARCH_ENTRIES (array of {id, display}), and a focusNode(nodeId) function.

import { normalizeForSearch, scoreEntry, buildSuggestions } from "./searchCore.js";

export function initSearch({
  searchInput,
  searchGoBtn,
  suggestionsBox,
  SEARCH_ENTRIES,
  focusNode,
} = {}) {
  if (!searchInput || !searchGoBtn || !suggestionsBox) {
    throw new Error("initSearch: searchInput, searchGoBtn, suggestionsBox are required.");
  }
  if (!Array.isArray(SEARCH_ENTRIES)) {
    throw new Error("initSearch: SEARCH_ENTRIES must be an array.");
  }
  if (typeof focusNode !== "function") {
    throw new Error("initSearch: focusNode(nodeId) function is required.");
  }

  const anchorRow = searchInput.closest(".search-row") || searchInput.parentElement;
  const legendBody = document.getElementById("legend-body");

  // Move the dropdown out of the scroll/overflow container so it can spill over the panel.
  const originalParent = suggestionsBox.parentElement;
  document.body.appendChild(suggestionsBox);

  // searchCore.js provides normalizeForSearch / scoreEntry / buildSuggestions

  function positionSuggestions() {
    // Prefer anchoring to the full input row (input + Go button) so the dropdown
    // lines up cleanly with the "search bar".
    const anchor = anchorRow || searchInput;

    const r = anchor.getBoundingClientRect();

    // Respect the row's margin-bottom (not included in getBoundingClientRect()).
    const mb = parseFloat(getComputedStyle(anchor).marginBottom) || 0;

    // Small extra gap below the bar looks nicer than flush alignment.
    const gap = 4;

    suggestionsBox.style.left = `${Math.round(r.left)}px`;
    suggestionsBox.style.top = `${Math.round(r.bottom + mb + gap)}px`;
    suggestionsBox.style.width = `${Math.round(r.width)}px`;
  }


  function hideSuggestions() {
    suggestionsBox.classList.add("hidden");
    suggestionsBox.innerHTML = "";
  }

  function renderSuggestions(q) {
    const matches = buildSuggestions(q, SEARCH_ENTRIES, 8);
    if (matches.length === 0) {
      hideSuggestions();
      return;
    }

    let html = "";
    for (const m of matches) {
      html +=
        '<div class="sug-item" data-node="' +
        m.id +
        '">' +
        m.display +
        "</div>";
    }

    suggestionsBox.innerHTML = html;
    positionSuggestions();
    suggestionsBox.classList.remove("hidden");

    suggestionsBox.querySelectorAll(".sug-item").forEach((div) => {
      div.addEventListener("click", () => {
        const nodeId = div.dataset.node;
        searchInput.value = div.textContent;
        hideSuggestions();
        focusNode(nodeId);
      });
    });
  }

  function doSearch() {
    const q        = searchInput.value;
    const rawQ     = q.toLowerCase().trim();
    const qNoSpace = normalizeForSearch(q);

    let bestNode  = null;
    let bestScore = Infinity;

    for (const entry of SEARCH_ENTRIES) {
      const sc = scoreEntry(rawQ, qNoSpace, entry);
      if (sc !== null && sc < bestScore) {
        bestScore = sc;
        bestNode  = entry.id;
        if (sc === 0) break;
      }
    }

    hideSuggestions();

    if (bestNode) {
      focusNode(bestNode);
    } else {
      console.warn("No match for search:", q);
    }
  }

  // Wiring (matches your current behavior)
  searchInput.addEventListener("input", () => renderSuggestions(searchInput.value));
  searchGoBtn.addEventListener("click", () => doSearch());
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSearch();
  });

  // Keep dropdown anchored if the user scrolls the panel / page or resizes.
  const maybeReposition = () => {
    if (!suggestionsBox.classList.contains("hidden")) positionSuggestions();
  };
  window.addEventListener("resize", maybeReposition);
  window.addEventListener("scroll", maybeReposition, true);
  if (legendBody) legendBody.addEventListener("scroll", maybeReposition);

  // Close dropdown when clicking elsewhere
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!t) return;
    if (t === searchInput) return;
    if (suggestionsBox.contains(t)) return;
    hideSuggestions();
  });

  return {
    normalizeForSearch,
    scoreEntry,
    buildSuggestions,
    renderSuggestions,
    doSearch,
    hideSuggestions,
    positionSuggestions,
    // Just in case you want to restore the old DOM structure later:
    restoreDropdownToOriginalParent: () => {
      if (originalParent) originalParent.appendChild(suggestionsBox);
      hideSuggestions();
    },
  };
}
