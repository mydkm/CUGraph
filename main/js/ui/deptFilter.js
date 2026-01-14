// deptFilter.js
// Department checkbox filtering for nodes + edges.
// Refactors applyDeptFilter() / getAllowedDepartments() / show-all / hide-all logic.

export function initDeptFilter({
  network,
  nodes,
  edges,
  NODE_DEPT,
  showAllBtn,
  hideAllBtn,
  // Optional: physics API returned by initPhysics() so we can keep sim running while preserving view.
  physicsApi = null,
  // Required: recompute the final `hidden` field after updating hiddenDept.
  applyCombinedVisibility = null,
} = {}) {
  if (!nodes || !edges || !NODE_DEPT) {
    throw new Error("initDeptFilter: nodes, edges, and NODE_DEPT are required.");
  }

  function getAllowedDepartments() {
    const boxes = document.querySelectorAll(".dept-toggle");
    const allowed = new Set();
    boxes.forEach((box) => {
      if (box.checked) allowed.add(box.dataset.dept);
    });
    return allowed;
  }

  function applyDeptFilter() {
    const allowed = getAllowedDepartments();

    // node hide/show
    const allNodes = nodes.get();
    const changedNodes = [];

    for (const n of allNodes) {
      const dept = NODE_DEPT[n.id] || "";
      const hide = !allowed.has(dept);
      if (!!n.hiddenDept !== hide) changedNodes.push({ id: n.id, hiddenDept: hide });
    }

    if (changedNodes.length > 0) nodes.update(changedNodes);

    // Recompute `hidden` and edge visibility after updating hiddenDept.
    if (typeof applyCombinedVisibility === "function") {
      applyCombinedVisibility({ nodes, edges });
    }

    // If physics is enabled, keep sim but preserve camera (delegated to physicsApi).
    if (physicsApi && typeof physicsApi.isEnabled === "function" && physicsApi.isEnabled()) {
      if (typeof physicsApi.applyLiveOptionsPreserveView === "function") {
        physicsApi.applyLiveOptionsPreserveView();
      }
    }
  }

  // Wire checkbox changes
  document.querySelectorAll(".dept-toggle").forEach((cb) => {
    cb.addEventListener("change", applyDeptFilter);
  });

  // Show/hide all buttons
  if (showAllBtn) {
    showAllBtn.addEventListener("click", () => {
      document.querySelectorAll(".dept-toggle").forEach((cb) => (cb.checked = true));
      applyDeptFilter();
    });
  }

  if (hideAllBtn) {
    hideAllBtn.addEventListener("click", () => {
      document.querySelectorAll(".dept-toggle").forEach((cb) => (cb.checked = false));
      applyDeptFilter();
    });
  }

  return {
    getAllowedDepartments,
    applyDeptFilter,
  };
}
