// js/ui/theme.js
// Theme state + toggle + updating vis-network colors from CSS variables.

export function themeEdgeColorVars(rootEl = document.documentElement) {
  const styles = getComputedStyle(rootEl);
  return {
    nodeFontColor: styles.getPropertyValue("--text-color").trim() || "#dddddd",
    edgeColor: styles.getPropertyValue("--edge-color").trim() || "rgba(200,200,200,0.4)",
    edgeHighlight: styles.getPropertyValue("--edge-highlight").trim() || "rgba(255,255,255,0.8)",
  };
}

export function initTheme({
  network,
  themeToggleBtn,
  defaultTheme = "dark",
} = {}) {
  if (!network) throw new Error("initTheme: network is required.");
  if (!themeToggleBtn) throw new Error("initTheme: themeToggleBtn is required.");

  let currentTheme = defaultTheme;

  function snapshotView() {
    return { position: network.getViewPosition(), scale: network.getScale() };
  }

  function restoreView(view) {
    network.moveTo({ position: view.position, scale: view.scale, animation: false });
  }

  function updateNetworkColorsFromTheme() {
    const view = snapshotView();
    const themeNow = themeEdgeColorVars(document.documentElement);

    network.setOptions({
      nodes: { font: { color: themeNow.nodeFontColor } },
      edges: { color: { color: themeNow.edgeColor, highlight: themeNow.edgeHighlight } },
    });

    network.redraw();
    restoreView(view);
  }

  function applyTheme(themeName) {
    currentTheme = themeName;
    document.documentElement.setAttribute("data-theme", themeName);
    themeToggleBtn.textContent = themeName === "dark" ? "Light mode" : "Dark mode";
    updateNetworkColorsFromTheme();
  }

  // Same initialization behavior as your current file
  applyTheme(defaultTheme);

  themeToggleBtn.addEventListener("click", () => {
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
  });

  return {
    getTheme: () => currentTheme,
    applyTheme,
    updateNetworkColorsFromTheme,
  };
}
