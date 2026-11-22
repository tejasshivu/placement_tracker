/** Indian mobile: 10 digits starting with 6–9, or empty. */

export function sanitizePhoneInput(raw) {
  let digits = String(raw ?? "").replace(/\D/g, "").slice(0, 10);
  // Indian mobiles start with 6–9 — drop invalid leading digits (typing/paste)
  while (digits && !"6789".includes(digits[0])) {
    digits = digits.slice(1);
  }
  return digits.slice(0, 10);
}

export function parsePhone(raw) {
  if (raw === "" || raw == null) {
    return { ok: true, value: null };
  }
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length !== 10) {
    return { ok: false, error: "Phone number must be exactly 10 digits" };
  }
  if (!/^[6-9]/.test(digits)) {
    return { ok: false, error: "Mobile number must start with 6, 7, 8, or 9" };
  }
  return { ok: true, value: digits };
}

/** Digits only — blocks -, letters, spaces, etc. First digit must be 6–9. */
export function phoneKeyDown(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const nav = ["Backspace", "Delete", "Tab", "Escape", "Enter", "ArrowLeft", "ArrowRight", "Home", "End"];
  if (nav.includes(e.key)) return;
  if (e.key.length === 1 && !/[0-9]/.test(e.key)) {
    e.preventDefault();
    return;
  }
  const input = e.currentTarget;
  const digits = String(input?.value ?? "").replace(/\D/g, "");
  const selStart = input?.selectionStart ?? digits.length;
  const selEnd = input?.selectionEnd ?? digits.length;
  // Typing the first digit (empty field or replacing all) — only 6–9
  if (e.key.length === 1 && selStart === 0 && (digits.length === 0 || selEnd === digits.length)) {
    if (!/[6-9]/.test(e.key)) {
      e.preventDefault();
    }
  }
}
