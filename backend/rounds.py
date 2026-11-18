"""Drive hiring rounds — shared labels and helpers."""

from __future__ import annotations

import json

DRIVE_ROUNDS = [
    ("registration", "Registration"),
    ("aptitude", "Aptitude test"),
    ("technical", "Technical interview"),
    ("gd", "Group discussion"),
    ("hr", "HR interview"),
    ("offer", "Offer"),
    ("completed", "Completed"),
]

DRIVE_ROUND_KEYS = {key for key, _ in DRIVE_ROUNDS}
DRIVE_ROUND_LABELS = {key: label for key, label in DRIVE_ROUNDS}

APP_STATUSES = {
    "applied",
    "shortlisted",
    "in_round",
    "waitlisted",
    "rejected",
    "selected",
}

APP_STATUS_LABELS = {
    "applied": "Applied",
    "shortlisted": "Shortlisted",
    "in_round": "In current round",
    "waitlisted": "Waitlisted",
    "rejected": "Rejected",
    "selected": "Selected",
}


def round_label(key: str | None) -> str:
    if not key:
        return "Registration"
    return DRIVE_ROUND_LABELS.get(key, key.replace("_", " ").title())


def parse_round_details(raw) -> dict:
    if not raw:
        return {}
    if isinstance(raw, dict):
        return raw
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except (TypeError, ValueError, json.JSONDecodeError):
        return {}


def dump_round_details(data: dict | None) -> str | None:
    if not data:
        return None
    return json.dumps(data)


def parse_attendance(raw) -> dict:
    if not raw:
        return {}
    if isinstance(raw, dict):
        return raw
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except (TypeError, ValueError, json.JSONDecodeError):
        return {}


def dump_attendance(data: dict | None) -> str | None:
    if not data:
        return None
    return json.dumps(data)


def merge_round_detail(existing: dict, round_key: str, patch: dict) -> dict:
    details = dict(existing or {})
    current = dict(details.get(round_key) or {})
    for field in ("date", "time", "venue", "meet_link", "notes"):
        if field in patch:
            value = patch[field]
            if value in (None, ""):
                current.pop(field, None)
            else:
                current[field] = str(value).strip()
    if current:
        details[round_key] = current
    elif round_key in details:
        del details[round_key]
    return details


def student_next_step(drive, application) -> str:
    """Human-readable next action for a student on a drive."""
    round_key = getattr(drive, "current_round", None) or "registration"
    status = application.status if application else None
    details = parse_round_details(getattr(drive, "round_details", None))
    info = details.get(round_key) or {}
    when_bits = []
    if info.get("date"):
        when_bits.append(info["date"])
    if info.get("time"):
        when_bits.append(info["time"])
    when = " · ".join(when_bits)
    where = info.get("venue") or info.get("meet_link") or ""

    if status == "rejected":
        return "Not selected for further rounds."
    if status == "selected" or round_key == "offer":
        if status == "selected":
            return "Selected — check for offer letter."
        return "Offer stage — wait for company update."
    if status == "waitlisted":
        return f"Waitlisted for {round_label(round_key)}." + (f" ({when})" if when else "")
    if round_key == "completed":
        return "Drive completed."
    if round_key == "registration":
        if not application:
            return "Registration open — you can apply."
        return "Applied — waiting for shortlist."

    prefix = f"Next: {round_label(round_key)}"
    if status in {"shortlisted", "in_round"}:
        prefix = f"You’re in {round_label(round_key)}"
    elif status == "applied":
        prefix = f"Applied — {round_label(round_key)} may open soon"

    extras = " · ".join(x for x in (when, where) if x)
    return f"{prefix}" + (f" · {extras}" if extras else "")
