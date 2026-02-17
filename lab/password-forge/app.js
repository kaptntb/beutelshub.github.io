(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const els = {
    out: $("out"),
    meter: $("meterFill"),
    strengthText: $("strengthText"),
    badge: $("statusBadge"),

    len: $("len"),
    lenLabel: $("lenLabel"),

    upper: $("opt-upper"),
    lower: $("opt-lower"),
    num: $("opt-num"),
    sym: $("opt-sym"),
    nolook: $("opt-nolook"),

    startLetter: $("opt-startletter"),
    requireAll: $("opt-requireall"),

    gen: $("btn-gen"),
    gen5: $("btn-gen-5"),
    copy: $("btn-copy"),
    dl: $("btn-download"),

    presetSafe: $("preset-safe"),
    presetMax: $("preset-max"),
    presetWords: $("preset-words"),
  };

  const SETS = {
    upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    lower: "abcdefghijklmnopqrstuvwxyz",
    num: "0123456789",
    sym: "!@#$%^&*()-_=+[]{};:,.?/<>~",
  };

  const CONFUSING = new Set(["O","0","o","I","l","1","S","5","B","8","Z","2"]);

  const randInt = (n) => Math.floor(Math.random() * n);
  const pick = (s) => s[randInt(s.length)];

  function filtered(set, noLook) {
    if (!noLook) return set;
    return [...set].filter(ch => !CONFUSING.has(ch)).join("");
  }

  function buildPools() {
    const pools = [];
    if (els.upper.checked) pools.push({ name:"upper", chars: filtered(SETS.upper, els.nolook.checked) });
    if (els.lower.checked) pools.push({ name:"lower", chars: filtered(SETS.lower, els.nolook.checked) });
    if (els.num.checked) pools.push({ name:"num", chars: filtered(SETS.num, els.nolook.checked) });
    if (els.sym.checked) pools.push({ name:"sym", chars: filtered(SETS.sym, els.nolook.checked) });

    // remove empty pools (can happen when filtering)
    return pools.filter(p => p.chars.length > 0);
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function generateOne() {
    const length = Number(els.len.value);
    const pools = buildPools();
    if (pools.length === 0) return "";

    const allChars = pools.map(p => p.chars).join("");

    const out = [];

    // Optional: require at least one char from each selected pool
    if (els.requireAll.checked) {
      for (const p of pools) out.push(pick(p.chars));
    }

    while (out.length < length) {
      out.push(pick(allChars));
    }

    // Optional: start with letter
    if (els.startLetter.checked) {
      const letters = (els.lower.checked ? filtered(SETS.lower, els.nolook.checked) : "")
                    + (els.upper.checked ? filtered(SETS.upper, els.nolook.checked) : "");
      if (letters.length > 0) out[0] = pick(letters);
    }

    return shuffle(out).slice(0, length).join("");
  }

  function entropyBits(pw) {
    const pools = buildPools();
    const N = pools.map(p => p.chars.length).reduce((a,b)=>a+b, 0);
    if (!pw || N <= 1) return 0;
    // rough entropy estimate: L * log2(N)
    return pw.length * Math.log2(N);
  }

  function strengthLabel(bits) {
    if (bits < 35) return ["WEAK", 20];
    if (bits < 55) return ["OK", 45];
    if (bits < 80) return ["STRONG", 70];
    return ["NUCLEAR", 100];
  }

  function renderStrength(pw) {
    const bits = entropyBits(pw);
    const [label, pct] = strengthLabel(bits);
    els.meter.style.width = `${pct}%`;
    els.strengthText.textContent = `${label} (${bits.toFixed(0)} bits)`;
    els.badge.textContent = label;
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      els.badge.textContent = "COPIED";
      setTimeout(() => els.badge.textContent = "READY", 700);
    } catch {
      els.badge.textContent = "NOCLIP";
      setTimeout(() => els.badge.textContent = "READY", 900);
    }
  }

  function downloadTxt(lines) {
    const blob = new Blob([lines.join("\n") + "\n"], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "passwords.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function regen() {
    const pw = generateOne();
    els.out.textContent = pw || "— wähle mindestens 1 Zeichensatz —";
    renderStrength(pw);
  }

  // Presets
  function presetSAFE() {
    els.len.value = "16";
    els.upper.checked = true;
    els.lower.checked = true;
    els.num.checked = true;
    els.sym.checked = true;
    els.nolook.checked = true;
    els.startLetter.checked = false;
    els.requireAll.checked = true;
    sync();
    regen();
  }
  function presetMAX() {
    els.len.value = "32";
    els.upper.checked = true;
    els.lower.checked = true;
    els.num.checked = true;
    els.sym.checked = true;
    els.nolook.checked = false;
    els.startLetter.checked = false;
    els.requireAll.checked = true;
    sync();
    regen();
  }
  function presetWORDS() {
    // “Words” without dictionary: no symbols, no confusing chars, longer
    els.len.value = "24";
    els.upper.checked = false;
    els.lower.checked = true;
    els.num.checked = true;
    els.sym.checked = false;
    els.nolook.checked = true;
    els.startLetter.checked = true;
    els.requireAll.checked = true;
    sync();
    regen();
  }

  function sync() {
    els.lenLabel.textContent = els.len.value;
  }

  // Wiring
  els.len.addEventListener("input", () => { sync(); regen(); });
  [els.upper,els.lower,els.num,els.sym,els.nolook,els.startLetter,els.requireAll]
    .forEach(x => x.addEventListener("change", regen));

  els.gen.addEventListener("click", regen);
  els.gen5.addEventListener("click", () => {
    const lines = Array.from({length:5}, () => generateOne()).filter(Boolean);
    els.out.textContent = lines[0] || "—";
    renderStrength(lines[0] || "");
    downloadTxt(lines);
  });

  els.copy.addEventListener("click", () => copyToClipboard(els.out.textContent));
  els.dl.addEventListener("click", () => {
    const lines = Array.from({length:10}, () => generateOne()).filter(Boolean);
    downloadTxt(lines);
  });

  els.presetSafe.addEventListener("click", presetSAFE);
  els.presetMax.addEventListener("click", presetMAX);
  els.presetWords.addEventListener("click", presetWORDS);

  // Init
  sync();
  regen();
})();
