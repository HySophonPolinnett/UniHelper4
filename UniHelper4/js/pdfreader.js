/* UniHelper PDF reader (browser only)
 * 1) tries the PDF's own text layer (fast, exact)
 * 2) if the text is unreadable (the AUPP "Print Degree Audit" PDF uses embedded fonts with no text mapping)
 *    it renders each page and reads it with OCR (Tesseract.js, self-hosted, runs fully in the browser).
 * Nothing is uploaded anywhere.
 */
(function (root) {
  "use strict";
  const R = {};
  const abs = (p) => new URL(p, document.baseURI).href;
  const EMB = root.UH_EMBED || null; // set only in the single-file build: { name: base64 }
  const blobUrl = (name, type) => { const b = atob(EMB[name]), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return URL.createObjectURL(new Blob([u], { type: type || "application/javascript" })); };
  const pdfWorkerSrc = () => (EMB ? (EMB._pw = EMB._pw || blobUrl("pdfWorker")) : abs("vendor/pdf.worker.min.js"));
  let ocrWorker = null;

  async function getOcr(onStatus) {
    if (ocrWorker) return ocrWorker;
    if (!root.Tesseract) throw new Error("OCR engine not loaded");
    onStatus("Starting the reading engine (first time takes a few seconds)…");
    if (EMB) { // single-file build: worker, OCR core and English data all come from inside this file
      if (!EMB._tw) {
        const wUrl = blobUrl("tessWorker"), lang = EMB.lang;
        const wrapper = "const __L='" + lang + "';const __b=()=>{const b=atob(__L),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u};" +
          "const __f=self.fetch?self.fetch.bind(self):null;self.fetch=function(u,o){if(/traineddata/.test(String(u)))return Promise.resolve(new Response(__b(),{status:200}));return __f(u,o)};" +
          "const __X=self.XMLHttpRequest;if(__X){self.XMLHttpRequest=function(){const x=new __X();let url='';const op=x.open;x.open=function(m,u){url=String(u);if(/traineddata/.test(url)){return op.call(x,'GET','data:application/octet-stream;base64,'+__L)}return op.apply(x,arguments)};return x}}" +
          "importScripts('" + wUrl + "');";
        EMB._tw = URL.createObjectURL(new Blob([wrapper], { type: "application/javascript" }));
        EMB._tc = blobUrl("tessCore");
      }
      ocrWorker = await root.Tesseract.createWorker("eng", 1, { workerPath: EMB._tw, corePath: EMB._tc, langPath: "https://offline.invalid/lang", gzip: true, workerBlobURL: false, cacheMethod: "none" });
      return ocrWorker;
    }
    ocrWorker = await root.Tesseract.createWorker("eng", 1, {
      workerPath: abs("vendor/tesseract/worker.min.js"),
      corePath: abs("vendor/tesseract/"),
      langPath: abs("vendor/tesseract/lang"),
      gzip: true, workerBlobURL: false, cacheMethod: "none",
    });
    return ocrWorker;
  }
  R.stop = async function () { if (ocrWorker) { try { await ocrWorker.terminate(); } catch (e) {} ocrWorker = null; } };

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
  function wordsFromOcr(data) {
    let ws = data.words;
    if (!ws || !ws.length) { ws = []; (data.blocks || []).forEach((b) => (b.paragraphs || []).forEach((p) => (p.lines || []).forEach((l) => (l.words || []).forEach((w) => ws.push(w))))); }
    return ws.map((w) => ({ t: w.text, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1, conf: w.confidence }));
  }

  /* y positions of long horizontal table borders in the rendered page (row separators) */
  function findHLines(ctx, w, h) {
    const d = ctx.getImageData(0, 0, w, h).data, x0 = Math.round(0.07 * w), x1 = Math.round(0.93 * w), step = 2;
    const need = 0.9 * Math.ceil((x1 - x0) / step), hits = [];
    for (let y = 0; y < h; y++) {
      let c = 0; const base = y * w * 4;
      for (let x = x0; x < x1; x += step) if (d[base + x * 4] < 246) c++;
      hits.push(c >= need);
    }
    const lines = []; let y = 0;
    while (y < h) {
      if (!hits[y]) { y++; continue; }
      let e = y; while (e + 1 < h && hits[e + 1]) e++;
      if (e - y + 1 <= 8) lines.push((y + e) / 2); // thin = a border; thick = a shaded band, ignore
      y = e + 1;
    }
    return lines;
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
    // 2) OCR
    const worker = await getOcr((m) => onStatus(m, 0.05));
    const pages = [];
    for (let i = 1; i <= n; i++) {
      onStatus("Reading page " + i + " of " + n + " (OCR – about 10–20 seconds per page)…", 0.08 + 0.85 * ((i - 1) / n));
      const page = await doc.getPage(i), vp = page.getViewport({ scale: 2.5 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const hl = findHLines(ctx, canvas.width, canvas.height);
      const res = await worker.recognize(canvas);
      pages.push({ w: canvas.width, h: canvas.height, words: wordsFromOcr(res.data), hlines: hl });
      canvas.width = canvas.height = 0;
    }
    R.lastPages = pages;
    onStatus("Understanding the table…", 0.97);
    await R.stop();
    const audit = root.UHParse.parseAuditWords(pages);
    audit.method = "ocr";
    return audit;
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
      const a = root.UHParse.parseAuditTable(rows);
      const bodyText = doc.body ? doc.body.innerText || doc.body.textContent : "";
      const dm = bodyText.match(/Degree\s*:\s*([^\n]+?)(?:\s{2,}|\n|$)/); if (dm) a.meta.degree = dm[1].trim();
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

  async function ocrPages(doc, onStatus) {
    const worker = await getOcr((m) => onStatus(m, 0.05)), pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      onStatus("Reading page " + i + " of " + doc.numPages + " (OCR – about 10–20 seconds per page)…", 0.08 + 0.85 * ((i - 1) / doc.numPages));
      const page = await doc.getPage(i), vp = page.getViewport({ scale: 2.5 }), canvas = document.createElement("canvas");
      canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
      const ctx = canvas.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const res = await worker.recognize(canvas);
      pages.push({ w: canvas.width, h: canvas.height, words: wordsFromOcr(res.data) });
      canvas.width = canvas.height = 0;
    }
    await R.stop();
    return pages;
  }

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
      if (pages.reduce((n, p) => n + p.words.length, 0) < 20) pages = await ocrPages(doc, onStatus); // scanned PDF
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
