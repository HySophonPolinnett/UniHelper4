/* UniHelper parsers
 * - parseSchedule(rows)        : semester schedule spreadsheet  -> sections
 * - parseAuditTable(rows)      : degree audit exported as Excel/CSV/HTML table
 * - parseAuditText(text)       : degree audit copied & pasted as text
 * - parseAuditWords(pages)     : degree audit PDF (words + positions from PDF text layer or OCR)
 * Pure functions, no DOM access, so they can be tested anywhere.
 */
(function (root) {
  "use strict";
  const U = {};

  /* ---------- small helpers ---------- */
  const str = (v) => (v == null ? "" : String(v)).replace(/ /g, " ").trim();
  const median = (a) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
  const CODE_ANY = /([A-Za-z]{2,5})\s*-?\s*(\d{3}[A-Za-z]?)/g;
  const CODE_ONE = /^([A-Za-z]{2,5})\s*-?\s*(\d{3}[A-Za-z]?)$/;
  U.normCode = (s) => { const m = str(s).match(CODE_ONE); return m ? m[1].toUpperCase() + " " + m[2].toUpperCase() : null; };
  U.codesIn = (s) => { const out = []; str(s).replace(CODE_ANY, (m, a, b) => { out.push(a.toUpperCase() + " " + b.toUpperCase()); return m; }); return out; };

  /* ---------- tolerant code repair (OCR confuses I/L/1, O/0 ...) ---------- */
  const PREFIXES = new Set("ACCT AIN BCOM BUSN CLD COMM COSC CSCI CYBR CYS ECON ENGL ENTR ENVS ESOC FIN FINC FYP GBLA GEOG HIST HUMN ICT INF INFO INS INTS ISEC ITEC ITM LAW LEGL MATH MGMT MIS MKTG PHIL POLS PR PSYC SMNR BNAD CHEM BIOL PHYS ARTS MUSC".split(" "));
  U.addPrefixes = (list) => list.forEach((p) => PREFIXES.add(String(p).toUpperCase()));
  const TITLES = new Map(); // normalised title -> Set(codes)
  const normTitle = (t) => str(t).toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  U.normTitle = normTitle;
  U.addTitles = (pairs) => pairs.forEach(([code, title]) => { const k = normTitle(title); if (!k) return; if (!TITLES.has(k)) TITLES.set(k, new Set()); TITLES.get(k).add(code); });
  const CONF_LETTER = { L: "I", "1": "I", "|": "I", I: "L", "0": "O", O: "0", "5": "S", S: "5", "8": "B", B: "8" };
  function fixPrefix(tok) {
    tok = str(tok).toUpperCase().replace(/[^A-Z0-9|]/g, "");
    if (PREFIXES.has(tok)) return tok;
    // try swapping confusable characters, one or two positions
    const cs = tok.split("");
    const opts = [];
    for (let i = 0; i < cs.length; i++) if (CONF_LETTER[cs[i]]) opts.push(i);
    for (let m = 1; m < (1 << opts.length) && m < 16; m++) {
      const c = cs.slice();
      opts.forEach((pos, bit) => { if (m & (1 << bit)) c[pos] = CONF_LETTER[c[pos]]; });
      const cand = c.join("");
      if (PREFIXES.has(cand)) return cand;
    }
    return /^[A-Z]{2,5}$/.test(tok) ? tok : null;
  }
  function fixNumber(tok) {
    tok = str(tok).toUpperCase().replace(/[\s.,:;]/g, "");
    let out = "";
    for (const ch of tok) {
      if (/\d/.test(ch)) out += ch;
      else if (ch === "M") out += "11";           // three thin 1s are often read as "m"
      else if ("ILl|!".includes(ch)) out += "1";
      else if (ch === "O" || ch === "Q") out += "0";
      else if (ch === "S") out += "5";
      else if (ch === "B") out += "8";
      else if (ch === "Z") out += "2";
      else if (ch === "G") out += "6";
      else out += ch;
    }
    const m = out.match(/^(\d{3})([A-Z]?)$/);
    return m ? m[1] + m[2] : null;
  }
  /* turn the text of the "AUPP CSN" cell into a clean code, or null */
  U.fixCode = function (text) {
    const t = str(text).replace(/\s+/g, " ");
    if (!t) return null;
    let m = t.match(/^([A-Za-z]{2,5})(\d{3}[A-Za-z]?)$/);
    if (!m) m = t.match(/^([A-Za-z|0-9]{2,5})\s+(\S{1,5})$/);
    if (!m) return null;
    const pre = fixPrefix(m[1]), num = fixNumber(m[2]);
    return pre && num ? pre + " " + num : null;
  };
  const levR = (a, b) => { // similarity 0..1 between two short strings
    if (a === b) return 1; const n = a.length, m = b.length; if (!n || !m) return 0;
    let prev = Array.from({ length: m + 1 }, (_, j) => j);
    for (let i = 1; i <= n; i++) { const cur = [i]; for (let j = 1; j <= m; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
    return 1 - prev[m] / Math.max(n, m);
  };
  /* exact title first; otherwise the single closest catalog title (OCR makes small spelling slips) */
  U.guessByTitle = function (title) {
    const k = normTitle(title); if (!k) return null;
    const ex = TITLES.get(k); if (ex) return ex.size === 1 ? Array.from(ex)[0] : null;
    if (k.length < 8) return null;
    let best = null, bs = 0, second = 0;
    TITLES.forEach((codes, t) => { if (Math.abs(t.length - k.length) > 4) return; const r = levR(k, t); if (r > bs) { second = bs; bs = r; best = codes; } else if (r > second) second = r; });
    return best && best.size === 1 && bs >= 0.84 && bs - second >= 0.05 ? Array.from(best)[0] : null;
  };

  /* ---------- meeting times ---------- */
  U.parseDays = function (s) {
    s = str(s).toUpperCase().replace(/[^A-Z]/g, "");
    const out = [], map = { M: 1, T: 2, W: 3, R: 4, F: 5, S: 6 };
    for (let i = 0; i < s.length;) {
      if (s.startsWith("TH", i)) { out.push(4); i += 2; continue; }
      if (map[s[i]]) out.push(map[s[i]]);
      i++;
    }
    return Array.from(new Set(out));
  };
  U.parseTime = function (raw) {
    const s = str(raw);
    const m = s.match(/(?:\(([^)]*)\))?\s*(\d{1,2})[:.](\d{2})\s*([ap])\.?m\.?\s*(?:-|–|—|to)\s*(\d{1,2})[:.](\d{2})\s*([ap])\.?m\.?\s*([A-Za-z,/ ]*)/i);
    if (!m) return null;
    const conv = (h, mi, ap) => { h = +h; ap = ap.toLowerCase(); if (ap === "p" && h < 12) h += 12; if (ap === "a" && h === 12) h = 0; return h * 60 + (+mi); };
    const days = U.parseDays(m[8] || "");
    return { slot: str(m[1]), days, start: conv(m[2], m[3], m[4]), end: conv(m[5], m[6], m[7]), dayStr: str(m[8]), raw: s };
  };
  U.overlap = (a, b) => !!(a && b && a.days.length && b.days.length && a.days.some((d) => b.days.includes(d)) && a.start < b.end && b.start < a.end);

  /* ---------- schedule spreadsheet ---------- */
  U.parseSchedule = function (rows) {
    const warnings = [];
    const keys = [
      ["code", /course\s*code|^code$|course\s*no|course\s*number|^course$/i],
      ["section", /^sec/i],
      ["title", /course\s*title|^title$|course\s*name|^name$/i],
      ["credits", /credit|unit/i],
      ["faculty", /faculty|instructor|teacher|lecturer|professor/i],
      ["time", /^time|schedule|meeting/i],
      ["room", /class\s*room|^room|location|venue/i],
      ["start", /start/i],
      ["end", /^end/i],
    ];
    let hi = -1, col = {};
    for (let i = 0; i < Math.min(rows.length, 40); i++) {
      const found = {};
      rows[i].forEach((c, j) => { c = str(c); for (const [k, re] of keys) { if (found[k] === undefined && re.test(c)) { found[k] = j; break; } } });
      if (found.code !== undefined && (found.time !== undefined || found.title !== undefined)) { hi = i; col = found; break; }
    }
    if (hi < 0) { // guess columns from the data itself
      const codeRe = /^[A-Za-z]{2,5}\s?-?\d{3}[A-Za-z]?(\s*\/\s*[A-Za-z]{2,5}\s?-?\d{3}[A-Za-z]?)*$/;
      const width = Math.max(0, ...rows.map((r) => r.length));
      const best = (test) => { let bi = -1, bc = 0; for (let j = 0; j < width; j++) { let c = 0; rows.forEach((r) => { if (test(str(r[j]))) c++; }); if (c > bc) { bc = c; bi = j; } } return bi; };
      const cc = best((v) => codeRe.test(v));
      if (cc < 0) return { sections: [], aliases: [], warnings: ["I couldn't find any course codes (like COSC 111) in this file."], stats: { rows: 0, courses: 0 } };
      col = { code: cc, section: cc + 1, title: cc + 2, credits: cc + 3, faculty: cc + 4, time: best((v) => !!U.parseTime(v)) };
      warnings.push("No header row found – I guessed the columns. Please check the results.");
    }
    const sections = [], aliases = [];
    let noTime = 0;
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i], cell = (k) => (col[k] === undefined ? "" : str(r[col[k]]));
      const codes = U.codesIn(cell("code"));
      if (!codes.length) continue;
      const titleRaw = cell("title"), tparts = titleRaw.split(/\s+\/\s+/).map(str);
      const sparts = cell("section").split("/").map(str);
      const credits = parseFloat(cell("credits"));
      const t = U.parseTime(cell("time"));
      if (!t || !t.days.length) noTime++;
      if (codes.length > 1) aliases.push(codes);
      codes.forEach((code, ix) => {
        sections.push({
          code,
          section: sparts[ix] || sparts[0] || "",
          title: (tparts.length === codes.length ? tparts[ix] : titleRaw).replace(/\s+/g, " "),
          credits: isNaN(credits) ? null : credits,
          faculty: cell("faculty"),
          room: cell("room"),
          slot: t ? t.slot : "",
          days: t ? t.days : [], start: t ? t.start : null, end: t ? t.end : null,
          timeText: t ? t.raw : cell("time"),
          startDate: cell("start"), endDate: cell("end"),
        });
      });
    }
    if (noTime) warnings.push(noTime + " section(s) have no readable meeting time and will show as TBA.");
    return { sections, aliases, warnings, stats: { rows: sections.length, courses: new Set(sections.map((s) => s.code)).size } };
  };

  /* schedule from plain text lines (PDF fallback): CODE  SECTION  TITLE ... time ... */
  U.parseScheduleLines = function (lines) {
    const sections = [];
    lines.forEach((l) => {
      l = str(l).replace(/\s+/g, " ");
      const m = l.match(/(?:^|\s)([A-Za-z]{2,5})\s?-?(\d{3}[A-Za-z]?)\s+(?:([A-Za-z]?\d{1,2}[A-Za-z]?)\s+)?(.*)$/);
      if (!m) return;
      const t = U.parseTime(l); if (!t) return;
      const ti = l.search(/(?:\([^)]*\)\s*)?\d{1,2}[:.]\d{2}\s*[ap]\.?m/i);
      const mid = ti > l.indexOf(m[2]) ? l.slice(l.indexOf(m[2]) + m[2].length, ti) : m[4];
      const title = str(mid.replace(/^\s*[A-Za-z]?\d{1,2}[A-Za-z]?\s+/, "")).replace(/\s+\d(\.\d)?\s*$/, "");
      sections.push({ code: m[1].toUpperCase() + " " + m[2].toUpperCase(), section: m[3] || "", title, credits: null, faculty: "", room: "", slot: t.slot, days: t.days, start: t.start, end: t.end, timeText: ti >= 0 ? l.slice(ti) : t.raw, startDate: "", endDate: "" });
    });
    return { sections, aliases: [], warnings: sections.length ? ["I read this PDF line by line, so teacher names and rooms may be missing. Check a few courses."] : [], stats: { rows: sections.length, courses: new Set(sections.map((x) => x.code)).size } };
  };

  /* ---------- degree audit: grades, groups ---------- */
  const PASS = /^(A[+-]?|B[+-]?|C[+-]?|D[+-]?|P|S|CR|TR|T|TC|EX|CE|PASS)$/i;
  const INPROG = /^(RG|IP|REG|REGISTERED|IN\s*PROGRESS|I)$/i;
  const FAIL = /^(F|W|WF|WP|WD|NP|NC|U|FN)$/i;
  U.GRADE_TOKEN = /^(A[+-]?|B[+-]?|C[+-]?|D[+-]?|F|P|S|U|W|WF|WP|WD|I|NP|NC|CR|TR|T|TC|EX|CE|RG|IP|AU)$/i;
  /* Rule from the audit itself: grade RG (registered) = taking it now; a number in "Credits Earned" = completed
     (and that number is the credits); an empty "Credits Earned" box = not taken yet. */
  U.statusOf = function (grade, semester, earned) {
    const g = str(grade).replace(/\s+/g, "").toUpperCase();
    if (/^(RG|REG|REGISTERED|IP|INPROGRESS)$/.test(g)) return "inprogress";
    if (earned != null && earned > 0) return "done";
    return "todo";
  };
  U.groupOf = function (label) {
    const s = str(label).toLowerCase();
    if (!s) return "none";
    if (/intern/.test(s)) return "internship";
    if (/elective/.test(s)) return "electives";
    if (/foundation|fndn/.test(s)) return "foundation";
    if (/humanit|\bha\b|\barts\b/.test(s)) return "humanities";
    if (/behavior|social|\bbss\b/.test(s)) return "social";
    if (/major/.test(s)) return "major";
    if (/natural|\bmns\b|math/.test(s)) return "natural";
    if (/gen.?ed|\bge\b/.test(s)) return "gened";
    return "other";
  };
  U.GROUP_LABEL = { major: "Major", foundation: "Foundation", humanities: "Humanities and arts", social: "Behavioral and social sciences", natural: "Math and natural sciences", gened: "General education", electives: "Electives", internship: "Internship", other: "Other", none: "Not counted toward degree" };
  U.GROUP_ORDER = ["foundation", "major", "natural", "humanities", "social", "gened", "internship", "electives", "other", "none"];

  const normSemester = (s) => {
    const m = str(s).replace(/[oO](?=\d)|(?<=\d)[oO]/g, "0").match(/(spring|summer|fall|winter|autumn)\s*(\d{4})/i);
    return m ? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() + " " + m[2] : "";
  };
  const num = (s) => { const m = str(s).match(/\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };

  /* Turn raw rows + optional summary into the final audit object */
  /* Merged "Category" cells come out blank on every row after the first. Fill them down – but only when that makes
     the credit count agree with the audit's own total (or when most rows are blank and none of them is a real "uncategorised" row). */
  function fillDown(raw, totalCompleted) {
    const unclear = (r) => !str(r.category) || U.groupOf(r.category) === "other"; // blank, or OCR noise that isn't a real category
    const blank = raw.filter((r) => r.code && unclear(r)).length, withCat = raw.filter((r) => !unclear(r)).length;
    if (!blank || !withCat) return;
    const earned = (rows) => rows.filter((r) => U.groupOf(r.category) !== "none").reduce((n, r) => { const st = U.statusOf(str(r.grade).toUpperCase().replace(/\s+/g, ""), normSemester(r.semester), r.earned); return n + (st === "done" ? (r.earned || r.credits || 0) : 0); }, 0);
    let last = ""; const filled = raw.map((r) => { if (!unclear(r)) last = r.category; return Object.assign({}, r, { category: unclear(r) ? last || r.category : r.category }); });
    let use;
    if (totalCompleted != null) use = Math.abs(earned(filled) - totalCompleted) <= Math.abs(earned(raw) - totalCompleted);
    else use = blank / raw.length >= 0.3 && !unclear(raw[0]);
    if (use) raw.forEach((r, i) => (r.category = filled[i].category));
  }
  U.finalizeAudit = function (raw, summary, meta, source) {
    fillDown(raw, summary && summary.totalCompleted != null ? summary.totalCompleted : null);
    const priority = { done: 4, inprogress: 3, retake: 2, todo: 1 };
    const unreadable = raw.filter((r) => !r.code).map((r) => ({ category: r.category, name: r.name, credits: r.credits, semester: normSemester(r.semester), grade: r.grade, earned: r.earned, codeText: r.codeText || "" }));
    const guessed = raw.filter((r) => r.code && r.guessed).map((r) => r.code);
    raw = raw.filter((r) => r.code);
    const byCode = new Map();
    raw.forEach((r) => {
      const row = Object.assign({}, r);
      row.group = U.groupOf(row.category);
      row.grade = str(row.grade).toUpperCase().replace(/[\u2010-\u2015\u2212]/g, "-").replace(/\s+/g, "").replace(/^([A-Z])\1$/, "$1");
      row.semester = normSemester(row.semester);
      row.status = U.statusOf(row.grade, row.semester, row.earned);
      if (row.status !== "done") row.earned = null;
      const old = byCode.get(row.code);
      if (!old || priority[row.status] > priority[old.status]) byCode.set(row.code, row);
    });
    const rows = Array.from(byCode.values());
    const groups = {};
    const g = (k) => (groups[k] = groups[k] || { key: k, label: U.GROUP_LABEL[k] || k, listed: 0, done: 0, inprog: 0, required: null, rows: 0 });
    rows.forEach((r) => {
      const o = g(r.group); o.rows++; o.listed += r.credits || 0;
      if (r.status === "done") o.done += r.earned || r.credits || 0;
      if (r.status === "inprogress") o.inprog += r.credits || 0;
    });
    const warnings = [];
    let totalRequired = null, totalCompleted = null;
    if (summary && summary.groups && Object.keys(summary.groups).length) {
      Object.entries(summary.groups).forEach(([k, v]) => { const o = g(k); o.required = v.required; o.summaryDone = v.completed; });
      totalRequired = summary.totalRequired; totalCompleted = summary.totalCompleted;
    } else {
      warnings.push("I couldn't read the credit summary (Required / Completed) from this file, so I can't tell how many credits you still need in pick-from groups like Electives. Upload the PDF or paste the whole page for exact results.");
    }
    // groups where every listed course is mandatory
    Object.values(groups).forEach((o) => {
      if (o.required == null && ["major", "foundation", "humanities", "natural", "internship"].includes(o.key)) o.required = o.listed;
      o.pick = o.required != null && o.listed > o.required + 0.01; // choose-from list
    });
    const earnedSum = rows.filter((r) => r.group !== "none" && r.status === "done").reduce((n, r) => n + (r.earned || 0), 0);
    const checks = { earnedSum, summaryCompleted: totalCompleted, ok: totalCompleted == null ? null : Math.abs(earnedSum - totalCompleted) < 0.01 };
    return { source, meta: meta || {}, rows, groups, totalRequired, totalCompleted, checks, warnings, unreadable, guessed };
  };

  /* ---------- audit summary (Required / Completed per group) from rows of cells ---------- */
  U.scanSummary = function (lines) { // lines: arrays of cell strings
    const groups = {}; let totalRequired = null, totalCompleted = null;
    lines.forEach((cells) => {
      cells = cells.map(str).filter(Boolean);
      if (!cells.length) return;
      const joined = cells.join(" ");
      let m = joined.match(/required\s*:?\s*(\d+)\s*completed\s*:?\s*(\d+)/i);
      if (m) { totalRequired = +m[1]; totalCompleted = +m[2]; return; }
      if (U.codesIn(cells[0]).length && /^[A-Za-z]{2,5}\s?\d{3}/.test(cells[0])) return; // course row
      m = joined.match(/^(.*?):?\s+(\d{1,3})\s+(\d{1,3})$/);
      if (!m) return;
      const label = m[1].replace(/:$/, "");
      if (!/major|elective|foundation|humanit|behavior|social|natural|math|intern|general/i.test(label)) return;
      if (/semester|credits earned/i.test(label)) return;
      const k = U.groupOf(label);
      if (k === "none" || k === "other") return;
      if (!groups[k]) groups[k] = { required: +m[2], completed: +m[3], label };
    });
    return { groups, totalRequired, totalCompleted };
  };

  /* ---------- degree audit from a table (Excel / CSV / HTML) ---------- */
  const GR_COL = [
    ["category", /categor|requirement\s*type|^type$/i],
    ["code", /aupp\s*csn|course\s*(code|no|number)|^code$|^csn$|^course$/i],
    ["inst", /inst/i],
    ["name", /course\s*name|title|description/i],
    ["credits", /^credits?$|^units?$|^cr$/i],
    ["semester", /semester|term/i],
    ["grade", /grade|result|status/i],
    ["earned", /earned/i],
  ];
  const SEM_RE = /^(spring|summer|fall|winter|autumn)\s*\d{4}$/i;
  function rowFromCells(cells, col) {
    cells = cells.map(str);
    let ci = -1;
    if (col && col.code !== undefined) {
      const m = U.normCode(cells[col.code]) || (U.codesIn(cells[col.code])[0] || null);
      if (m) ci = col.code;
    }
    if (ci < 0) ci = cells.findIndex((c) => !!U.normCode(c));
    if (ci < 0) return null;
    const code = U.normCode(cells[ci]) || U.codesIn(cells[ci])[0];
    if (col && col.code !== undefined) {
      const g = (k) => (col[k] === undefined ? "" : cells[col[k]]);
      return { category: g("category"), code, inst: g("inst"), name: g("name"), credits: num(g("credits")), semester: g("semester"), grade: g("grade"), earned: num(g("earned")) };
    }
    // no header: infer from the shape of the row
    const after = cells.slice(ci + 1);
    const category = cells.slice(0, ci).join(" ");
    const si = after.findIndex((c) => SEM_RE.test(c));
    const semester = si >= 0 ? after[si] : "";
    let grade = "", earned = null;
    if (si >= 0) { if (U.GRADE_TOKEN.test(after[si + 1] || "")) grade = after[si + 1]; earned = num(after[si + (grade ? 2 : 1)]); }
    else { const gi = after.findIndex((c) => U.GRADE_TOKEN.test(c)); if (gi >= 0) grade = after[gi]; }
    const stop = si >= 0 ? si : after.length;
    const head = after.slice(0, stop);
    const ni = head.map((c, i) => (/^\d(\.\d)?$/.test(c) ? i : -1)).filter((i) => i >= 0).pop();
    const credits = ni !== undefined ? num(head[ni]) : null;
    const textCells = head.filter((c, i) => i !== ni && c && !U.normCode(c) && !/^GE/i.test(c));
    const name = textCells.sort((a, b) => b.length - a.length)[0] || "";
    const instc = head.find((c) => U.normCode(c) || /^GE/i.test(c)) || "";
    return { category, code, inst: instc, name, credits, semester, grade, earned };
  }
  U.parseAuditTable = function (rows) {
    let hi = -1, col = {};
    for (let i = 0; i < Math.min(rows.length, 40); i++) {
      const found = {};
      rows[i].forEach((c, j) => { c = str(c); for (const [k, re] of GR_COL) { if (found[k] === undefined && re.test(c)) { found[k] = j; break; } } });
      if (found.code !== undefined && (found.grade !== undefined || found.semester !== undefined)) { hi = i; col = found; break; }
    }
    const raw = [];
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rowFromCells(rows[i], hi >= 0 ? col : null);
      if (r && r.code) raw.push(r);
    }
    const summary = U.scanSummary(rows);
    return U.finalizeAudit(raw, summary, {}, "table");
  };
  U.parseAuditText = function (text) {
    const lines = String(text).split(/\r?\n/).map((l) => l.replace(/ /g, " ")).filter((l) => l.trim());
    const cellsOf = (l) => (l.includes("\t") ? l.split("\t") : l.split(/\s{2,}/));
    const raw = [], sumLines = [];
    let meta = {};
    lines.forEach((l) => {
      const dm = l.match(/^\s*Degree\s*:?\s*(.+)$/i); if (dm && !meta.degree) meta.degree = dm[1].trim();
      const cm = l.match(/Catalog\s*Term\s*:?\s*((?:spring|summer|fall|winter)\s*\d{4})/i); if (cm) meta.catalogTerm = normSemester(cm[1]);
      let cells = cellsOf(l);
      let r = cells.length >= 3 ? rowFromCells(cells, null) : null;
      if (!r) { // single-spaced line: split around the code and semester
        const m = l.match(/(?:^|\s)([A-Za-z]{2,5})\s?(\d{3}[A-Za-z]?)\s+(.*)$/);
        if (m) {
          const rest = m[3];
          const sm = rest.match(/\b(Spring|Summer|Fall|Winter)\s*(\d{4})\s+([A-Za-z][+-]?)?(?:\s+(\d(?:\.\d)?))?\s*$/i);
          const body = sm ? rest.slice(0, sm.index).trim() : rest.trim();
          const cm2 = body.match(/^(.*?)\s+(\d(?:\.\d)?)$/);
          const pre = l.slice(0, l.indexOf(m[1] + (m[0].includes(m[1] + " ") ? " " : "") + m[2])).trim();
          r = { category: pre, code: m[1].toUpperCase() + " " + m[2].toUpperCase(), inst: "", name: cm2 ? cm2[1] : body, credits: cm2 ? parseFloat(cm2[2]) : null, semester: sm ? sm[1] + " " + sm[2] : "", grade: sm && sm[3] && U.GRADE_TOKEN.test(sm[3]) ? sm[3] : "", earned: sm && sm[4] ? parseFloat(sm[4]) : null };
        }
      }
      if (r) raw.push(r); else sumLines.push(cells.length > 1 ? cells : [l]);
    });
    return U.finalizeAudit(raw, U.scanSummary(sumLines.map((c) => (c.length === 1 ? c[0].split(/\s{2,}|\t/) : c))), meta, "text");
  };

  /* ---------- degree audit from a PDF (words with positions) ---------- */
  const DEFAULT_FRAC = [54, 213, 279, 369, 617, 678, 763, 816].map((x) => x / 935);
  function clusterLines(ws, tol) {
    const s = ws.slice().sort((a, b) => a.cy - b.cy || a.x0 - b.x0), lines = [];
    s.forEach((w) => {
      const L = lines[lines.length - 1];
      if (L && Math.abs(w.cy - L.cy) <= tol) { L.toks.push(w); L.cy = (L.cy * (L.toks.length - 1) + w.cy) / L.toks.length; L.y0 = Math.min(L.y0, w.y0); }
      else lines.push({ cy: w.cy, y0: w.y0, toks: [w] });
    });
    lines.forEach((L) => L.toks.sort((a, b) => a.x0 - b.x0));
    return lines;
  }
  const lineText = (L) => L.toks.map((t) => t.t).join(" ");

  U.parseAuditWords = function (pages) {
    const raw = [], sumLines = [], diag = [], meta = {};
    let fracs = null, totalReq = null, totalComp = null;
    pages.forEach((pg, pi) => {
      const W = pg.w, H = pg.h;
      const words = pg.words.map((w) => ({ t: str(w.t), x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1 })).filter((w) => w.t)
        .map((w) => Object.assign(w, { cx: (w.x0 + w.x1) / 2, cy: (w.y0 + w.y1) / 2, hh: w.y1 - w.y0 }));
      if (!words.length) { diag.push("page " + (pi + 1) + ": no text"); return; }
      const medH = median(words.map((w) => w.hh)) || 12;
      const lc = (w) => w.t.toLowerCase().replace(/[^a-z]/g, "");
      // header row -> column starts
      let starts = null, headerBottom = 0.03 * H;
      const hCat = words.find((w) => /^categ/.test(lc(w)) && w.x0 < 0.2 * W);
      if (hCat) {
        const band = words.filter((w) => Math.abs(w.cy - hCat.cy) < 1.2 * medH);
        const pick = (re, after) => band.filter((w) => re.test(lc(w)) && (after === undefined || w.x0 > after + 0.01 * W)).sort((a, b) => a.x0 - b.x0)[0];
        const aupp = pick(/^aupp/), inst = pick(/^inst/), course = pick(/^course/), credits = pick(/^credit/, course && course.x0), sem = pick(/^semest/), grade = pick(/^grade/);
        const credit2 = band.filter((w) => /^credit/.test(lc(w)) && grade && w.x0 > grade.x0).sort((a, b) => a.x0 - b.x0)[0];
        const earned = words.find((w) => /^earned/.test(lc(w)) && grade && w.x0 > grade.x0);
        const cand = [hCat, aupp, inst, course, credits, sem, grade, credit2 || earned];
        if (cand.every(Boolean)) {
          starts = cand.map((w) => w.x0);
          fracs = starts.map((x) => x / W);
          const sub = words.filter((w) => w.cy > hCat.cy && w.cy < hCat.cy + 3.2 * medH && (/^csn/.test(lc(w)) || /^earned/.test(lc(w)) || /^name/.test(lc(w))));
          headerBottom = Math.max(hCat.cy + 0.8 * medH, ...sub.map((w) => w.cy + 0.9 * medH));
        }
      }
      if (!starts) starts = (fracs || DEFAULT_FRAC).map((f) => f * W);
      const tol = 0.007 * W;
      const colOf = (x0) => { let c = -1; for (let i = 0; i < starts.length; i++) if (x0 >= starts[i] - tol) c = i; return c; };
      // where the table ends on this page (notes / summary)
      const notes = words.filter((w) => /^notes/.test(lc(w)) && w.cy > headerBottom && w.x0 < 0.3 * W).sort((a, b) => a.cy - b.cy)[0];
      const reqW = words.filter((w) => /^required/.test(lc(w)) && w.cy > headerBottom && w.x0 < 0.2 * W).sort((a, b) => a.cy - b.cy)[0];
      let tableEnd = 0.955 * H;
      if (notes) tableEnd = Math.min(tableEnd, notes.y0 - 0.2 * medH);
      if (reqW) tableEnd = Math.min(tableEnd, reqW.y0 - 0.2 * medH);
      // header block (first page): degree, catalog term
      if (hCat && !meta._done) {
        const lab = words.filter((w) => w.cy < hCat.cy - medH && w.x0 > 0.5 * W && /^(student|date|catalog|degree)/.test(lc(w)));
        const labelX = lab.length ? Math.min(...lab.map((w) => w.x0)) : 0.57 * W;
        const block = words.filter((w) => w.cy < hCat.cy - medH && w.x0 >= labelX - 0.01 * W);
        const lines = clusterLines(block, 0.6 * medH);
        let field = null;
        lines.forEach((L) => {
          const first = L.toks[0].t.replace(/:$/, "").toLowerCase();
          const rest = (from) => L.toks.slice(from).map((t) => t.t).filter((t) => t !== ":").join(" ").replace(/^:\s*/, "");
          if (first === "student") field = "student";
          else if (first === "date") field = "dob";
          else if (first === "catalog") { field = "catalog"; meta.catalogTerm = normSemester(lineText(L)); }
          else if (first === "degree") { field = "degree"; meta.degree = rest(1); }
          else if (field === "degree") meta.degree = (meta.degree + " " + lineText(L)).trim();
        });
        if (meta.degree) meta.degree = meta.degree.replace(/\s+/g, " ").replace(/^[:\s]+/, "");
        meta._done = true;
      }
      const body = words.filter((w) => w.cy > headerBottom - 0.5 * medH && w.cy < tableEnd);
      const cellsFor = (y0, y1) => {
        const cells = [[], [], [], [], [], [], [], []];
        body.filter((w) => w.cy >= y0 && w.cy < y1).forEach((w) => { const c = colOf(w.x0); if (c >= 0) cells[c].push(w); });
        return cells.map((ws) => clusterLines(ws, 0.6 * medH).map(lineText).join(" ").trim());
      };
      const bands = []; // [y0,y1,code|undefined]
      /* a band can hold several courses (the audit only draws lines between categories): cut it into one row per course,
         using the credit numbers (or course codes) as the marker of each row */
      const splitBand = (ya, yb) => {
        const inb = body.filter((w) => w.cy >= ya && w.cy < yb);
        const cr = clusterLines(inb.filter((w) => colOf(w.x0) === 4 && /^[0-9]([.,][0-9])?$/.test(w.t.replace(/[Il|]/g, "1"))), 0.6 * medH).map((L) => L.cy);
        const cd = clusterLines(inb.filter((w) => colOf(w.x0) === 1), 0.6 * medH).filter((L) => /[A-Za-z|0-9]{2,5}\s*\S{0,5}/.test(lineText(L)) && /\d/.test(lineText(L))).map((L) => L.cy);
        let an = (cd.length >= cr.length ? cd : cr).slice().sort((x, y) => x - y).filter((y, i, a) => !i || y - a[i - 1] > 0.9 * medH);
        if (an.length < 2) return [[ya, yb]];
        const out = []; let start = ya;
        for (let i = 0; i < an.length; i++) { const end = i + 1 < an.length ? (an[i] + an[i + 1]) / 2 : yb; out.push([start, end]); start = end; }
        return out;
      };
      const hl = (pg.hlines || []).slice().sort((x, y) => x - y);
      let mode = "anchors";
      if (hl.length >= 4) {
        mode = "grid";
        for (let i = 0; i + 1 < hl.length; i++) {
          const ya = hl[i], yb = hl[i + 1];
          if (yb - ya < 1.4 * medH || ya < headerBottom - 0.3 * medH || ya >= tableEnd) continue;
          splitBand(ya, Math.min(yb, tableEnd)).forEach((b) => bands.push(b));
        }
        if (!bands.length) splitBand(headerBottom, tableEnd).forEach((b) => bands.push(b));
      } else {
        const csn = words.filter((w) => colOf(w.x0) === 1 && w.cy > headerBottom && w.cy < tableEnd);
        const lines = clusterLines(csn, 0.6 * medH), anchors = [];
        for (let i = 0; i < lines.length; i++) {
          const t = lineText(lines[i]);
          if (/^[A-Z]{2,5}\s*\d{3}[A-Z]?$/.test(t)) { anchors.push(lines[i].y0); continue; }
          if (/^[A-Z]{2,5}$/.test(t) && lines[i + 1] && /^\d{3}[A-Z]?$/.test(lineText(lines[i + 1])) && lines[i + 1].cy - lines[i].cy < 3.2 * medH) { anchors.push(lines[i].y0); i++; }
        }
        anchors.forEach((y, k) => bands.push([y - 0.5 * medH, k + 1 < anchors.length ? anchors[k + 1] - 0.5 * medH : tableEnd]));
        if (anchors.length < 2) { bands.length = 0; splitBand(headerBottom, tableEnd).forEach((b) => bands.push(b)); } // codes unreadable: split by credit numbers instead
      }
      let got = 0;
      bands.forEach(([ya, yb]) => {
        const text = cellsFor(ya, yb);
        if (!text[1] && !text[3]) return;                    // empty band
        if (/aupp|^csn$/i.test(text[1]) && /category|course/i.test(text.join(" "))) return; // header row
        if (/course\s*name|credits?\s*earned|student\s*id|date\s*of\s*birth|catalog\s*term|registrar|degree\s*audit|\bnotes?\b/i.test(text.join(" "))) return; // page banner / headings, not a course
        if (!U.fixCode(text[1]) && !text[4] && !text[5] && !text[6]) return; // no code, no credits, no term, no grade: not a course row
        const code = U.fixCode(text[1]);
        const gradeTok = text[6].split(/\s+/).find((t) => U.GRADE_TOKEN.test(t)) || text[6];
        const row = { category: text[0], code, inst: text[2], name: text[3], credits: num(text[4]), semester: text[5], grade: gradeTok, earned: num(text[7]), codeText: text[1] };
        if (!code) { const g = U.guessByTitle(text[3]); if (g) { row.code = g; row.guessed = true; } }
        raw.push(row); got++;
      });
      diag.push("page " + (pi + 1) + " (" + mode + "): " + got + " course rows");
      // credit summary (Required / Completed)
      if (reqW) {
        const sw = words.filter((w) => w.cy >= reqW.cy - 0.6 * medH && w.cy < 0.955 * H);
        clusterLines(sw, 0.6 * medH).forEach((L) => {
          const left = L.toks.filter((t) => t.cx < 0.5 * W), right = L.toks.filter((t) => t.cx >= 0.5 * W);
          const ln = (arr) => arr.filter((t) => /^\d{1,3}$/.test(t.t)).pop();
          const lbl = left.filter((t) => !/^\d{1,3}$/.test(t.t)).map((t) => t.t).join(" ").replace(/:$/, "");
          const a = ln(left), b = ln(right);
          if (/^required/i.test(lbl)) { if (a) totalReq = +a.t; if (b) totalComp = +b.t; return; }
          if (a && b && lbl) sumLines.push([lbl + ":", a.t, b.t]);
        });
      }
    });
    const summary = U.scanSummary(sumLines.map((r) => [r.join(" ")]));
    if (totalReq != null) summary.totalRequired = totalReq;
    if (totalComp != null) summary.totalCompleted = totalComp;
    delete meta._done;
    const audit = U.finalizeAudit(raw, summary, meta, "pdf");
    audit.diag = diag;
    return audit;
  };

  /* how many course-code rows could a words list yield? (used to decide text layer vs OCR) */
  U.looksLikeAudit = function (pages) {
    let n = 0;
    pages.forEach((pg) => pg.words.forEach((w, i, a) => { if (/^[A-Z]{2,5}$/.test(str(w.t)) && a[i + 1] && /^\d{3}[A-Z]?$/.test(str(a[i + 1].t))) n++; }));
    return n;
  };

  if (typeof module !== "undefined" && module.exports) module.exports = U; else root.UHParse = U;
})(typeof window !== "undefined" ? window : globalThis);
