/** Distinct hues for calendar drive marks (stable per drive id). */
const PALETTE = [
  "#2f7a4f",
  "#1d6a9a",
  "#c45c26",
  "#0f766e",
  "#b45309",
  "#be3a4c",
  "#4f6f52",
  "#2563a8",
  "#9a3412",
  "#0e7490",
  "#a16207",
  "#3f6212",
];

export function driveColor(id) {
  const n = Number(id);
  const idx = Number.isFinite(n) ? Math.abs(n) % PALETTE.length : 0;
  return PALETTE[idx];
}

/** Build { [isoDate]: [{ id, color, title }] } from drive list. */
export function buildDriveMarks(drives, { skipCancelled = true } = {}) {
  const map = {};
  (drives || []).forEach((drive) => {
    if (!drive?.drive_date) return;
    if (skipCancelled && drive.status === "cancelled") return;
    const iso = drive.drive_date;
    if (!map[iso]) map[iso] = [];
    map[iso].push({
      id: drive.id,
      color: driveColor(drive.id),
      title:
        drive.title ||
        drive.company_name ||
        (drive.is_mine ? "Your drive" : "Drive"),
    });
  });
  return map;
}
