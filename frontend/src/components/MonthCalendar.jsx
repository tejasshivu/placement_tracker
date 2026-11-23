import { useMemo, useState } from "react";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_DRIVE_DOTS = 4;

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
 * Month calendar with optional per-drive colored marks.
 * Prefer `driveMarks` ({ iso: [{ id, color, title }] }) for distinct drive colors.
 */
export default function MonthCalendar({
  markedDates = {},
  mineDates = {},
  otherDates = {},
  blockedDates = {},
  driveMarks = null,
  selectedDate = null,
  onSelectDate,
  legend = "Marked days have one or more drives",
  showKindLegend = false,
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
      const marks = driveMarks?.[iso] || [];
      const mine = !!mineDates[iso] || false;
      const other = !!otherDates[iso] || false;
      const count =
        marks.length || markedDates[iso] || (mine || other ? 1 : 0);
      const weekday = new Date(cursor.year, cursor.month, day).getDay();
      list.push({
        type: "day",
        key: iso,
        day,
        iso,
        count,
        marks,
        isMine: mine,
        isOther: other,
        isBlocked: !!blockedDates[iso],
        isSunday: weekday === 0,
        isToday: iso === toKey(today.getFullYear(), today.getMonth(), today.getDate()),
        isSelected: iso === selectedDate,
      });
    }
    return list;
  }, [cursor, markedDates, mineDates, otherDates, blockedDates, driveMarks, selectedDate]);

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

  const useDriveColors = driveMarks && Object.keys(driveMarks).length > 0;

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
                !useDriveColors && cell.isMine ? "is-mine" : "",
                !useDriveColors && cell.isOther ? "is-other" : "",
                cell.isBlocked ? "is-blocked" : "",
                cell.isSunday ? "is-sunday" : "",
                cell.isToday ? "is-today" : "",
                cell.isSelected ? "is-selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onSelectDate?.(cell.iso)}
              title={
                cell.marks.length
                  ? cell.marks.map((m) => m.title).join(", ")
                  : cell.isSunday
                    ? "Sunday — college permission often required"
                    : undefined
              }
            >
              <span className="day-num">{cell.day}</span>
              {(cell.count > 0 || cell.isBlocked || cell.isSunday) && (
                <span className="day-marks">
                  {useDriveColors && cell.marks.length > 0 ? (
                    <>
                      {cell.marks.slice(0, MAX_DRIVE_DOTS).map((m) => (
                        <span
                          key={m.id}
                          className="day-dot drive-color-dot"
                          style={{ background: m.color }}
                          title={m.title}
                        />
                      ))}
                      {cell.marks.length > MAX_DRIVE_DOTS ? (
                        <span className="day-dot-more" title={`+${cell.marks.length - MAX_DRIVE_DOTS} more`}>
                          +{cell.marks.length - MAX_DRIVE_DOTS}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <>
                      {cell.isMine && <span className="day-dot mine-dot" title="Your drive" />}
                      {cell.isOther && (
                        <span className="day-dot other-dot" title="Other company" />
                      )}
                      {!cell.isMine && !cell.isOther && cell.count > 0 && (
                        <span className="day-dot" title={`${cell.count} drive(s)`} />
                      )}
                    </>
                  )}
                  {cell.isBlocked && (
                    <span className="day-dot blocked-dot" title="Blocked / exam" />
                  )}
                  {cell.isSunday && (
                    <span className="day-dot sunday-dot" title="Sunday" />
                  )}
                </span>
              )}
            </button>
          )
        )}
      </div>
      {showKindLegend ? (
        <p className="muted month-cal-legend">
          {useDriveColors ? (
            <>
              <span className="day-dot inline-dot drive-color-dot" style={{ background: "#2f7a4f" }} />
              <span className="day-dot inline-dot drive-color-dot" style={{ background: "#1d6a9a" }} />
              <span className="day-dot inline-dot drive-color-dot" style={{ background: "#c45c26" }} />{" "}
              Each drive has its own color
              {" · "}
            </>
          ) : (
            <>
              <span className="day-dot inline-dot mine-dot" /> Your drives
              {" · "}
              <span className="day-dot inline-dot other-dot" /> Other campus drives
              {" · "}
            </>
          )}
          <span className="day-dot inline-dot blocked-dot" /> Exam / blocked
          {" · "}
          <span className="day-dot inline-dot sunday-dot" /> Sunday
        </p>
      ) : (
        <p className="muted month-cal-legend">
          {useDriveColors ? (
            <>
              <span className="day-dot inline-dot drive-color-dot" style={{ background: "#2f7a4f" }} />
              <span className="day-dot inline-dot drive-color-dot" style={{ background: "#1d6a9a" }} />
              <span className="day-dot inline-dot drive-color-dot" style={{ background: "#c45c26" }} />{" "}
              Each drive has its own color
            </>
          ) : (
            <>
              <span className="day-dot inline-dot" /> {legend}
            </>
          )}
          {Object.keys(blockedDates).length > 0 && (
            <>
              {" · "}
              <span className="day-dot inline-dot blocked-dot" /> Exam / blocked
            </>
          )}
        </p>
      )}
    </div>
  );
}
