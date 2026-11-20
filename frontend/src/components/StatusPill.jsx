import { appStatusLabel, driveStatusLabel } from "../utils/statusLabels";

export default function StatusPill({ status, kind = "drive", label }) {
  const text =
    label ||
    (kind === "app" ? appStatusLabel(status) : driveStatusLabel(status));
  return <span className={`status-pill status-${status || "unknown"}`}>{text}</span>;
}
