/** Format drive date + optional time for display. */
export function formatDriveWhen(drive, { fallback = "Date TBA" } = {}) {
  if (!drive?.drive_date) return fallback;
  const niceDate = formatNiceDate(drive.drive_date);
  if (!drive.drive_time) return niceDate;
  return `${niceDate} · ${formatNiceTime(drive.drive_time)}`;
}

export function formatNiceDate(iso) {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Always show 12-hour clock with AM/PM (e.g. 2:30 PM). */
export function formatNiceTime(hhmm) {
  if (!hhmm) return "";
  const [h, m] = String(hhmm).split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  const hour24 = h;
  const minute = Number.isNaN(m) ? 0 : m;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}
