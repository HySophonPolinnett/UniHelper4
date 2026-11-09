/* UniHelper interface */
(function () {
  "use strict";
  const UH = window.UH, P = window.UHParse, S = UH.S;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TABS = ["start", "advisor", "courses", "degree", "plan"];
  const ui = { tab: "start", q: "", mode: "rec", group: "all", offeredOnly: false, limit: 40, chat: [], busy: false, af: { group: "all", time: "both" }, started: false, cwPicked: false, timePicked: false, lg: { tab: "login", err: "", ok: "", id: "", field: "", busy: false }, ab: { busy: false, msg: "", pct: 0, err: "" }, sb: { busy: false, err: "" }, sel: -1 };
  const GL = P.GROUP_LABEL;
  const YEARS = ["Freshman", "Sophomore", "Junior", "Senior"];
  const lbl = (g) => GL[g] || g;

  /* ---------- small helpers ---------- */
  let toastT;
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3800); }
  function openModal(html) { const m = $("#modal"); $("#sheet").innerHTML = html; m.hidden = false; document.body.style.overflow = "hidden"; const f = $("#sheet input,#sheet button.pri,#sheet button"); if (f) f.focus(); $("#sheet").scrollTop = 0; }
  function closeModal() { $("#modal").hidden = true; document.body.style.overflow = ""; }
  const statusTag = (k) => ({ done: '<span class="tag ok">✓ Completed</span>', inprogress: '<span class="tag info">In progress</span>', retake: '<span class="tag bad">Retake</span>', todo: '<span class="tag warn">Still needed</span>', outside: '<span class="tag">Not on your list</span>' }[k] || "");
  const inPlan = (code) => S.plan.find((p) => p.code === code);
  const term = () => (S.schedule && S.schedule.term) || "";
  const cap = (s) => s[0].toUpperCase() + s.slice(1).toLowerCase();
  const nice = (n) => (Math.round(n * 10) / 10).toString();

  async function saveFile(name, text, mime) {
    try {
      const dl = window.claude && window.claude.use ? await window.claude.use("downloads") : null;
      if (dl) { await dl.save({ filename: name, data: text }); toast("Saved ✓"); return; }
    } catch (e) { if (e && e.code === "declined") return; }
    const blob = new Blob([text], { type: mime || "text/plain" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  UH._saveFile = saveFile;

  /* ---------- navigation ---------- */
  function go(tab, opts) {
    if (!TABS.includes(tab)) tab = "start";
    ui.tab = tab;
    TABS.forEach((t) => { $("#v-" + t).hidden = t !== tab; });
    $$("#tabs button").forEach((b) => { b.classList.toggle("on", b.dataset.go === tab); b.setAttribute("aria-current", b.dataset.go === tab ? "page" : "false"); });
    if (location.hash !== "#" + tab) { try { history.replaceState(null, "", "#" + tab); } catch (e) {} }
    render(tab);
    closeSearch();
    if (!opts || !opts.keepScroll) window.scrollTo({ top: 0 });
    document.title = "UniHelper – " + ({ start: "Start", advisor: "Advisor", courses: "Courses", degree: "Degree", plan: "My plan" }[tab]);
  }
  function render(tab) { ({ start: rStart, advisor: rAdvisor, courses: rCourses, degree: rDegree, plan: rPlan }[tab || ui.tab])(); header(); }
  function header() {
    $("#planCount").textContent = nice(UH.planCredits());
    const w = $("#whoName"); if (w) w.textContent = UH.user ? " " + UH.user : "";
  }
  const need = () => (S.audit ? "" : '<div class="note warn"><b>Tip:</b> upload your degree audit for exact results. <button class="btn sm" data-go="start">Go to Start</button></div>');

  /* =============== START =============== */
  function auditCounts() {
    const a = S.audit, c = { done: 0, inprogress: 0, todo: 0, retake: 0, none: 0 };
    a.rows.forEach((r) => { if (r.group === "none") c.none++; else c[r.status] = (c[r.status] || 0) + 1; });
    return c;
  }
  /* did the audit come out clearly wrong? (credits I counted far below the audit's own total, or most rows unreadable) */
  function auditPoor(a) {
    if (!a) return false; const ch = a.checks || {};
    return (ch.ok === false && ch.summaryCompleted > 0 && ch.earnedSum < 0.8 * ch.summaryCompleted) || (a.unreadable && a.unreadable.length > 3) || a.rows.length < 5;
  }
  function rStart() {
    const a = S.audit, sc = S.schedule, ab = ui.ab, poor = auditPoor(a);
    let h = '<div class="hero"><h1>Plan your next semester in 3 steps</h1><p>Upload your degree audit and the semester schedule (PDF or Excel). UniHelper works out what you have finished, what you still need, and builds a clash-free timetable. Everything is read inside your browser – your files are never uploaded.</p></div><div class="grid steps">';

    /* step 1 */
    h += '<div class="card step' + (a && !poor ? " done" : "") + '"><h2>Your degree audit</h2>';
    if (a) {
      const c = auditCounts(), ch = a.checks || {};
      h += '<p class="mut">' + esc((a.meta && a.meta.degree) || "Degree audit loaded") + (a.meta && a.meta.catalogTerm ? " · catalog " + esc(a.meta.catalogTerm) : "") + '</p>';
      h += '<div class="stats"><div class="stat"><b>' + c.done + '</b><span>completed</span></div><div class="stat"><b>' + c.inprogress + '</b><span>in progress</span></div><div class="stat"><b>' + (c.todo + c.retake) + '</b><span>still to take</span></div>' + (a.totalRequired ? '<div class="stat"><b>' + nice(ch.earnedSum || 0) + "/" + a.totalRequired + '</b><span>credits earned</span></div>' : "") + "</div>";
      h += ch.ok === true ? '<span class="tag ok">✓ Credits match your audit total</span>' : ch.ok === false ? '<span class="tag warn">⚠ I counted ' + nice(ch.earnedSum) + " credits but the audit says " + nice(ch.summaryCompleted) + "</span>" : "";
      if (poor) h += '<div class="note bad"><b>I don’t think I read your audit correctly.</b> ' + (ch.summaryCompleted ? "I counted " + nice(ch.earnedSum || 0) + " completed credits but your audit says " + nice(ch.summaryCompleted) + ". " : "") + 'Please don’t rely on the results yet. Try “Replace file” with the Excel or HTML version of the audit if you have one, or remove it and use <b>Paste the text instead</b>.</div>';
      h += '<div class="row" style="margin-top:12px"><button class="btn pri" data-act="review">Review what I read</button><label class="btn">Replace file<input type="file" data-kind="audit" accept=".pdf,.xlsx,.xls,.csv,.html,.htm,.txt" hidden></label><button class="btn ghost" data-act="rmaudit">Remove</button></div>';
    } else {
      h += '<p class="mut">Download “Print Degree Audit” from the student portal (or save the page) and drop it here. PDF, Excel, CSV, HTML and text all work.</p>';
      if (ab.busy) h += '<div class="note" role="status"><b id="abMsg">' + esc(ab.msg) + '</b><div class="prog"><i id="abBar" style="width:' + Math.round(ab.pct * 100) + '%"></i></div><span class="sm mut">Stay on this page. Scanned/garbled PDFs are read by OCR and can take a minute.</span></div>';
      else h += '<label class="drop" id="dzA"><input type="file" data-kind="audit" accept=".pdf,.xlsx,.xls,.csv,.html,.htm,.txt"><div class="big">📄</div><b>Drop your Degree Audit here</b><div class="mut sm">or click to choose a file</div></label>';
      if (ab.err) h += '<div class="note bad">' + esc(ab.err) + "</div>";
      h += '<details class="paste"><summary>Can’t upload? Paste the text instead</summary><p class="sm mut">Open the audit, press Ctrl/⌘+A, copy, and paste below.</p><textarea id="pasteA" placeholder="Paste your degree audit text here"></textarea><button class="btn" data-act="paste" style="margin-top:8px">Read pasted text</button></details>';
    }
    h += "</div>";

    /* step 2 */
    h += '<div class="card step' + (sc ? " done" : "") + '"><h2>The semester schedule (PDF or Excel)</h2>';
    if (sc) {
      h += '<p class="mut">' + esc(term() || "Schedule") + " · " + esc(sc.file || "") + '</p><div class="stats"><div class="stat"><b>' + sc.stats.courses + '</b><span>courses</span></div><div class="stat"><b>' + sc.stats.rows + '</b><span>sections</span></div></div>';
      (sc.warnings || []).forEach((w) => (h += '<div class="note warn">' + esc(w) + "</div>"));
      h += '<div class="row"><label class="btn">Replace file<input type="file" data-kind="sched" accept=".pdf,.xlsx,.xls,.csv" hidden></label><button class="btn ghost" data-act="rmsched">Remove</button></div>';
    } else {
      h += '<p class="mut">Each semester the school sends the list of available courses. Upload that PDF or Excel file so I only suggest courses that are really offered, with their times.</p>';
      if (ui.sb.busy) h += '<div class="note" role="status"><b id="sbMsg">' + esc(ui.sb.msg || "Reading the schedule…") + '</b><div class="prog"><i id="sbBar" style="width:' + Math.round((ui.sb.pct || 0.05) * 100) + '%"></i></div></div>';
      else {
        h += '<label class="drop" id="dzS"><input type="file" data-kind="sched" accept=".pdf,.xlsx,.xls,.csv"><div class="big">📊</div><b>Drop the schedule file here</b><div class="mut sm">PDF or Excel (.xlsx, .xls, .csv)</div></label>';
        h += '<div class="row" style="justify-content:center;margin-top:10px"><label class="btn pri">⬆ Upload schedule file<input type="file" data-kind="sched" accept=".pdf,.xlsx,.xls,.csv" hidden></label></div>';
      }
      if (ui.sb.err) h += '<div class="note bad">' + esc(ui.sb.err) + "</div>";
    }
    h += "</div>";

    /* step 3 */
    h += '<div class="card step' + (a || S.major ? " done" : "") + '"><h2>About you</h2><div class="grid g3">';
    if (!a) {
      h += '<div><label class="f" for="pMajor">Your program</label><select id="pMajor"><option value="">Choose…</option>' + UH.MAJOR_ORDER.map((k) => '<option value="' + k + '"' + (S.major === k ? " selected" : "") + ">" + esc(UH.MAJORS[k].n) + "</option>").join("") + "</select></div>";
    }
    h += '<div><label class="f" for="pYear">Year</label><select id="pYear">' + YEARS.map((n, i) => '<option value="' + (i + 1) + '"' + (S.year === i + 1 ? " selected" : "") + ">" + n + "</option>").join("") + '</select>' + (a ? '<div class="sm mut">Worked out from your credits – change it if it is wrong.</div>' : "") + "</div>";
    h += '<div><label class="f" for="pCr">Credits you want to take (max ' + UH.MAX_CREDITS + ')</label><input type="number" id="pCr" min="1" max="' + UH.MAX_CREDITS + '" value="' + S.credits + '"></div></div>';
    h += '<label class="row" style="margin-top:12px"><input type="checkbox" id="pAssume"' + (S.assume ? " checked" : "") + '> <span>Count courses I’m taking <b>right now</b> as finished (so I can suggest the next level)</span></label></div>';
    h += "</div>";

    const ready = a || S.major;
    h += '<div class="row" style="margin-top:18px"><button class="btn acc big" data-act="auto"' + (ready ? "" : " disabled") + '>Build my plan</button><button class="btn big" data-go="advisor">💬 Ask the advisor</button><button class="btn big" data-go="courses">📚 Browse courses</button></div>';
    if (!ready) h += '<p class="sm mut">Upload your degree audit or choose your program first.</p>';
    else if (!sc) h += '<p class="sm mut">No schedule yet – plans will list requirements but can’t check times.</p>';
    $("#v-start").innerHTML = h;
  }
  function progress() { const m = $("#abMsg"), b = $("#abBar"); if (m) m.textContent = ui.ab.msg; if (b) b.style.width = Math.round(ui.ab.pct * 100) + "%"; const m2 = $("#sbMsg"), b2 = $("#sbBar"); if (m2) m2.textContent = ui.sb.msg; if (b2) b2.style.width = Math.round((ui.sb.pct || 0.05) * 100) + "%"; }

  /* ---- applying uploads ---- */
  function applyAudit(a) {
    if (!a || !a.rows || !a.rows.length) throw new Error("I couldn't find any courses in this file. Try the “Print Degree Audit” PDF, or use “Paste the text instead”.");
    a.meta = { degree: (a.meta && a.meta.degree) || "", catalogTerm: (a.meta && a.meta.catalogTerm) || "" }; // never keep name / ID / birth date
    a.rows.forEach((r) => { r.name = String(r.name || "").replace(/[\s|~_\-–—.,:;]+$/, "").replace(/^[\s|~_]+/, "").replace(/\s+/g, " "); });
    // an OCR slip can turn a real code into an unknown one (e.g. COSC 1l1): if the title matches exactly one catalog course with a nearly identical code, use it
    const near = (x, y) => { x = x.replace(/\s/g, ""); y = y.replace(/\s/g, ""); if (x.length !== y.length) return false; let d = 0; for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) d++; return d <= 2; };
    a.corrected = [];
    a.rows.forEach((r) => {
      if (UH.DB[r.code] && UH.DB[r.code].known) return;
      const g = P.guessByTitle(r.name);
      if (g && g !== r.code && UH.DB[g] && UH.DB[g].known && near(g, r.code) && !a.rows.some((o) => o !== r && o.code === g)) { a.corrected.push(r.code + " → " + g); r.code = g; }
    });
    S.audit = a; S.manualDone = []; S.plan = []; UH.resetRecs();
    UH.rebuild(); UH.recompute();
    const y = UH.autoYear(); if (y) S.year = y.year;
    UH.rebuild(); UH.save();
  }
  async function loadAudit(file) {
    ui.ab = { busy: true, msg: "Opening " + file.name + "…", pct: 0.02, err: "" }; rStart();
    try {
      const a = await UHPdf.readAuditFile(file, (m, p) => { ui.ab.msg = m; ui.ab.pct = p || ui.ab.pct; progress(); });
      applyAudit(a); ui.ab = { busy: false, msg: "", pct: 0, err: "" }; render("start"); header();
      toast("Degree audit read ✓"); openReview();
    } catch (e) {
      console.error(e);
      ui.ab = { busy: false, msg: "", pct: 0, err: "I couldn't read that file. " + (e && e.message ? e.message : "") };
      try { UHPdf.stop(); } catch (x) {}
      rStart();
    }
  }
  function termOf(name, secs) {
    const m = String(name).match(/(spring|summer|fall|autumn|winter)[\s_-]*(20\d\d)/i);
    if (m) return cap(m[1]) + " " + m[2];
    const d = secs.map((s) => s.startDate).find(Boolean);
    if (d) { const dt = new Date(d); if (!isNaN(dt)) { const mo = dt.getMonth(); return (mo <= 4 ? "Spring" : mo <= 6 ? "Summer" : "Fall") + " " + dt.getFullYear(); } }
    return "";
  }
  async function loadSchedule(file) {
    if (!/\.(pdf|xlsx|xls|csv)$/i.test(file.name)) { ui.sb = { busy: false, err: "Please choose a PDF or Excel file (.pdf, .xlsx, .xls or .csv)." }; rStart(); return; }
    ui.sb = { busy: true, err: "", msg: "Opening " + file.name + "…", pct: 0.05 }; rStart();
    try {
      const all = await UHPdf.readScheduleFile(file, (m, p) => { ui.sb.msg = m; ui.sb.pct = p || ui.sb.pct; progress(); });
      if (!all.sections.length) throw new Error("I couldn't find course codes in this file. It should list columns like Course Code, Section, Course Title and Time.");
      all.stats = { rows: all.sections.length, courses: new Set(all.sections.map((x) => x.code)).size };
      all.warnings = Array.from(new Set(all.warnings || []));
      all.term = termOf(file.name, all.sections); all.file = file.name; all.aliases = all.aliases || [];
      S.schedule = all; UH.resetRecs(); UH.rebuild();
      S.plan = S.plan.map((p) => ({ code: p.code, sec: (UH.sectionObj(p.code, p.sec) || {}).section || "" }));
      UH.save(); ui.sb = { busy: false, err: "" }; render("start"); header(); toast("Schedule loaded: " + all.stats.courses + " courses ✓");
    } catch (e) { console.error(e); try { UHPdf.stop(); } catch (x) {} ui.sb = { busy: false, err: "I couldn't read that file. " + (e && e.message ? e.message : "") }; rStart(); }
  }

  /* ---- review modal ---- */
  function openReview() {
    const a = S.audit; if (!a) return;
    const c = auditCounts(), ch = a.checks || {};
    let h = '<button class="btn sm x" data-act="close" aria-label="Close">✕</button><h2>Here’s what I read</h2><p class="mut">' + esc((a.meta && a.meta.degree) || "") + "</p>";
    h += '<div class="stats"><div class="stat"><b>' + c.done + '</b><span>completed</span></div><div class="stat"><b>' + c.inprogress + '</b><span>in progress</span></div><div class="stat"><b>' + (c.todo + c.retake) + '</b><span>still to take</span></div><div class="stat"><b>' + c.none + "</b><span>not counted</span></div></div>";
    if (ch.ok === true) h += '<div class="note ok">✓ <b>Credit check passed.</b> I counted ' + nice(ch.earnedSum) + " completed credits – exactly what your audit says.</div>";
    else if (ch.ok === false) h += '<div class="note warn">⚠ <b>Credit check: please look.</b> I counted ' + nice(ch.earnedSum) + " completed credits but your audit says " + nice(ch.summaryCompleted) + ". A grade may have been misread – check the Degree tab (you can fix any status there).</div>";
    else h += '<div class="note">I couldn’t find a “completed credits” total to compare with, so please skim the Degree tab.</div>';
    (a.warnings || []).forEach((w) => (h += '<div class="note warn">' + esc(w) + "</div>"));
    if (a.corrected && a.corrected.length) h += '<div class="note warn">I fixed these course codes using the course title: <b>' + a.corrected.map(esc).join(", ") + "</b></div>";
    if (a.guessed && a.guessed.length) h += '<div class="note warn">I matched ' + a.guessed.length + ' course' + (a.guessed.length === 1 ? "" : "s") + ' by title because the code was unclear – please check them in the Degree tab' + (a.guessed.length <= 8 ? ": <b>" + a.guessed.map(esc).join(", ") + "</b>" : ".") + "</div>";
    if (a.unreadable && a.unreadable.length) {
      h += '<h3>I couldn’t read the code for ' + a.unreadable.length + " row(s)</h3><p class=\"sm mut\">Type the course code (like COSC 111) for each, or leave blank to skip.</p>";
      a.unreadable.forEach((u, i) => (h += '<div class="row" style="margin-bottom:8px"><input type="text" data-un="' + i + '" placeholder="Code" style="width:110px" aria-label="Course code for row ' + (i + 1) + '"><span class="sm">' + esc(u.name || "(no title)") + " · " + esc(u.credits || "?") + " cr · " + esc(u.grade || u.semester || "—") + "</span></div>"));
      h += '<button class="btn" data-act="fixun">Add these rows</button>';
    }
    h += '<div class="row" style="margin-top:16px"><button class="btn pri" data-act="close" data-then="advisor">Looks right – continue</button><button class="btn" data-act="close" data-then="degree">Check the Degree tab</button></div>';
    openModal(h);
  }
  function fixUnreadable() {
    const a = S.audit; let n = 0; const keep = [];
    a.unreadable.forEach((u, i) => {
      const inp = $('#sheet [data-un="' + i + '"]'), code = inp && (P.normCode(inp.value) || P.codesIn(inp.value)[0]);
      if (!code) { keep.push(u); return; }
      const grade = String(u.grade || "").toUpperCase(), row = { category: u.category, code, inst: "", name: u.name || code, credits: u.credits, semester: u.semester, grade, earned: null, codeText: code };
      row.earned = u.earned != null ? u.earned : null; row.group = P.groupOf(u.category); row.status = P.statusOf(grade, u.semester, row.earned); if (row.status !== "done") row.earned = null;
      const old = a.rows.findIndex((r) => r.code === code);
      if (old >= 0) a.rows[old] = row; else a.rows.push(row);
      n++;
    });
    a.unreadable = keep; UH.recompute(); UH.rebuild(); UH.save(); toast(n ? n + " row(s) added ✓" : "Nothing to add"); openReview(); render("start");
  }

  /* =============== COURSE CARD =============== */
  function describe(code) {
    const c = UH.DB[code] || { code, title: code, cr: 3, pre: [], known: false }, st = UH.statusOf(code);
    return { code, c, st, group: st.group || UH.groupOf(code), secs: UH.sections(code), pre: UH.prereq(code) };
  }
  function secChips(secs, code, tf) {
    if (tf && tf !== "both") { const f = secs.filter((x) => UH.timeOk(x, tf)); if (f.length) secs = f; }
    if (!secs.length) return "";
    const others = S.plan.filter((p) => p.code !== code).map((p) => UH.sectionObj(p.code, p.sec)).filter(Boolean);
    const clashes = (s) => others.some((o) => P.overlap(s, o));
    return '<div class="secs">' + secs.slice(0, 4).map((s) => '<span class="sec' + (clashes(s) ? " clash" : "") + '" title="' + (clashes(s) ? "Clashes with your plan" : "") + '">' + esc(s.section ? "Sec " + s.section + " · " : "") + esc(UH.fmtSec(s)) + (s.faculty ? " · " + esc(s.faculty.trim()) : "") + "</span>").join("") + (secs.length > 4 ? '<span class="sec">+' + (secs.length - 4) + " more</span>" : "") + "</div>";
  }
  function card(code, x, tf) {
    const d = describe(code), k = d.st.kind, plan = inPlan(code), why = x && x.why;
    const offered = S.schedule ? d.secs.length > 0 : null;
    const sim = S.schedule && !d.secs.length ? UH.similar(code) : [];
    let tags = '<span class="tag">' + nice(d.c.cr) + " cr</span>";
    if (d.group && d.group !== "none" && d.group !== "other") tags += ' <span class="tag pri">' + esc(lbl(d.group)) + "</span>";
    tags += " " + (k === "outside" ? (S.audit ? statusTag("outside") : "") : statusTag(k));
    if (offered === true) tags += ' <span class="tag ok">Offered' + (term() ? " " + esc(term()) : "") + "</span>";
    if (offered === false) tags += ' <span class="tag bad">Not offered' + (term() ? " in " + esc(term()) : "") + "</span>";
    if (d.pre.known && !d.pre.ok && k !== "done") tags += ' <span class="tag warn">🔒 Needs ' + esc(d.pre.missing.join(", ")) + "</span>";
    const canAdd = offered !== false && k !== "done";
    return '<article class="cc' + (plan ? " in" : "") + '"><div class="cc-h"><button class="linkb t" data-act="open" data-code="' + esc(code) + '"><span class="code">' + esc(code) + '</span> <span class="title">' + esc(d.c.title) + "</span></button></div><div class=\"row\" style=\"gap:6px\">" + tags + "</div>" +
      (why ? '<div class="why">' + esc(why) + "</div>" : "") + (sim.length ? '<div class="why">Not in this schedule – similar: ' + esc(sim.join(", ")) + " (ask your advisor if it counts)</div>" : "") +
      secChips(d.secs, code, tf) +
      '<div class="acts2">' + (plan ? '<button class="btn sm" data-act="rm" data-code="' + esc(code) + '">✓ In plan – remove</button>' : '<button class="btn sm pri" data-act="add" data-code="' + esc(code) + '"' + (canAdd ? "" : " disabled") + ">+ Add to plan</button>") + '<button class="btn sm" data-act="open" data-code="' + esc(code) + '">Details</button></div></article>';
  }

  /* ---- plan mutations ---- */
  function addPlan(code, sec) {
    if (inPlan(code)) return;
    let s = sec;
    if (s === undefined) { s = UH.pickSection(code, S.plan); if (s === null) { s = (UH.sections(code)[0] || {}).section || ""; toast(code + " added, but every section clashes with your plan"); } }
    S.plan.push({ code, sec: s }); UH.save(); header();
  }
  function rmPlan(code) { S.plan = S.plan.filter((p) => p.code !== code); UH.save(); header(); }

  /* =============== COURSE DETAIL =============== */
  function openCourse(code) {
    const d = describe(code), k = d.st.kind, plan = inPlan(code);
    let h = '<button class="btn sm x" data-act="close" aria-label="Close">✕</button><h2>' + esc(code) + " – " + esc(d.c.title) + '</h2><div class="row" style="gap:6px;margin-bottom:10px"><span class="tag">' + nice(d.c.cr) + " credits</span> " + statusTag(k) + (d.group && d.group !== "none" && d.group !== "other" ? ' <span class="tag pri">' + esc(lbl(d.group)) + "</span>" : "") + "</div>";
    if (k === "done") h += "<p>✓ You completed this" + (d.st.row && d.st.row.grade ? " with " + esc(d.st.row.grade) : "") + (d.st.via !== code ? " (as " + esc(d.st.via) + ")" : "") + ".</p>";
    h += '<p><b>' + esc(d.pre.text) + "</b>" + (d.pre.known ? (d.pre.ok ? " – <span class=\"tag ok\">you meet them</span>" : " – <span class=\"tag warn\">you still need " + esc(d.pre.missing.join(", ")) + "</span>") : "") + "</p>";
    if (!d.c.known) h += '<div class="note">This course isn’t in the public catalog I could read, so its description and prerequisites are unknown. It was added from your uploaded file.</div>';
    if (S.schedule) {
      if (d.secs.length) {
        h += '<h3>Sections in ' + esc(term() || "the schedule") + '</h3><div class="twrap"><table class="tbl"><tr><th>Sec</th><th>When</th><th>Teacher</th><th>Room</th><th></th></tr>' +
          d.secs.map((s) => '<tr><td>' + esc(s.section) + "</td><td>" + esc(UH.fmtSec(s)) + "</td><td>" + esc((s.faculty || "").trim()) + "</td><td>" + esc(s.room || "") + '</td><td><button class="btn sm' + (plan && plan.sec === s.section ? "" : " pri") + '" data-act="addsec" data-code="' + esc(code) + '" data-sec="' + esc(s.section) + '"' + (k === "done" ? " disabled" : "") + ">" + (plan && plan.sec === s.section ? "Selected" : plan ? "Switch" : "Add") + "</button></td></tr>").join("") + "</table></div>";
      } else h += '<div class="note warn">Not in the ' + esc(term() || "uploaded") + " schedule." + (UH.similar(code).length ? " Similar course(s) offered: <b>" + esc(UH.similar(code).join(", ")) + "</b> (ask your advisor if it counts)." : "") + "</div>";
    } else h += '<div class="note">Upload the semester schedule on the Start tab to see sections and times.</div>';
    h += '<div class="row" style="margin-top:14px">' + (plan ? '<button class="btn" data-act="rm" data-code="' + esc(code) + '" data-keep="1">Remove from plan</button>' : "") + (!S.audit ? '<button class="btn" data-act="done" data-code="' + esc(code) + '">' + (S.manualDone.includes(code) ? "Undo “I completed this”" : "I’ve completed this") + "</button>" : "") + '<button class="btn" data-act="ask" data-code="' + esc(code) + '">💬 Ask the advisor</button></div>';
    openModal(h);
  }

  /* =============== COURSES TAB (only courses from the student's degree audit) =============== */
  function rCourses() {
    if (!S.audit) {
      $("#v-courses").innerHTML = '<div class="hero" style="padding-bottom:6px"><h1>Courses</h1></div><div class="card empty"><div style="font-size:40px">📚</div><p>This page shows the courses from <b>your degree audit</b>. Upload it first and they will appear here.</p><button class="btn pri" data-go="start">Upload degree audit</button></div>';
      return;
    }
    const c = UH.candidates(), total = UH.auditCodes().length, recN = UH.currentRecs().length;
    let h = '<div class="hero" style="padding-bottom:6px"><h1>Courses</h1><p>Courses from your degree audit. Search by course code or title, or filter by requirement.</p></div><div class="card"><div class="row"><div class="search" style="flex:1;min-width:220px"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="cq" type="search" placeholder="Search by course code or title (e.g. COSC 111 or programming)" value="' + esc(ui.q) + '" aria-label="Search by course code or title" autocomplete="off"></div></div>';
    h += '<div class="chips" style="margin-top:12px" id="modes">' + [["rec", "Recommended", recN], ["locked", "Not yet eligible", c.locked.length], ["gone", "Not offered", c.gone.length], ["all", "Everything on my audit", total]].map(([m, n, k]) => '<button class="chip' + (ui.mode === m && !ui.q ? " on" : "") + '" data-act="mode" data-m="' + m + '">' + n + " (" + k + ")</button>").join("") + "</div>";
    h += '<div class="row" style="margin-top:12px"><div><label class="f" for="cg">Requirement</label><select id="cg">' + UH.COURSEWORK.map(([k, n]) => '<option value="' + k + '"' + (ui.group === k ? " selected" : "") + ">" + esc(k === "all" ? "All requirements" : n) + "</option>").join("") + "</select></div>" + (S.schedule ? '<label class="row"><input type="checkbox" id="co"' + (ui.offeredOnly ? " checked" : "") + "> Only courses offered in " + esc(term() || "this schedule") + "</label>" : "") + "</div></div>";
    h += '<div id="cl"></div>';
    $("#v-courses").innerHTML = h; courseList();
  }
  function courseList() {
    if (!S.audit) return;
    const c = UH.candidates(), q = ui.q.trim(); let items = [], title = "", sub = "";
    const cmap = new Map(c.all.map((x) => [x.code, x]));
    const rowItem = (code) => { const r = UH.rowOf(code); return cmap.get(code) || { code, group: r ? r.group : "none" }; };
    if (q) { items = UH.search(q, UH.auditCodes()).map((d) => rowItem(d.code)); title = items.length + " result" + (items.length === 1 ? "" : "s") + " for “" + q + "”"; }
    else if (ui.mode === "all") {
      const ord = P.GROUP_ORDER; items = UH.auditCodes().map(rowItem).sort((x, y) => ord.indexOf(x.group) - ord.indexOf(y.group) || x.code.localeCompare(y.code));
      title = "Everything on my degree audit"; sub = "Every course listed on the audit you uploaded, including the ones you already finished.";
    } else { items = ui.mode === "rec" ? UH.currentRecs() : c[ui.mode]; title = { rec: "Recommended for you", locked: "Not yet eligible", gone: "Required but not offered" }[ui.mode]; sub = { rec: "The same recommendations the Advisor gave you (ask the Advisor again for a new set). Prerequisites are met and a section exists.", locked: "You need a prerequisite first.", gone: "Still required, but not in the uploaded schedule." }[ui.mode]; }
    if (ui.group !== "all") items = items.filter((x) => (x.group || describe(x.code).group) === ui.group);
    if (ui.offeredOnly && S.schedule) items = items.filter((x) => UH.sections(x.code).length);
    let h = '<div class="sect"><h2>' + esc(title) + '</h2><span class="mut">' + items.length + " course" + (items.length === 1 ? "" : "s") + "</span></div>" + (sub ? '<p class="mut">' + esc(sub) + "</p>" : "");
    if (!items.length) h += '<div class="empty">' + (q ? "No course on your degree audit matches “" + esc(q) + "”. Try the course code (e.g. COSC 111) or a word from the title." : ui.group !== "all" ? "No courses here for " + esc(lbl(ui.group)) + "." : ui.mode === "rec" ? "Nothing to recommend right now. " + (c.locked.length ? "Check “Not yet eligible”." : "") : "Nothing here.") + "</div>";
    else h += '<div class="clist">' + items.slice(0, ui.limit).map((x) => card(x.code, x.why ? x : null)).join("") + "</div>" + (items.length > ui.limit ? '<div class="row" style="justify-content:center;margin-top:14px"><button class="btn" data-act="more">Show ' + Math.min(40, items.length - ui.limit) + " more</button></div>" : "");
    $("#cl").innerHTML = h;
  }

  /* =============== DEGREE TAB =============== */
  function rDegree() {
    const a = S.audit;
    if (!a) { $("#v-degree").innerHTML = '<div class="hero"><h1>Your degree</h1></div><div class="card empty"><div class="big" style="font-size:40px">🎓</div><p>Upload your degree audit and I’ll show every requirement, what’s finished and what’s left.</p><button class="btn pri" data-go="start">Upload degree audit</button></div>'; return; }
    const ch = a.checks || {}, c = auditCounts();
    let h = '<div class="hero" style="padding-bottom:8px"><h1>Your degree</h1><p>' + esc((a.meta && a.meta.degree) || "") + "</p></div>";
    h += '<div class="card"><div class="row"><div class="stat"><b>' + nice(ch.earnedSum || 0) + (a.totalRequired ? " / " + a.totalRequired : "") + '</b><span>credits completed</span></div><div class="stat"><b>' + c.inprogress + '</b><span>in progress</span></div><div class="stat"><b>' + (c.todo + c.retake) + '</b><span>still to take</span></div><div class="sp"></div>' + (ch.ok === false ? '<span class="tag warn">⚠ total differs from audit (' + nice(ch.summaryCompleted) + ")</span>" : ch.ok ? '<span class="tag ok">✓ matches audit</span>' : "") + '<button class="btn" data-act="review">Review what I read</button></div></div>';
    h += '<p class="sm mut" style="margin-top:12px">Wrong status? Change it in the table – recommendations update instantly. “In progress” counts as finished only if you ticked that option on the Start tab.</p>';
    const ord = { retake: 0, todo: 1, inprogress: 2, done: 3 };
    P.GROUP_ORDER.forEach((g) => {
      const o = a.groups[g], rows = a.rows.filter((r) => r.group === g);
      if (!rows.length) return;
      const req = o && o.required, rem = UH.groupRem(g), done = o ? o.done : 0, ip = o ? o.inprog : 0;
      const pct = (n) => (req ? Math.min(100, (n / req) * 100) : 0);
      h += '<details class="grp"' + (g !== "none" && (rem > 0 || !isFinite(rem)) ? " open" : "") + "><summary><div class=\"row\"><h3 style=\"margin:0\">" + esc(lbl(g)) + '</h3><span class="sp"></span>' + (g === "none" ? '<span class="tag">' + rows.length + " courses</span>" : req != null ? (rem <= 0 ? '<span class="tag ok">✓ complete</span>' : '<span class="tag warn">' + nice(rem) + " cr to go</span>") : '<span class="tag">requirement unknown</span>') + '</div>' +
        (g !== "none" && req ? '<div class="gbar" aria-hidden="true"><i class="d" style="width:' + pct(done) + '%"></i><i class="p" style="width:' + Math.min(100 - pct(done), pct(ip)) + '%"></i></div><div class="sm mut">' + nice(done) + " of " + nice(req) + " credits done" + (ip ? " · " + nice(ip) + " in progress" : "") + (o.pick ? " · choose from the list below" : "") + "</div>" : g === "none" ? '<div class="sm mut">These rows have no requirement category on the audit, so they don’t count toward your degree.</div>' : "") + "</summary>";
      h += '<div class="twrap"><table class="tbl"><tr><th>Course</th><th>Credits</th><th>Term</th><th>Grade</th><th>Status</th></tr>' +
        rows.sort((x, y) => ord[x.status] - ord[y.status] || x.code.localeCompare(y.code)).map((r) => {
          const off = S.schedule && UH.sections(r.code).length;
          return '<tr><td><button class="linkb" data-act="open" data-code="' + esc(r.code) + '"><b>' + esc(r.code) + "</b> " + esc(r.name || (UH.DB[r.code] || {}).title || "") + "</button>" + (off && r.status !== "done" ? ' <span class="tag ok">offered</span>' : "") + "</td><td>" + nice(r.credits || 0) + "</td><td>" + esc(r.semester || "") + "</td><td>" + esc(r.grade || "") + '</td><td><select data-act="setstatus" data-code="' + esc(r.code) + '" aria-label="Status of ' + esc(r.code) + '">' + [["done", "✓ Completed"], ["inprogress", "In progress"], ["todo", "Still needed"], ["retake", "Retake"]].map(([v, t]) => '<option value="' + v + '"' + (r.status === v ? " selected" : "") + ">" + t + "</option>").join("") + "</select></td></tr>";
        }).join("") + "</table></div></details>";
    });
    $("#v-degree").innerHTML = h;
  }

  /* =============== PLAN TAB =============== */
  const COLORS = [215, 12, 150, 270, 35, 190, 330, 95];
  function rPlan() {
    const cr = UH.planCredits(), items = S.plan.map((p, i) => ({ p, i, d: describe(p.code), s: UH.sectionObj(p.code, p.sec) }));
    let h = need() + '<div class="hero" style="padding-bottom:6px"><h1>My plan' + (term() ? " – " + esc(term()) : "") + '</h1></div><div class="row"><div class="stat"><b>' + nice(cr) + " / " + S.credits + '</b><span>credits</span></div><div class="sp"></div><button class="btn acc" data-act="auto">Auto-build</button><button class="btn" data-act="dl"' + (items.length ? "" : " disabled") + '>⬇ Download</button><button class="btn" data-act="clear"' + (items.length ? "" : " disabled") + ">Clear</button></div>";
    const issues = UH.planIssues();
    if (issues.length) h += '<div class="note warn"><b>Please check:</b><ul>' + issues.map((x) => "<li>" + esc(x.text) + "</li>").join("") + "</ul></div>";
    else if (items.length) h += '<div class="note ok">✓ No time clashes, prerequisites met.</div>';
    if (!items.length) { h += '<div class="card empty"><div style="font-size:40px">🗓️</div><p>Your plan is empty. Press <b>Auto-build</b> or add courses from the Courses tab.</p><button class="btn pri" data-go="courses">Browse courses</button></div>'; $("#v-plan").innerHTML = h; return; }
    const timed = items.filter((x) => x.s && x.s.days && x.s.days.length && x.s.start != null);
    if (timed.length) {
      const lo = Math.max(7, Math.floor(Math.min(...timed.map((x) => x.s.start)) / 60)), hi = Math.min(22, Math.ceil(Math.max(...timed.map((x) => x.s.end)) / 60)), H = (hi - lo) * 48;
      const clashing = new Set(); timed.forEach((a, i) => timed.forEach((b, j) => { if (i < j && P.overlap(a.s, b.s)) { clashing.add(a.p.code); clashing.add(b.p.code); } }));
      h += '<div class="card twrap" style="margin-top:12px;padding:10px"><div class="tt"><div class="h"></div>' + ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => '<div class="h">' + d + "</div>").join("");
      h += "<div>" + Array.from({ length: hi - lo }, (_, i) => '<div class="hr">' + UH.fmtTime((lo + i) * 60).replace(":00", "") + "</div>").join("") + "</div>";
      for (let day = 1; day <= 6; day++) {
        h += '<div class="col" style="height:' + H + 'px;background-image:repeating-linear-gradient(to bottom,transparent 0 47px,var(--line) 47px 48px)">';
        timed.filter((x) => x.s.days.includes(day)).forEach((x) => { const top = ((x.s.start - lo * 60) / 60) * 48, ht = ((x.s.end - x.s.start) / 60) * 48; h += '<div class="blk' + (clashing.has(x.p.code) ? " clash" : "") + '" style="top:' + top + "px;height:" + ht + "px;background:hsl(" + COLORS[x.i % COLORS.length] + ',55%,36%)"><b>' + esc(x.p.code) + "</b>" + esc(UH.fmtTime(x.s.start).replace(" ", "").toLowerCase()) + "</div>"; });
        h += "</div>";
      }
      h += "</div></div>";
    }
    h += '<div class="card" style="margin-top:14px">' + items.map((x) => {
      const secs = x.d.secs;
      return '<div class="prow"><div class="t"><button class="linkb" data-act="open" data-code="' + esc(x.p.code) + '"><b>' + esc(x.p.code) + "</b> " + esc(x.d.c.title) + '</button><div class="sm mut">' + nice(x.d.c.cr) + " cr · " + esc(lbl(x.d.group)) + "</div></div>" +
        (secs.length ? '<select data-act="setsec" data-code="' + esc(x.p.code) + '" aria-label="Section for ' + esc(x.p.code) + '">' + secs.map((s) => '<option value="' + esc(s.section) + '"' + (x.s && x.s.section === s.section ? " selected" : "") + ">" + esc((s.section ? "Sec " + s.section + " · " : "") + UH.fmtSec(s) + (s.faculty ? " · " + s.faculty.trim() : "")) + "</option>").join("") + "</select>" : '<span class="tag">' + (S.schedule ? "not in schedule" : "no schedule loaded") + "</span>") +
        '<button class="btn sm" data-act="rm" data-code="' + esc(x.p.code) + '" aria-label="Remove ' + esc(x.p.code) + '">Remove</button></div>';
    }).join("") + "</div>";
    $("#v-plan").innerHTML = h;
  }
  function downloadPlan() {
    const L = ["UniHelper plan" + (term() ? " – " + term() : ""), "Credits: " + nice(UH.planCredits()), ""];
    S.plan.forEach((p) => { const d = describe(p.code), s = UH.sectionObj(p.code, p.sec); L.push(p.code + " – " + d.c.title + " (" + nice(d.c.cr) + " cr)" + (s ? " | Sec " + s.section + " | " + UH.fmtSec(s) + (s.faculty ? " | " + s.faculty.trim() : "") : "")); });
    L.push("", "Unofficial – confirm with your academic advisor before registering.");
    saveFile("unihelper-plan.txt", L.join("\n"), "text/plain");
  }

  /* =============== ADVISOR TAB =============== */
  function greeting() {
    const bits = [];
    if (S.audit) bits.push("I have your degree audit"); else bits.push("I don’t have your degree audit yet");
    bits.push(S.schedule ? "and the " + (term() || "semester") + " schedule." : "and no semester schedule yet.");
    return "Hi! " + bits.join(" ") + " Pick Coursework and Time if you like, then tap one of the questions below.";
  }
  function rAdvisor() {
    const on = ui.started, dis = on ? "" : " disabled";
    const chip = (act, k, label, sel) => '<button class="chip' + (sel ? " on" : "") + '" data-act="' + act + '" data-v="' + k + '"' + dis + ">" + esc(label) + "</button>";
    let h = need() + '<div class="hero" style="padding-bottom:6px"><h1>Advisor</h1><p>Tap <b>What should I take next semester?</b> first. Then pick a Coursework or a Time below to narrow it down.</p></div>';
    h += '<div class="chat card"><div class="msgs" id="msgs" aria-live="polite"></div><div class="chips bubbles" style="margin:8px 0 2px">' + UH.QUESTIONS.map(([k, t]) => '<button class="chip big' + (k === "next" && !on ? " pulse" : "") + '" data-act="chip" data-k="' + k + '">' + esc(t) + "</button>").join("") + "</div></div>";
    h += '<div class="card" style="margin-top:14px' + (on ? "" : ";opacity:.75") + '"><div class="sm mut" style="margin-bottom:8px">' + (on ? "Pick one – I will answer in the chat." : "🔒 These filters unlock after you tap “What should I take next semester?”") + "</div>";
    h += '<label class="f">Coursework</label><div class="chips" style="margin-bottom:12px">' + UH.COURSEWORK.map(([k, n]) => chip("fc", k, n, on && ui.af.group === k && ui.cwPicked)).join("") + "</div>";
    h += '<label class="f">Time</label><div class="chips">' + UH.TIMES.map(([k, n]) => chip("ft", k, n, on && ui.af.time === k && ui.timePicked)).join("") + "</div>";
    h += '<div class="sm mut" style="margin-top:8px">Time builds a 5-course plan using only the times you pick (needs the semester schedule).</div></div>';
    $("#v-advisor").innerHTML = h; msgs();
  }
  function msgs() {
    const box = $("#msgs"); if (!box) return;
    const all = UH.candidates().all;
    let h = '<div class="m a">' + esc(greeting()) + "</div>";
    ui.chat.forEach((m) => {
      if (m.r === "u") h += '<div class="m u">' + esc(m.text) + "</div>";
      else h += '<div class="m a">' + esc(m.text) + (m.codes && m.codes.length ? '<div class="mc">' + m.codes.map((c) => card(c, all.find((x) => x.code === c) || {}, m.time)).join("") + "</div>" : "") + (m.goPlan ? '<div class="acts2" style="margin-top:8px"><button class="btn pri sm" data-go="plan">Open my plan</button></div>' : "") + (m.goStart ? '<div class="acts2" style="margin-top:8px"><button class="btn pri sm" data-go="start">Go to Start</button></div>' : "") + (m.note ? '<span class="src">' + esc(m.note) + "</span>" : "") + "</div>";
    });
    box.innerHTML = h; box.scrollTop = box.scrollHeight;
  }
  /* kind = which answer to run; userText = what shows as the student's chat bubble */
  function ask(kind, userText) {
    ui.chat.push({ r: "u", text: userText });
    let res; try { res = UH.advise(kind, ui.af); } catch (e) { console.error(e); res = { text: "Sorry, something went wrong: " + e.message }; }
    ui.chat.push({ r: "a", time: S.schedule ? ui.af.time : "both", text: res.text, codes: res.codes, note: res.note, goPlan: res.goPlan, goStart: res.goStart });
    if (ui.chat.length > 40) ui.chat = ui.chat.slice(-40);
    UH.save(); header();
  }
  function send(kind) {
    const q = (UH.QUESTIONS.find((x) => x[0] === kind) || [])[1]; if (!q) return;
    if (kind === "next") { ui.af = { group: "all", time: "both" }; ui.cwPicked = false; ui.timePicked = false; const was = ui.started; ui.started = true; ask("next", q); if (!was) rAdvisor(); else rAdvisor(); return; }
    ask(kind, q); rAdvisor();
  }
  const lblOf = (arr, k) => (arr.find((x) => x[0] === k) || [k, k])[1];
  function pickCoursework(k) { ui.af.group = k; ui.cwPicked = true; ask("next", lblOf(UH.COURSEWORK, k)); rAdvisor(); }
  function pickTime(k) { ui.af.time = k; ui.timePicked = true; ask("plan", lblOf(UH.TIMES, k)); rAdvisor(); }

  /* =============== LOGIN / SIGN UP =============== */
  function rLogin() {
    const L = ui.lg, su = L.tab === "signup";
    let h = '<div class="login-card"><div class="lbrand"><span class="logo">U</span><span>UniHelper</span></div><h1>' + (su ? "Create your account" : "Welcome back") + '</h1><p class="mut">' + (su ? "Sign up with your email, school ID and a password." : "Log in with your school ID or email to plan your semester.") + "</p>";
    h += '<div class="seg" role="tablist"><button type="button" class="chip' + (!su ? " on" : "") + '" data-lg="login">Log in</button><button type="button" class="chip' + (su ? " on" : "") + '" data-lg="signup">Sign up</button></div>';
    h += '<div id="lgMsg" role="status">' + (L.ok ? '<div class="note ok">' + esc(L.ok) + "</div>" : "") + "</div>";
    h += '<form id="lgForm" novalidate>';
    if (su) {
      h += '<label class="f" for="suEmail">Email</label><input type="email" id="suEmail" autocomplete="email" placeholder="name@aupp.edu.kh" value="' + esc(L.email || "") + '">';
      h += '<label class="f" for="suId" style="margin-top:12px">School ID</label><input type="text" id="suId" autocomplete="username" placeholder="Your student ID" value="' + esc(L.sid || "") + '">';
    } else h += '<label class="f" for="lgId">School ID or email</label><input type="text" id="lgId" autocomplete="username" placeholder="School ID or email" value="' + esc(L.id || "") + '">';
    h += '<label class="f" for="lgPw" style="margin-top:12px">Password</label><input type="password" id="lgPw" autocomplete="' + (su ? "new-password" : "current-password") + '" placeholder="' + (su ? "At least 6 characters" : "Your password") + '">';
    h += '<label class="row sm" style="margin-top:8px"><input type="checkbox" id="lgShow"> Show password</label>';
    h += '<button class="btn pri big" type="submit" style="width:100%;justify-content:center;margin-top:16px"' + (L.busy ? " disabled" : "") + ">" + (su ? "Create account" : "Log in") + "</button></form>";
    h += '<p class="sm mut" style="margin-top:14px;text-align:center">' + (su ? "Already have an account? <button class=\"linkb\" style=\"color:var(--pri);font-weight:700\" data-lg=\"login\">Log in</button>" : "New here? <button class=\"linkb\" style=\"color:var(--pri);font-weight:700\" data-lg=\"signup\">Sign up</button>") + "</p>";
    h += '<p class="sm mut" style="text-align:center">Accounts are saved on this device only.</p></div>';
    $("#login").innerHTML = h;
    const f = $(su ? "#suEmail" : "#lgId"); if (f && !L.noFocus) f.focus();
  }
  const lgMsg = (cls, text, field) => { $("#lgMsg").innerHTML = '<div class="note ' + cls + '">' + esc(text) + "</div>"; $$("#lgForm input").forEach((i) => i.classList.remove("bad")); const m = { email: "#suEmail", sid: "#suId", pw: "#lgPw" }[field]; if (m && $(m)) { $(m).classList.add("bad"); $(m).focus(); } };
  async function submitLogin() {
    const L = ui.lg; if (L.busy) return;
    const su = L.tab === "signup", pw = $("#lgPw").value;
    L.busy = true; const btn = $("#lgForm button[type=submit]"); if (btn) btn.disabled = true;
    try {
      if (su) {
        L.email = $("#suEmail").value.trim(); L.sid = $("#suId").value.trim();
        const r = await UH.auth.signup(L.email, L.sid, pw);
        if (!r.ok) { lgMsg("bad", r.error, r.field); return; }
        ui.lg = { tab: "login", ok: "Account created ✓  Now log in with your school ID or email.", id: L.sid, busy: false, noFocus: true }; rLogin(); $("#lgPw").focus(); return;
      }
      L.id = $("#lgId").value.trim();
      const r = await UH.auth.login(L.id, pw);
      if (!r.ok) { lgMsg("bad", r.error, r.field); if (r.notFound) $("#lgMsg").insertAdjacentHTML("beforeend", '<div style="margin-top:-4px"><button class="btn sm" type="button" data-lg="signup">Sign up</button></div>'); return; }
      enter(r.user);
    } catch (e) { console.error(e); lgMsg("bad", "Something went wrong. Please try again."); }
    finally { L.busy = false; const b2 = $("#lgForm button[type=submit]"); if (b2) b2.disabled = false; }
  }
  function showLogin() { $("#login").hidden = false; $("#app").hidden = true; closeModal(); rLogin(); document.title = "UniHelper – Log in"; }
  function enter(user) {
    UH.loadUser(user.schoolId);
    ui.chat = []; ui.q = ""; ui.mode = "rec"; ui.group = "all"; ui.offeredOnly = false; ui.limit = 40; ui.af = { group: "all", time: "both" }; ui.started = false; ui.cwPicked = false; ui.timePicked = false; ui.ab = { busy: false, msg: "", pct: 0, err: "" }; ui.sb = { busy: false, err: "" };
    ui.lg = { tab: "login", err: "", ok: "", id: "", busy: false };
    $("#login").hidden = true; $("#app").hidden = false; header();
    const first = location.hash.slice(1);
    go(TABS.includes(first) ? first : S.audit || S.major ? "advisor" : "start");
  }
  function logout() { UH.auth.logout(); UH.loadUser(null); ui.lg = { tab: "login", err: "", ok: "", id: "", busy: false }; showLogin(); }

  /* =============== SEARCH (header) =============== */
  function searchBox() {
    const q = $("#gq").value.trim(), box = $("#gres");
    if (!q) { closeSearch(); return; }
    const r = UH.search(q, S.audit ? UH.auditCodes() : null), top = r.slice(0, 8); ui.sel = -1;
    box.innerHTML = top.length ? top.map((c, i) => '<button class="it" data-act="open" data-code="' + esc(c.code) + '" data-i="' + i + '"><b>' + esc(c.code) + '</b><span class="t">' + esc(c.title) + "</span>" + statusTag(UH.statusOf(c.code).kind).replace(/<span class="tag">Not on your list<\/span>/, "") + "</button>").join("") + (r.length > 8 ? '<button class="more" data-act="allres">See all ' + r.length + " results →</button>" : "") : '<div class="none">No course matches “' + esc(q) + "”.</div>";
    box.hidden = false;
  }
  function closeSearch() { $("#gres").hidden = true; ui.sel = -1; }

  /* =============== EVENTS =============== */
  document.addEventListener("click", (e) => {
    const lg = e.target.closest("[data-lg]"); if (lg) { ui.lg = { tab: lg.dataset.lg, ok: "", id: ui.lg.id, email: ui.lg.email, sid: ui.lg.sid, busy: false }; rLogin(); return; }
    const g = e.target.closest("[data-go]"); if (g) { closeModal(); go(g.dataset.go); return; }
    const t = e.target.closest("[data-act]");
    if (!t) { if ($("#modal") === e.target) closeModal(); if (!e.target.closest(".search")) closeSearch(); return; }
    const a = t.dataset.act, code = t.dataset.code;
    if (t.tagName === "SELECT") return;
    switch (a) {
      case "close": closeModal(); if (t.dataset.then) go(t.dataset.then); break;
      case "open": closeSearch(); openCourse(code); break;
      case "allres": ui.q = $("#gq").value.trim(); ui.mode = "rec"; ui.limit = 40; go("courses"); break;
      case "add": addPlan(code); toast(code + " added to your plan"); refreshView(); break;
      case "addsec": { const had = inPlan(code); if (had) had.sec = t.dataset.sec; else addPlan(code, t.dataset.sec); UH.save(); header(); openCourse(code); refreshView(); break; }
      case "rm": rmPlan(code); toast(code + " removed"); if (!t.dataset.keep) refreshView(); else { openCourse(code); refreshView(); } break;
      case "done": { const i = S.manualDone.indexOf(code); if (i >= 0) S.manualDone.splice(i, 1); else S.manualDone.push(code); UH.save(); openCourse(code); refreshView(); break; }
      case "ask": closeModal(); go("advisor"); send("Tell me about " + code); break;
      case "chip": send(t.dataset.k); break;
      case "fc": if (ui.started) pickCoursework(t.dataset.v); break;
      case "ft": if (ui.started) pickTime(t.dataset.v); break;
      case "mode": ui.mode = t.dataset.m; ui.q = ""; ui.limit = 40; rCourses(); break;
      case "more": ui.limit += 40; courseList(); break;
      case "auto": { if (!S.audit && !S.major) { toast("Upload your degree audit or choose a program first"); break; } const p = UH.autoPlan({ group: ui.af.group, time: S.schedule ? ui.af.time : "both" }); UH.save(); header(); if (!p.length) toast("No eligible courses fit without a time clash"); if (ui.tab === "plan") rPlan(); else go("plan"); break; }
      case "clear": S.plan = []; UH.save(); rPlan(); header(); break;
      case "dl": downloadPlan(); break;
      case "review": openReview(); break;
      case "fixun": fixUnreadable(); break;
      case "paste": { const txt = ($("#pasteA") || {}).value || ""; if (txt.trim().length < 30) { toast("Paste the audit text first"); break; } try { applyAudit(P.parseAuditText(txt)); render("start"); header(); openReview(); } catch (err) { ui.ab.err = err.message; rStart(); } break; }
      case "rmaudit": S.audit = null; S.plan = []; UH.resetRecs(); S.manualDone = []; UH.rebuild(); UH.save(); render("start"); header(); toast("Degree audit removed from this browser"); break;
      case "rmsched": S.schedule = null; S.plan = S.plan.map((p) => ({ code: p.code, sec: "" })); UH.rebuild(); UH.save(); render("start"); header(); break;
    }
  });
  function refreshView() { if (ui.tab === "courses") courseList(); else if (ui.tab === "advisor") msgs(); else render(ui.tab); header(); }

  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.matches('input[type=file][data-kind]')) { const f = t.files[0]; t.value = ""; if (!f) return; t.dataset.kind === "audit" ? loadAudit(f) : loadSchedule(f); return; }
    if (t.matches('[data-act="setstatus"]')) {
      const r = UH.rowOf(t.dataset.code); if (!r) return;
      r.status = t.value; if (t.value === "done") r.earned = r.earned || r.credits; else r.earned = null;
      UH.recompute(); UH.refresh(); UH.save(); rDegree(); header(); toast(r.code + " → " + t.options[t.selectedIndex].text); return;
    }
    if (t.matches('[data-act="setsec"]')) { const p = inPlan(t.dataset.code); if (p) { p.sec = t.value; UH.save(); rPlan(); } return; }
    if (t.id === "pMajor") { S.major = t.value; UH.save(); rStart(); }
    else if (t.id === "pYear") { S.year = +t.value; UH.save(); }
    else if (t.id === "pCr") { S.credits = Math.max(1, Math.min(UH.MAX_CREDITS, Math.round(+t.value || 15))); t.value = S.credits; UH.save(); if (+t.value !== S.credits) {} }
    else if (t.id === "pAssume") { S.assume = t.checked; UH.save(); }
    else if (t.id === "cg") { ui.group = t.value; ui.limit = 40; courseList(); }
    else if (t.id === "co") { ui.offeredOnly = t.checked; ui.limit = 40; courseList(); }
  });
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.id === "pCr" && t.value !== "" && +t.value > UH.MAX_CREDITS) { t.value = UH.MAX_CREDITS; toast("The maximum is " + UH.MAX_CREDITS + " credits"); }
    if (t.id === "gq") searchBox();
    else if (t.id === "cq") { ui.q = t.value; ui.limit = 40; courseList(); }
  });
  document.addEventListener("submit", (e) => { if (e.target.id === "lgForm") { e.preventDefault(); submitLogin(); } });
  document.addEventListener("change", (e) => { if (e.target.id === "lgShow") { const p = $("#lgPw"); if (p) p.type = e.target.checked ? "text" : "password"; } });
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if ($("#app").hidden) return;
    if (e.key === "/" && !typing && $("#modal").hidden) { e.preventDefault(); $("#gq").focus(); return; }
    if (e.key === "Escape") { if (!$("#modal").hidden) closeModal(); else if (!$("#gres").hidden) { closeSearch(); $("#gq").blur(); } return; }
    if (document.activeElement.id === "gq") {
      const its = $$("#gres .it");
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (!its.length) return; ui.sel = (ui.sel + (e.key === "ArrowDown" ? 1 : -1) + its.length) % its.length; its.forEach((b, i) => b.classList.toggle("on", i === ui.sel)); }
      else if (e.key === "Enter") { e.preventDefault(); if (ui.sel >= 0 && its[ui.sel]) { closeSearch(); openCourse(its[ui.sel].dataset.code); } else { ui.q = $("#gq").value.trim(); ui.mode = "rec"; ui.limit = 40; go("courses"); } }
    }
    if (document.activeElement.id === "cq" && e.key === "Enter") e.preventDefault();
  });
  ["dragover", "dragenter"].forEach((n) => document.addEventListener(n, (e) => { const d = e.target.closest(".drop"); if (d) { e.preventDefault(); d.classList.add("over"); } }));
  ["dragleave", "drop"].forEach((n) => document.addEventListener(n, (e) => { const d = e.target.closest(".drop"); if (d) { d.classList.remove("over"); if (n === "drop") { e.preventDefault(); const f = e.dataTransfer.files[0], k = d.querySelector("input").dataset.kind; if (f) k === "audit" ? loadAudit(f) : loadSchedule(f); } } }));
  window.addEventListener("dragover", (e) => e.preventDefault()); window.addEventListener("drop", (e) => { if (!e.target.closest(".drop")) e.preventDefault(); });
  $("#btnOut").addEventListener("click", logout);
  window.addEventListener("hashchange", () => { if ($("#app").hidden) return; const t = location.hash.slice(1); if (TABS.includes(t) && t !== ui.tab) go(t); });

  /* ---------- boot ---------- */
  window.__UH_APP = { go, ui, openCourse, openReview, enter, logout };
  const me = UH.auth.current();
  if (me) enter(me); else showLogin();
})();
