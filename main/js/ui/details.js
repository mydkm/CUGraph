// details.js
// Details card rendering + prereq link jump + click-to-focus behavior.

export function initDetails({
  network,
  nodes,
  edges,
  NODE_DEPT,
  applyDeptFilter, // pass deptFilterApi.applyDeptFilter so prereq jumps can unhide needed departments
  onBeforeFocusNode = null, // optional hook to adjust other filters before focusing (e.g., degree builder hide toggle)
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

  function buildPrereqFragment(rawText) {
    const frag = document.createDocumentFragment();
    if (!rawText) return frag;
    const re = /\b([A-Za-z]{1,4})\s?(\d{1,3}(?:\.\d+)?)\b/g;
    let lastIndex = 0;
    let match;
    while ((match = re.exec(rawText)) !== null) {
      const before = rawText.slice(lastIndex, match.index);
      if (before) frag.appendChild(document.createTextNode(before));

      const dept = match[1];
      const num = match[2];
      const canon = dept.toUpperCase() + " " + num;
      if (nodes.get(canon)) {
        const link = document.createElement("a");
        link.href = "#";
        link.className = "prereq-link";
        link.dataset.jump = canon;
        link.textContent = canon;
        frag.appendChild(link);
      } else {
        frag.appendChild(document.createTextNode(match[0]));
      }
      lastIndex = re.lastIndex;
    }
    const tail = rawText.slice(lastIndex);
    if (tail) frag.appendChild(document.createTextNode(tail));
    return frag;
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
      detailsPrereqs.textContent = "";
      detailsPrereqs.appendChild(buildPrereqFragment(n.prereqText || ""));
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

    // After dept filter may have changed hidden state, we intentionally *do not*
    // force-show the node here. Other filters (e.g. degree builder) may also
    // legitimately hide nodes.
  }

  function focusNode(nodeId) {
    if (!nodeId) return;

    if (typeof onBeforeFocusNode === "function") {
      onBeforeFocusNode(nodeId);
    }

    ensureNodeVisible(nodeId);

    // If node is still hidden (e.g. another filter is active), we can still open
    // the details card, but focusing/selecting will not be meaningful.
    const n = nodes.get(nodeId);
    const isHidden = !!(n && n.hidden);

    if (!isHidden) {
      network.selectNodes([nodeId], false);
      network.focus(nodeId, {
        scale: 1.4,
        animation: { duration: 600, easingFunction: "easeOutQuad" },
      });
    }

    showDetailsFor(nodeId);
  }

  // Clicking a node focuses it + opens details
  network.on("click", (params) => {
    if (params.nodes && params.nodes.length > 0) {
      focusNode(params.nodes[0]);
    }
  });

  return {
    showDetailsFor,
    ensureNodeVisible,
    focusNode,
  };
}
