export const DRIVE_ROUNDS = [
  { key: "registration", label: "Registration" },
  { key: "aptitude", label: "Aptitude test" },
  { key: "technical", label: "Technical interview" },
  { key: "gd", label: "Group discussion" },
  { key: "hr", label: "HR interview" },
  { key: "offer", label: "Offer" },
  { key: "completed", label: "Completed" },
];

export const APP_STATUSES = [
  { key: "applied", label: "Applied" },
  { key: "shortlisted", label: "Shortlisted" },
  { key: "in_round", label: "In interview round" },
  { key: "waitlisted", label: "Waitlisted" },
  { key: "rejected", label: "Not selected" },
  { key: "selected", label: "Selected" },
];

export function roundLabel(key) {
  return DRIVE_ROUNDS.find((r) => r.key === key)?.label || key || "Registration";
}
