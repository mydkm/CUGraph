#!/usr/bin/env node
/**
 * build_requirements_data.mjs
 *
 * Converts requirements CSVs into js/data/requirements.json.
 *
 * Usage:
 *  node scripts/build_requirements_data.mjs \
 *    --courses requirements_scaffold.csv \
 *    --majors major_requirements.csv \
 *    --majors-json main/js/data/majors.json \
 *    --out main/js/data/requirements.json
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
  if (rows.length === 0) return [];
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
  return data;
}

function parseNumber(val) {
  const n = parseFloat(String(val ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function getArg(argv, key, fallback = null) {
  const i = argv.indexOf(key);
  if (i >= 0 && i + 1 < argv.length) return argv[i + 1];
  return fallback;
}

const argv = process.argv.slice(2);
const root = findProjectRoot(process.cwd());

const coursesCsv = path.resolve(root, getArg(argv, "--courses", "requirements_scaffold.csv"));
const majorsCsv = path.resolve(root, getArg(argv, "--majors", "major_requirements.csv"));
const majorsJson = path.resolve(root, getArg(argv, "--majors-json", "main/js/data/majors.json"));
const outPath = path.resolve(root, getArg(argv, "--out", "main/js/data/requirements.json"));

if (!exists(coursesCsv)) {
  console.error(`ERROR: Requirements CSV not found: ${coursesCsv}`);
  process.exit(1);
}
if (!exists(majorsCsv)) {
  console.error(`ERROR: Major requirements CSV not found: ${majorsCsv}`);
  process.exit(1);
}

let majors = [];
if (exists(majorsJson)) {
  const mj = readJson(majorsJson);
  if (Array.isArray(mj)) majors = mj;
}

const majorsMap = {};
for (const m of majors) {
  if (!m || typeof m !== "object") continue;
  if (typeof m.id !== "string" || !m.id) continue;
  majorsMap[m.id] = {
    label: typeof m.label === "string" ? m.label : m.id,
    credits: {
      required_coursework: 0,
      degree_electives: 0,
      engineering_electives: 0,
      free_electives: 0,
      humanities_social_science_electives: 0,
    },
  };
}

const majorRows = parseCsvFile(majorsCsv);
for (const row of majorRows) {
  const id = row.major_id;
  if (!id) continue;
  if (!majorsMap[id]) {
    majorsMap[id] = {
      label: row.label || id,
      credits: {
        required_coursework: 0,
        degree_electives: 0,
        engineering_electives: 0,
        free_electives: 0,
        humanities_social_science_electives: 0,
      },
    };
  }
  majorsMap[id].credits.required_coursework = parseNumber(row.required_coursework);
  majorsMap[id].credits.degree_electives = parseNumber(row.degree_electives);
  majorsMap[id].credits.engineering_electives = parseNumber(row.engineering_electives);
  majorsMap[id].credits.free_electives = parseNumber(row.free_electives);
  majorsMap[id].credits.humanities_social_science_electives = parseNumber(
    row.humanities_social_science_electives
  );
}

const allowedTypes = new Set([
  "required_coursework",
  "engineering_electives",
  "free_electives",
  "humanities_social_science_electives",
]);

const courseRows = parseCsvFile(coursesCsv);
const courseRequirements = {};
for (const row of courseRows) {
  const code = row.course_code;
  if (!code) continue;
  const canon = canonCourseCode(code);
  if (!canon) continue;
  const type = row.requirement_type;
  courseRequirements[canon] = {
    code,
    requirement_type: allowedTypes.has(type) ? type : "",
    required_for_majors: row.required_for_majors
      ? row.required_for_majors.split("|").map((s) => s.trim()).filter(Boolean)
      : [],
    elective_for_majors: row.elective_for_majors
      ? row.elective_for_majors.split("|").map((s) => s.trim()).filter(Boolean)
      : [],
  };
}

const out = {
  majors: majorsMap,
  courseRequirements,
  meta: {
    generatedAt: new Date().toISOString(),
  },
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");
console.log(`Wrote ${outPath}`);
