import os
import uuid

from flask import Blueprint, current_app, jsonify, request, send_file
from flask_jwt_extended import get_jwt, get_jwt_identity, jwt_required
from werkzeug.utils import secure_filename

from extensions import db
from models import Application, Drive, StudentProfile, User
from utils import role_required

students_bp = Blueprint("students", __name__, url_prefix="/api/students")

ALLOWED_EXTENSIONS = {"pdf"}


def _allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


@students_bp.get("/me")
@jwt_required()
@role_required("student")
def get_my_profile():
    user = User.query.get(int(get_jwt_identity()))
    return jsonify(user.student_profile.to_dict())


@students_bp.patch("/me")
@jwt_required()
@role_required("student")
def update_my_profile():
    user = User.query.get(int(get_jwt_identity()))
    profile = user.student_profile
    data = request.get_json() or {}

    for field in ("full_name", "branch", "phone"):
        if field in data and data[field] is not None:
            setattr(profile, field, data[field])

    if "year" in data:
        profile.year = int(data["year"]) if data["year"] not in (None, "") else None
    if "cgpa" in data:
        profile.cgpa = float(data["cgpa"]) if data["cgpa"] not in (None, "") else None

    db.session.commit()
    return jsonify(profile.to_dict())


@students_bp.post("/me/resume")
@jwt_required()
@role_required("student")
def upload_resume():
    user = User.query.get(int(get_jwt_identity()))
    profile = user.student_profile

    if "resume" not in request.files:
        return jsonify({"error": "No resume file provided (field name: resume)"}), 400

    file = request.files["resume"]
    if not file or not file.filename:
        return jsonify({"error": "Empty filename"}), 400

    if not _allowed_file(file.filename):
        return jsonify({"error": "Only PDF resumes are allowed"}), 400

    upload_dir = current_app.config["UPLOAD_FOLDER"]
    os.makedirs(upload_dir, exist_ok=True)

    # Remove previous resume file if present
    if profile.resume_path:
        old_path = os.path.join(upload_dir, profile.resume_path)
        if os.path.isfile(old_path):
            try:
                os.remove(old_path)
            except OSError:
                pass

    original = secure_filename(file.filename)
    stored_name = f"student_{profile.id}_{uuid.uuid4().hex}.pdf"
    save_path = os.path.join(upload_dir, stored_name)
    file.save(save_path)

    profile.resume_path = stored_name
    profile.resume_original_name = original
    db.session.commit()

    return jsonify(
        {
            "message": "Resume uploaded",
            "profile": profile.to_dict(),
        }
    )


@students_bp.get("/me/resume")
@jwt_required()
@role_required("student")
def download_my_resume():
    user = User.query.get(int(get_jwt_identity()))
    return _send_resume(user.student_profile)


@students_bp.get("/<int:student_id>/resume")
@jwt_required()
@role_required("placement", "company")
def download_student_resume(student_id):
    profile = StudentProfile.query.get_or_404(student_id)
    claims = get_jwt()
    user = User.query.get(int(get_jwt_identity()))

    if claims.get("role") == "company":
        # Company may only download resumes of students who applied to their drives
        allowed = (
            Application.query.join(Drive)
            .filter(
                Application.student_id == student_id,
                Drive.company_id == user.company_profile.id,
            )
            .first()
        )
        if not allowed:
            return jsonify({"error": "No application to your drives"}), 403

    return _send_resume(profile)


def _send_resume(profile: StudentProfile):
    if not profile.resume_path:
        return jsonify({"error": "Resume not uploaded"}), 404

    upload_dir = current_app.config["UPLOAD_FOLDER"]
    path = os.path.join(upload_dir, profile.resume_path)
    if not os.path.isfile(path):
        return jsonify({"error": "Resume file missing on server"}), 404

    download_name = profile.resume_original_name or f"{profile.full_name}_resume.pdf"
    return send_file(path, mimetype="application/pdf", as_attachment=True, download_name=download_name)
