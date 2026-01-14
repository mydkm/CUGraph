// js/ui/degreeBuilder.js
// Bottom panel "Degree Builder".
//
// Features:
//  - Collapsible (collapsed on first load)
//  - 8 semesters (columns) with horizontal scroll
//  - 8 initial entry slots per semester
//  - Each slot can search for a course (suggestions dropdown)
//  - Once selected, slot shows "CODE: Title" and credits, and an X to clear
//  - Plus button adds extra slots; extra slots have an undo button to remove the slot
//  - Checkbox to hide all nodes not listed in the degree builder
//  - State persisted in localStorage

import { buildSuggestions } from "./searchCore.js";

const STORAGE_KEY = "degreeBuilderState_v1";

const SEMESTERS_DEFAULT = [
  "Summer 0",
  "Fall 1",
  "Spring 1",
  "Summer 1",
  "Fall 2",
  "Spring 2",
  "Summer 2",
  "Fall 3",
  "Spring 3",
  "Summer 3",
  "Fall 4",
  "Spring 4",
];

function safeParse(jsonText) {
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function clampInt(n, lo, hi) {
  const x = Number.isFinite(n) ? Math.floor(n) : lo;
  return Math.max(lo, Math.min(hi, x));
}

function parseCredits(val) {
  if (val == null) return 0;
  const num = parseFloat(String(val).replace(/[^\d.-]/g, ""));
  return Number.isFinite(num) ? num : 0;
}

function formatCredits(val) {
  return Number(val || 0).toFixed(2);
}

function buildInitialState() {
  return {
    isOpen: false,
    hideNonSelected: false,
    presetId: "",
    currentSemesterIndex: 0,
    showSummer: true,
    semesters: SEMESTERS_DEFAULT.map(() => ({
      slots: Array.from({ length: 8 }, () => ({
        courseId: null,
        isExtra: false,
        source: null, // "preset" | "manual" | null
        presetId: null,
        addedByPreset: false,
      })),
    })),
  };
}

function normalizeLoadedState(raw) {
  const base = buildInitialState();
  if (!raw || typeof raw !== "object") return base;

  const out = buildInitialState();
  out.isOpen = !!raw.isOpen;
  out.hideNonSelected = !!raw.hideNonSelected;
  out.presetId = typeof raw.presetId === "string" ? raw.presetId : "";
  out.currentSemesterIndex = clampInt(raw.currentSemesterIndex, 0, SEMESTERS_DEFAULT.length - 1);
  out.showSummer = raw.showSummer !== false;

  if (Array.isArray(raw.semesters)) {
    let sourceSemesters = raw.semesters;
    if (raw.semesters.length === 8 && SEMESTERS_DEFAULT.length === 11) {
      sourceSemesters = [];
      const summerInsertAfter = new Set([1, 3, 5]);
      let srcIdx = 0;
      for (let i = 0; i < 8; i++) {
        sourceSemesters.push(raw.semesters[srcIdx++]);
        if (summerInsertAfter.has(i)) {
          sourceSemesters.push({ slots: [] });
        }
      }
    }
    for (let i = 0; i < out.semesters.length; i++) {
      const s = sourceSemesters[i];
      if (!s || typeof s !== "object" || !Array.isArray(s.slots)) continue;

      // Start with 8 base slots.
      const slots = Array.from({ length: 8 }, () => ({
        courseId: null,
        isExtra: false,
        source: null,
        presetId: null,
        addedByPreset: false,
      }));
      // Copy over provided slots (keeping the first 8 + any extras).
      for (let j = 0; j < s.slots.length; j++) {
        const src = s.slots[j];
        if (!src || typeof src !== "object") continue;
        const courseId = typeof src.courseId === "string" ? src.courseId : null;
        const isExtra = j >= 8;

        const srcSource = src.source === "preset" ? "preset" : src.source === "manual" ? "manual" : null;
        const source = srcSource || (courseId ? "manual" : null);
        const presetId = source === "preset" && typeof src.presetId === "string" ? src.presetId : null;
        const addedByPreset = !!src.addedByPreset;

        if (j < 8) {
          slots[j].courseId = courseId;
          slots[j].source = source;
          slots[j].presetId = presetId;
          slots[j].addedByPreset = addedByPreset;
        } else {
          slots.push({ courseId, isExtra, source, presetId, addedByPreset });
        }
      }

      out.semesters[i].slots = slots;
    }
  }

  return out;
}

export function initDegreeBuilder({
  nodes,
  edges,
  SEARCH_ENTRIES,
  focusNode,
  applyDeptFilter = null,
  applyCombinedVisibility,
} = {}) {
  if (!nodes || !edges) throw new Error("initDegreeBuilder: nodes and edges are required.");
  if (!Array.isArray(SEARCH_ENTRIES)) throw new Error("initDegreeBuilder: SEARCH_ENTRIES must be an array.");
  if (typeof applyCombinedVisibility !== "function") {
    throw new Error("initDegreeBuilder: applyCombinedVisibility(...) callback is required.");
  }

  const panel = document.getElementById("degree-builder");
  const toggleBtn = document.getElementById("db-toggle");
  const body = document.getElementById("degree-builder-body");
  const columnsRoot = document.getElementById("db-columns");
  const hideCb = document.getElementById("db-hide-nonselected");
  const exportBtn = document.getElementById("db-export-btn");
  const presetSel = document.getElementById("db-preset-select");
  const optionsToggle = document.getElementById("db-options-toggle");
  const optionsPanel = document.getElementById("db-options-panel");
  const pagePrev = document.getElementById("db-page-prev");
  const pageNext = document.getElementById("db-page-next");
  const pageLabel = document.getElementById("db-page-label");
  const pageControls = document.querySelector(".db-page-controls");
  const semesterAddBtn = document.getElementById("db-semester-add");
  const semesterRemoveBtn = document.getElementById("db-semester-remove");
  const showSummerToggle = document.getElementById("db-show-summers");
  const requirementsPanel = document.getElementById("requirements-panel");
  const requirementsHeader = document.getElementById("requirements-header");
  const requirementsBody = document.getElementById("requirements-body");
  const sug = document.getElementById("db-suggestions") || (() => {
    const d = document.createElement("div");
    d.id = "db-suggestions";
    d.className = "db-suggestions hidden";
    document.body.appendChild(d);
    return d;
  })();

  if (!panel || !toggleBtn || !body || !columnsRoot || !hideCb) {
    throw new Error("initDegreeBuilder: degree builder DOM not found. Did you update index.html?");
  }

  // Load state (collapsed by default on first load)
  const loaded = safeParse(localStorage.getItem(STORAGE_KEY) || "");
  const state = normalizeLoadedState(loaded);

  // Enforce "collapsed on first load": if there was no saved state, keep collapsed.
  if (!loaded) state.isOpen = false;

  // Build a fast lookup: normalized course code -> node id
  const codeToNodeId = new Map();
  nodes.forEach((n) => {
    if (!n || typeof n.id !== "string") return;
    const k = normalizeCourseCode(n.id);
    if (k && !codeToNodeId.has(k)) codeToNodeId.set(k, n.id);
  });

  // Presets (major curricula) loaded from JSON index.
  const PRESET_INDEX_URL = "./main/js/data/presets/presets.json";
  const REQUIREMENTS_URL = "./main/js/data/requirements.json";
  let presetIndex = [];
  const presetById = new Map();
  let presetLoadToken = 0;
  let requirementsData = null;

  async function loadPresetIndex() {
    if (!presetSel) return;
    try {
      const res = await fetch(PRESET_INDEX_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`Preset index fetch failed: ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error("Preset index JSON must be an array.");
      // Keep the array order as the canonical order for the dropdown.
      presetIndex = data;
      presetById.clear();
      for (const p of presetIndex) {
        if (!p || typeof p !== "object") continue;
        if (typeof p.id !== "string" || !p.id) continue;
        if (typeof p.label !== "string" || !p.label) continue;
        if (typeof p.file !== "string" || !p.file) continue;
        if (presetById.has(p.id)) {
          console.warn(
            `Duplicate preset id '${p.id}' detected in presets.json. ` +
              "Only the first occurrence will be used."
          );
          continue;
        }
        presetById.set(p.id, p);
      }

      // Rebuild <select> options
      const current = typeof state.presetId === "string" ? state.presetId : "";
      presetSel.innerHTML = "";
      const optEmpty = document.createElement("option");
      optEmpty.value = "";
      optEmpty.textContent = "Preset: (Empty)";
      presetSel.appendChild(optEmpty);

      for (const p of presetIndex) {
        if (!p || typeof p !== "object") continue;
        if (typeof p.id !== "string" || !presetById.has(p.id)) continue;
        const canon = presetById.get(p.id);
        const opt = document.createElement("option");
        opt.value = canon.id;
        opt.textContent = `Preset: ${canon.label}`;
        presetSel.appendChild(opt);
      }

      // Sync select to current preset if present
      if (current && presetById.has(current)) {
        presetSel.value = current;
      } else {
        presetSel.value = "";
        state.presetId = "";
      }
    } catch (err) {
      console.warn("DegreeBuilder preset index failed to load:", err);
      // Leave the default empty option (already in HTML)
    }
  }

  async function loadRequirementsData() {
    if (!requirementsPanel || !requirementsBody) return;
    try {
      const res = await fetch(REQUIREMENTS_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`Requirements fetch failed: ${res.status}`);
      const data = await res.json();
      requirementsData = data && typeof data === "object" ? data : null;
    } catch (err) {
      console.warn("Degree requirements failed to load:", err);
      requirementsData = null;
    }
    renderRequirementsPanel();
    requestAnimationFrame(updateRequirementsPanelOffset);
  }

  function normalizeCourseCode(code) {
    return String(code || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  }

  function semesterIndexFromRow(year, semester) {
    const y = String(year || "").trim().toLowerCase();
    const s = String(semester || "").trim().toLowerCase();

    const yIdx =
      y === "freshman" ? 0 :
      y === "sophomore" ? 1 :
      y === "junior" ? 2 :
      y === "senior" ? 3 : -1;

    if (yIdx < 0) return null;

    const sIdx =
      s.startsWith("fall") ? 0 :
      s.startsWith("spring") ? 1 :
      s.startsWith("summer") ? 2 : -1;

    if (sIdx < 0) return null;

    if (sIdx === 2 && yIdx >= 3) return null; // no Summer 4

    const idx = 1 + yIdx * 3 + sIdx;
    return idx >= 0 && idx < SEMESTERS_DEFAULT.length ? idx : null;
  }

  function clearPresetSelections() {
    for (const sem of state.semesters) {
      // First, remove extra slots that were added by the preset and never "claimed" by the user
      sem.slots = sem.slots.filter((slot) => !(slot && slot.isExtra && slot.addedByPreset));

      // Then clear any remaining preset-filled slots (base slots or claimed extras)
      for (const slot of sem.slots) {
        if (!slot) continue;
        if (slot.source === "preset") {
          slot.courseId = null;
          slot.source = null;
          slot.presetId = null;
          slot.addedByPreset = false;
        }
      }

      // Ensure we always have at least 8 base slots
      while (sem.slots.length < 8) {
        sem.slots.push({
          courseId: null,
          isExtra: false,
          source: null,
          presetId: null,
          addedByPreset: false,
        });
      }
    }
  }

  function assignCourseToSemester(semIdx, nodeId, presetId) {
    const sem = state.semesters[semIdx];
    if (!sem) return;

    // Find first empty slot
    let slot = sem.slots.find((s) => s && !s.courseId);
    if (!slot) {
      // Add an extra slot if needed
      slot = {
        courseId: null,
        isExtra: true,
        source: null,
        presetId: null,
        addedByPreset: true,
      };
      sem.slots.push(slot);
    }

    slot.courseId = nodeId;
    slot.source = "preset";
    slot.presetId = presetId;
    if (slot.isExtra) slot.addedByPreset = true;
  }

  function getAllSelectedCourseIdSet() {
    return new Set(getAllSelectedCourseIds());
  }

  async function applyPreset(newPresetId) {
    const newId = typeof newPresetId === "string" ? newPresetId : "";
    const oldId = typeof state.presetId === "string" ? state.presetId : "";

    if (newId === oldId) return;

    // Always clear previous preset classes first
    clearPresetSelections();

    state.presetId = newId;
    saveState();
    render();
    applyDegreeBuilderFilter();

    // Empty preset means "stay cleared"
    if (!newId) return;

    const p = presetById.get(newId);
    if (!p) {
      console.warn("Unknown preset id:", newId);
      return;
    }

    const token = ++presetLoadToken;

    try {
      const res = await fetch("./" + p.file.replace(/^\/+/, ""), { cache: "no-store" });
      if (!res.ok) throw new Error(`Preset file fetch failed: ${res.status}`);
      const rows = await res.json();
      if (token !== presetLoadToken) return; // superseded

      if (!Array.isArray(rows)) throw new Error("Preset file must be a JSON array.");

      // Avoid duplicate entries: do not add a course if it's already in the degree builder.
      // (This prevents duplicates from repeated rows, and also prevents preset+manual duplicates.)
      const selected = getAllSelectedCourseIdSet();

      for (const r of rows) {
        if (!r || typeof r !== "object") continue;
        const semIdx = semesterIndexFromRow(r.year, r.semester);
        if (semIdx == null) continue;

        const code = r.course_code || r.courseCode || r.code;
        const nodeId = codeToNodeId.get(normalizeCourseCode(code));
        if (!nodeId) continue;

        if (selected.has(nodeId)) continue;
        selected.add(nodeId);

        assignCourseToSemester(semIdx, nodeId, newId);
      }

      saveState();
      render();
      applyDegreeBuilderFilter();
    } catch (err) {
      console.warn("Preset apply failed:", err);
      // If apply fails, revert to empty preset but keep the cleared state.
      state.presetId = "";
      if (presetSel) presetSel.value = "";
      saveState();
      render();
      applyDegreeBuilderFilter();
    }
  }


  let activeInput = null; // currently active input element for dropdown positioning

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore storage failures
    }
  }

  function setOpen(isOpen) {
    state.isOpen = !!isOpen;
    panel.dataset.open = state.isOpen ? "1" : "0";
    toggleBtn.dataset.open = panel.dataset.open;

    if (state.isOpen) {
      panel.classList.remove("collapsed");
      toggleBtn.textContent = "▾";
    } else {
      panel.classList.add("collapsed");
      toggleBtn.textContent = "▴";
      hideSuggestions();
    }

    if (!state.isOpen) hideOptionsPanel();

    saveState();
  }

  function updateDetailsCardOffset() {
    const root = document.documentElement;
    if (!root) return;

    root.style.setProperty("--details-card-bottom", "56px");
  }

  function updateRequirementsPanelOffset() {
    const root = document.documentElement;
    if (!root) return;
    root.style.setProperty("--requirements-panel-offset", "0px");
  }

  function getAllSelectedCourseIds() {
    const ids = [];
    for (const sem of state.semesters) {
      for (const slot of sem.slots) {
        if (slot.courseId) ids.push(slot.courseId);
      }
    }
    return ids;
  }

  function applyDegreeBuilderFilter() {
    const hideNonSelected = !!hideCb.checked;
    state.hideNonSelected = hideNonSelected;

    const selectedSet = new Set(getAllSelectedCourseIds());
    const allNodes = nodes.get();
    const updates = [];

    if (!hideNonSelected) {
      for (const n of allNodes) {
        if (n.hiddenDegreeBuilder) updates.push({ id: n.id, hiddenDegreeBuilder: false });
      }
    } else {
      for (const n of allNodes) {
        const hide = !selectedSet.has(n.id);
        if (!!n.hiddenDegreeBuilder !== hide) updates.push({ id: n.id, hiddenDegreeBuilder: hide });
      }
    }

    if (updates.length > 0) nodes.update(updates);
    applyCombinedVisibility({ nodes, edges });
    saveState();
  }

  function buildScheduleSummary() {
    const semesters = state.semesters.map((_, idx) => {
      const name = SEMESTERS_DEFAULT[idx] || `Semester ${idx + 1}`;
      const sem = state.semesters[idx];
      const courses = [];
      let totalCredits = 0;

      if (sem && Array.isArray(sem.slots)) {
        for (const slot of sem.slots) {
          if (!slot || !slot.courseId) continue;
          const n = nodes.get(slot.courseId);
          const credits = parseCredits(n && n.credits);
          totalCredits += credits;
          courses.push({
            id: slot.courseId,
            title: n && (n.courseTitle || n.title) ? (n.courseTitle || n.title) : "",
            dept: n && n.dept ? n.dept : "",
            credits,
            source: slot.source === "preset" ? "preset" : "manual",
            presetId: slot.presetId || "",
          });
        }
      }

      return {
        name,
        courses,
        totalCredits: Number(totalCredits.toFixed(2)),
      };
    });

    const totalCredits = Number(
      semesters.reduce((sum, sem) => sum + sem.totalCredits, 0).toFixed(2)
    );

    return { semesters, totalCredits };
  }

  function buildSheetRows(summary) {
    const rows = [];
    rows.push(["Degree Builder Export"]);
    rows.push([`Generated: ${new Date().toLocaleString()}`]);
    rows.push([]);
    rows.push(["Semester", "Course", "Title", "Department", "Credits"]);

    for (const sem of summary.semesters) {
      rows.push([sem.name]);
      if (sem.courses.length === 0) {
        rows.push(["", "(empty)", "", "", { v: 0, t: "n" }]);
      } else {
        for (const c of sem.courses) {
          rows.push([
            "",
            c.id,
            c.title || "",
            c.dept || "",
            { v: c.credits, t: "n" },
          ]);
        }
      }
      rows.push(["", "", "", "Semester total", { v: sem.totalCredits, t: "n" }]);
      rows.push([]);
    }

    rows.push(["", "", "", "Degree total", { v: summary.totalCredits, t: "n" }]);
    return rows;
  }

  function escapeXml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function columnName(idx1Based) {
    let n = idx1Based;
    let s = "";
    while (n > 0) {
      const rem = (n - 1) % 26;
      s = String.fromCharCode(65 + rem) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s || "A";
  }

  function normalizeCell(cell) {
    if (cell && typeof cell === "object" && "v" in cell) {
      return { v: cell.v, t: cell.t === "n" ? "n" : "s" };
    }
    if (typeof cell === "number") return { v: cell, t: "n" };
    return { v: cell == null ? "" : cell, t: "s" };
  }

  function sheetXmlFromRows(rows, colWidths) {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
    if (Array.isArray(colWidths) && colWidths.length > 0) {
      xml += "<cols>";
      for (let i = 0; i < colWidths.length; i++) {
        const w = colWidths[i];
        if (!Number.isFinite(w) || w <= 0) continue;
        const idx = i + 1;
        xml += `<col min="${idx}" max="${idx}" width="${w}" customWidth="1"/>`;
      }
      xml += "</cols>";
    }
    xml += "<sheetData>";

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r] || [];
      xml += `<row r="${r + 1}">`;
      for (let c = 0; c < row.length; c++) {
        const cell = normalizeCell(row[c]);
        const ref = `${columnName(c + 1)}${r + 1}`;
        if (cell.t === "n" && Number.isFinite(cell.v)) {
          xml += `<c r="${ref}"><v>${cell.v}</v></c>`;
        } else if (cell.v === "") {
          xml += `<c r="${ref}"/>`;
        } else {
          xml += `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(cell.v)}</t></is></c>`;
        }
      }
      xml += "</row>";
    }

    xml += "</sheetData></worksheet>";
    return xml;
  }

  function workbookXml() {
    return (
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="Degree Plan" sheetId="1" r:id="rId1"/></sheets>' +
      "</workbook>"
    );
  }

  function workbookRelsXml() {
    return (
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      "</Relationships>"
    );
  }

  function rootRelsXml() {
    return (
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      "</Relationships>"
    );
  }

  function contentTypesXml() {
    return (
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      "</Types>"
    );
  }

  function toDosDateTime(d) {
    const year = d.getFullYear();
    const y = Math.max(0, Math.min(127, year - 1980));
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const h = d.getHours();
    const min = d.getMinutes();
    const sec = Math.floor(d.getSeconds() / 2);
    const dosTime = (h << 11) | (min << 5) | sec;
    const dosDate = (y << 9) | (m << 5) | day;
    return { dosTime, dosDate };
  }

  const CRC_TABLE = (() => {
    const tbl = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      tbl[i] = c >>> 0;
    }
    return tbl;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function writeUint16(arr, v) {
    arr.push(v & 0xff, (v >>> 8) & 0xff);
  }

  function writeUint32(arr, v) {
    arr.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
  }

  function buildZip(files) {
    const encoder = new TextEncoder();
    const now = new Date();
    const { dosTime, dosDate } = toDosDateTime(now);
    const out = [];
    const central = [];

    for (const f of files) {
      const nameBytes = encoder.encode(f.name);
      const dataBytes = typeof f.data === "string" ? encoder.encode(f.data) : new Uint8Array(f.data);

      const crc = crc32(dataBytes);
      const size = dataBytes.length;
      const localOffset = out.length;

      // Local file header
      writeUint32(out, 0x04034b50);
      writeUint16(out, 20); // version needed
      writeUint16(out, 0);  // flags
      writeUint16(out, 0);  // compression (store)
      writeUint16(out, dosTime);
      writeUint16(out, dosDate);
      writeUint32(out, crc);
      writeUint32(out, size);
      writeUint32(out, size);
      writeUint16(out, nameBytes.length);
      writeUint16(out, 0); // extra
      for (const b of nameBytes) out.push(b);
      for (const b of dataBytes) out.push(b);

      // Central directory header
      writeUint32(central, 0x02014b50);
      writeUint16(central, 20); // version made
      writeUint16(central, 20); // version needed
      writeUint16(central, 0);  // flags
      writeUint16(central, 0);  // compression
      writeUint16(central, dosTime);
      writeUint16(central, dosDate);
      writeUint32(central, crc);
      writeUint32(central, size);
      writeUint32(central, size);
      writeUint16(central, nameBytes.length);
      writeUint16(central, 0); // extra len
      writeUint16(central, 0); // comment len
      writeUint16(central, 0); // disk start
      writeUint16(central, 0); // internal attrs
      writeUint32(central, 0); // external attrs
      writeUint32(central, localOffset);
      for (const b of nameBytes) central.push(b);
    }

    const centralOffset = out.length;
    for (const b of central) out.push(b);

    // End of central directory
    writeUint32(out, 0x06054b50);
    writeUint16(out, 0);
    writeUint16(out, 0);
    writeUint16(out, files.length);
    writeUint16(out, files.length);
    writeUint32(out, central.length);
    writeUint32(out, centralOffset);
    writeUint16(out, 0); // comment length

    return new Uint8Array(out);
  }

  function createXlsx(rows) {
    const colWidths = [18, 14, 52, 28, 12];
    const sheetXml = sheetXmlFromRows(rows, colWidths);
    const files = [
      { name: "[Content_Types].xml", data: contentTypesXml() },
      { name: "_rels/.rels", data: rootRelsXml() },
      { name: "xl/workbook.xml", data: workbookXml() },
      { name: "xl/_rels/workbook.xml.rels", data: workbookRelsXml() },
      { name: "xl/worksheets/sheet1.xml", data: sheetXml },
    ];
    const zipBytes = buildZip(files);
    return new Blob([zipBytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function exportDegreePlan() {
    const summary = buildScheduleSummary();
    const rows = buildSheetRows(summary);
    const blob = createXlsx(rows);
    const filename = "degree-builder.xlsx";

    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [
            {
              description: "Excel Workbook",
              accept: {
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
              },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
    }

    downloadBlob(blob, filename);
  }

  function hideSuggestions() {
    sug.classList.add("hidden");
    sug.innerHTML = "";
    activeInput = null;
  }

  function positionSuggestions(anchorEl) {
    const r = anchorEl.getBoundingClientRect();
    const gap = 4;
    sug.style.left = `${Math.round(r.left)}px`;
    sug.style.top = `${Math.round(r.bottom + gap)}px`;
    sug.style.width = `${Math.round(r.width)}px`;
  }

  function renderSuggestionsForInput(inputEl, semIdx, slotIdx) {
    const matches = buildSuggestions(inputEl.value, SEARCH_ENTRIES, 8);
    if (matches.length === 0) {
      hideSuggestions();
      return;
    }

    let html = "";
    for (const m of matches) {
      html += `<div class="db-sug-item" data-node="${m.id}">${m.display}</div>`;
    }
    sug.innerHTML = html;
    positionSuggestions(inputEl);
    sug.classList.remove("hidden");
    activeInput = inputEl;

    sug.querySelectorAll(".db-sug-item").forEach((div) => {
      div.addEventListener("click", () => {
        const nodeId = div.dataset.node;
        selectCourse(semIdx, slotIdx, nodeId);
        hideSuggestions();
      });
    });
  }

  function selectCourse(semIdx, slotIdx, nodeId) {
    const sem = state.semesters[semIdx];
    if (!sem || !sem.slots[slotIdx]) return;
    sem.slots[slotIdx].courseId = nodeId;
    sem.slots[slotIdx].source = "manual";
    sem.slots[slotIdx].presetId = null;
    sem.slots[slotIdx].addedByPreset = false;

    // If the course lives in a department currently hidden by the legend filter,
    // auto-check that department so the selected course can be shown.
    const n = nodes.get(nodeId);
    if (n && n.dept) {
      const boxes = document.querySelectorAll(".dept-toggle");
      for (const box of boxes) {
        if (box && box.dataset && box.dataset.dept === n.dept) {
          if (!box.checked) {
            box.checked = true;
            if (typeof applyDeptFilter === "function") applyDeptFilter();
          }
          break;
        }
      }
    }
    saveState();
    render();
    applyDegreeBuilderFilter();
  }

  function clearCourse(semIdx, slotIdx) {
    const sem = state.semesters[semIdx];
    if (!sem || !sem.slots[slotIdx]) return;
    sem.slots[slotIdx].courseId = null;
    sem.slots[slotIdx].source = null;
    sem.slots[slotIdx].presetId = null;
    sem.slots[slotIdx].addedByPreset = false;
    saveState();
    render();
    applyDegreeBuilderFilter();
  }

  function addSlot(semIdx) {
    const sem = state.semesters[semIdx];
    if (!sem) return;
    sem.slots.push({ courseId: null, isExtra: true, source: null, presetId: null, addedByPreset: false });
    saveState();
    render();
  }

  function removeExtraSlot(semIdx, slotIdx) {
    const sem = state.semesters[semIdx];
    if (!sem) return;
    const s = sem.slots[slotIdx];
    if (!s || !s.isExtra) return;
    sem.slots.splice(slotIdx, 1);
    saveState();
    render();
    applyDegreeBuilderFilter();
  }

  function courseLabel(nodeId) {
    const n = nodes.get(nodeId);
    if (!n) return { titleLine: nodeId, creditsLine: "" };
    const title = n.courseTitle ? `${n.id}: ${n.courseTitle}` : (n.title || n.id || nodeId);
    const credits = n.credits ? `${n.credits} credits` : "";
    return { titleLine: title, creditsLine: credits };
  }

  function isUndergradLevel(level) {
    if (!level) return false;
    return String(level).toLowerCase().includes("undergraduate");
  }

  function semesterCreditSummary(semIdx) {
    const sem = state.semesters[semIdx];
    if (!sem) return { totalCredits: 0, undergradCredits: 0 };
    let total = 0;
    let undergrad = 0;
    for (const slot of sem.slots) {
      if (!slot || !slot.courseId) continue;
      const n = nodes.get(slot.courseId);
      const credits = parseCredits(n && n.credits);
      total += credits;
      if (n && isUndergradLevel(n.level)) undergrad += credits;
    }
    return {
      totalCredits: Number(total.toFixed(2)),
      undergradCredits: Number(undergrad.toFixed(2)),
    };
  }

  function normalizeRequirementCode(code) {
    return String(code || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  }

  function extractPrereqCodes(rawText) {
    if (!rawText) return [];
    const re = /\b([A-Za-z]{1,4})\s?(\d{1,3}(?:\.\d+)?)\b/g;
    const found = new Set();
    let match;
    while ((match = re.exec(rawText))) {
      const canon = normalizeRequirementCode(`${match[1]} ${match[2]}`);
      if (canon) found.add(canon);
    }
    return Array.from(found);
  }

  function tokenizePrereqs(rawText) {
    if (!rawText) return [];
    const normalized = String(rawText).replace(/[\/|]/g, " or ");
    const re = /\b[A-Za-z]{1,4}\s?\d{1,3}(?:\.\d+)?\b|\(|\)|\band\b|\bor\b/gi;
    const tokens = [];
    let match;
    while ((match = re.exec(normalized))) {
      const raw = match[0];
      if (!raw) continue;
      const lower = raw.toLowerCase();
      if (lower === "and" || lower === "or" || raw === "(" || raw === ")") {
        tokens.push(lower);
      } else {
        const canon = normalizeRequirementCode(raw);
        if (canon) tokens.push(canon);
      }
    }
    return tokens;
  }

  function rpnFromTokens(tokens) {
    const output = [];
    const ops = [];
    const precedence = { or: 1, and: 2 };
    const isOp = (t) => t === "and" || t === "or";

    for (const token of tokens) {
      if (isOp(token)) {
        while (ops.length) {
          const top = ops[ops.length - 1];
          if (isOp(top) && precedence[top] >= precedence[token]) {
            output.push(ops.pop());
          } else {
            break;
          }
        }
        ops.push(token);
      } else if (token === "(") {
        ops.push(token);
      } else if (token === ")") {
        while (ops.length && ops[ops.length - 1] !== "(") {
          output.push(ops.pop());
        }
        if (ops.length && ops[ops.length - 1] === "(") ops.pop();
      } else {
        output.push(token);
      }
    }

    while (ops.length) {
      const op = ops.pop();
      if (op !== "(" && op !== ")") output.push(op);
    }
    return output;
  }

  function dnfFromRpn(rpn) {
    const stack = [];
    const isOp = (t) => t === "and" || t === "or";
    for (const token of rpn) {
      if (!isOp(token)) {
        stack.push([[token]]);
        continue;
      }
      const right = stack.pop();
      const left = stack.pop();
      if (!left || !right) return [];
      if (token === "or") {
        stack.push(left.concat(right));
      } else {
        const combined = [];
        for (const l of left) {
          for (const r of right) {
            combined.push(l.concat(r));
          }
        }
        stack.push(combined);
      }
    }
    if (stack.length !== 1) return [];
    return stack[0];
  }

  function parsePrereqGroups(rawText) {
    if (!rawText) return [];
    const tokens = tokenizePrereqs(rawText);
    if (tokens.length === 0) return [];
    const rpn = rpnFromTokens(tokens);
    const dnf = dnfFromRpn(rpn);
    if (!dnf.length) {
      const codes = extractPrereqCodes(rawText);
      return codes.length ? [codes] : [];
    }
    const normalizedGroups = dnf.map((group) => Array.from(new Set(group)));
    return normalizedGroups.length ? normalizedGroups : [];
  }

  function buildPrereqFailures() {
    const courseToSem = new Map();
    for (let i = 0; i < state.semesters.length; i++) {
      const sem = state.semesters[i];
      if (!sem || !Array.isArray(sem.slots)) continue;
      for (const slot of sem.slots) {
        if (!slot || !slot.courseId) continue;
        const canon = normalizeRequirementCode(slot.courseId);
        if (!canon) continue;
        if (!courseToSem.has(canon) || courseToSem.get(canon) > i) {
          courseToSem.set(canon, i);
        }
      }
    }

    const failures = new Map();
    for (let i = 0; i < state.semesters.length; i++) {
      const sem = state.semesters[i];
      if (!sem || !Array.isArray(sem.slots)) continue;
      for (let j = 0; j < sem.slots.length; j++) {
        const slot = sem.slots[j];
        if (!slot || !slot.courseId) continue;
        const node = nodes.get(slot.courseId);
        const prereqGroups = parsePrereqGroups(node && node.prereqText);
        if (prereqGroups.length === 0) continue;

        const groupStatus = prereqGroups.map((group) => {
          const missing = group.filter((code) => {
            const prereqSem = courseToSem.get(code);
            return prereqSem == null || prereqSem > i;
          });
          return { group, missing };
        });

        const satisfied = groupStatus.some((g) => g.missing.length === 0);
        if (!satisfied) {
          const allMissing = new Set();
          for (const g of groupStatus) {
            g.missing.forEach((code) => allMissing.add(code));
          }
          failures.set(`${i}:${j}`, Array.from(allMissing));
        }
      }
    }

    return failures;
  }

  function getMajorDept(majorId) {
    const map = {
      me: "Mechanical Engineering",
      cive: "Civil Engineering",
      cs: "Computer Science",
      ee1: "Electrical and Computer Engineering",
      ee2: "Electrical and Computer Engineering",
      cheme: "Chemical Engineering",
    };
    return map[majorId] || "";
  }

  function buildSelectedCourseSet() {
    const set = new Set();
    for (const id of getAllSelectedCourseIds()) {
      const canon = normalizeRequirementCode(id);
      if (canon) set.add(canon);
    }
    return set;
  }

  function getSelectedCourseIdsOrdered() {
    const ordered = [];
    const seen = new Set();
    for (const sem of state.semesters) {
      for (const slot of sem.slots) {
        if (!slot || !slot.courseId) continue;
        const canon = normalizeRequirementCode(slot.courseId);
        if (!canon || seen.has(canon)) continue;
        seen.add(canon);
        ordered.push(slot.courseId);
      }
    }
    return ordered;
  }

  function isEngineeringDept(dept) {
    const engineering = new Set([
      "Biology",
      "Chemical Engineering",
      "Chemistry",
      "Civil Engineering",
      "Computer Science",
      "Electrical and Computer Engineering",
      "Engineering Sciences",
      "Interdisciplinary Engineering",
      "Mathematics",
      "Mechanical Engineering",
      "Physics",
    ]);
    return engineering.has(dept);
  }

  function isHumanitiesSocialDept(dept) {
    const hss = new Set([
      "Humanities",
      "Social Sciences",
      "History and Theory of Art",
    ]);
    return hss.has(dept);
  }

  function fallbackRequirementType(node) {
    if (!node) return "free_electives";
    if (isHumanitiesSocialDept(node.dept)) return "humanities_social_science_electives";
    if (isEngineeringDept(node.dept)) return "engineering_electives";
    return "free_electives";
  }

  function courseAppliesToMajor(req, majorId) {
    if (!majorId) return false;
    const required = Array.isArray(req.required_for_majors) ? req.required_for_majors : [];
    const elective = Array.isArray(req.elective_for_majors) ? req.elective_for_majors : [];
    if (required.length === 0 && elective.length === 0) return true;
    return required.includes(majorId) || elective.includes(majorId);
  }

  function renderRequirementsPanel() {
    if (!requirementsPanel || !requirementsBody || !requirementsHeader) return;

    const majorId = typeof state.presetId === "string" ? state.presetId : "";
    const majorData =
      requirementsData &&
      requirementsData.majors &&
      requirementsData.majors[majorId]
        ? requirementsData.majors[majorId]
        : null;

    const majorLabel = majorData && majorData.label ? majorData.label : (majorId || "Select a preset");
    requirementsHeader.textContent = majorId ? `Degree Requirements: ${majorLabel}` : "Degree Requirements";

    requirementsBody.innerHTML = "";

    if (!majorId) {
      const msg = document.createElement("div");
      msg.className = "req-missing";
      msg.textContent = "Select a preset to view major requirements.";
      requirementsBody.appendChild(msg);
      return;
    }

    if (!requirementsData || !requirementsData.courseRequirements) {
      const msg = document.createElement("div");
      msg.className = "req-missing";
      msg.textContent = "Requirements data not loaded. Run the requirements scripts to generate it.";
      requirementsBody.appendChild(msg);
      return;
    }

    const categories = [
      { key: "required_coursework", label: "Required Coursework:" },
      { key: "degree_electives", label: "Degree Electives:", totalKey: "degree_electives" },
      { key: "engineering_electives", label: "Engineering Electives:" },
      { key: "free_electives", label: "Free Electives:" },
      { key: "humanities_social_science_electives", label: "Humanities Electives:" },
    ];

    const selected = buildSelectedCourseSet();
    const selectedCredits = {
      required_coursework: 0,
      degree_electives: 0,
      engineering_electives: 0,
      free_electives: 0,
      humanities_social_science_electives: 0,
    };

    const majorDept = getMajorDept(majorId);
    const degreeCap =
      majorData && majorData.credits && Number.isFinite(majorData.credits.degree_electives)
        ? majorData.credits.degree_electives
        : 0;
    const engineeringCap =
      majorData && majorData.credits && Number.isFinite(majorData.credits.engineering_electives)
        ? majorData.credits.engineering_electives
        : 0;

    for (const nodeId of getSelectedCourseIdsOrdered()) {
      const canon = normalizeRequirementCode(nodeId);
      if (!canon || !selected.has(canon)) continue;
      const n = nodes.get(nodeId);
      const req = requirementsData.courseRequirements[canon] || null;
      const rawType = req && req.requirement_type ? req.requirement_type : "";
      let requirementType = rawType || fallbackRequirementType(n);
      if (req && rawType && !courseAppliesToMajor(req, majorId)) {
        requirementType = fallbackRequirementType(n);
      }
      const credits = parseCredits(n && n.credits);

      if (requirementType === "required_coursework") {
        if (req && Array.isArray(req.required_for_majors) && req.required_for_majors.includes(majorId)) {
          selectedCredits.required_coursework += credits;
        }
        continue;
      }

      if (requirementType === "humanities_social_science_electives") {
        selectedCredits.humanities_social_science_electives += credits;
        continue;
      }

      if (requirementType === "free_electives") {
        selectedCredits.free_electives += credits;
        continue;
      }

      if (requirementType === "engineering_electives" && n) {
        const courseDept = n.dept || "";
        const isEngineering = isEngineeringDept(courseDept);
        if (!isEngineering) {
          selectedCredits.free_electives += credits;
          continue;
        }

        const isMajorDept = majorDept && courseDept === majorDept;
        if (isMajorDept) {
          if (selectedCredits.degree_electives + credits <= degreeCap + 1e-6) {
            selectedCredits.degree_electives += credits;
          } else if (selectedCredits.engineering_electives + credits <= engineeringCap + 1e-6) {
            selectedCredits.engineering_electives += credits;
          } else {
            selectedCredits.free_electives += credits;
          }
        } else {
          if (selectedCredits.engineering_electives + credits <= engineeringCap + 1e-6) {
            selectedCredits.engineering_electives += credits;
          } else {
            selectedCredits.free_electives += credits;
          }
        }
      } else if (selectedCredits[requirementType] != null) {
        selectedCredits[requirementType] += credits;
      }
    }

    for (const key of Object.keys(selectedCredits)) {
      selectedCredits[key] = Number(selectedCredits[key].toFixed(2));
    }

    const requiredCourses = [];
    for (const [canon, req] of Object.entries(requirementsData.courseRequirements)) {
      if (!req || req.requirement_type !== "required_coursework") continue;
      if (!Array.isArray(req.required_for_majors)) continue;
      if (!req.required_for_majors.includes(majorId)) continue;
      requiredCourses.push(req.code || canon);
    }
    requiredCourses.sort((a, b) => a.localeCompare(b));
    const missingRequired = requiredCourses.filter((code) => {
      const canon = normalizeRequirementCode(code);
      return canon && !selected.has(canon);
    });

    for (const c of categories) {
      const row = document.createElement("div");
      row.className = "req-row";

      const label = document.createElement("div");
      label.className = "req-label";
      label.textContent = c.label;

      const value = document.createElement("div");
      value.className = "req-value";
      const totalKey = c.totalKey || c.key;
      const requiredTotal =
        majorData && majorData.credits && Number.isFinite(majorData.credits[totalKey])
          ? majorData.credits[totalKey]
          : 0;
      value.textContent = `${formatCredits(selectedCredits[c.key] || 0)} / ${formatCredits(requiredTotal)}`;

      row.appendChild(label);
      row.appendChild(value);
      requirementsBody.appendChild(row);

      if (c.key === "required_coursework" && missingRequired.length > 0) {
        const miss = document.createElement("div");
        miss.className = "req-missing";
        miss.textContent = "Missing required courses:";
        const codes = document.createElement("div");
        codes.className = "req-missing-codes";
        codes.textContent = missingRequired.join(", ");
        miss.appendChild(codes);
        requirementsBody.appendChild(miss);
      }
    }

    const totalSelectedKeys = [
      "required_coursework",
      "degree_electives",
      "engineering_electives",
      "free_electives",
      "humanities_social_science_electives",
    ];
    const totalRequiredKeys = [
      "required_coursework",
      "degree_electives",
      "engineering_electives",
      "free_electives",
      "humanities_social_science_electives",
    ];
    const totalSelected = totalSelectedKeys.reduce((sum, key) => sum + (selectedCredits[key] || 0), 0);
    const totalRequired = totalRequiredKeys.reduce((sum, key) => {
      const v = majorData && majorData.credits && Number.isFinite(majorData.credits[key])
        ? majorData.credits[key]
        : 0;
      return sum + v;
    }, 0);

    const totalRow = document.createElement("div");
    totalRow.className = "req-row";

    const totalLabel = document.createElement("div");
    totalLabel.className = "req-label";
    totalLabel.textContent = "Total Credits:";

    const totalValue = document.createElement("div");
    totalValue.className = "req-value";
    totalValue.textContent = `${formatCredits(totalSelected)} / ${formatCredits(totalRequired)}`;

    totalRow.appendChild(totalLabel);
    totalRow.appendChild(totalValue);
    requirementsBody.appendChild(totalRow);
  }

  function getSlotData(semIdx, slotIdx) {
    const sem = state.semesters[semIdx];
    if (!sem || !sem.slots[slotIdx]) return null;
    const slot = sem.slots[slotIdx];
    return {
      courseId: slot.courseId,
      source: slot.source,
      presetId: slot.presetId,
      addedByPreset: slot.addedByPreset && slot.source === "preset",
    };
  }

  function setSlotData(semIdx, slotIdx, data) {
    const sem = state.semesters[semIdx];
    if (!sem || !sem.slots[slotIdx]) return;
    const slot = sem.slots[slotIdx];
    slot.courseId = data && data.courseId ? data.courseId : null;
    slot.source = data && data.courseId ? (data.source || "manual") : null;
    slot.presetId = data && data.source === "preset" ? (data.presetId || null) : null;
    slot.addedByPreset = data && data.source === "preset" ? !!data.addedByPreset : false;
  }

  function clearSlot(semIdx, slotIdx) {
    setSlotData(semIdx, slotIdx, null);
  }

  function moveCourse(fromSemIdx, fromSlotIdx, toSemIdx, toSlotIdx = null) {
    const source = getSlotData(fromSemIdx, fromSlotIdx);
    if (!source || !source.courseId) return;
    if (fromSemIdx === toSemIdx && fromSlotIdx === toSlotIdx) return;

    let targetSlotIdx = toSlotIdx;
    if (targetSlotIdx == null) {
      const targetSem = state.semesters[toSemIdx];
      if (!targetSem) return;
      targetSlotIdx = targetSem.slots.findIndex((s) => s && !s.courseId);
      if (targetSlotIdx === -1) {
        targetSem.slots.push({
          courseId: null,
          isExtra: true,
          source: null,
          presetId: null,
          addedByPreset: false,
        });
        targetSlotIdx = targetSem.slots.length - 1;
      }
    }

    const target = getSlotData(toSemIdx, targetSlotIdx);
    const targetHasCourse = target && target.courseId;

    if (targetHasCourse) {
      setSlotData(toSemIdx, targetSlotIdx, source);
      setSlotData(fromSemIdx, fromSlotIdx, target);
    } else {
      setSlotData(toSemIdx, targetSlotIdx, source);
      const srcSlot = state.semesters[fromSemIdx].slots[fromSlotIdx];
      if (srcSlot && srcSlot.isExtra) {
        state.semesters[fromSemIdx].slots.splice(fromSlotIdx, 1);
      } else {
        clearSlot(fromSemIdx, fromSlotIdx);
      }
    }

    saveState();
    render();
    applyDegreeBuilderFilter();
  }

  let prereqFailures = new Map();
  let prereqTooltip = null;

  function ensurePrereqTooltip() {
    if (prereqTooltip) return prereqTooltip;
    const tip = document.createElement("div");
    tip.className = "db-tooltip hidden";
    document.body.appendChild(tip);
    prereqTooltip = tip;
    return tip;
  }

  function showPrereqTooltip(message, x, y) {
    const tip = ensurePrereqTooltip();
    tip.textContent = message;
    tip.classList.remove("hidden");
    const offset = 12;
    tip.style.left = `${Math.round(x + offset)}px`;
    tip.style.top = `${Math.round(y + offset)}px`;
  }

  function hidePrereqTooltip() {
    if (!prereqTooltip) return;
    prereqTooltip.classList.add("hidden");
  }

  function renderSlot(semIdx, slotIdx) {
    const slot = state.semesters[semIdx].slots[slotIdx];
    const wrap = document.createElement("div");
    wrap.className = "db-slot";
    wrap.dataset.sem = String(semIdx);
    wrap.dataset.slot = String(slotIdx);

    const main = document.createElement("div");
    main.className = "db-slot-main";
    wrap.appendChild(main);

    // --- Slot content ---
    if (!slot.courseId) {
      const row = document.createElement("div");
      row.className = "db-search-row";
      const input = document.createElement("input");
      input.className = "db-search-input";
      input.placeholder = "Search class";
      input.autocomplete = "off";
      row.appendChild(input);
      main.appendChild(row);

      input.addEventListener("input", () => renderSuggestionsForInput(input, semIdx, slotIdx));
      input.addEventListener("focus", () => renderSuggestionsForInput(input, semIdx, slotIdx));
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          const matches = buildSuggestions(input.value, SEARCH_ENTRIES, 1);
          if (matches.length > 0) selectCourse(semIdx, slotIdx, matches[0].id);
          hideSuggestions();
        }
      });

    } else {
      const { titleLine, creditsLine } = courseLabel(slot.courseId);

      const pill = document.createElement("div");
      pill.className = "db-course-pill";
      pill.title = "Click to focus this course in the graph";
      pill.draggable = true;

      const text = document.createElement("div");
      text.className = "db-course-text";

      const t1 = document.createElement("div");
      t1.className = "db-course-titleline";
      t1.textContent = titleLine;
      const t2 = document.createElement("div");
      t2.className = "db-course-credits";
      t2.textContent = creditsLine;
      const failureKey = `${semIdx}:${slotIdx}`;
      const missingPrereqs = prereqFailures.get(failureKey);
      if (missingPrereqs) {
        const tooltipText = `You are missing the following prerequisites: ${missingPrereqs.join(", ")}`;
        t1.classList.add("prereq-fail");
        t2.classList.add("prereq-fail");
        pill.addEventListener("mouseenter", (e) => {
          showPrereqTooltip(tooltipText, e.clientX, e.clientY);
        });
        pill.addEventListener("mousemove", (e) => {
          showPrereqTooltip(tooltipText, e.clientX, e.clientY);
        });
        pill.addEventListener("mouseleave", () => {
          hidePrereqTooltip();
        });
      }

      text.appendChild(t1);
      text.appendChild(t2);
      pill.appendChild(text);

      const removeBtn = document.createElement("button");
      removeBtn.className = "db-icon-btn db-remove-course";
      removeBtn.title = "Remove course";
      removeBtn.type = "button";
      removeBtn.textContent = "×";

      pill.addEventListener("click", (e) => {
        // avoid focusing when clicking the remove button
        if (e.target === removeBtn) return;
        if (typeof focusNode === "function") focusNode(slot.courseId);
      });

      pill.addEventListener("dragstart", (e) => {
        const payload = {
          fromSem: semIdx,
          fromSlot: slotIdx,
        };
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", JSON.stringify(payload));
      });

      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        clearCourse(semIdx, slotIdx);
      });

      main.appendChild(pill);
      wrap.appendChild(removeBtn);
    }

    // Extra-slot undo button
    if (slot.isExtra) {
      const undoBtn = document.createElement("button");
      undoBtn.className = "db-icon-btn db-remove-slot";
      undoBtn.type = "button";
      undoBtn.title = "Remove entry";
      undoBtn.textContent = "↶";
      undoBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeExtraSlot(semIdx, slotIdx);
      });
      wrap.appendChild(undoBtn);
    }

    wrap.addEventListener("dragover", (e) => {
      const data = e.dataTransfer.getData("text/plain");
      if (!data) return;
      e.preventDefault();
      wrap.classList.add("drag-over");
    });

    wrap.addEventListener("dragleave", () => {
      wrap.classList.remove("drag-over");
    });

    wrap.addEventListener("drop", (e) => {
      const data = e.dataTransfer.getData("text/plain");
      if (!data) return;
      e.preventDefault();
      wrap.classList.remove("drag-over");
      try {
        const payload = JSON.parse(data);
        if (
          payload &&
          Number.isInteger(payload.fromSem) &&
          Number.isInteger(payload.fromSlot)
        ) {
          moveCourse(payload.fromSem, payload.fromSlot, semIdx, slotIdx);
        }
      } catch {
        // ignore invalid payloads
      }
    });

    return wrap;
  }

  function renderColumn(semIdx, title) {
    const col = document.createElement("div");
    col.className = "db-semester-col";
    col.dataset.sem = String(semIdx);

    const head = document.createElement("div");
    head.className = "db-semester-title";
    const headTitle = document.createElement("span");
    headTitle.textContent = title;
    const headCredits = document.createElement("span");
    headCredits.className = "db-semester-credits";
    const summary = semesterCreditSummary(semIdx);
    headCredits.textContent = `${formatCredits(summary.totalCredits)} credits`;
    if (summary.totalCredits > 21) {
      headCredits.classList.add("overload");
    } else if (summary.undergradCredits < 12) {
      headCredits.classList.add("underload");
    }
    head.appendChild(headTitle);
    head.appendChild(headCredits);
    col.appendChild(head);

    const slots = state.semesters[semIdx].slots;
    for (let i = 0; i < slots.length; i++) {
      col.appendChild(renderSlot(semIdx, i));
    }

    const addBtn = document.createElement("button");
    addBtn.className = "db-icon-btn db-add-slot";
    addBtn.type = "button";
    addBtn.title = "Add entry";
    addBtn.textContent = "+";
    addBtn.addEventListener("click", () => addSlot(semIdx));
    col.appendChild(addBtn);

    col.addEventListener("dragover", (e) => {
      const data = e.dataTransfer.getData("text/plain");
      if (!data) return;
      e.preventDefault();
    });

    col.addEventListener("drop", (e) => {
      const data = e.dataTransfer.getData("text/plain");
      if (!data) return;
      e.preventDefault();
      try {
        const payload = JSON.parse(data);
        if (
          payload &&
          Number.isInteger(payload.fromSem) &&
          Number.isInteger(payload.fromSlot)
        ) {
          moveCourse(payload.fromSem, payload.fromSlot, semIdx, null);
        }
      } catch {
        // ignore invalid payloads
      }
    });

    return col;
  }

  function render() {
    columnsRoot.innerHTML = "";
    prereqFailures = buildPrereqFailures();
    const visible = getVisibleSemesterIndices();
    const activeIdx = resolveVisibleSemesterIndex(state.currentSemesterIndex, visible);
    state.currentSemesterIndex = activeIdx;
    const title = SEMESTERS_DEFAULT[activeIdx] || `Semester ${activeIdx + 1}`;
    columnsRoot.appendChild(renderColumn(activeIdx, title));
    updatePagination();
    requestAnimationFrame(positionPageControls);
    renderRequirementsPanel();
    requestAnimationFrame(updateRequirementsPanelOffset);
  }

  function getVisibleSemesterIndices() {
    const indices = [];
    for (let i = 0; i < state.semesters.length; i++) {
      const label = SEMESTERS_DEFAULT[i] || "";
      const isSummer = /^Summer\s/i.test(label);
      if (!state.showSummer && isSummer) continue;
      indices.push(i);
    }
    return indices;
  }

  function resolveVisibleSemesterIndex(currentIdx, visibleIndices) {
    if (visibleIndices.length === 0) return 0;
    if (visibleIndices.includes(currentIdx)) return currentIdx;
    for (const idx of visibleIndices) {
      if (idx >= currentIdx) return idx;
    }
    return visibleIndices[visibleIndices.length - 1];
  }

  function updatePagination() {
    if (!pageLabel || !pagePrev || !pageNext) return;
    const visible = getVisibleSemesterIndices();
    const total = visible.length;
    const idx = clampInt(state.currentSemesterIndex, 0, state.semesters.length - 1);
    const pageIndex = Math.max(0, visible.indexOf(idx));
    pageLabel.textContent = `${pageIndex + 1} / ${Math.max(1, total)}`;
    pagePrev.disabled = pageIndex <= 0;
    pageNext.disabled = pageIndex >= total - 1;
    if (semesterRemoveBtn) {
      const baseVisible = SEMESTERS_DEFAULT.filter((label) => {
        if (/^Summer\s/i.test(label)) return state.showSummer;
        return true;
      }).length;
      semesterRemoveBtn.disabled = total <= baseVisible;
    }
  }

  function positionPageControls() {
    if (!optionsToggle || !pageControls) return;
    const optsRect = optionsToggle.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    if (!optsRect.width || !optsRect.height) return;
    const width = Math.round(optsRect.width);
    const left = Math.round(optsRect.left - panelRect.left);
    const gap = 8;
    const baseRect =
      optionsPanel && !optionsPanel.classList.contains("hidden")
        ? optionsPanel.getBoundingClientRect()
        : optsRect;
    const top = Math.round(baseRect.bottom - panelRect.top + gap);
    pageControls.style.left = `${left}px`;
    pageControls.style.top = `${top}px`;
    pageControls.querySelectorAll("button").forEach((btn) => {
      btn.style.width = `${width}px`;
    });
  }

  function setSemesterIndex(nextIdx) {
    const visible = getVisibleSemesterIndices();
    if (visible.length === 0) return;
    const currentVisibleIdx = Math.max(0, visible.indexOf(state.currentSemesterIndex));
    const targetVisibleIdx = clampInt(nextIdx, 0, visible.length - 1);
    const targetIdx = visible[targetVisibleIdx];
    if (targetIdx === state.currentSemesterIndex) return;
    state.currentSemesterIndex = targetIdx;
    saveState();
    render();
  }

  function addSemester() {
    state.semesters.push({
      slots: Array.from({ length: 8 }, () => ({
        courseId: null,
        isExtra: false,
        source: null,
        presetId: null,
        addedByPreset: false,
      })),
    });
    saveState();
    updatePagination();
    render();
  }

  function removeSemester() {
    const visible = getVisibleSemesterIndices();
    const baseVisible = SEMESTERS_DEFAULT.filter((label) => {
      if (/^Summer\s/i.test(label)) return state.showSummer;
      return true;
    }).length;
    if (visible.length <= baseVisible) return;
    state.semesters.pop();
    if (state.currentSemesterIndex >= state.semesters.length) {
      state.currentSemesterIndex = state.semesters.length - 1;
    }
    saveState();
    updatePagination();
    render();
  }

  function hideOptionsPanel() {
    if (!optionsPanel || !optionsToggle) return;
    optionsPanel.classList.add("hidden");
    optionsToggle.setAttribute("aria-expanded", "false");
    requestAnimationFrame(positionPageControls);
  }

  function toggleOptionsPanel() {
    if (!optionsPanel || !optionsToggle) return;
    const isHidden = optionsPanel.classList.contains("hidden");
    if (isHidden) {
      const optsRect = optionsToggle.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const gap = 8;
      const right = Math.round(panelRect.right - optsRect.right);
      const top = Math.round(optsRect.bottom - panelRect.top + gap);
      optionsPanel.style.right = `${right}px`;
      optionsPanel.style.top = `${top}px`;
      optionsPanel.classList.remove("hidden");
      optionsToggle.setAttribute("aria-expanded", "true");
      requestAnimationFrame(positionPageControls);
    } else {
      hideOptionsPanel();
    }
  }

  // ----------------- Wiring -----------------
  toggleBtn.addEventListener("click", () => setOpen(!state.isOpen));
  hideCb.addEventListener("change", () => applyDegreeBuilderFilter());
  if (exportBtn) {
    exportBtn.addEventListener("click", () => exportDegreePlan());
  }
  if (presetSel) {
    presetSel.addEventListener("change", () => applyPreset(presetSel.value));
  }
  if (optionsToggle) {
    optionsToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!state.isOpen) return;
      toggleOptionsPanel();
    });
  }
  if (pagePrev) {
    pagePrev.addEventListener("click", () => {
      const visible = getVisibleSemesterIndices();
      const currentVisibleIdx = Math.max(0, visible.indexOf(state.currentSemesterIndex));
      setSemesterIndex(currentVisibleIdx - 1);
    });
  }
  if (pageNext) {
    pageNext.addEventListener("click", () => {
      const visible = getVisibleSemesterIndices();
      const currentVisibleIdx = Math.max(0, visible.indexOf(state.currentSemesterIndex));
      setSemesterIndex(currentVisibleIdx + 1);
    });
  }
  if (semesterAddBtn) {
    semesterAddBtn.addEventListener("click", () => addSemester());
  }
  if (semesterRemoveBtn) {
    semesterRemoveBtn.addEventListener("click", () => removeSemester());
  }
  if (showSummerToggle) {
    showSummerToggle.addEventListener("change", () => {
      state.showSummer = !!showSummerToggle.checked;
      saveState();
      render();
    });
  }

  // Keep dropdown anchored on scroll/resize.
  const maybeReposition = () => {
    if (activeInput && !sug.classList.contains("hidden")) positionSuggestions(activeInput);
  };
  window.addEventListener("resize", () => {
    maybeReposition();
    updateDetailsCardOffset();
    positionPageControls();
  });
  window.addEventListener("scroll", maybeReposition, true);
  body.addEventListener("scroll", maybeReposition);

  // Keep details card offset correct on viewport changes.
  window.addEventListener("resize", () => requestAnimationFrame(updateDetailsCardOffset));

  // Close suggestions when clicking elsewhere.
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!t) return;
    if (t.classList && t.classList.contains("db-search-input")) return;
    if (sug.contains(t)) return;
    hideSuggestions();
    if (optionsPanel && optionsToggle) {
      if (!optionsPanel.contains(t) && t !== optionsToggle) hideOptionsPanel();
    }
  });

  // Initial render + state application
  render();
  hideCb.checked = !!state.hideNonSelected;
  if (presetSel) presetSel.value = typeof state.presetId === "string" ? state.presetId : "";
  if (showSummerToggle) showSummerToggle.checked = !!state.showSummer;
  setOpen(state.isOpen);
  applyDegreeBuilderFilter();
  updatePagination();

  // Load presets index (async) and sync the dropdown.
  loadPresetIndex().then(() => {
    if (!presetSel) return;
    // If a preset is stored but no preset-filled slots exist (e.g., after upgrade), apply it once.
    const hasPresetSlots = state.semesters.some((sem) => sem.slots.some((s) => s && s.source === "preset"));
    if (state.presetId && !hasPresetSlots) {
      applyPreset(state.presetId);
    }
  });

  // Load requirements data for the right-side panel.
  loadRequirementsData();

  // Ensure correct placement on first paint.
  requestAnimationFrame(updateDetailsCardOffset);

  return {
    getSelectedCourseIds: () => getAllSelectedCourseIds(),
    isHideNonSelectedEnabled: () => !!hideCb.checked,
    disableHideNonSelected: () => {
      hideCb.checked = false;
      applyDegreeBuilderFilter();
    },
    applyDegreeBuilderFilter,
  };
}
