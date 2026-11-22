/** CGPA helpers — valid range is 0–10 inclusive. */

export function parseCgpa(raw) {
  if (raw === "" || raw == null) {
    return { ok: true, value: null };
  }
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 10) {
    return { ok: false, error: "CGPA must be between 0 and 10" };
  }
  return { ok: true, value: n };
}

/** Digits + one decimal only; strips minus and letters. Caps at 10. */
export function sanitizeCgpaInput(raw) {
  if (raw === "" || raw == null) return "";
  let text = String(raw).replace(/[^\d.]/g, "");
  const dot = text.indexOf(".");
  if (dot !== -1) {
    text = text.slice(0, dot + 1) + text.slice(dot + 1).replace(/\./g, "");
  }
  if (text === "" || text === ".") return text;
  const n = Number(text);
  if (Number.isFinite(n) && n > 10) return "10";
  return text;
}

/** Block -, +, e/E and other non-numeric keys while typing. */
export function cgpaKeyDown(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const nav = ["Backspace", "Delete", "Tab", "Escape", "Enter", "ArrowLeft", "ArrowRight", "Home", "End"];
  if (nav.includes(e.key)) return;
  if (e.key === "-" || e.key === "+" || e.key === "e" || e.key === "E") {
    e.preventDefault();
    return;
  }
  if (e.key.length === 1 && !/[0-9.]/.test(e.key)) {
    e.preventDefault();
  }
}
