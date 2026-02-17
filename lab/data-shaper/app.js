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
    // try common delimiters: ; , tab |
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0).slice(0, 10);
    if (lines.length === 0) return ",";
    const cand = [",", ";", "\t", "|"];
    let best = { d: ",", score: -1 };

    for (const d of cand) {
      let score = 0;
      for (const ln of lines) {
        const parts = splitCSVLine(ln, d);
        // reward consistent split count
        score += parts.length;
      }
      if (score > best.score) best = { d, score };
    }
    return best.d;
  }

  function splitCSVLine(line, delim) {
    // simple CSV splitter with quotes support (handles "" inside quotes)
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

    // remove trailing empty lines
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
    if (headerMode === "auto") {
      // heuristic: if first row has any non-numeric strings and later rows look more numeric-ish
      headerUsed = guessHeader(rows);
    }

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

    // normalize umlauts, ß (basic)
    x = x
      .replaceAll("ä", "ae").replaceAll("ö", "oe").replaceAll("ü", "ue")
      .replaceAll("Ä", "ae").replaceAll("Ö", "oe").replaceAll("Ü", "ue")
      .replaceAll("ß", "ss");

    // remove quotes and weirds
    x = x.replaceAll('"', "").replaceAll("'", "");

    // to lower + underscore
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
    // handle "1.234,56" -> "1234.56"
    // and "1 234,56" -> "1234.56"
    let x = norm(s).trim();
    if (!x) return x;

    // remove spaces
    x = x.replace(/\s+/g, "");

    // detect both . and , present
    if (x.includes(".") && x.includes(",")) {
      // assume last separator is decimal; if comma is last, decimal comma
      const lastDot = x.lastIndexOf(".");
      const lastComma = x.lastIndexOf(",");
      if (lastComma > lastDot) {
        // decimal comma: remove dots (thousands), replace comma with dot
        x = x.replace(/\./g, "").replace(",", ".");
      } else {
        // decimal dot: remove commas (thousands)
        x = x.replace(/,/g, "");
      }
    } else if (x.includes(",") && !x.includes(".")) {
      // maybe decimal comma
      if (/^-?\d{1,3}(?:\.\d{3})*,\d+$/.test(x)) {
        x = x.replace(/\./g, "").replace(",", ".");
      } else if (/^-?\d+,\d+$/.test(x)) {
        x = x.replace(",", ".");
      }
    }
    return x;
  }

  function normalizeDate(s) {
    // supports: DD.MM.YYYY, DD/MM/YYYY, YYYY-MM-DD, YYYY/MM/DD
    const x = norm(s).trim();
    if (!x) return x;

    // yyyy-mm-dd
    let m = x.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
    if (m) {
      const yyyy = m[1];
      const mm = String(m[2]).padStart(2, "0");
      const dd = String(m[3]).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }

    // dd.mm.yyyy or dd/mm/yyyy
    m = x.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
    if (m) {
      const dd = String(m[1]).padStart(2, "0");
      const mm = String(m[2]).padStart(2, "0");
      const yyyy = m[3];
      return `${yyyy}-${mm}-${dd}`;
    }

    return x;
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

    if (doTrim) {
      headers = headers.map(h => trimCell(h));
      r
