// js/ui/customClass.js
// Custom class creation/editing for the graph.

const CUSTOM_PREFIX = "CUSTOM";
const STORAGE_KEY = "customClasses_v1";

const DEPT_COLORS = {
  "Biology": "rgb(57,255,20)",
  "Chemical Engineering": "rgb(34,139,34)",
  "Chemistry": "rgb(0,204,0)",
  "Civil Engineering": "rgb(139,69,19)",
  "Computer Science": "rgb(0,255,255)",
  "Electrical and Computer Engineering": "rgb(255,215,0)",
  "Engineering Sciences": "rgb(255,165,0)",
  "Interdisciplinary Engineering": "rgb(192,192,192)",
  "Mathematics": "rgb(255,0,0)",
  "Mechanical Engineering": "rgb(21,80,132)",
  "Physics": "rgb(128,0,128)",
  "Humanities": "rgb(90,200,250)",
  "Social Sciences": "rgb(255,105,180)",
  "History and Theory of Art": "rgb(204,85,0)",
};

function normalizeCode(code) {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function splitCodes(raw) {
  if (!raw) return [];
  return raw
    .split(/[,;\n]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function initCustomClass({
  network,
  nodes,
  edges,
  NODE_DEPT,
  SEARCH_ENTRIES,
  addClassBtn,
  customCard,
  customCodeInput,
  customTitleInput,
  customDeptSelect,
  customLevelSelect,
  customCreditsInput,
  customPrereqInput,
  customDescInput,
  customSaveBtn,
  requirementsPanel,
  detailsCard,
  applyDeptFilter,
} = {}) {
  if (!network || !nodes || !edges) {
    throw new Error("initCustomClass: network, nodes, and edges are required.");
  }

  let customCounter = 0;
  const customEdges = new Map();
  const customData = new Map();
  let activeId = null;

  nodes.forEach((n) => {
    if (!n || typeof n.id !== "string") return;
    const match = n.id.match(/^CUSTOM\s+(\d+)$/);
    if (match) customCounter = Math.max(customCounter, parseInt(match[1], 10));
  });

  function updateRequirementsPanelHeight() {
    if (!requirementsPanel) return;
    const rect = requirementsPanel.getBoundingClientRect();
    if (!rect.height) return;
    document.documentElement.style.setProperty("--requirements-panel-height", `${Math.round(rect.height)}px`);
  }

  function buildCodeMap() {
    const map = new Map();
    nodes.forEach((n) => {
      if (!n || typeof n.id !== "string") return;
      const canon = normalizeCode(n.id);
      if (canon && !map.has(canon)) map.set(canon, n.id);
    });
    return map;
  }

  function ensureSearchEntry(nodeId, displayText) {
    if (!Array.isArray(SEARCH_ENTRIES)) return;
    const display = displayText || nodeId;
    const existing = SEARCH_ENTRIES.find((e) => e.id === nodeId);
    if (existing) {
      existing.display = display;
    } else {
      SEARCH_ENTRIES.push({ id: nodeId, display });
    }
  }

  function removeSearchEntry(nodeId) {
    if (!Array.isArray(SEARCH_ENTRIES)) return;
    const idx = SEARCH_ENTRIES.findIndex((e) => e.id === nodeId);
    if (idx >= 0) SEARCH_ENTRIES.splice(idx, 1);
  }

  function persistState() {
    const payload = {
      customCounter,
      nodes: Array.from(customData.entries()).map(([id, data]) => {
        const node = nodes.get(id);
        return {
          id,
          x: node && Number.isFinite(node.x) ? node.x : 0,
          y: node && Number.isFinite(node.y) ? node.y : 0,
          courseCode: data.courseCode || id,
          title: data.title || "",
          dept: data.dept || "",
          level: data.level || "",
          credits: data.credits || "",
          prereqs: Array.isArray(data.prereqs) ? data.prereqs : [],
          description: data.description || "n/a",
        };
      }),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore storage failures
    }
  }

  function loadState() {
    let raw = null;
    try {
      raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "");
    } catch {
      raw = null;
    }
    if (!raw || !Array.isArray(raw.nodes)) return;
    if (Number.isFinite(raw.customCounter)) customCounter = Math.max(customCounter, raw.customCounter);
    for (const saved of raw.nodes) {
      if (!saved || typeof saved !== "object" || !saved.id) continue;
      const id = saved.id;
      const courseCode = saved.courseCode || id;
      const title = saved.title || "Untitled";
      const dept = saved.dept || "";
      const level = saved.level || "";
      const credits = saved.credits || "";
      const prereqs = Array.isArray(saved.prereqs) ? saved.prereqs : [];
      const description = saved.description || "n/a";
      const color = dept ? (DEPT_COLORS[dept] || "#ffffff") : "#ffffff";
      const font = dept ? undefined : { color: "#111" };

      if (!nodes.get(id)) {
        nodes.add({
          id,
          label: courseCode,
          title: `${courseCode}: ${title}`,
          courseCode,
          courseTitle: title,
          dept,
          level,
          credits,
          prereqText: prereqs.join(", "),
          description,
          color,
          font,
          x: Number.isFinite(saved.x) ? saved.x : 0,
          y: Number.isFinite(saved.y) ? saved.y : 0,
          isCustom: true,
        });
      } else {
        nodes.update({
          id,
          label: courseCode,
          title: `${courseCode}: ${title}`,
          courseCode,
          courseTitle: title,
          dept,
          level,
          credits,
          prereqText: prereqs.join(", "),
          description,
          color,
          font,
          isCustom: true,
        });
      }

      NODE_DEPT[id] = dept || "";
      ensureSearchEntry(id, `${courseCode}: ${title}`);
      customData.set(id, { courseCode, title, dept, level, credits, prereqs, description });
      syncEdges(id, prereqs);
    }
    if (typeof applyDeptFilter === "function") applyDeptFilter();
  }

  function openPanel(nodeId) {
    if (!customCard) return;
    if (detailsCard) detailsCard.classList.add("hidden");
    activeId = nodeId;
    const data = customData.get(nodeId) || {};
    if (customCodeInput) customCodeInput.value = data.courseCode || "";
    customTitleInput.value = data.title || "";
    customDeptSelect.value = data.dept || "";
    customLevelSelect.value = data.level || "";
    customCreditsInput.value = data.credits || "";
    customPrereqInput.value = (data.prereqs || []).join(", ");
    customDescInput.value = data.description || "";
    customCard.classList.remove("hidden");
    updateRequirementsPanelHeight();
  }

  function closePanel() {
    if (!customCard) return;
    customCard.classList.add("hidden");
    activeId = null;
  }

  function focusNode(nodeId) {
    network.selectNodes([nodeId], false);
    network.focus(nodeId, {
      scale: 1.4,
      animation: { duration: 600, easingFunction: "easeOutQuad" },
    });
  }

  function deleteEdgesFor(nodeId) {
    const stored = customEdges.get(nodeId);
    const toRemove = stored ? Array.from(stored) : [];
    const connected = edges.get({
      filter: (e) => e.from === nodeId || e.to === nodeId,
    }).map((e) => e.id);
    for (const id of connected) toRemove.push(id);
    if (toRemove.length > 0) edges.remove(toRemove);
    customEdges.delete(nodeId);
  }

  function syncEdges(nodeId, prereqCodes) {
    deleteEdgesFor(nodeId);
    const codeMap = buildCodeMap();
    const edgeIds = new Set();
    for (const raw of prereqCodes) {
      const canon = normalizeCode(raw);
      if (!canon) continue;
      const prereqId = codeMap.get(canon);
      if (!prereqId) continue;
      const edgeId = `custom-edge-${nodeId}-${canon}`;
      if (!edges.get(edgeId)) {
        edges.add({ id: edgeId, from: prereqId, to: nodeId, hidden: false });
      }
      edgeIds.add(edgeId);
    }
    customEdges.set(nodeId, edgeIds);
  }

  function saveCustomNode() {
    if (!activeId) return;
    const courseCodeInput = customCodeInput ? customCodeInput.value.trim() : "";
    const courseCode = courseCodeInput || activeId;
    const title = customTitleInput.value.trim() || "Untitled";
    const dept = customDeptSelect.value;
    const level = customLevelSelect.value;
    const credits = customCreditsInput.value.trim();
    const prereqs = splitCodes(customPrereqInput.value);
    const description = customDescInput.value.trim() || "n/a";
    const color = dept ? (DEPT_COLORS[dept] || "#ffffff") : "#ffffff";
    const font = dept ? undefined : { color: "#111" };

    const titleText = `${courseCode}: ${title}`;

    nodes.update({
      id: activeId,
      label: courseCode,
      title: titleText,
      courseCode,
      courseTitle: title,
      dept,
      level,
      credits,
      prereqText: prereqs.join(", "),
      description,
      color,
      font,
      isCustom: true,
    });
    NODE_DEPT[activeId] = dept || "";
    ensureSearchEntry(activeId, titleText);

    customData.set(activeId, {
      courseCode,
      title,
      dept,
      level,
      credits,
      prereqs,
      description,
    });

    syncEdges(activeId, prereqs);
    if (typeof applyDeptFilter === "function") applyDeptFilter();
    persistState();
    closePanel();
  }

  function createCustomNode() {
    customCounter += 1;
    const nodeId = `${CUSTOM_PREFIX} ${customCounter}`;
    const view = network.getViewPosition();
    nodes.add({
      id: nodeId,
      label: nodeId,
      title: nodeId,
      courseCode: nodeId,
      size: 10,
      color: "#ffffff",
      font: { color: "#111" },
      dept: "",
      level: "",
      credits: "",
      prereqText: "",
      description: "n/a",
      x: view.x,
      y: view.y,
      isCustom: true,
    });
    NODE_DEPT[nodeId] = "";
    ensureSearchEntry(nodeId, nodeId);
    openPanel(nodeId);
    focusNode(nodeId);
    persistState();
  }

  function deleteCustomNode(nodeId) {
    deleteEdgesFor(nodeId);
    nodes.remove(nodeId);
    delete NODE_DEPT[nodeId];
    customData.delete(nodeId);
    removeSearchEntry(nodeId);
    persistState();
    if (detailsCard) detailsCard.classList.add("hidden");
  }

  function renderDetailsActions({ node, actionsEl }) {
    if (!node || !node.isCustom) return;
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openPanel(node.id);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteCustomNode(node.id);
    });

    actionsEl.appendChild(editBtn);
    actionsEl.appendChild(deleteBtn);
  }

  if (addClassBtn) {
    addClassBtn.addEventListener("click", () => {
      if (detailsCard) detailsCard.classList.add("hidden");
      createCustomNode();
    });
  }
  if (customSaveBtn) {
    customSaveBtn.addEventListener("click", () => saveCustomNode());
  }

  if (requirementsPanel) {
    updateRequirementsPanelHeight();
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => updateRequirementsPanelHeight());
      ro.observe(requirementsPanel);
    } else {
      window.addEventListener("resize", () => updateRequirementsPanelHeight());
    }
  }

  loadState();

  network.on("click", (params) => {
    if (!activeId) return;
    if (!params.nodes || params.nodes.length === 0) return;
    const clickedId = params.nodes[0];
    if (clickedId === activeId) return;
    const node = nodes.get(clickedId);
    if (node && node.isCustom) {
      openPanel(clickedId);
      focusNode(clickedId);
      return;
    }
    closePanel();
  });

  return {
    renderDetailsActions,
  };
}
