(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const ui = {
    badge: $("badge"),
    inBadge: $("inBadge"),
    rulesBadge: $("rulesBadge"),
    outBadge: $("outBadge"),

    fmt: $("fmt"),
    rows: $("rows"),
    cols: $("cols"),
    delim: $("delim"),

    input: $("input"),
    err: $("err"),

    btnParse: $("btn-parse"),
    btnClear: $("btn-clear"),
    btnSample: $("btn-sample"),

    delimiterMode: $("delimiterMode"),
    headerMode: $("headerMode"),
    previewLimit: $("previewLimit"),

    xlsxFile: $("xlsxFile"),

    rTrim: $("r-trim"),
    rDropEmptyRows: $("r-drop-empty-rows"),
    rDropEmptyCols: $("r-drop-empty-cols"),
    rDedupeCols: $("r-dedupe-cols"),
    rNormalizeHeaders: $("r-normalize-headers"),
    rFixNumbers: $("r-fix-numbers"),
    rFixDates: $("r-fix-dates"),
    rFixPhones: $("r-fix-phones"),
    phoneCountry: $("phoneCountry"),

    keepCols: $("keepCols"),
    renameCols: $("renameCols"),

    btnApply: $("btn-apply"),
    btnResetRules: $("btn-reset-rules"),

    btnCopyCSV: $("btn-copy-csv"),
    btnCopyTSV: $("btn-copy-tsv"),
    btnCopyJSON: $("btn-copy-json"),
    copyHint: $("copyHint"),

    tbl: $("tbl"),
    previewNote: $("previewNote"),
  };

  const state = {
    raw: { headers: [], rows: [] },     // parsed
    shaped: { headers: [], rows: [] },  // transformed
    format: "—",
    delimiter: "—",
    headerUsed: true,
    lastError: "",
  };

  function setBadge(text, kind = "ok") {
    ui.badge.textContent = text;
    ui.badge.classList.toggle("warn", kind === "warn");
  }

  function setError(msg) {
    state.lastError = msg || "";
    ui.err.textContent = state.lastError;
    ui.err.classList.toggle("warn", !!msg);
    if (msg) setBadge("ERROR", "warn");
  }

  function norm(s) {
    return (s ?? "").toString();
  }

  function trimCell(v) {
    if (v === null || v === undefined) return "";
    if (typeof v === "string") return v.trim();
    return String(v).trim();
  }

  function isRowEmpty(row) {
    return row.every((c) => trimCell(c) === "");
  }

  function isColEmpty(rows, colIdx) {
    for (const r of rows) {
      if (trimCell(r[colIdx]) !== "") return false;
    }
    return true;
  }

  function detectDelimiter(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0).slice(0, 10);
    if (lines.length === 0) return ",";
    const cand = [",", ";", "\t", "|"];
    let best = { d: ",", score: -1 };

    for (const d of cand) {
      let score = 0;
      for (const ln of lines) {
        const parts = splitCSVLine(ln, d);
        score += parts.length;
      }
      if (score > best.score) best = { d, score };
    }
    return best.d;
  }

  function splitCSVLine(line, delim) {
    const out = [];
    let cur = "";
    let inQ = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];

      if (ch === '"') {
        const next = line[i + 1];
        if (inQ && next === '"') {
          cur += '"';
          i++;
        } else {
          inQ = !inQ;
        }
        continue;
      }

      if (!inQ && ch === delim) {
        out.push(cur);
        cur = "";
        continue;
      }

      cur += ch;
    }
    out.push(cur);
    return out;
  }

  function parseDelimited(text, delimiter, headerMode) {
    const lines = text.split(/\r?\n/);

    while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();

    const rows = [];
    for (const ln of lines) {
      if (ln.trim() === "") continue;
      rows.push(splitCSVLine(ln, delimiter).map(x => x));
    }

    if (rows.length === 0) return { headers: [], rows: [], headerUsed: true };

    const maxLen = Math.max(...rows.map(r => r.length));
    for (const r of rows) while (r.length < maxLen) r.push("");

    let headerUsed = true;
    if (headerMode === "no") headerUsed = false;
    if (headerMode === "yes") headerUsed = true;
    if (headerMode === "auto") headerUsed = guessHeader(rows);

    let headers = [];
    let body = rows;

    if (headerUsed) {
      headers = rows[0].map((h, i) => (h?.toString?.() ?? "").trim() || `col_${i + 1}`);
      body = rows.slice(1);
    } else {
      headers = Array.from({ length: maxLen }, (_, i) => `col_${i + 1}`);
      body = rows;
    }

    return { headers, rows: body, headerUsed };
  }

  function guessHeader(rows) {
    if (rows.length < 2) return true;
    const r0 = rows[0];
    const r1 = rows[1];

    const scoreRow = (r) => {
      let score = 0;
      for (const c of r) {
        const t = trimCell(c);
        if (!t) continue;
        if (/^-?\d+([.,]\d+)?$/.test(t)) score -= 1;
        else score += 1;
      }
      return score;
    };
    return scoreRow(r0) >= scoreRow(r1);
  }

  function snakeCaseHeader(s) {
    let x = norm(s).trim();

    x = x
      .replaceAll("ä", "ae").replaceAll("ö", "oe").replaceAll("ü", "ue")
      .replaceAll("Ä", "ae").replaceAll("Ö", "oe").replaceAll("Ü", "ue")
      .replaceAll("ß", "ss");

    x = x.replaceAll('"', "").replaceAll("'", "");

    x = x.toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/_+/g, "_");

    return x || "col";
  }

  function dedupeHeaders(headers) {
    const seen = new Map();
    return headers.map((h) => {
      const key = h;
      const n = (seen.get(key) || 0) + 1;
      seen.set(key, n);
      if (n === 1) return key;
      return `${key}_${n}`;
    });
  }

  function parseRenameMap(text) {
    const map = new Map();
    const t = (text || "").trim();
    if (!t) return map;
    const pairs = t.split(",").map(s => s.trim()).filter(Boolean);
    for (const p of pairs) {
      const [a, b] = p.split(":").map(s => (s || "").trim());
      if (!a || !b) continue;
      map.set(a, b);
    }
    return map;
  }

  function parseKeepList(text) {
    const t = (text || "").trim();
    if (!t) return null;
    return t.split(",").map(s => s.trim()).filter(Boolean);
  }

  function normalizeNumber(s) {
    let x = norm(s).trim();
    if (!x) return x;

    x = x.replace(/\s+/g, "");

    if (x.includes(".") && x.includes(",")) {
      const lastDot = x.lastIndexOf(".");
      const lastComma = x.lastIndexOf(",");
      if (lastComma > lastDot) {
        x = x.replace(/\./g, "").replace(",", ".");
      } else {
        x = x.replace(/,/g, "");
      }
    } else if (x.includes(",") && !x.includes(".")) {
      if (/^-?\d{1,3}(?:\.\d{3})*,\d+$/.test(x)) {
        x = x.replace(/\./g, "").replace(",", ".");
      } else if (/^-?\d+,\d+$/.test(x)) {
        x = x.replace(",", ".");
      }
    }
    return x;
  }

  function normalizeDate(s) {
    const x = norm(s).trim();
    if (!x) return x;

    let m = x.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
    if (m) {
      const yyyy = m[1];
      const mm = String(m[2]).padStart(2, "0");
      const dd = String(m[3]).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }

    m = x.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
    if (m) {
      const dd = String(m[1]).padStart(2, "0");
      const mm = String(m[2]).padStart(2, "0");
      const yyyy = m[3];
      return `${yyyy}-${mm}-${dd}`;
    }

    return x;
  }

  // --- Phone normalization (DE default; conservative for other cases)
  function looksLikePhoneColumn(h) {
    const x = (h || "").toLowerCase();
    return ["phone","telefon","tel","mobile","handy","rufnummer","kontakt"].some(k => x.includes(k));
  }

  function normalizePhone(raw, countryISO2 = "DE") {
    let s = norm(raw).trim();
    if (!s) return s;

    s = s.replace(/^tel:\s*/i, "");
    s = s.replace(/[^\d+]/g, "");
    s = s.replace(/\+(?=.)/g, (m, off) => (off === 0 ? "+" : ""));

    if (s.startsWith("00")) s = "+" + s.slice(2);

    if (s.startsWith("+")) {
      const digits = s.slice(1).replace(/\D/g, "");
      if (digits.length < 7) return raw;
      return "+" + digits;
    }

    const cc = (countryISO2 || "DE").toUpperCase();

    if (cc === "DE") {
      let d = s.replace(/\D/g, "");
      if (d.length < 7) return raw;
      if (d.startsWith("0")) d = d.slice(1);
      if (d.startsWith("49") && d.length >= 9) return "+49" + d.slice(2);
      return "+49" + d;
    }

    return s.replace(/\D/g, "");
  }

  function applyPipeline(parsed) {
    let headers = [...parsed.headers];
    let rows = parsed.rows.map(r => [...r]);

    const doTrim = ui.rTrim.checked;
    const dropEmptyRows = ui.rDropEmptyRows.checked;
    const dropEmptyCols = ui.rDropEmptyCols.checked;
    const dedupeCols = ui.rDedupeCols.checked;
    const normalizeHeaders = ui.rNormalizeHeaders.checked;
    const fixNumbers = ui.rFixNumbers.checked;
    const fixDates = ui.rFixDates.checked;
    const fixPhones = ui.rFixPhones.checked;
    const phoneCC = (ui.phoneCountry.value || "DE").trim().toUpperCase();

    if (doTrim) {
      headers = headers.map(h => trimCell(h));
      rows = rows.map(r => r.map(c => trimCell(c)));
    }

    if (normalizeHeaders) {
      headers = headers.map(h => snakeCaseHeader(h));
    }

    if (dedupeCols) {
      headers = dedupeHeaders(headers);
    }

    const renameMap = parseRenameMap(ui.renameCols.value);
    if (renameMap.size) {
      headers = headers.map(h => renameMap.get(h) || h);
    }

    const keep = parseKeepList(ui.keepCols.value);
    if (keep && keep.length) {
      const idxs = [];
      const newHeaders = [];
      for (const k of keep) {
        const i = headers.indexOf(k);
        if (i >= 0) {
          idxs.push(i);
          newHeaders.push(headers[i]);
        }
      }
      headers = newHeaders;
      rows = rows.map(r => idxs.map(i => r[i] ?? ""));
    }

    if (dropEmptyRows) {
      rows = rows.filter(r => !isRowEmpty(r));
    }

    if (dropEmptyCols && headers.length) {
      const keepIdx = [];
      for (let i = 0; i < headers.length; i++) {
        if (!isColEmpty(rows, i)) keepIdx.push(i);
      }
      headers = keepIdx.map(i => headers[i]);
      rows = rows.map(r => keepIdx.map(i => r[i] ?? ""));
    }

    if (fixNumbers || fixDates || fixPhones) {
      const phoneCols = fixPhones
        ? headers.map((h, i) => looksLikePhoneColumn(h) ? i : -1).filter(i => i >= 0)
        : [];

      rows = rows.map(r => r.map((v, idx) => {
        let x = norm(v);
        if (doTrim) x = x.trim();
        if (fixNumbers) x = normalizeNumber(x);
        if (fixDates) x = normalizeDate(x);
        if (fixPhones && phoneCols.includes(idx)) {
          x = normalizePhone(x, phoneCC);
        }
        return x;
      }));
    }

    return { headers, rows };
  }

  function toDelimited(data, delimiter) {
    const d = delimiter;
    const esc = (v) => {
      const s = norm(v);
      const needs = s.includes('"') || s.includes("\n") || s.includes("\r") || s.includes(d);
      if (!needs) return s;
      return `"${s.replace(/"/g, '""')}"`;
    };

    const lines = [];
    lines.push(data.headers.map(esc).join(d));
    for (const r of data.rows) {
      lines.push(r.map(esc).join(d));
    }
    return lines.join("\n");
  }

  function toJSON(data) {
    const out = [];
    for (const r of data.rows) {
      const obj = {};
      data.headers.forEach((h, i) => {
        obj[h] = r[i] ?? "";
      });
      out.push(obj);
    }
    return JSON.stringify(out, null, 2);
  }

  function renderStats(format, delimiter, headers, rows) {
    ui.fmt.textContent = format;
    ui.delim.textContent = delimiter === "\t" ? "TAB" : delimiter;
    ui.cols.textContent = String(headers.length);
    ui.rows.textContent = String(rows.length);
  }

  function renderTable(data) {
    const limit = Number(ui.previewLimit.value);
    const headers = data.headers;
    const rows = data.rows.slice(0, limit);

    ui.tbl.innerHTML = "";

    if (!headers.length) {
      ui.previewNote.textContent = "Keine Daten geparst. Paste CSV/TSV oder lade XLSX.";
      return;
    }

    const thead = document.createElement("thead");
    const trh = document.createElement("tr");
    for (const h of headers) {
      const th = document.createElement("th");
      th.textContent = h;
      trh.appendChild(th);
    }
    thead.appendChild(trh);

    const tbody = document.createElement("tbody");
    for (const r of rows) {
      const tr = document.createElement("tr");
      for (let i = 0; i < headers.length; i++) {
        const td = document.createElement("td");
        td.textContent = r[i] ?? "";
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }

    ui.tbl.appendChild(thead);
    ui.tbl.appendChild(tbody);

    ui.previewNote.textContent =
      `Preview zeigt ${rows.length} von ${data.rows.length} Zeilen. Output per Copy-Buttons (kein Download nötig).`;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      ui.copyHint.textContent = "Copied ✅";
      setBadge("COPIED");
      setTimeout(() => setBadge("READY"), 650);
    } catch {
      ui.copyHint.textContent = "Clipboard nicht verfügbar (Browser/HTTPS?). Markieren & kopieren geht trotzdem.";
      setBadge("NOCLIP", "warn");
      setTimeout(() => setBadge("READY"), 900);
    }
  }

  function parseFromTextarea() {
    setError("");
    const t = ui.input.value || "";
    if (!t.trim()) {
      state.raw = { headers: [], rows: [] };
      state.shaped = { headers: [], rows: [] };
      renderStats("—", "—", [], []);
      renderTable(state.shaped);
      return;
    }

    const mode = ui.delimiterMode.value;
    const headerMode = ui.headerMode.value;

    let delim = ",";
    if (mode === "auto") delim = detectDelimiter(t);
    else if (mode === "tab") delim = "\t";
    else delim = mode;

    const parsed = parseDelimited(t, delim, headerMode);
    state.raw = { headers: parsed.headers, rows: parsed.rows };
    state.headerUsed = parsed.headerUsed;
    state.format = "CSV/TSV";
    state.delimiter = delim;

    applyAndRender();
  }

  function applyAndRender() {
    setError("");
    try {
      state.shaped = applyPipeline(state.raw);
      renderStats(state.format, state.delimiter, state.shaped.headers, state.shaped.rows);
      renderTable(state.shaped);
      ui.inBadge.textContent = state.format === "XLSX" ? "XLSX" : "PASTE";
      ui.outBadge.textContent = "PREVIEW";
    } catch (e) {
      setError(e?.message || String(e));
    }
  }

  async function parseXLSX(file) {
    setError("");
    if (!file) return;

    try {
      ui.inBadge.textContent = "XLSX…";
      setBadge("LOADING");
      await window.__loadXLSX();

      const buf = await file.arrayBuffer();
      const wb = window.XLSX.read(buf, { type: "array" });

      const first = wb.SheetNames[0];
      const ws = wb.Sheets[first];

      const aoa = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

      while (aoa.length && isRowEmpty(aoa[aoa.length - 1].map(String))) aoa.pop();
      if (!aoa.length) throw new Error("XLSX Sheet ist leer.");

      const maxLen = Math.max(...aoa.map(r => r.length));
      const rows = aoa.map(r => {
        const rr = r.map(v => (v === null || v === undefined) ? "" : String(v));
        while (rr.length < maxLen) rr.push("");
        return rr;
      });

      let headerUsed = true;
      if (ui.headerMode.value === "no") headerUsed = false;
      if (ui.headerMode.value === "yes") headerUsed = true;
      if (ui.headerMode.value === "auto") headerUsed = guessHeader(rows);

      let headers, body;
      if (headerUsed) {
        headers = rows[0].map((h, i) => trimCell(h) || `col_${i + 1}`);
        body = rows.slice(1);
      } else {
        headers = Array.from({ length: maxLen }, (_, i) => `col_${i + 1}`);
        body = rows;
      }

      state.raw = { headers, rows: body };
      state.format = "XLSX";
      state.delimiter = ","; // for stats
      state.headerUsed = headerUsed;

      applyAndRender();
      setBadge("READY");
    } catch (e) {
      setError(e?.message || String(e));
      setBadge("ERROR", "warn");
    }
  }

  function sampleCSV() {
    ui.input.value =
`Name;Telefon;Summe;Datum;Kommentar
  Alice ; 0170 1234567 ; 1.234,56 ; 12.01.2025 ; " ok "
Bob; +49 (160) 9988-7766 ; 99,5 ; 2025-02-03 ; "hi"
;;;;
Clara; 0049 151 22233344 ; 2.000 ; 03/02/2025 ;`;
    ui.delimiterMode.value = "auto";
    ui.headerMode.value = "auto";
    parseFromTextarea();
  }

  function resetRules() {
    ui.rTrim.checked = true;
    ui.rDropEmptyRows.checked = true;
    ui.rDropEmptyCols.checked = false;
    ui.rDedupeCols.checked = true;
    ui.rNormalizeHeaders.checked = true;
    ui.rFixNumbers.checked = false;
    ui.rFixDates.checked = false;
    ui.rFixPhones.checked = false;
    ui.phoneCountry.value = "DE";
    ui.keepCols.value = "";
    ui.renameCols.value = "";
  }

  // Wiring
  ui.btnParse.addEventListener("click", parseFromTextarea);

  ui.btnClear.addEventListener("click", () => {
    ui.input.value = "";
    ui.xlsxFile.value = "";
    setError("");
    state.raw = { headers: [], rows: [] };
    state.shaped = { headers: [], rows: [] };
    renderStats("—", "—", [], []);
    renderTable(state.shaped);
    setBadge("READY");
  });

  ui.btnSample.addEventListener("click", sampleCSV);

  ui.input.addEventListener("input", () => {
    window.clearTimeout(window.__ds_t);
    window.__ds_t = window.setTimeout(parseFromTextarea, 250);
  });

  ui.previewLimit.addEventListener("change", () => renderTable(state.shaped));
  ui.delimiterMode.addEventListener("change", parseFromTextarea);
  ui.headerMode.addEventListener("change", parseFromTextarea);

  ui.btnApply.addEventListener("click", applyAndRender);
  ui.btnResetRules.addEventListener("click", () => { resetRules(); applyAndRender(); });

  [
    ui.rTrim, ui.rDropEmptyRows, ui.rDropEmptyCols, ui.rDedupeCols,
    ui.rNormalizeHeaders, ui.rFixNumbers, ui.rFixDates, ui.rFixPhones
  ].forEach(x => x.addEventListener("change", applyAndRender));

  ui.phoneCountry.addEventListener("input", () => {
    window.clearTimeout(window.__ds_p);
    window.__ds_p = window.setTimeout(applyAndRender, 250);
  });

  ui.keepCols.addEventListener("input", () => {
    window.clearTimeout(window.__ds_k);
    window.__ds_k = window.setTimeout(applyAndRender, 300);
  });

  ui.renameCols.addEventListener("input", () => {
    window.clearTimeout(window.__ds_r);
    window.__ds_r = window.setTimeout(applyAndRender, 300);
  });

  ui.xlsxFile.addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) parseXLSX(f);
  });

  ui.btnCopyCSV.addEventListener("click", () => copyText(toDelimited(state.shaped, ",")));
  ui.btnCopyTSV.addEventListener("click", () => copyText(toDelimited(state.shaped, "\t")));
  ui.btnCopyJSON.addEventListener("click", () => copyText(toJSON(state.shaped)));

  // Init
  resetRules();
  renderStats("—", "—", [], []);
  renderTable({ headers: [], rows: [] });
  setBadge("READY");
})();
