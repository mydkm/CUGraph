// js/ui/visibility.js
// Centralized visibility composition for multiple filters.
//
// We keep the *reasons* for hiding separate (e.g., hiddenDept, hiddenDegreeBuilder)
// and compute the actual `hidden` field (used by vis-network) as the OR of all
// reasons. This prevents filters from overwriting each other.

export function applyCombinedVisibility({ nodes, edges } = {}) {
  if (!nodes || !edges) throw new Error("applyCombinedVisibility: nodes and edges are required.");

  // ---- Nodes ----
  const allNodes = nodes.get();
  const nodeUpdates = [];

  for (const n of allNodes) {
    const hide = !!(n.hiddenDept || n.hiddenDegreeBuilder);
    if (n.hidden !== hide) nodeUpdates.push({ id: n.id, hidden: hide });
  }

  if (nodeUpdates.length > 0) nodes.update(nodeUpdates);

  // ---- Edges ----
  const allEdges = edges.get();
  const edgeUpdates = [];

  for (const e of allEdges) {
    const fromN = nodes.get(e.from);
    const toN   = nodes.get(e.to);
    const hideE = !fromN || !toN || !!fromN.hidden || !!toN.hidden;
    if (e.hidden !== hideE) edgeUpdates.push({ id: e.id, hidden: hideE });
  }

  if (edgeUpdates.length > 0) edges.update(edgeUpdates);
}
