(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const input = $("input");
  const output = $("output");
  const status = $("status");

  const btnEncode = $("btn-encode");
  const btnDecode = $("btn-decode");
  const btnClear  = $("btn-clear");

  const btnCopyIn  = $("btn-copy-in");
  const btnCopyOut = $("btn-copy-out");

  let mode = "base64";

  // Mode buttons
  const modeButtons = Array.from(document.querySelectorAll("[data-mode]"));
  modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      modeButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      mode = btn.dataset.mode || "base64";
      status.textContent = mode.toUpperCase();
    });
  });

  // Helpers: Base64 (UTF-8 safe)
  function b64EncodeUtf8(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }
  function b64DecodeUtf8(b64) {
    return decodeURIComponent(escape(atob(b64)));
  }

  // Generic hash
  async function hash(text, algo) {
    const buf = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest(algo, buf);
    return [...new Uint8Array(digest)]
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = "COPIED";
    } catch {
      status.textContent = "COPY FAILED";
    }
  }

  function setError() {
    status.textContent = "ERROR";
  }

  // Encode
  btnEncode.addEventListener("click", async () => {
    try {
      const text = input.value ?? "";

      if (mode === "base64") {
        output.value = b64EncodeUtf8(text);
        status.textContent = "ENCODED";
        return;
      }

      if (mode === "url") {
        output.value = encodeURIComponent(text);
        status.textContent = "ENCODED";
        return;
      }

      if (mode === "sha1") {
        output.value = await hash(text, "SHA-1");
        status.textContent = "HASHED";
        return;
      }

      if (mode === "sha256") {
        output.value = await hash(text, "SHA-256");
        status.textContent = "HASHED";
        return;
      }

      if (mode === "sha384") {
        output.value = await hash(text, "SHA-384");
        status.textContent = "HASHED";
        return;
      }

      if (mode === "sha512") {
        output.value = await hash(text, "SHA-512");
        status.textContent = "HASHED";
        return;
      }

      // Fallback
      output.value = "Unknown mode";
      setError();
    } catch {
      setError();
    }
  });

  // Decode
  btnDecode.addEventListener("click", () => {
    try {
      const text = input.value ?? "";

      if (mode === "base64") {
        output.value = b64DecodeUtf8(text);
        status.textContent = "DECODED";
        return;
      }

      if (mode === "url") {
        output.value = decodeURIComponent(text);
        status.textContent = "DECODED";
        return;
      }

      // Hashes are one-way
      if (mode.startsWith("sha")) {
        output.value = "Hash kann nicht decodiert werden";
        status.textContent = "NO-DECODE";
        return;
      }

      output.value = "Unknown mode";
      setError();
    } catch {
      setError();
    }
  });

  // Clear
  btnClear.addEventListener("click", () => {
    input.value = "";
    output.value = "";
    status.textContent = "READY";
  });

  // Copy
  btnCopyIn.addEventListener("click", () => copy(input.value ?? ""));
  btnCopyOut.addEventListener("click", () => copy(output.value ?? ""));

})();
