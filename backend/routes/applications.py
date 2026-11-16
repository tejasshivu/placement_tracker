import os
import uuid

from flask import Blueprint, current_app, jsonify, request, send_file
from flask_jwt_extended import get_jwt, get_jwt_identity, jwt_required
from werkzeug.utils import secure_filename

from extensions import db
from models import Application, Drive, User
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

    if drive.status != "scheduled":
        return jsonify({"error": "Drive is not open for applications yet"}), 400

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


@applications_bp.post("/<int:application_id>/offer")
@jwt_required()
@role_required("placement", "company")
def upload_offer(application_id):
    app_row = Application.query.get_or_404(application_id)
    claims = get_jwt()
    user = User.query.get(int(get_jwt_identity()))

    if claims.get("role") == "company" and app_row.drive.company_id != user.company_profile.id:
        return jsonify({"error": "Not your applicant"}), 403

    if app_row.status != "selected":
        return jsonify({"error": "Offer letter can be uploaded only for selected students"}), 400

    if "offer" not in request.files:
        return jsonify({"error": "No offer file provided (field name: offer)"}), 400

    file = request.files["offer"]
    if not file or not file.filename:
        return jsonify({"error": "Empty filename"}), 400
    if "." not in file.filename or file.filename.rsplit(".", 1)[1].lower() != "pdf":
        return jsonify({"error": "Only PDF offer letters are allowed"}), 400

    upload_dir = current_app.config["OFFER_UPLOAD_FOLDER"]
    os.makedirs(upload_dir, exist_ok=True)

    if app_row.offer_letter_path:
        old = os.path.join(upload_dir, app_row.offer_letter_path)
        if os.path.isfile(old):
            try:
                os.remove(old)
            except OSError:
                pass

    original = secure_filename(file.filename)
    stored = f"offer_app_{app_row.id}_{uuid.uuid4().hex}.pdf"
    file.save(os.path.join(upload_dir, stored))
    app_row.offer_letter_path = stored
    app_row.offer_original_name = original
    db.session.commit()
    return jsonify({"message": "Offer letter uploaded", "application": app_row.to_dict()})


@applications_bp.get("/<int:application_id>/offer")
@jwt_required()
def download_offer(application_id):
    app_row = Application.query.get_or_404(application_id)
    claims = get_jwt()
    user = User.query.get(int(get_jwt_identity()))
    role = claims.get("role")

    allowed = False
    if role == "placement":
        allowed = True
    elif role == "company" and user.company_profile and app_row.drive.company_id == user.company_profile.id:
        allowed = True
    elif role == "student" and user.student_profile and app_row.student_id == user.student_profile.id:
        allowed = True

    if not allowed:
        return jsonify({"error": "Forbidden"}), 403
    if not app_row.offer_letter_path:
        return jsonify({"error": "Offer letter not uploaded"}), 404

    path = os.path.join(current_app.config["OFFER_UPLOAD_FOLDER"], app_row.offer_letter_path)
    if not os.path.isfile(path):
        return jsonify({"error": "Offer file missing on server"}), 404

    download_name = app_row.offer_original_name or "offer_letter.pdf"
    return send_file(path, mimetype="application/pdf", as_attachment=True, download_name=download_name)
