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

window.addEventListener("DOMContentLoaded", () => {
  // Build graph first
  const { network, nodes, edges } = createNetwork({ NODES_INIT, EDGES_INIT });

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

  // Init theme + physics
  initTheme({ network, themeToggleBtn });
  const physicsApi = initPhysics({ network, physicsToggle, physicsLabel, repelSlider });

  // Dept filter (pass buttons + physicsApi to preserve view when filtering)
  const deptFilterApi = initDeptFilter({
    network, nodes, edges, NODE_DEPT,
    showAllBtn, hideAllBtn,
    physicsApi,
  });

  // Details (pass applyDeptFilter so prereq jumps can unhide departments)
  const detailsApi = initDetails({
    network, nodes, edges, NODE_DEPT,
    applyDeptFilter: deptFilterApi.applyDeptFilter,
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
});
