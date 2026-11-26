from datetime import date
from functools import wraps

from flask import jsonify
from flask_jwt_extended import get_jwt, verify_jwt_in_request


def ensure_not_past_date(value, *, field_name="Date"):
    """Raise ValueError if value is a date strictly before today (UTC date)."""
    if value in (None, ""):
        return None
    if isinstance(value, date):
        parsed = value
    else:
        parsed = date.fromisoformat(str(value)[:10])
    if parsed < date.today():
        raise ValueError(f"{field_name} cannot be in the past")
    return parsed


SUNDAY_COLLEGE_NOTE = "Sunday slot — confirm with college before approving."


def apply_sunday_college_flag(drive):
    """Tag Sunday drives so placement knows to check with college."""
    if drive.drive_date and drive.drive_date.weekday() == 6:
        note = (drive.placement_note or "").strip()
        if SUNDAY_COLLEGE_NOTE not in note:
            drive.placement_note = f"{note}\n{SUNDAY_COLLEGE_NOTE}".strip() if note else SUNDAY_COLLEGE_NOTE
    return drive


def normalize_branch(value):
    """Canonical course/branch code, e.g. 'cse' -> 'CSE'."""
    if value in (None, ""):
        return None
    return str(value).strip().upper()


def normalize_branches_csv(value):
    """Normalize comma-separated eligible branches to uppercase codes."""
    if value in (None, ""):
        return None
    parts = [normalize_branch(p) for p in str(value).split(",")]
    parts = [p for p in parts if p]
    return ",".join(parts) if parts else None


def parse_cgpa(value, *, field_name="CGPA", allow_none=True):
    """Parse CGPA / min CGPA. Raises ValueError with a user-facing message."""
    if value in (None, ""):
        if allow_none:
            return None
        raise ValueError(f"{field_name} is required")
    try:
        cgpa = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Invalid {field_name}") from exc
    if cgpa < 0 or cgpa > 10:
        raise ValueError(f"{field_name} must be between 0 and 10")
    return cgpa


def parse_phone(value, *, field_name="Phone", allow_none=True):
    """Parse Indian mobile: exactly 10 digits starting with 6–9 (or empty)."""
    if value in (None, ""):
        if allow_none:
            return None
        raise ValueError(f"{field_name} is required")
    text = str(value).strip()
    if not text.isdigit() or len(text) != 10:
        raise ValueError(f"{field_name} must be exactly 10 digits")
    if text[0] not in "6789":
        raise ValueError(f"{field_name} must start with 6, 7, 8, or 9")
    return text


def college_email_domains():
    """Allowed student email domains from env (comma-separated)."""
    from flask import current_app, has_app_context
    import os

    raw = ""
    if has_app_context():
        raw = current_app.config.get("COLLEGE_EMAIL_DOMAINS") or ""
    if not raw:
        raw = os.getenv("COLLEGE_EMAIL_DOMAINS", "college.edu")
    return [d.strip().lower() for d in str(raw).split(",") if d.strip()]


def ensure_college_email(email):
    """Require a college email domain for students. Raises ValueError if invalid."""
    text = (email or "").strip().lower()
    if "@" not in text:
        raise ValueError("Use your college email address")
    domain = text.rsplit("@", 1)[-1]
    allowed = college_email_domains()
    if domain not in allowed:
        if len(allowed) == 1:
            raise ValueError(f"Students must register with a @{allowed[0]} email")
        listed = ", ".join(f"@{d}" for d in allowed)
        raise ValueError(f"Students must register with a college email ({listed})")
    return text


def role_required(*roles):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            claims = get_jwt()
            if claims.get("role") not in roles:
                return jsonify({"error": "Forbidden for this role"}), 403
            return fn(*args, **kwargs)

        return wrapper

    return decorator
