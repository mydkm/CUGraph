#!/usr/bin/env node
/**
 * build_requirements_scaffold.mjs
 *
 * Generates:
 *  - majors.json from js/data/presets/presets.json
 *  - requirements_scaffold.csv populated from cooper_courses.json + presets
 *
 * Usage:
 *  node scripts/build_requirements_scaffold.mjs \
 *    --presets main/js/data/presets/presets.json \
 *    --courses main/js/data/cooper_courses.json \
 *    --out-csv requirements_scaffold.csv \
 *    --out-majors main/js/data/majors.json
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function findProjectRoot(startDir) {
  let dir = startDir;
  while (true) {
    const hasIndex = exists(path.join(dir, "index.html"));
    const hasMainJsDir = exists(path.join(dir, "main", "js"));
    if (hasIndex && hasMainJsDir) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
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

function csvEscape(val) {
  const s = String(val ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function getArg(argv, key, fallback = null) {
  const i = argv.indexOf(key);
  if (i >= 0 && i + 1 < argv.length) return argv[i + 1];
  return fallback;
}

const argv = process.argv.slice(2);
const root = findProjectRoot(process.cwd());

const presetsPath = path.resolve(root, getArg(argv, "--presets", "main/js/data/presets/presets.json"));
const coursesPath = path.resolve(root, getArg(argv, "--courses", "main/js/data/cooper_courses.json"));
const outCsvPath = path.resolve(root, getArg(argv, "--out-csv", "requirements_scaffold.csv"));
const outMajorsPath = path.resolve(root, getArg(argv, "--out-majors", "main/js/data/majors.json"));
const outMajorReqPath = path.resolve(
  root,
  getArg(argv, "--out-major-reqs", "major_requirements.csv")
);

if (!exists(presetsPath)) {
  console.error(`ERROR: Presets index not found: ${presetsPath}`);
  process.exit(1);
}
if (!exists(coursesPath)) {
  console.error(`ERROR: Courses JSON not found: ${coursesPath}`);
  process.exit(1);
}

const presetsIndex = readJson(presetsPath);
if (!Array.isArray(presetsIndex)) {
  console.error("ERROR: presets.json must be an array.");
  process.exit(1);
}

const majors = [];
const presetList = [];
for (const p of presetsIndex) {
  if (!p || typeof p !== "object") continue;
  if (typeof p.id !== "string" || !p.id) continue;
  if (typeof p.label !== "string" || !p.label) continue;
  if (typeof p.file !== "string" || !p.file) continue;
  majors.push({ id: p.id, label: p.label });
  presetList.push({ id: p.id, file: p.file });
}

// Map of canonical course code -> Set of major ids
const requiredForMajors = new Map();
for (const preset of presetList) {
  const presetPath = path.resolve(root, preset.file);
  if (!exists(presetPath)) {
    console.warn(`WARN: Missing preset file: ${presetPath}`);
    continue;
  }
  const rows = readJson(presetPath);
  if (!Array.isArray(rows)) continue;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const code = row.course_code || row.courseCode || row.code;
    if (!code) continue;
    const canon = canonCourseCode(code);
    if (!canon) continue;
    if (!requiredForMajors.has(canon)) requiredForMajors.set(canon, new Set());
    requiredForMajors.get(canon).add(preset.id);
  }
}

const courses = readJson(coursesPath);
if (!Array.isArray(courses)) {
  console.error("ERROR: cooper_courses.json must be an array.");
  process.exit(1);
}

const seen = new Set();
const rows = [];
rows.push(["course_code", "title", "requirement_type", "required_for_majors", "elective_for_majors"]);

for (const c of courses) {
  if (!c || typeof c !== "object") continue;
  const code = String(c.course_code ?? "").trim();
  if (!code) continue;
  const canon = canonCourseCode(code);
  if (!canon || seen.has(canon)) continue;
  seen.add(canon);

  const majorsSet = requiredForMajors.get(canon);
  const majorsList = majorsSet ? Array.from(majorsSet).sort() : [];
  const requirementType = majorsList.length > 0 ? "major_required" : "";
  const majorsStr = majorsList.join("|");

  rows.push([
    code,
    c.title ?? "",
    requirementType,
    majorsStr,
    "",
  ]);
}

const csvLines = rows.map((row) => row.map(csvEscape).join(",")).join("\n") + "\n";
fs.writeFileSync(outCsvPath, csvLines, "utf8");
fs.mkdirSync(path.dirname(outMajorsPath), { recursive: true });
fs.writeFileSync(outMajorsPath, JSON.stringify(majors, null, 2) + "\n", "utf8");

const majorReqRows = [
  [
    "major_id",
    "required_coursework",
    "engineering_electives",
    "free_electives",
    "humanities_social_science_electives",
  ],
];
for (const m of majors) {
  majorReqRows.push([m.id, "0", "0", "0", "0"]);
}
const majorReqCsv = majorReqRows.map((row) => row.map(csvEscape).join(",")).join("\n") + "\n";
fs.writeFileSync(outMajorReqPath, majorReqCsv, "utf8");

console.log(`Wrote ${outCsvPath}`);
console.log(`Wrote ${outMajorsPath}`);
console.log(`Wrote ${outMajorReqPath}`);
