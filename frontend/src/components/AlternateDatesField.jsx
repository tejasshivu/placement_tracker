import { isSunday, todayISO } from "../utils/dates";
import { formatNiceDate, formatNiceTime } from "../utils/driveWhen";

/** Slot stored as YYYY-MM-DD or YYYY-MM-DDTHH:MM (comma-separated). */
export function parseAlternateSlots(value) {
  if (!value) return [{ date: "", time: "" }];
  const parts = String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((part) => {
      if (part.includes("T")) {
        const [date, time] = part.split("T");
        return { date: date || "", time: (time || "").slice(0, 5) };
      }
      // legacy: "YYYY-MM-DD HH:MM" or date-only
      const bits = part.split(/\s+/);
      return { date: bits[0] || "", time: (bits[1] || "").slice(0, 5) };
    });
  return parts.length ? parts : [{ date: "", time: "" }];
}

export function joinAlternateSlots(slots) {
  return slots
    .filter((s) => s.date)
    .map((s) => (s.time ? `${s.date}T${s.time}` : s.date))
    .join(",");
}

export function formatAlternateSlot(part) {
  const slots = parseAlternateSlots(part);
  const s = slots[0];
  if (!s?.date) return "";
  const dateLabel = formatNiceDate(s.date);
  if (!s.time) return dateLabel;
  return `${dateLabel} · ${formatNiceTime(s.time)}`;
}

export function formatAlternateList(value) {
  if (!value) return "";
  return String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((part) => formatAlternateSlot(part))
    .filter(Boolean)
    .join(", ");
}

export default function AlternateDatesField({ value, onChange, min }) {
  const minDate = min || todayISO();
  const slots = parseAlternateSlots(value);

  const commit = (next) => onChange(joinAlternateSlots(next));

  const setAt = (index, patch) => {
    const copy = slots.map((s, i) => (i === index ? { ...s, ...patch } : s));
    commit(copy);
  };

  const addRow = () => {
    commit([...slots.filter((s) => s.date), { date: "", time: "" }]);
  };

  const removeAt = (index) => {
    const copy = slots.filter((_, i) => i !== index);
    commit(copy.length ? copy : [{ date: "", time: "" }]);
  };

  return (
    <div className="alt-dates-field">
      {slots.map((slot, index) => (
        <div key={`alt-${index}`} className="alt-dates-row">
          <input
            type="date"
            min={minDate}
            value={slot.date}
            onChange={(e) => setAt(index, { date: e.target.value })}
            aria-label={`Alternate date ${index + 1}`}
          />
          <input
            type="time"
            value={slot.time}
            onChange={(e) => setAt(index, { time: e.target.value })}
            aria-label={`Alternate time ${index + 1}`}
          />
          {slot.date ? (
            <span className="muted field-hint alt-dates-hint">
              {formatNiceDate(slot.date)}
              {slot.time ? ` · ${formatNiceTime(slot.time)}` : ""}
              {isSunday(slot.date) ? " · Sunday" : ""}
            </span>
          ) : null}
          {slots.length > 1 || slot.date || slot.time ? (
            <button
              type="button"
              className="btn ghost btn-xs"
              onClick={() => removeAt(index)}
              aria-label="Remove slot"
            >
              Remove
            </button>
          ) : null}
        </div>
      ))}
      <button type="button" className="btn ghost btn-xs" onClick={addRow}>
        Add another date & time
      </button>
    </div>
  );
}
