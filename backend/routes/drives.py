from datetime import date

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt, get_jwt_identity, jwt_required, verify_jwt_in_request

from extensions import db
from models import CompanyProfile, Drive, User
from scheduling import find_drive_conflicts
from utils import role_required

drives_bp = Blueprint("drives", __name__, url_prefix="/api/drives")

VALID_STATUSES = {"proposed", "needs_reschedule", "scheduled", "completed", "cancelled"}


@drives_bp.get("")
@jwt_required(optional=True)
def list_drives():
    verify_jwt_in_request(optional=True)
    claims = get_jwt() or {}
    role = claims.get("role")

    query = Drive.query.filter_by(is_active=True)
    if role == "student" or not role:
        query = query.filter(Drive.status == "scheduled")
    elif role == "company":
        user = User.query.get(int(get_jwt_identity()))
        if user and user.company_profile:
            query = query.filter(Drive.company_id == user.company_profile.id)

    rows = query.order_by(Drive.drive_date.asc(), Drive.created_at.desc()).all()
    include_conflicts = role == "placement"
    return jsonify([d.to_dict(include_conflicts=include_conflicts) for d in rows])


@drives_bp.get("/<int:drive_id>")
@jwt_required(optional=True)
def get_drive(drive_id):
    verify_jwt_in_request(optional=True)
    claims = get_jwt() or {}
    drive = Drive.query.get_or_404(drive_id)
    include_conflicts = claims.get("role") in {"placement", "company"}
    return jsonify(drive.to_dict(include_conflicts=include_conflicts))


@drives_bp.post("")
@jwt_required()
@role_required("placement", "company")
def create_drive():
    data = request.get_json() or {}
    claims = get_jwt()
    user = User.query.get(int(get_jwt_identity()))

    company_id = data.get("company_id")
    if claims.get("role") == "company":
        if not user.is_approved:
            return jsonify({"error": "Company not approved yet"}), 403
        company_id = user.company_profile.id
        status = "proposed"
    else:
        if not company_id:
            return jsonify({"error": "company_id is required"}), 400
        status = data.get("status") if data.get("status") in VALID_STATUSES else "scheduled"

    if not CompanyProfile.query.get(company_id):
        return jsonify({"error": "Company not found"}), 404

    if not data.get("title"):
        return jsonify({"error": "title is required"}), 400

    drive = Drive(
        company_id=company_id,
        title=data["title"],
        role=data.get("role"),
        package_lpa=data.get("package_lpa"),
        location=data.get("location"),
        drive_date=_parse_date(data.get("drive_date")),
        deadline=_parse_date(data.get("deadline")),
        alternate_dates=data.get("alternate_dates"),
        min_cgpa=data.get("min_cgpa", 0.0),
        eligible_branches=data.get("eligible_branches"),
        description=data.get("description"),
        status=status,
        placement_note=data.get("placement_note"),
    )
    db.session.add(drive)
    db.session.commit()
    return jsonify(drive.to_dict(include_conflicts=True)), 201


@drives_bp.patch("/<int:drive_id>")
@jwt_required()
@role_required("placement", "company")
def update_drive(drive_id):
    drive = Drive.query.get_or_404(drive_id)
    claims = get_jwt()
    user = User.query.get(int(get_jwt_identity()))

    if claims.get("role") == "company" and drive.company_id != user.company_profile.id:
        return jsonify({"error": "Not your drive"}), 403

    data = request.get_json() or {}
    for field in (
        "title",
        "role",
        "package_lpa",
        "location",
        "min_cgpa",
        "eligible_branches",
        "description",
        "is_active",
        "alternate_dates",
    ):
        if field in data:
            setattr(drive, field, data[field])

    if "drive_date" in data:
        drive.drive_date = _parse_date(data["drive_date"])
        # Company proposing a new date after reschedule request
        if claims.get("role") == "company" and drive.status == "needs_reschedule":
            drive.status = "proposed"

    if "deadline" in data:
        drive.deadline = _parse_date(data["deadline"])

    if claims.get("role") == "placement":
        if "placement_note" in data:
            drive.placement_note = data["placement_note"]
        if "status" in data:
            if data["status"] not in VALID_STATUSES:
                return jsonify({"error": "Invalid status"}), 400
            drive.status = data["status"]

    db.session.commit()
    return jsonify(drive.to_dict(include_conflicts=True))


@drives_bp.post("/<int:drive_id>/schedule")
@jwt_required()
@role_required("placement")
def schedule_action(drive_id):
    """Placement coordination actions for drive dates."""
    drive = Drive.query.get_or_404(drive_id)
    data = request.get_json() or {}
    action = data.get("action")

    if action == "approve":
        if data.get("drive_date"):
            drive.drive_date = _parse_date(data["drive_date"])
        if not drive.drive_date:
            return jsonify({"error": "drive_date is required to approve"}), 400
        drive.status = "scheduled"
        if "placement_note" in data:
            drive.placement_note = data["placement_note"]
    elif action == "request_reschedule":
        drive.status = "needs_reschedule"
        drive.placement_note = data.get("placement_note") or "Please propose another date."
        if data.get("drive_date"):
            drive.drive_date = _parse_date(data["drive_date"])
    elif action == "cancel":
        drive.status = "cancelled"
        if "placement_note" in data:
            drive.placement_note = data["placement_note"]
    else:
        return jsonify({"error": "action must be approve, request_reschedule, or cancel"}), 400

    db.session.commit()
    return jsonify(
        {
            "drive": drive.to_dict(include_conflicts=True),
            "conflicts": find_drive_conflicts(drive),
        }
    )


@drives_bp.get("/<int:drive_id>/conflicts")
@jwt_required()
@role_required("placement", "company")
def drive_conflicts(drive_id):
    drive = Drive.query.get_or_404(drive_id)
    claims = get_jwt()
    user = User.query.get(int(get_jwt_identity()))
    if claims.get("role") == "company" and drive.company_id != user.company_profile.id:
        return jsonify({"error": "Not your drive"}), 403
    return jsonify({"conflicts": find_drive_conflicts(drive)})


def _parse_date(value):
    if not value:
        return None
    if isinstance(value, date):
        return value
    return date.fromisoformat(value)
