import { NODES_INIT } from "./data/nodes.js";
import { EDGES_INIT } from "./data/edges.js";
import { NODE_DEPT } from "./data/nodeDept.js";
import { SEARCH_ENTRIES } from "./data/searchEntries.js";

import { createNetwork } from "./graph/network.js";
import { initTheme } from "./ui/theme.js";
import { initPhysics } from "./ui/physics.js";
import { initDeptFilter } from "./ui/deptFilter.js";
import { initDetails } from "./ui/details.js";
import { initSearch } from "./ui/search.js";
import { applyCombinedVisibility } from "./ui/visibility.js";
import { initDegreeBuilder } from "./ui/degreeBuilder.js";

window.addEventListener("DOMContentLoaded", () => {
  // Build graph first
  const { network, nodes, edges, layoutCacheUsed, layoutCacheKey } = createNetwork({ NODES_INIT, EDGES_INIT });

  // Grab UI elements (IDs come from your current index.html)
  const physicsToggle   = document.getElementById("physics-toggle");
  const physicsLabel    = document.getElementById("physics-label");
  const repelSlider     = document.getElementById("repel-slider");

  const themeToggleBtn  = document.getElementById("theme-toggle-btn");

  const showAllBtn      = document.getElementById("show-all");
  const hideAllBtn      = document.getElementById("hide-all");

  const detailsCard      = document.getElementById("details-card");
  const detailsCloseBtn  = document.getElementById("details-close-btn");
  const detailsCodeTitle = document.getElementById("details-code-title");
  const detailsDept      = document.getElementById("details-dept");
  const detailsLevel     = document.getElementById("details-level");
  const detailsCredits   = document.getElementById("details-credits");
  const detailsPrereqs   = document.getElementById("details-prereqs");
  const detailsDesc      = document.getElementById("details-desc");

  const searchInput     = document.getElementById("search-input");
  const searchGoBtn     = document.getElementById("search-go");
  const suggestionsBox  = document.getElementById("search-suggestions");

  // --- NEW: Legend/Controls collapse elements ---
  const legendToggle = document.getElementById("legend-toggle");
  const legendBody   = document.getElementById("legend-body");
  const legendPanel  = document.getElementById("legend-panel");

  // --- NEW: Engineering Departments section collapse elements ---
  const engToggle = document.getElementById("eng-toggle");
  const engBody   = document.getElementById("eng-body");

  // --- NEW: Legend panel collapse wiring ---
  if (legendToggle && legendBody) {
    if (!legendToggle.dataset.open) {
      legendToggle.dataset.open = legendBody.classList.contains("hidden") ? "0" : "1";
    }

    const saved = localStorage.getItem("legendOpen_v1");
    if (saved === "0") {
      legendBody.classList.add("hidden");
      legendToggle.dataset.open = "0";
      legendToggle.textContent = "▴";
    } else if (saved === "1") {
      legendBody.classList.remove("hidden");
      legendToggle.dataset.open = "1";
      legendToggle.textContent = "▾";
    }

    legendToggle.addEventListener("click", () => {
      const isOpen = legendToggle.dataset.open !== "0";
      const nextOpen = !isOpen;

      legendToggle.dataset.open = nextOpen ? "1" : "0";
      legendBody.classList.toggle("hidden", !nextOpen);
      legendToggle.textContent = nextOpen ? "▾" : "▴";

      localStorage.setItem("legendOpen_v1", nextOpen ? "1" : "0");
    });
  }

  const updateLegendPanelBottom = () => {
    if (!legendPanel) return;
    const rect = legendPanel.getBoundingClientRect();
    const bottom = Math.max(12, Math.round(rect.bottom));
    document.documentElement.style.setProperty("--legend-panel-bottom", `${bottom}px`);
  };

  if (legendPanel) {
    updateLegendPanelBottom();
    window.addEventListener("resize", () => requestAnimationFrame(updateLegendPanelBottom));
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => updateLegendPanelBottom());
      ro.observe(legendPanel);
    }
  }

  // --- NEW: Engineering Departments section collapse wiring ---
  if (engToggle && engBody) {
    if (!engToggle.dataset.open) {
      engToggle.dataset.open = engBody.classList.contains("hidden") ? "0" : "1";
    }

    engToggle.addEventListener("click", () => {
      const isOpen = engToggle.dataset.open !== "0";
      const nextOpen = !isOpen;

      engToggle.dataset.open = nextOpen ? "1" : "0";
      engBody.classList.toggle("hidden", !nextOpen);
      engToggle.textContent = nextOpen ? "−" : "+";
    });
  } else if (engBody) {
    engBody.classList.remove("hidden");
  }

  // Init theme + physics
  initTheme({ network, themeToggleBtn });
  const physicsApi = initPhysics({
    network,
    physicsToggle,
    physicsLabel,
    repelSlider,
    nodes,
    layoutCacheUsed,
    layoutCacheKey,
  });

  // Dept filter (pass buttons + physicsApi to preserve view when filtering)
  const deptFilterApi = initDeptFilter({
    network, nodes, edges, NODE_DEPT,
    showAllBtn, hideAllBtn,
    physicsApi,
    applyCombinedVisibility,
  });

  // Details (pass applyDeptFilter so prereq jumps can unhide departments)
  let degreeBuilderApi = null;

  const detailsApi = initDetails({
    network, nodes, edges, NODE_DEPT,
    applyDeptFilter: deptFilterApi.applyDeptFilter,
    onBeforeFocusNode: (nodeId) => {
      if (degreeBuilderApi && degreeBuilderApi.isHideNonSelectedEnabled && degreeBuilderApi.isHideNonSelectedEnabled()) {
        const selected = new Set(degreeBuilderApi.getSelectedCourseIds());
        if (!selected.has(nodeId)) degreeBuilderApi.disableHideNonSelected();
      }
    },
    detailsCard,
    detailsCloseBtn,
    detailsCodeTitle,
    detailsDept,
    detailsLevel,
    detailsCredits,
    detailsPrereqs,
    detailsDesc,
  });

  // Search (needs focusNode from details)
  initSearch({
    searchInput,
    searchGoBtn,
    suggestionsBox,
    SEARCH_ENTRIES,
    focusNode: detailsApi.focusNode,
  });

  // Degree builder (bottom panel)
  degreeBuilderApi = initDegreeBuilder({
    nodes,
    edges,
    SEARCH_ENTRIES,
    focusNode: detailsApi.focusNode,
    applyDeptFilter: deptFilterApi.applyDeptFilter,
    applyCombinedVisibility,
  });

  // Ensure initial visibility composition is consistent
  applyCombinedVisibility({ nodes, edges });
});
