from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt, get_jwt_identity, jwt_required

from extensions import db
from models import Application, Drive, StudentProfile, User
from utils import role_required

applications_bp = Blueprint("applications", __name__, url_prefix="/api/applications")


@applications_bp.post("")
@jwt_required()
@role_required("student")
def apply():
    data = request.get_json() or {}
    drive_id = data.get("drive_id")
    if not drive_id:
        return jsonify({"error": "drive_id is required"}), 400

    user = User.query.get(int(get_jwt_identity()))
    student = user.student_profile
    drive = Drive.query.get_or_404(drive_id)

    if not drive.is_active:
        return jsonify({"error": "Drive is not active"}), 400

    if not student.resume_path:
        return jsonify({"error": "Upload your resume before applying"}), 400

    if drive.min_cgpa and student.cgpa is not None and student.cgpa < drive.min_cgpa:
        return jsonify({"error": f"Minimum CGPA required: {drive.min_cgpa}"}), 400

    if drive.eligible_branches and student.branch:
        allowed = [b.strip().lower() for b in drive.eligible_branches.split(",")]
        if student.branch.strip().lower() not in allowed:
            return jsonify({"error": "Your branch is not eligible for this drive"}), 400

    existing = Application.query.filter_by(student_id=student.id, drive_id=drive.id).first()
    if existing:
        return jsonify({"error": "Already applied"}), 409

    app_row = Application(student_id=student.id, drive_id=drive.id, status="applied")
    db.session.add(app_row)
    db.session.commit()
    return jsonify(app_row.to_dict()), 201


@applications_bp.get("/mine")
@jwt_required()
@role_required("student")
def my_applications():
    user = User.query.get(int(get_jwt_identity()))
    rows = Application.query.filter_by(student_id=user.student_profile.id).all()
    return jsonify([r.to_dict() for r in rows])


@applications_bp.get("/drive/<int:drive_id>")
@jwt_required()
@role_required("placement", "company")
def drive_applications(drive_id):
    drive = Drive.query.get_or_404(drive_id)
    claims = get_jwt()
    user = User.query.get(int(get_jwt_identity()))

    if claims.get("role") == "company" and drive.company_id != user.company_profile.id:
        return jsonify({"error": "Not your drive"}), 403

    rows = Application.query.filter_by(drive_id=drive_id).all()
    return jsonify([r.to_dict() for r in rows])


@applications_bp.patch("/<int:application_id>/status")
@jwt_required()
@role_required("placement", "company")
def update_status(application_id):
    app_row = Application.query.get_or_404(application_id)
    claims = get_jwt()
    user = User.query.get(int(get_jwt_identity()))

    if claims.get("role") == "company" and app_row.drive.company_id != user.company_profile.id:
        return jsonify({"error": "Not your applicant"}), 403

    data = request.get_json() or {}
    status = data.get("status")
    if status not in {"applied", "shortlisted", "rejected", "selected"}:
        return jsonify({"error": "Invalid status"}), 400

    app_row.status = status
    db.session.commit()
    return jsonify(app_row.to_dict())
