// physics.js
// Physics toggle + stabilization/freeze/unfreeze + repulsion slider.
// Refactors your "Physics helpers" + repulsion slider logic.

export function initPhysics({
  network,
  physicsToggle,
  physicsLabel,
  repelSlider,
  nodes,
  layoutCacheUsed = false,
  layoutCacheKey = "graphLayout_v1",
  layoutCacheDelayMs = 15000,

  // Defaults match your current inline constants
  initialStabilIters = 200,
  settleIterations = 50,
  currentRepulsion = null, // if null, we read from slider or fall back to 18000
  centralGravityVal = 1.0,
  springLengthVal = 120,
  springConstantVal = 0.02,
  dampingVal = 0.2,
  avoidOverlapVal = 0.5,
} = {}) {
  if (!network || !physicsToggle || !physicsLabel || !repelSlider) {
    throw new Error("initPhysics: network, physicsToggle, physicsLabel, and repelSlider are required.");
  }

  let userPhysicsEnabled = !!physicsToggle.checked;

  // Initialize repulsion from slider if present
  let repulsion =
    currentRepulsion ??
    (Number.isFinite(parseFloat(repelSlider.value)) ? parseFloat(repelSlider.value) : 18000);

  function snapshotView() {
    return { position: network.getViewPosition(), scale: network.getScale() };
  }

  function restoreView(view) {
    network.moveTo({ position: view.position, scale: view.scale, animation: false });
  }

  function barnesHutOptions() {
    return {
      gravitationalConstant: -repulsion,
      centralGravity: centralGravityVal,
      springLength: springLengthVal,
      springConstant: springConstantVal,
      damping: dampingVal,
      avoidOverlap: avoidOverlapVal,
    };
  }

  function applyLiveOptionsPreserveView() {
    const view = snapshotView();
    network.setOptions({
      physics: {
        enabled: true,
        stabilization: { enabled: false },
        barnesHut: barnesHutOptions(),
      },
    });
    network.startSimulation();
    restoreView(view);
  }

  function stabilizeThenDisable(view, iterations) {
    network.setOptions({
      physics: {
        enabled: true,
        stabilization: { enabled: true, iterations },
        barnesHut: barnesHutOptions(),
      },
    });

    network.once("stabilized", () => {
      network.setOptions({ physics: { enabled: false } });
      network.stopSimulation();
      restoreView(view);
    });

    network.stabilize(iterations);
  }

  function enablePhysicsLive() {
    userPhysicsEnabled = true;
    physicsToggle.checked = true;
    physicsLabel.innerHTML = "<b>Physics: on</b>";
    applyLiveOptionsPreserveView();
  }

  function disablePhysicsUser() {
    userPhysicsEnabled = false;
    physicsToggle.checked = false;
    physicsLabel.innerHTML = "<b>Physics: off</b>";

    const view = snapshotView();
    network.setOptions({ physics: { enabled: false } });
    network.stopSimulation();
    restoreView(view);
  }

  // Set initial UI state based on the checkbox value.
  physicsLabel.innerHTML = userPhysicsEnabled ? "<b>Physics: on</b>" : "<b>Physics: off</b>";

  // Defer enabling physics until after the first paint to keep initial render fast.
  if (userPhysicsEnabled) {
    requestAnimationFrame(() => applyLiveOptionsPreserveView());
  } else {
    network.setOptions({ physics: { enabled: false } });
    network.stopSimulation();
  }

  if (!layoutCacheUsed && nodes && typeof nodes.getIds === "function") {
    setTimeout(() => {
      try {
        const positions = network.getPositions(nodes.getIds());
        const payload = { positions };
        localStorage.setItem(layoutCacheKey, JSON.stringify(payload));
      } catch {
        // ignore cache failures
      }
    }, layoutCacheDelayMs);
  }

  // Toggle wiring
  physicsToggle.addEventListener("change", () => {
    if (physicsToggle.checked) enablePhysicsLive();
    else disablePhysicsUser();
  });

  // Repulsion slider wiring (matches your existing "change" behavior)
  repelSlider.addEventListener("change", (e) => {
    const strength = parseFloat(e.target.value);
    if (!Number.isFinite(strength)) return;

    repulsion = strength;
    if (userPhysicsEnabled) applyLiveOptionsPreserveView();
  });

  // If you want the layout to respond *while dragging*, also listen to "input":
  // repelSlider.addEventListener("input", ...)

  return {
    isEnabled: () => userPhysicsEnabled,
    getRepulsion: () => repulsion,
    setRepulsion: (v) => {
      if (!Number.isFinite(v)) return;
      repulsion = v;
      repelSlider.value = String(v);
      if (userPhysicsEnabled) applyLiveOptionsPreserveView();
    },
    applyLiveOptionsPreserveView,
    enablePhysicsLive,
    disablePhysicsUser,
    stabilizeThenDisable,
  };
}
