/* UniHelper PDF reader (browser only)
 * 1) tries the PDF's own text layer (fast, exact)
 * 2) if there is no readable text (a scan, or fonts with no text mapping), it stops with a clear message: no OCR is used.
 * Nothing is uploaded anywhere.
 */
(function (root) {
  "use strict";
  const R = {};
  const abs = (p) => new URL(p, document.baseURI).href;
  const EMB = root.UH_EMBED || null; // set only in the single-file build: { name: base64 }
  const blobUrl = (name, type) => { const b = atob(EMB[name]), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return URL.createObjectURL(new Blob([u], { type: type || "application/javascript" })); };
  const pdfWorkerSrc = () => (EMB ? (EMB._pw = EMB._pw || blobUrl("pdfWorker")) : abs("vendor/pdf.worker.min.js"));
  R.stop = async function () {};

  function wordsFromTextContent(tc, vp) {
    const out = [];
    tc.items.forEach((it) => {
      const s = String(it.str || ""); if (!s.trim()) return;
      const x = it.transform[4], base = vp.height - it.transform[5], h = Math.abs(it.height || it.transform[3] || 10), w = it.width || 0;
      const n = s.length; let i = 0;
      s.replace(/\S+/g, (tok, idx) => { out.push({ t: tok, x0: x + (idx / n) * w, x1: x + ((idx + tok.length) / n) * w, y0: base - h, y1: base }); return tok; });
    });
    return out;
  }
  /* onStatus(text, fraction0to1) */
  R.readAuditPdf = async function (file, onStatus) {
    const pdfjs = root.pdfjsLib;
    if (!pdfjs) throw new Error("PDF reader not loaded");
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc();
    onStatus("Opening PDF…", 0.02);
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const n = doc.numPages;
    // 1) text layer
    const textPages = [];
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i), vp = page.getViewport({ scale: 1 });
      textPages.push({ w: vp.width, h: vp.height, words: wordsFromTextContent(await page.getTextContent(), vp) });
    }
    if (root.UHParse.looksLikeAudit(textPages) >= 3) {
      onStatus("Reading the PDF text…", 0.9);
      const audit = root.UHParse.parseAuditWords(textPages);
      if (audit.rows.length) { audit.method = "text"; return audit; }
    }
    throw new Error("I couldn't find readable text in this PDF. It may be a scan or a photo. In the student portal, print the Official Degree Audit to PDF (Ctrl+P, then “Save as PDF”) instead of scanning it, or paste the audit text below.");
  };

  /* Excel / CSV / HTML / text */
  R.readAuditFile = async function (file, onStatus) {
    const name = file.name.toLowerCase();
    if (/\.pdf$/.test(name)) return R.readAuditPdf(file, onStatus);
    onStatus("Reading " + file.name + "…", 0.3);
    if (/\.(html?|mhtml)$/.test(name)) {
      const doc = new DOMParser().parseFromString(await file.text(), "text/html");
      const rows = [];
      doc.querySelectorAll("table").forEach((tb) => {
        const carry = []; // cells still spanning down from earlier rows
        Array.from(tb.querySelectorAll("tr")).forEach((tr) => {
          const out = []; let col = 0;
          const fill = () => { while (carry[col] && carry[col].n > 0) { out[col] = carry[col].v; carry[col].n--; col++; } };
          Array.from(tr.children).forEach((c) => {
            fill();
            const v = c.textContent.replace(/\s+/g, " ").trim(), rs = Math.max(1, +c.getAttribute("rowspan") || 1), cs = Math.max(1, +c.getAttribute("colspan") || 1);
            for (let k = 0; k < cs; k++) { out[col] = v; if (rs > 1) carry[col] = { v, n: rs - 1 }; col++; }
          });
          fill();
          if (out.length) rows.push(out);
        });
      });
      let a = root.UHParse.parseAuditTable(rows), rawOut = [];
      // second opinion from the page text (works when the page is not built from <table>s, or the table has no header)
      try {
        const out = [], BLOCK = /^(DIV|P|LI|UL|OL|H[1-6]|SECTION|ARTICLE|HEADER|FOOTER|BR|HR|DL|DT|DD|MAIN|FORM|TABLE|THEAD|TBODY|TFOOT|CAPTION|PRE)$/;
        let buf = "";
        const flush = () => { const t = buf.replace(/[ \u00a0]+/g, " ").trim(); if (t) out.push(t); buf = ""; };
        const walk = (n) => {
          if (n.nodeType === 3) { buf += n.nodeValue.replace(/\s+/g, " "); return; }
          if (n.nodeType !== 1) return;
          const tg = n.tagName;
          if (/^(SCRIPT|STYLE|NOSCRIPT|HEAD|SVG|TEMPLATE)$/.test(tg)) return;
          if (tg === "TR") { flush(); out.push(Array.from(n.children).map((c) => c.textContent.replace(/\s+/g, " ").trim()).join("\t")); return; }
          const blk = BLOCK.test(tg); if (blk) flush();
          Array.from(n.childNodes).forEach(walk);
          if (blk) flush();
        };
        walk(doc.body || doc.documentElement); flush();
        const alt = root.UHParse.parseAuditText(out.join("\n")); rawOut = out;
        if (alt && alt.rows.length) { if (!a.totalCompleted && alt.totalCompleted != null) { a.totalCompleted = alt.totalCompleted; a.totalRequired = alt.totalRequired; } a = root.UHParse.betterAudit(a.rows.length ? a : alt, alt); }
        else if (!a.rows.length) throw new Error("no courses found");
      } catch (e) { if (!a.rows.length) throw new Error("I couldn't find a course table in this page. Make sure you saved the audit page itself, and that the table had finished loading when you saved it. Otherwise paste the page text instead."); }
      a.rawLines = rawOut.slice(0, 400);
      const bodyText = doc.body ? doc.body.innerText || doc.body.textContent : "";
      const dm = bodyText.match(/Degree\s*:\s*([^\n]+?)(?:\s{2,}|\n|$)/); if (dm && dm[1].trim().length > 6 && !/^audit/i.test(dm[1].trim())) a.meta.degree = dm[1].trim();
      const tm = (bodyText || doc.documentElement.textContent || "").match(/Required\s*:?\s*(\d+)\s*Completed\s*:?\s*(\d+)/i); // totals printed outside the table
      if (tm && a.totalCompleted == null) { a.totalRequired = +tm[1]; a.totalCompleted = +tm[2]; a.checks = { earnedSum: a.checks.earnedSum, summaryCompleted: a.totalCompleted, ok: Math.abs(a.checks.earnedSum - a.totalCompleted) < 0.01 }; }
      a.method = "html"; return a;
    }
    if (/\.(txt|text)$/.test(name)) { const a = root.UHParse.parseAuditText(await file.text()); a.method = "text-file"; return a; }
    if (!root.XLSX) throw new Error("Excel reader not loaded");
    const wb = root.XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", cellDates: false });
    let best = null;
    wb.SheetNames.forEach((sn) => {
      const rows = root.XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: "", raw: false });
      const a = root.UHParse.parseAuditTable(rows);
      if (!best || a.rows.length > best.rows.length) best = a;
    });
    best.method = "excel"; return best;
  };

  /* ---------- semester schedule: PDF or Excel/CSV ---------- */
  const med = (a) => { if (!a.length) return 0; const t = a.slice().sort((x, y) => x - y); return t[t.length >> 1]; };
  function linesOf(words, tol) {
    const s = words.slice().sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2 || a.x0 - b.x0), lines = [];
    s.forEach((w) => { const cy = (w.y0 + w.y1) / 2, L = lines[lines.length - 1]; if (L && Math.abs(cy - L.cy) <= tol) L.w.push(w); else lines.push({ cy, w: [w] }); });
    lines.forEach((L) => L.w.sort((a, b) => a.x0 - b.x0));
    return lines;
  }
  function cellsOfLine(L, gap) { // split a line into table cells wherever there is a wide gap
    const cells = []; let cur = null;
    L.w.forEach((w) => { if (cur && w.x0 - cur.x1 <= gap) { cur.t += " " + w.t; cur.x1 = w.x1; } else { cur = { t: w.t, x0: w.x0, x1: w.x1 }; cells.push(cur); } });
    return cells;
  }
  const HEAD = /course\s*code|^code$|section|^sec|title|course\s*name|credit|faculty|instructor|teacher|time|room|schedule|start|end/i;
  function pagesToRows(pages) {
    const rows = []; let header = null, starts = null, fr = null;
    const allLines = [];
    pages.forEach((pg) => {
      const medH = med(pg.words.map((w) => w.y1 - w.y0)) || 10, gap = Math.max(6, medH * 0.9);
      linesOf(pg.words, 0.6 * medH).forEach((L) => allLines.push({ L, gap, W: pg.w, medH }));
    });
    allLines.forEach(({ L, gap, W }) => {
      const cells = cellsOfLine(L, gap);
      const hits = cells.filter((c) => HEAD.test(c.t) && c.t.length < 30).length;
      if (hits >= 3 && cells.length >= 3 && cells.filter((c) => /\d{3}/.test(c.t)).length === 0) { // a header line
        starts = cells.map((c) => c.x0); fr = starts.map((x) => x / W);
        if (!header) { header = cells.map((c) => c.t); rows.push(header); }
        return;
      }
      if (!starts) { rows.push(cells.map((c) => c.t)); return; }
      const st = fr.map((f) => f * W), tol = gap * 0.8;
      const out = st.map(() => "");
      L.w.forEach((w) => { let c = 0; for (let i = 0; i < st.length; i++) if (w.x0 >= st[i] - tol) c = i; out[c] = (out[c] ? out[c] + " " : "") + w.t; });
      const hasCode = U().codesIn(out.join(" ")).length > 0 && /^[A-Za-z]{2,5}\s?-?\d{3}/.test(out.join(" ").trim());
      if (hasCode || !rows.length) rows.push(out);
      else { const last = rows[rows.length - 1]; out.forEach((t, i) => { if (t) last[i] = ((last[i] || "") + " " + t).trim(); }); } // wrapped text goes with the row above
    });
    return { rows, lines: allLines.map(({ L }) => L.w.map((w) => w.t).join(" ")) };
  }
  const U = () => root.UHParse;

  R.readScheduleFile = async function (file, onStatus) {
    onStatus = onStatus || function () {};
    const name = file.name.toLowerCase(), P = U();
    if (/\.pdf$/.test(name)) {
      const pdfjs = root.pdfjsLib; if (!pdfjs) throw new Error("PDF reader not loaded");
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc();
      onStatus("Opening PDF…", 0.05);
      const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
      let pages = [];
      for (let i = 1; i <= doc.numPages; i++) { const page = await doc.getPage(i), vp = page.getViewport({ scale: 1 }); pages.push({ w: vp.width, h: vp.height, words: wordsFromTextContent(await page.getTextContent(), vp) }); }
      if (pages.reduce((n, p) => n + p.words.length, 0) < 20) throw new Error("I couldn't find readable text in this PDF (it may be a scan). Please upload the PDF exported from the system, or the Excel file.");
      const { rows, lines } = pagesToRows(pages);
      let r = P.parseSchedule(rows);
      if (!r.sections.length || r.sections.every((x) => x.start == null)) { const r2 = P.parseScheduleLines(lines); if (r2.sections.length > r.sections.length) r = r2; }
      return r;
    }
    if (!root.XLSX) throw new Error("Excel reader not loaded");
    onStatus("Reading " + file.name + "…", 0.3);
    const wb = root.XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
    const all = { sections: [], aliases: [], warnings: [], stats: {} };
    wb.SheetNames.forEach((sn) => {
      const rows = root.XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: "", raw: false });
      const r = P.parseSchedule(rows);
      all.sections.push(...r.sections); all.aliases.push(...r.aliases);
      if (r.sections.length) all.warnings.push(...r.warnings);
    });
    return all;
  };

  root.UHPdf = R;
})(window);
