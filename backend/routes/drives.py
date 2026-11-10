from datetime import date

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt, get_jwt_identity, jwt_required

from extensions import db
from models import CompanyProfile, Drive, User
from utils import role_required

drives_bp = Blueprint("drives", __name__, url_prefix="/api/drives")


@drives_bp.get("")
@jwt_required(optional=True)
def list_drives():
    query = Drive.query.filter_by(is_active=True).order_by(Drive.drive_date.asc())
    return jsonify([d.to_dict() for d in query.all()])


@drives_bp.get("/<int:drive_id>")
@jwt_required(optional=True)
def get_drive(drive_id):
    drive = Drive.query.get_or_404(drive_id)
    return jsonify(drive.to_dict())


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
    elif not company_id:
        return jsonify({"error": "company_id is required"}), 400

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
        min_cgpa=data.get("min_cgpa", 0.0),
        eligible_branches=data.get("eligible_branches"),
        description=data.get("description"),
    )
    db.session.add(drive)
    db.session.commit()
    return jsonify(drive.to_dict()), 201


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
    ):
        if field in data:
            setattr(drive, field, data[field])

    if "drive_date" in data:
        drive.drive_date = _parse_date(data["drive_date"])
    if "deadline" in data:
        drive.deadline = _parse_date(data["deadline"])

    db.session.commit()
    return jsonify(drive.to_dict())


def _parse_date(value):
    if not value:
        return None
    if isinstance(value, date):
        return value
    return date.fromisoformat(value)
