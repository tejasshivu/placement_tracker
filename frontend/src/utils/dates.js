/** Local calendar helpers (YYYY-MM-DD). */

export function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** True if dateStr is strictly before today (local). Empty is ok. */
export function isPastDate(dateStr) {
  if (!dateStr) return false;
  return String(dateStr) < todayISO();
}

export function pastDateError(label = "Date") {
  return `${label} cannot be in the past`;
}

/** True if YYYY-MM-DD falls on Sunday (local). */
export function isSunday(dateStr) {
  if (!dateStr) return false;
  const d = new Date(`${String(dateStr).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  return d.getDay() === 0;
}

/**
 * Ask the user to confirm a Sunday slot needs college / placement OK.
 * Returns false if they cancel.
 */
export function confirmSundayWithCollege(dateStr) {
  if (!isSunday(dateStr)) return true;
  return window.confirm(
    "This date is a Sunday.\n\nCampus hiring on Sundays usually needs college permission.\n\nSubmit so the placement team can check with the college?"
  );
}
