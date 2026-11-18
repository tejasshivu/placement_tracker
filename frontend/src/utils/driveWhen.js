/** Format drive date + optional time for display. */
export function formatDriveWhen(drive, { fallback = "TBA" } = {}) {
  if (!drive?.drive_date) return fallback;
  return drive.drive_time ? `${drive.drive_date} · ${drive.drive_time}` : drive.drive_date;
}
