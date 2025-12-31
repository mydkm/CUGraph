// js/graph/network.js
// Creates the vis-network instance + DataSets using your NODES_INIT / EDGES_INIT.
// NOTE: vis-network must be loaded globally (UMD) so `vis` exists.
// Example in HTML:
//   <script src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>

import { themeEdgeColorVars } from "../ui/theme.js";

export function createNetwork({
  NODES_INIT,
  EDGES_INIT,
  containerId = "graph",
  defaultTheme = "dark",

  // Physics defaults match your current index.html
  currentRepulsion = 18000,
  centralGravityVal = 1.0,
  springLengthVal = 120,
  springConstantVal = 0.02,
  dampingVal = 0.2,
  avoidOverlapVal = 0.5,
  initialStabilIters = 200,
} = {}) {
  if (!Array.isArray(NODES_INIT)) throw new Error("createNetwork: NODES_INIT must be an array.");
  if (!Array.isArray(EDGES_INIT)) throw new Error("createNetwork: EDGES_INIT must be an array.");

  const container = document.getElementById(containerId);
  if (!container) throw new Error(`createNetwork: container #${containerId} not found.`);

  // Ensure CSS vars resolve the same way your monolith file does.
  document.documentElement.setAttribute("data-theme", defaultTheme);

  const themeColors = themeEdgeColorVars(document.documentElement);

  // DataSets
  const nodes = new vis.DataSet(NODES_INIT);
  const edges = new vis.DataSet(EDGES_INIT);

  const options = {
    nodes: {
      borderWidth: 1,
      shape: "dot",
      font: {
        size: 14,
        face: "Arial",
        color: themeColors.nodeFontColor,
      },
      chosen: {
        node: function (values, id, selected) {
          if (selected) values.borderWidth = 3;
        },
      },
    },
    edges: {
      smooth: false,
      arrows: { to: { enabled: true, scaleFactor: 0.5 } },
      color: { color: themeColors.edgeColor, highlight: themeColors.edgeHighlight },
      width: 1.5,
    },
    interaction: { hover: true, dragNodes: true, zoomView: true },
    physics: {
      enabled: true,
      stabilization: { enabled: true, iterations: initialStabilIters },
      barnesHut: {
        gravitationalConstant: -currentRepulsion,
        centralGravity: centralGravityVal,
        springLength: springLengthVal,
        springConstant: springConstantVal,
        damping: dampingVal,
        avoidOverlap: avoidOverlapVal,
      },
    },
  };

  const network = new vis.Network(container, { nodes, edges }, options);

  return { network, nodes, edges, options };
}
