#!/usr/bin/env node
/**
 * auto_populate_requirements_from_presets.mjs
 *
 * Populates requirements_scaffold.csv and major_requirements.csv
 * using preset files as required coursework for each major.
 *
 * Usage:
 *  node scripts/auto_populate_requirements_from_presets.mjs \
 *    --presets js/data/presets/presets.json \
 *    --courses cooper_courses.json \
 *    --requirements requirements_scaffold.csv \
 *    --majors major_requirements.csv
 */

import fs from "node:fs";
import path from "node:path";

function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function readJson(filePath) {
  const txt = fs.readFileSync(filePath, "utf8");
  return JSON.parse(txt);
}

function canonCourseCode(code) {
  return String(code ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\n") {
        row.push(field);
        field = "";
        rows.push(row);
        row = [];
      } else if (ch === "\r") {
        // ignore
      } else {
        field += ch;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parseCsvFile(filePath) {
  const txt = fs.readFileSync(filePath, "utf8");
  const rows = parseCsv(txt);
  if (rows.length === 0) return { header: [], rows: [] };
  const header = rows[0].map((h) => h.trim());
  const data = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const obj = {};
    for (let j = 0; j < header.length; j++) {
      const key = header[j];
      if (!key) continue;
      obj[key] = row[j] != null ? row[j].trim() : "";
    }
    data.push(obj);
  }
  return { header, rows: data };
}

function csvEscape(val) {
  const s = String(val ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsv(filePath, header, rows) {
  const lines = [];
  lines.push(header.map(csvEscape).join(","));
  for (const row of rows) {
    lines.push(header.map((h) => csvEscape(row[h] ?? "")).join(","));
  }
  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf8");
}

function parseCredits(val) {
  const n = parseFloat(String(val ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function getArg(argv, key, fallback = null) {
  const i = argv.indexOf(key);
  if (i >= 0 && i + 1 < argv.length) return argv[i + 1];
  return fallback;
}

const argv = process.argv.slice(2);
const root = process.cwd();

const presetsPath = path.resolve(root, getArg(argv, "--presets", "js/data/presets/presets.json"));
const coursesPath = path.resolve(root, getArg(argv, "--courses", "cooper_courses.json"));
const requirementsPath = path.resolve(root, getArg(argv, "--requirements", "requirements_scaffold.csv"));
const majorsPath = path.resolve(root, getArg(argv, "--majors", "major_requirements.csv"));

if (!exists(presetsPath)) {
  console.error(`ERROR: Presets index not found: ${presetsPath}`);
  process.exit(1);
}
if (!exists(coursesPath)) {
  console.error(`ERROR: Courses JSON not found: ${coursesPath}`);
  process.exit(1);
}
if (!exists(requirementsPath)) {
  console.error(`ERROR: Requirements CSV not found: ${requirementsPath}`);
  process.exit(1);
}
if (!exists(majorsPath)) {
  console.error(`ERROR: Major requirements CSV not found: ${majorsPath}`);
  process.exit(1);
}

const courses = readJson(coursesPath);
const creditsByCanon = new Map();
for (const c of courses) {
  if (!c || typeof c !== "object") continue;
  const code = c.course_code;
  const canon = canonCourseCode(code);
  if (!canon || creditsByCanon.has(canon)) continue;
  creditsByCanon.set(canon, parseCredits(c.credits));
}

const presetsIndex = readJson(presetsPath);
const majors = [];
for (const p of presetsIndex) {
  if (!p || typeof p !== "object") continue;
  if (typeof p.id !== "string" || !p.id) continue;
  if (typeof p.file !== "string" || !p.file) continue;
  majors.push({ id: p.id, file: p.file });
}

const requiredByMajor = new Map();
for (const m of majors) {
  requiredByMajor.set(m.id, new Set());
  const presetFile = path.resolve(root, m.file);
  if (!exists(presetFile)) {
    console.warn(`WARN: Missing preset file: ${presetFile}`);
    continue;
  }
  const rows = readJson(presetFile);
  if (!Array.isArray(rows)) continue;
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const code = r.course_code || r.courseCode || r.code;
    if (!code) continue;
    const canon = canonCourseCode(code);
    if (!canon) continue;
    requiredByMajor.get(m.id).add(canon);
  }
}

// Update requirements_scaffold.csv
const reqCsv = parseCsvFile(requirementsPath);
for (const row of reqCsv.rows) {
  const code = row.course_code;
  if (!code) continue;
  const canon = canonCourseCode(code);
  const majorsList = [];
  for (const m of majors) {
    const set = requiredByMajor.get(m.id);
    if (set && set.has(canon)) majorsList.push(m.id);
  }
  if (majorsList.length > 0) {
    row.requirement_type = "required_coursework";
    row.required_for_majors = majorsList.sort().join("|");
  }
}
writeCsv(requirementsPath, reqCsv.header, reqCsv.rows);

// Update major_requirements.csv
const majorsCsv = parseCsvFile(majorsPath);
const majorsById = new Map();
for (const row of majorsCsv.rows) {
  if (!row.major_id) continue;
  majorsById.set(row.major_id, row);
}
for (const m of majors) {
  let total = 0;
  const set = requiredByMajor.get(m.id);
  if (set) {
    for (const canon of set) {
      total += creditsByCanon.get(canon) || 0;
    }
  }
  if (!majorsById.has(m.id)) {
    majorsById.set(m.id, {
      major_id: m.id,
      required_coursework: "0",
      engineering_electives: "0",
      free_electives: "0",
      humanities_social_science_electives: "0",
    });
  }
  const row = majorsById.get(m.id);
  row.required_coursework = String(Number(total.toFixed(2)));
}

writeCsv(majorsPath, majorsCsv.header, majorsCsv.rows);

console.log(`Updated ${requirementsPath}`);
console.log(`Updated ${majorsPath}`);
