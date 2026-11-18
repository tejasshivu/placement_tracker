from functools import wraps

from flask import jsonify
from flask_jwt_extended import get_jwt, verify_jwt_in_request


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
