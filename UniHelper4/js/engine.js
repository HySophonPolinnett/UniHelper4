/* UniHelper engine: state, catalog, requirements, prerequisites, recommendations, search, plan.
   No DOM code here. */
(function () {
  "use strict";
  const P = window.UHParse;
  const UH = (window.UH = {});
  const LS_PREFIX = "unihelper_v4_";
  UH.MAX_CREDITS = 18;
  const DEFAULTS = () => ({ year: 1, credits: 15, major: "", assume: true, audit: null, schedule: null, plan: [], manualDone: [], recs: [] });
  const S = (UH.S = DEFAULTS());
  UH.user = null; // id of the signed-in student; each student gets their own saved data
  const lsKey = () => LS_PREFIX + String(UH.user || "").toLowerCase();
  const clampCr = () => { S.credits = Math.max(1, Math.min(UH.MAX_CREDITS, Math.round(+S.credits || 15))); };
  UH.save = () => { if (!UH.user) return false; try { localStorage.setItem(lsKey(), JSON.stringify(S)); return true; } catch (e) { return false; } };
  UH.wipe = () => { try { localStorage.removeItem(lsKey()); } catch (e) {} };
  /* switch to a student's saved data (or start fresh when id is null) */
  UH.loadUser = function (id) {
    UH.user = id || null;
    Object.keys(S).forEach((k) => delete S[k]);
    Object.assign(S, DEFAULTS());
    if (UH.user) { try { Object.assign(S, JSON.parse(localStorage.getItem(lsKey()) || "{}")); } catch (e) {} }
    clampCr(); if (UH.clearShown) UH.clearShown();
    UH.rebuild(); if (S.audit) UH.recompute();
  };

  /* ================= programs for "no audit" mode (estimate only) ================= */
  const CORE = ["ENGL 101", "ENGL 102", "SMNR 101", "COMM 103", "MATH 177", "ITEC 101"];
  UH.MAJORS = {
    ba: { n: "Business Administration", pfx: ["BUSN", "ACCT", "BCOM", "ECON", "FIN", "FINC", "MGMT", "MIS", "MKTG"], fd: [...CORE, "MATH 200", "ECON 200", "ACCT 201", "ACCT 202", "BUSN 200", "ICT 209", "PSYC 101", "PHIL 110", "HUMN 101"], re: /business|bba|accounting|finance|marketing|management|econom/ },
    ent: { n: "Entrepreneurship", pfx: ["ENTR"], fd: [...CORE, "ENTR 110", "BUSN 200", "MATH 200", "ECON 200"], re: /entrepreneur|startup|start-up/ },
    comm: { n: "Communication & Public Relations", pfx: ["COMM", "PR"], fd: [...CORE, "COMM 102", "PSYC 101"], re: /communication|public relation|\bpr\b|media|journalism/ },
    esoc: { n: "eSociety (Digital Society)", pfx: ["ESOC", "ISEC"], fd: [...CORE, "ISEC 100", "COMM 102"], re: /esoc|e-?society|digital society/ },
    law: { n: "Law", pfx: ["LEGL", "LAW"], fd: [...CORE, "LEGL 101", "LEGL 199", "POLS 110", "MATH 200", "PHIL 110", "PSYC 101", "HUMN 101", "HIST 131", "ENVS 131C", "ICT 209"], re: /\blaw\b|legal|llb|lawyer/ },
    cs: { n: "Computer Science", pfx: ["COSC", "CSCI", "FYP"], fd: [...CORE, "COSC 111", "COSC 121", "ICT 209"], re: /computer science|\bcs\b|software|coding|programming|developer/ },
    itm: { n: "Information Technology Management", pfx: ["ITM", "INF", "INFO", "ICT", "INS"], fd: [...CORE, "ICT 209"], re: /information technology|\bitm\b|\bit\b|informatics/ },
    cyber: { n: "Cybersecurity", pfx: ["CYBR", "CYS"], fd: [...CORE, "COSC 111", "COSC 121"], re: /cyber|security|hacking|forensic/ },
    cloud: { n: "Cloud Computing", pfx: ["CLD"], fd: [...CORE, "COSC 111"], re: /cloud|aws|devops/ },
    ai: { n: "Artificial Intelligence", pfx: ["AIN", "ICT"], fd: [...CORE, "COSC 111", "COSC 121", "ICT 209"], re: /\bai\b|artificial|machine learning|computer vision/ },
  };
  UH.MAJOR_ORDER = ["cyber", "cloud", "ai", "cs", "itm", "law", "ent", "comm", "esoc", "ba"];
  const GE_GROUP = (code) => /^(MATH|ENVS|PHYS|CHEM|BIOL)/.test(code) ? "natural" : /^(HUMN|HIST|PHIL|ARTS|MUSC)/.test(code) ? "humanities" : /^(POLS|PSYC|GLBA|GBLA|GEOG)/.test(code) ? "social" : "foundation";
  const GE = ["ENGL 101", "ENGL 102", "SMNR 101", "COMM 103", "MATH 177", "HUMN 101", "HUMN 110", "HUMN 250", "PHIL 110", "POLS 110", "PSYC 101", "ENVS 131C", "ENVS 131A", "HIST 131", "ITEC 101", "GLBA 101"];

  /* ================= catalog (DB) ================= */
  let DB = (UH.DB = {});
  let SEC = (UH.SEC = new Map());
  const lvl = (code) => +((code.match(/\d/) || [1])[0]);
  const prefixOf = (code) => code.split(" ")[0];

  UH.rebuild = function () {
    DB = UH.DB = {};
    String(window.COURSE_DATA || "").trim().split("\n").forEach((l) => {
      const [code, title, cr, pre, u] = l.split("|");
      if (!code) return;
      DB[code] = { code, title, cr: +cr, pre: pre ? pre.split(";") : [], ua: !!u, known: true };
    });
    const addUnknown = (code, title, cr) => {
      if (!DB[code]) DB[code] = { code, title: title || code, cr: cr || 3, pre: [], ua: false, known: false };
      else if (cr && !DB[code].known) DB[code].cr = cr;
    };
    SEC = UH.SEC = new Map();
    if (S.schedule) S.schedule.sections.forEach((s) => {
      if (!SEC.has(s.code)) SEC.set(s.code, []);
      SEC.get(s.code).push(s);
      addUnknown(s.code, s.title, s.credits);
      if (DB[s.code] && s.credits) DB[s.code].cr = s.credits;
    });
    if (S.audit) S.audit.rows.forEach((r) => { addUnknown(r.code, r.name, r.credits); if (DB[r.code] && r.credits) DB[r.code].cr = r.credits; });
    P.addPrefixes(Object.keys(DB).map(prefixOf));
    P.addTitles(Object.values(DB).map((c) => [c.code, c.title]));
    refresh();
  };

  /* ================= equivalents & status ================= */
  UH.eqs = function (code) {
    const out = new Set([code]);
    const m = code.match(/^([A-Z]+) (\d{3}[A-Z]?)$/);
    if (m) { if (m[1] === "COSC") out.add("CSCI " + m[2]); if (m[1] === "CSCI") out.add("COSC " + m[2]); }
    ((S.schedule && S.schedule.aliases) || []).forEach((g) => { if (g.includes(code)) g.forEach((x) => out.add(x)); });
    return Array.from(out);
  };
  let ROW = {};
  function refresh() {
    ROW = {};
    ((S.audit && S.audit.rows) || []).forEach((r) => (ROW[r.code] = r));
  }
  UH.refresh = refresh;
  UH.rowOf = (code) => ROW[code] || null;
  UH.statusOf = function (code) {
    if (S.manualDone.includes(code)) return { kind: "done", via: code };
    if (ROW[code]) return { kind: ROW[code].status, row: ROW[code], group: ROW[code].group, via: code };
    const alt = UH.eqs(code).find((c) => ROW[c] && c !== code);
    if (alt) return { kind: ROW[alt].status, row: ROW[alt], group: ROW[alt].group, via: alt };
    if (UH.eqs(code).some((c) => S.manualDone.includes(c))) return { kind: "done", via: code };
    return { kind: "outside" };
  };
  const satisfied = (code) => UH.eqs(code).some((c) => { const k = UH.statusOf(c).kind; return k === "done" || (S.assume && k === "inprogress"); });
  UH.satisfied = satisfied;

  UH.recompute = function () {
    const a = S.audit; if (!a) return;
    Object.values(a.groups).forEach((o) => { o.listed = 0; o.done = 0; o.inprog = 0; o.rows = 0; });
    a.rows.forEach((r) => {
      const o = a.groups[r.group] || (a.groups[r.group] = { key: r.group, label: P.GROUP_LABEL[r.group] || r.group, listed: 0, done: 0, inprog: 0, required: null, rows: 0 });
      o.rows++; o.listed += r.credits || 0;
      if (r.status === "done") o.done += r.earned || r.credits || 0;
      if (r.status === "inprogress") o.inprog += r.credits || 0;
    });
    Object.values(a.groups).forEach((o) => { o.pick = o.required != null && o.listed > o.required + 0.01; });
    const earned = a.rows.filter((r) => r.group !== "none" && r.status === "done").reduce((n, r) => n + (r.earned || r.credits || 0), 0);
    a.checks = { earnedSum: earned, summaryCompleted: a.totalCompleted, ok: a.totalCompleted == null ? null : Math.abs(earned - a.totalCompleted) < 0.01 };
  };
  UH.groupRem = function (g) {
    const o = S.audit && S.audit.groups[g];
    if (!o || o.required == null) return Infinity;
    return Math.max(0, o.required - o.done - (S.assume ? o.inprog : 0));
  };
  UH.autoYear = function () {
    const a = S.audit; if (!a) return null;
    const done = a.rows.filter((r) => r.group !== "none" && r.status === "done").reduce((n, r) => n + (r.earned || r.credits || 0), 0);
    const inp = S.assume ? a.rows.filter((r) => r.group !== "none" && r.status === "inprogress").reduce((n, r) => n + (r.credits || 0), 0) : 0;
    const t = done + inp;
    return { credits: t, year: t < 30 ? 1 : t < 60 ? 2 : t < 90 ? 3 : 4 };
  };

  /* ================= prerequisites ================= */
  UH.prereq = function (code) {
    const c = DB[code];
    if (!c || !c.known) return { known: false, ok: true, missing: [], text: "Prerequisites not listed in the catalog – confirm with your advisor" };
    const missing = [];
    c.pre.forEach((p) => {
      if (p[0] === "*") { if (S.year < 3) missing.push("foundation courses"); }
      else if (p === "~S") { if (S.year < 4) missing.push("senior standing"); }
      else if (p === "~J") { if (S.year < 3) missing.push("junior standing"); }
      else if (!satisfied(p)) missing.push(p);
    });
    const need = c.pre.map((p) => (p[0] === "*" ? "completed foundation courses" : p === "~S" ? "senior standing" : p === "~J" ? "junior standing" : p));
    return { known: true, ok: !missing.length, missing, text: need.length ? "Prerequisites: " + need.join(", ") : "No prerequisites" };
  };

  /* ================= sections / times ================= */
  const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  UH.fmtDays = (d) => (d && d.length ? d.map((x) => DAY[x]).join("/") : "TBA");
  UH.fmtTime = (m) => { const h = Math.floor(m / 60), mi = m % 60; return ((h + 11) % 12 + 1) + ":" + String(mi).padStart(2, "0") + " " + (h >= 12 ? "PM" : "AM"); };
  UH.fmtSec = (s) => (s.days && s.days.length && s.start != null ? UH.fmtDays(s.days) + " " + UH.fmtTime(s.start) + "–" + UH.fmtTime(s.end) : s.timeText || "TBA");
  UH.sections = (code) => SEC.get(code) || [];
  UH.sectionObj = (code, id) => UH.sections(code).find((s) => s.section === id) || UH.sections(code)[0] || null;
  const clash = (a, b) => !!(a && b && P.overlap(a, b));
  UH.pickSection = function (code, plan, secOk) {
    const secs = UH.sections(code);
    if (!secs.length) return S.schedule ? null : "";
    const others = plan.map((p) => UH.sectionObj(p.code, p.sec)).filter(Boolean);
    for (const s of secs) if ((!secOk || secOk(s)) && !others.some((o) => clash(s, o))) return s.section;
    return null;
  };
  UH.similar = function (code) {
    const m = code.match(/^([A-Z]+) (\d{3}[A-Z]?)$/); if (!m) return [];
    const alt = { COSC: ["CSCI"], CSCI: ["COSC"], INF: ["INFO"], INFO: ["INF"], CYBR: ["CYS"], CYS: ["CYBR"] }[m[1]] || [];
    return alt.map((p) => p + " " + m[2]).filter((c) => UH.sections(c).length);
  };

  /* ================= candidates ================= */
  const PR = { foundation: 1, major: 2, natural: 3, humanities: 3, social: 3, gened: 3, internship: 4, electives: 5, other: 6 };
  const meta = (code, row) => DB[code] || { code, title: (row && row.name) || code, cr: (row && row.credits) || 3, pre: [], known: false };
  function why(x, unlocks) {
    const L = P.GROUP_LABEL; let t;
    if (x.status === "retake") t = "Retake – you didn't pass it (" + (x.row.grade || "no credit") + ")";
    else if (x.group === "foundation") t = "Required – GE Foundation";
    else if (x.group === "major") t = "Required for your major";
    else if (x.group === "internship") t = "Required internship";
    else if (x.group === "electives") { const r = UH.groupRem("electives"); t = "Counts as an elective" + (isFinite(r) ? " – " + r + " elective credits still needed" : ""); }
    else if (x.group === "other") t = "On your degree list";
    else { const r = UH.groupRem(x.group); t = (L[x.group] || "General education") + " requirement" + (x.manual ? "" : x.pick ? " – choose from list" + (isFinite(r) ? ", " + r + " credits still needed" : "") : ""); }
    if (unlocks) t += " · unlocks " + unlocks + " more course" + (unlocks > 1 ? "s" : "");
    return t;
  }
  UH.candidates = function () {
    let list = [];
    if (S.audit) {
      S.audit.rows.forEach((r) => {
        if (r.group === "none" || (r.status !== "todo" && r.status !== "retake")) return;
        if (UH.groupRem(r.group) <= 0) return;
        list.push({ code: r.code, group: r.group, status: r.status, row: r, pick: !!(S.audit.groups[r.group] || {}).pick });
      });
    } else if (S.major && UH.MAJORS[S.major]) {
      const m = UH.MAJORS[S.major], seen = new Set();
      const add = (code, group, ge) => { if (seen.has(code) || satisfied(code)) return; seen.add(code); list.push({ code, group, status: "todo", manual: true, ge: !!ge }); };
      m.fd.forEach((c) => DB[c] && add(c, "foundation"));
      Object.keys(DB).forEach((c) => { if (m.pfx.includes(prefixOf(c))) add(c, "major"); });
      GE.forEach((c) => DB[c] && add(c, GE_GROUP(c), true));
    }
    const need = new Set(list.map((x) => x.code));
    list.forEach((x) => {
      x.c = meta(x.code, x.row);
      x.secs = UH.sections(x.code);
      x.offered = S.schedule ? x.secs.length > 0 : null;
      x.pre = UH.prereq(x.code);
      x.sim = S.schedule && !x.secs.length ? UH.similar(x.code) : [];
      x.unlocks = list.filter((y) => y !== x && DB[y.code] && DB[y.code].pre.some((p) => UH.eqs(x.code).includes(p))).length;
      x.why = why(x, x.unlocks);
      x.prio = x.status === "retake" ? 0 : PR[x.group] != null ? PR[x.group] : 6;
    });
    list.sort((a, b) => a.prio - b.prio || lvl(a.code) - lvl(b.code) || b.unlocks - a.unlocks || a.code.localeCompare(b.code));
    return {
      all: list,
      rec: list.filter((x) => x.pre.ok && x.offered !== false),
      locked: list.filter((x) => !x.pre.ok && x.offered !== false),
      gone: list.filter((x) => x.offered === false),
    };
  };

  /* ================= plan ================= */
  UH.planCredits = () => S.plan.reduce((n, p) => n + ((DB[p.code] && DB[p.code].cr) || 0), 0);
  UH.groupOf = function (code) {
    const st = UH.statusOf(code);
    if (st.group) return st.group;
    if (!S.audit && S.major && UH.MAJORS[S.major]) { const m = UH.MAJORS[S.major]; return m.fd.includes(code) ? "foundation" : m.pfx.includes(prefixOf(code)) ? "major" : GE.includes(code) ? GE_GROUP(code) : "other"; }
    return "none";
  };
  /* ---- advisor filters: coursework (requirement tag) and time of day ---- */
  UH.COURSEWORK = [["all", "All coursework"], ["foundation", "Foundation"], ["major", "Major"], ["natural", "Math and natural sciences"], ["humanities", "Humanities and arts"], ["social", "Behavioral and social sciences"], ["internship", "Internship"], ["electives", "Electives"]];
  UH.TIMES = [["both", "Morning & afternoon"], ["morning", "Only morning"], ["afternoon", "Only afternoon"]];
  const NOON = 12 * 60, EVE = 18 * 60;
  UH.timeOk = (s, mode) => {
    if (!mode || mode === "any") return true;
    if (!s || s.start == null) return false; // no meeting time known
    if (mode === "morning") return s.start < NOON;
    if (mode === "afternoon") return s.start >= NOON && s.start < EVE;
    return s.start < EVE; // morning & afternoon
  };
  UH.groupMatches = (g, key) => !key || key === "all" || g === key;
  /* keep only the candidates that match the filters (coursework tag + a section at the chosen time) */
  UH.applyFilters = function (list, f) {
    f = f || {};
    return list.filter((x) => UH.groupMatches(x.group, f.group) && (!S.schedule || !x.secs.length || x.secs.some((s) => UH.timeOk(s, f.time))));
  };
  /* priority order with a little randomness, so asking again gives a different (but still sensible) mix */
  UH.shuffleTiered = function (list, avoid, pen) { // avoid = codes shown last time: they move back so the new list differs
    return list.map((x) => ({ x, k: x.prio + Math.random() * 1.7 - Math.min(x.unlocks || 0, 3) * 0.2 + (avoid && avoid.has(x.code) ? (pen || 1.8) : 0) })).sort((a, b) => a.k - b.k).map((o) => o.x);
  };
  const sigOf = (codes) => codes.slice().sort().join(",");
  UH._last = { rec: "", plan: "" };

  /* top courses to suggest – different every time while still preferring required courses */
  UH.RECS = 10;
  /* what has already been shown for each filter combination, so every tap gives new courses until none are left */
  const SHOWN = {}, LASTREC = {}, LASTPLAN = {};
  const clearShown = () => [SHOWN, LASTREC, LASTPLAN].forEach((o) => Object.keys(o).forEach((k) => delete o[k]));
  UH.clearShown = clearShown;
  UH.resetRecs = () => { clearShown(); S.recs = []; };
  const keyOf = (f, t) => t + "|" + ((f && f.group) || "all") + "|" + ((f && f.time) || "both");
  UH.recommend = function (f, n) {
    n = n || UH.RECS;
    const pool = UH.applyFilters(UH.candidates().rec, f), key = keyOf(f, "rec");
    const shown = (SHOWN[key] = SHOWN[key] || new Set());
    let pick = UH.shuffleTiered(pool, shown, 9).slice(0, n), repeated = false;
    if (pool.length && !pick.some((x) => !shown.has(x.code))) { // nothing new left: show the earlier ones again
      const map = new Map(pool.map((x) => [x.code, x])), prev = (LASTREC[key] || []).map((c) => map.get(c)).filter(Boolean);
      if (prev.length) pick = prev; repeated = true; shown.clear(); pick.forEach((x) => shown.add(x.code));
    } else pick.forEach((x) => shown.add(x.code));
    LASTREC[key] = pick.map((x) => x.code);
    S.recs = LASTREC[key].slice(); // the Courses tab shows exactly this list under "Recommended"
    UH.save();
    return { items: pick, pool: pool.length, repeated };
  };
  /* the current recommended list (same one the Advisor just gave); makes one if there is none yet */
  UH.currentRecs = function () {
    const rec = UH.candidates().rec, map = new Map(rec.map((x) => [x.code, x]));
    let items = (S.recs || []).map((c) => map.get(c)).filter(Boolean);
    if (!items.length && rec.length) { UH.recommend({}, UH.RECS); items = S.recs.map((c) => map.get(c)).filter(Boolean); }
    return items;
  };

  function buildOnce(pool, f, count, shown) {
    const plan = [], rem = {}; let cr = 0, geN = 0;
    const secOk = (s) => UH.timeOk(s, f.time);
    for (const x of UH.shuffleTiered(pool, shown, 9)) {
      if (plan.length >= count) break;
      const cred = x.c.cr;
      if (cr + cred > UH.MAX_CREDITS) continue;
      if (S.audit && isFinite(UH.groupRem(x.group))) { if (rem[x.group] === undefined) rem[x.group] = UH.groupRem(x.group); if (rem[x.group] <= 0) continue; }
      if (x.manual && x.ge && geN >= 2) continue;
      const sec = UH.pickSection(x.code, plan, S.schedule ? secOk : null);
      if (sec === null) continue;
      plan.push({ code: x.code, sec }); cr += cred;
      if (rem[x.group] !== undefined) rem[x.group] -= cred;
      if (x.manual && x.ge) geN++;
    }
    return { plan, cr };
  }
  /* build a clash-free plan of 5 courses (max 18 credits); every tap gives courses not shown before, until none are left */
  UH.PLAN_COURSES = 5;
  UH.autoPlan = function (f, count) {
    f = Object.assign({ group: "all", time: "both" }, f || {});
    count = count || UH.PLAN_COURSES;
    const pool = UH.applyFilters(UH.candidates().rec, f), key = keyOf(f, "plan");
    const shown = (SHOWN[key] = SHOWN[key] || new Set());
    let best = null;
    for (let t = 0; t < 16; t++) {
      const r = buildOnce(pool, f, count, shown), fresh = r.plan.filter((p) => !shown.has(p.code)).length;
      const score = Math.min(r.plan.length, count) * 100 + fresh;
      if (!best || score > best.score) best = { plan: r.plan, score, fresh };
      if (r.plan.length >= Math.min(count, pool.length) && fresh === r.plan.length) break;
    }
    UH._planRepeated = false;
    if (best && best.plan.length && best.fresh === 0 && LASTPLAN[key]) { best = { plan: LASTPLAN[key] }; UH._planRepeated = true; shown.clear(); } // nothing new: earlier plan again
    const plan = best ? best.plan : [];
    plan.forEach((p) => shown.add(p.code)); LASTPLAN[key] = plan;
    S.plan = plan.map((p) => Object.assign({}, p));
    return S.plan;
  };
  UH.planIssues = function () {
    const out = [], items = S.plan.map((p) => ({ p, c: DB[p.code], s: UH.sectionObj(p.code, p.sec) }));
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) if (clash(items[i].s, items[j].s)) out.push({ kind: "clash", text: "Time clash: " + items[i].p.code + " and " + items[j].p.code });
    items.forEach(({ p, s }) => {
      if (S.schedule && !s) out.push({ kind: "offer", text: p.code + " is not in the uploaded schedule" });
      const pr = UH.prereq(p.code); if (!pr.ok) out.push({ kind: "pre", text: p.code + " needs " + pr.missing.join(", ") });
      const st = UH.statusOf(p.code); if (st.kind === "done") out.push({ kind: "dup", text: p.code + " is already completed" });
    });
    const cr = UH.planCredits();
    if (cr > S.credits) out.push({ kind: "over", text: "Plan is " + (cr - S.credits) + " credit(s) over your target of " + S.credits });
    if (cr > UH.MAX_CREDITS) out.push({ kind: "over", text: "More than " + UH.MAX_CREDITS + " credits is above the limit" });
    if (S.audit) {
      const used = {};
      S.plan.forEach((p) => { const g = UH.groupOf(p.code); used[g] = (used[g] || 0) + ((DB[p.code] && DB[p.code].cr) || 0); });
      Object.keys(used).forEach((g) => { const r = UH.groupRem(g); if (g !== "none" && isFinite(r) && used[g] > r) out.push({ kind: "extra", text: P.GROUP_LABEL[g] + ": your plan has " + used[g] + " credits but only " + r + " are still needed" }); if (g === "none") out.push({ kind: "extra", text: "Some plan courses don't count toward your degree list" }); });
    }
    return out;
  };

  /* ================= search (by course code or course title) ================= */
  UH.auditCodes = () => (S.audit ? Array.from(new Set(S.audit.rows.map((r) => r.code))) : []);
  const lev = (a, b) => { // edit distance, small strings only
    if (Math.abs(a.length - b.length) > 2) return 9;
    const d = []; for (let i = 0; i <= a.length; i++) { d[i] = [i]; } for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  };
  /* codes = optional list of course codes to search inside (e.g. only the student's degree audit) */
  UH.search = function (q, codes) {
    q = String(q || "").trim(); if (!q) return [];
    const ql = q.toLowerCase(), nospace = ql.replace(/[^a-z0-9]/g, "");
    const normed = P.normCode(q), toks = ql.split(/[^a-z0-9]+/).filter(Boolean);
    if (!nospace) return [];
    const universe = codes ? codes.map((c) => DB[c]).filter(Boolean) : Object.values(DB);
    const res = [];
    universe.forEach((c) => {
      const cn = c.code.toLowerCase().replace(/[^a-z0-9]/g, ""), title = c.title.toLowerCase(), words = title.split(/[^a-z0-9]+/).filter(Boolean);
      let sc = 0;
      if (normed && c.code === normed) sc = 100;
      else if (cn === nospace) sc = 98;
      else if (cn.startsWith(nospace)) sc = 90 - Math.min(10, cn.length - nospace.length);
      else if (title === ql) sc = 88;
      else if (title.startsWith(ql)) sc = 84;
      else if (toks.length && toks.every((t) => cn.includes(t) || words.some((w) => w.startsWith(t)))) sc = 76;
      else if (nospace.length >= 2 && cn.includes(nospace)) sc = 66;
      else if (title.includes(ql) || (toks.length && toks.every((t) => title.includes(t) || cn.includes(t)))) sc = 60;
      else {
        const hit = toks.filter((t) => t.length > 1 && (title.includes(t) || cn.includes(t))).length;
        if (hit) sc = 30 + (20 * hit) / toks.length;
        else if (toks.some((t) => t.length >= 4 && words.some((w) => w.length >= 4 && lev(t, w) <= (t.length >= 7 ? 2 : 1)))) sc = 25; // typo
      }
      if (sc) res.push({ c, sc });
    });
    return res.sort((a, b) => b.sc - a.sc || a.c.code.localeCompare(b.c.code)).map((x) => x.c);
  };

  UH.rebuild();
})();
