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

  const LAYOUT_CACHE_KEY = "graphLayout_v1";
  let layoutCacheUsed = false;

  function loadLayoutCache() {
    try {
      const raw = localStorage.getItem(LAYOUT_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || !parsed.positions) return null;
      return parsed.positions;
    } catch {
      return null;
    }
  }

  // -------------------------------
  // Department → color mapping (legend palette)
  // -------------------------------
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


  // vis-network group styling
  const GROUPS = {};
  for (const [dept, bg] of Object.entries(DEPT_COLORS)) {
    GROUPS[dept] = {
      color: {
        background: bg,
        border: bg,
        highlight: { background: bg, border: "#ffffff" },
        hover: { background: bg, border: "#ffffff" },
      },
    };
  }

  const MAX_ABS_COORD = 5000;
  const cachedPositions = loadLayoutCache();
  const sanitizedNodes = NODES_INIT.map((n) => {
    if (!n || typeof n !== "object") return n;
    const out = { ...n };
    if (cachedPositions && cachedPositions[out.id]) {
      const pos = cachedPositions[out.id];
      if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
        out.x = pos.x;
        out.y = pos.y;
        layoutCacheUsed = true;
      }
    }
    if (Number.isFinite(out.x) && Math.abs(out.x) > MAX_ABS_COORD) {
      out.x = Math.sign(out.x) * MAX_ABS_COORD;
    }
    if (Number.isFinite(out.y) && Math.abs(out.y) > MAX_ABS_COORD) {
      out.y = Math.sign(out.y) * MAX_ABS_COORD;
    }
    return out;
  });

  // DataSets
  const nodes = new vis.DataSet(sanitizedNodes);
  const edges = new vis.DataSet(EDGES_INIT);

  const options = {
    autoResize: true,
    height: "100%",
    width: "100%",

    // ✅ Make group colors match the legend palette
    groups: GROUPS,

    nodes: {
      borderWidth: 1,
      shape: "dot",
      size: 10, // ✅ consistent default size
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
    interaction: { hover: true, tooltipDelay: 0, dragNodes: true, zoomView: true },
    physics: {
      // Start with physics disabled so the graph renders immediately
      // using the precomputed x/y positions. Physics can be enabled later.
      enabled: false,
      stabilization: { enabled: false, iterations: initialStabilIters },
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

  return { network, nodes, edges, options, layoutCacheUsed, layoutCacheKey: LAYOUT_CACHE_KEY };
}
