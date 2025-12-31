// details.js
// Details card rendering + prereq link jump + click-to-focus behavior.

export function initDetails({
  network,
  nodes,
  edges,
  NODE_DEPT,
  applyDeptFilter, // pass deptFilterApi.applyDeptFilter so prereq jumps can unhide needed departments
  detailsCard,
  detailsCloseBtn,
  detailsCodeTitle,
  detailsDept,
  detailsLevel,
  detailsCredits,
  detailsPrereqs,
  detailsDesc,
} = {}) {
  if (!network || !nodes || !edges || !NODE_DEPT) {
    throw new Error("initDetails: network, nodes, edges, and NODE_DEPT are required.");
  }

  // Close button
  if (detailsCloseBtn && detailsCard) {
    detailsCloseBtn.addEventListener("click", () => {
      detailsCard.classList.add("hidden");
    });
  }

  function linkifyPrereqs(rawText) {
    if (!rawText) return "";
    const re = /\b([A-Za-z]{1,4})\s?(\d{2,3}(?:\.\d+)?)\b/g;

    return rawText.replace(re, (match, dept, num) => {
      const canon = dept.toUpperCase() + " " + num;
      if (nodes.get(canon)) {
        return (
          '<a href="#" class="prereq-link" data-jump="' +
          canon +
          '">' +
          canon +
          "</a>"
        );
      }
      return match;
    });
  }

  function showDetailsFor(nodeId) {
    const n = nodes.get(nodeId);
    if (!n) return;

    let headerText = n.id;
    if (n.courseTitle) headerText = n.id + ": " + n.courseTitle;

    if (detailsCodeTitle) detailsCodeTitle.textContent = headerText || n.id || "";
    if (detailsDept) detailsDept.textContent = n.dept || "";
    if (detailsLevel) detailsLevel.textContent = n.level || "";
    if (detailsCredits) detailsCredits.textContent = n.credits || "";
    if (detailsDesc) detailsDesc.textContent = n.description || "";

    if (detailsPrereqs) {
      detailsPrereqs.innerHTML = linkifyPrereqs(n.prereqText || "");
      detailsPrereqs.querySelectorAll(".prereq-link").forEach((a) => {
        a.addEventListener("click", (evt) => {
          evt.preventDefault();
          const targetId = a.dataset.jump;
          focusNode(targetId);
        });
      });
    }

    if (detailsCard) detailsCard.classList.remove("hidden");
  }

  function syncEdgeVisibilityFromHiddenNodes() {
    const allEdges = edges.get();
    const changedEdges = [];

    for (const e of allEdges) {
      const fromN = nodes.get(e.from);
      const toN = nodes.get(e.to);
      const hideE = !fromN || !toN || !!fromN.hidden || !!toN.hidden;

      if (e.hidden !== hideE) changedEdges.push({ id: e.id, hidden: hideE });
    }

    if (changedEdges.length > 0) edges.update(changedEdges);
  }

  function ensureNodeVisible(nodeId) {
    const n0 = nodes.get(nodeId);
    if (!n0) return;

    const dept = NODE_DEPT[nodeId] || "";

    // Ensure its department is checked
    const box = document.querySelector('.dept-toggle[data-dept="' + dept + '"]');
    if (box && !box.checked) {
      box.checked = true;
      if (typeof applyDeptFilter === "function") applyDeptFilter();
    }

    // Re-fetch after filter may have changed hidden state
    const n = nodes.get(nodeId);
    if (!n) return;

    // If still hidden, force show it and then recompute edge visibility correctly
    if (n.hidden) {
      nodes.update({ id: nodeId, hidden: false });
      syncEdgeVisibilityFromHiddenNodes();
    }
  }

  function focusNode(nodeId) {
    if (!nodeId) return;

    ensureNodeVisible(nodeId);

    network.selectNodes([nodeId], false);
    network.focus(nodeId, {
      scale: 1.4,
      animation: { duration: 600, easingFunction: "easeOutQuad" },
    });

    showDetailsFor(nodeId);
  }

  // Clicking a node focuses it + opens details
  network.on("click", (params) => {
    if (params.nodes && params.nodes.length > 0) {
      focusNode(params.nodes[0]);
    }
  });

  return {
    linkifyPrereqs,
    showDetailsFor,
    ensureNodeVisible,
    focusNode,
  };
}
