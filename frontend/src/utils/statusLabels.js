/** Human-friendly labels for drive + application statuses. */

const DRIVE_STATUS = {
  proposed: "Awaiting approval",
  needs_reschedule: "Needs new date",
  scheduled: "Open to students",
  completed: "Completed",
  cancelled: "Cancelled",
};

const APP_STATUS = {
  applied: "Applied",
  shortlisted: "Shortlisted",
  in_round: "In interview round",
  waitlisted: "Waitlisted",
  rejected: "Not selected",
  selected: "Selected",
};

export function driveStatusLabel(status) {
  if (!status) return "Unknown";
  return DRIVE_STATUS[status] || String(status).replaceAll("_", " ");
}

export function appStatusLabel(status, fallback) {
  if (!status) return fallback || "Unknown";
  return APP_STATUS[status] || fallback || String(status).replaceAll("_", " ");
}
