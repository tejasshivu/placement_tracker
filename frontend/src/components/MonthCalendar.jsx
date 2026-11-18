import { useMemo, useState } from "react";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pad(n) {
  return String(n).padStart(2, "0");
}

function toKey(year, monthIndex, day) {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

function monthLabel(year, monthIndex) {
  return new Date(year, monthIndex, 1).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });
}

/**
 * Simple month calendar.
 * @param {{
 *   markedDates?: Record<string, number>,
 *   blockedDates?: Record<string, boolean>,
 *   selectedDate?: string|null,
 *   onSelectDate?: (iso: string)=>void,
 *   legend?: string,
 * }} props
 */
export default function MonthCalendar({
  markedDates = {},
  blockedDates = {},
  selectedDate = null,
  onSelectDate,
  legend = "Marked days have one or more drives",
}) {
  const today = new Date();
  const [cursor, setCursor] = useState({
    year: today.getFullYear(),
    month: today.getMonth(),
  });

  const cells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const list = [];

    for (let i = 0; i < startPad; i += 1) {
      list.push({ type: "pad", key: `pad-${i}` });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const iso = toKey(cursor.year, cursor.month, day);
      list.push({
        type: "day",
        key: iso,
        day,
        iso,
        count: markedDates[iso] || 0,
        isBlocked: !!blockedDates[iso],
        isToday: iso === toKey(today.getFullYear(), today.getMonth(), today.getDate()),
        isSelected: iso === selectedDate,
      });
    }
    return list;
  }, [cursor, markedDates, blockedDates, selectedDate]);

  const prev = () => {
    setCursor((c) =>
      c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }
    );
  };

  const next = () => {
    setCursor((c) =>
      c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 }
    );
  };

  return (
    <div className="month-calendar">
      <div className="month-cal-header">
        <button type="button" className="btn ghost" onClick={prev} aria-label="Previous month">
          ‹
        </button>
        <strong>{monthLabel(cursor.year, cursor.month)}</strong>
        <button type="button" className="btn ghost" onClick={next} aria-label="Next month">
          ›
        </button>
      </div>
      <div className="month-cal-weekdays">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="month-cal-grid">
        {cells.map((cell) =>
          cell.type === "pad" ? (
            <div key={cell.key} className="month-cal-cell is-pad" />
          ) : (
            <button
              key={cell.key}
              type="button"
              className={[
                "month-cal-cell",
                cell.count ? "has-drive" : "",
                cell.isBlocked ? "is-blocked" : "",
                cell.isToday ? "is-today" : "",
                cell.isSelected ? "is-selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onSelectDate?.(cell.iso)}
            >
              <span className="day-num">{cell.day}</span>
              {(cell.count > 0 || cell.isBlocked) && (
                <span className="day-marks">
                  {cell.count > 0 && (
                    <span className="day-dot" title={`${cell.count} drive(s)`} />
                  )}
                  {cell.isBlocked && (
                    <span className="day-dot blocked-dot" title="Blocked / exam" />
                  )}
                </span>
              )}
            </button>
          )
        )}
      </div>
      <p className="muted month-cal-legend">
        <span className="day-dot inline-dot" /> {legend}
        {Object.keys(blockedDates).length > 0 && (
          <>
            {" · "}
            <span className="day-dot inline-dot blocked-dot" /> Exam / blocked
          </>
        )}
      </p>
    </div>
  );
}
