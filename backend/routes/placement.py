import os

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy import case, func

from extensions import db
from datetime import date

from models import Announcement, Application, BlockedDate, CompanyProfile, Drive, StudentProfile, User
from utils import role_required

placement_bp = Blueprint("placement", __name__, url_prefix="/api/placement")


def _company_row(company: CompanyProfile):
    return {
        **company.to_dict(),
        "email": company.user.email if company.user else None,
        "is_approved": bool(company.user.is_approved) if company.user else False,
        "drives_count": Drive.query.filter_by(company_id=company.id).count(),
        "registered_at": (
            company.user.created_at.isoformat()
            if company.user and company.user.created_at
            else None
        ),
    }


def _company_detail(company: CompanyProfile):
    drives = (
        Drive.query.filter_by(company_id=company.id)
        .order_by(Drive.drive_date.asc(), Drive.drive_time.asc(), Drive.created_at.desc())
        .all()
    )
    return {
        **_company_row(company),
        "drives": [d.to_dict() for d in drives],
    }


@placement_bp.get("/companies/pending")
@jwt_required()
@role_required("placement")
def pending_companies():
    companies = (
        CompanyProfile.query.join(User)
        .filter(User.role == "company", User.is_approved.is_(False))
        .order_by(CompanyProfile.company_name.asc())
        .all()
    )
    return jsonify([_company_row(c) for c in companies])


@placement_bp.get("/companies/approved")
@jwt_required()
@role_required("placement")
def approved_companies():
    companies = (
        CompanyProfile.query.join(User)
        .filter(User.role == "company", User.is_approved.is_(True))
        .order_by(CompanyProfile.company_name.asc())
        .all()
    )
    return jsonify([_company_row(c) for c in companies])


@placement_bp.get("/companies/<int:company_id>")
@jwt_required()
@role_required("placement")
def get_company(company_id):
    company = CompanyProfile.query.get_or_404(company_id)
    return jsonify(_company_detail(company))


@placement_bp.post("/companies/<int:company_id>/approve")
@jwt_required()
@role_required("placement")
def approve_company(company_id):
    company = CompanyProfile.query.get_or_404(company_id)
    company.user.is_approved = True
    db.session.commit()
    return jsonify({"message": "Company approved", "company": _company_row(company)})


def _student_payload(student: StudentProfile):
    app_count = Application.query.filter_by(student_id=student.id).count()
    selected_count = Application.query.filter_by(
        student_id=student.id, status="selected"
    ).count()
    return {
        **student.to_dict(),
        "email": student.user.email,
        "is_approved": student.user.is_approved,
        "registered_at": (
            student.user.created_at.isoformat() if student.user.created_at else None
        ),
        "applications_count": app_count,
        "selected_count": selected_count,
    }


@placement_bp.get("/students")
@jwt_required()
@role_required("placement")
def list_students():
    """Compact list of registered students for placement team."""
    students = (
        StudentProfile.query.join(User)
        .order_by(StudentProfile.full_name.asc())
        .all()
    )
    # Keep list light; full details are fetched on demand
    from utils import normalize_branch

    return jsonify(
        [
            {
                "id": s.id,
                "full_name": s.full_name,
                "email": s.user.email,
                "branch": normalize_branch(s.branch),
                "has_resume": bool(s.resume_path),
                "applications_count": Application.query.filter_by(student_id=s.id).count(),
            }
            for s in students
        ]
    )


@placement_bp.get("/students/<int:student_id>")
@jwt_required()
@role_required("placement")
def get_student(student_id):
    student = StudentProfile.query.get_or_404(student_id)
    return jsonify(_student_payload(student))


@placement_bp.patch("/students/<int:student_id>")
@jwt_required()
@role_required("placement")
def update_student(student_id):
    student = StudentProfile.query.get_or_404(student_id)
    data = request.get_json() or {}

    from utils import normalize_branch, parse_cgpa, parse_phone

    if "full_name" in data and data["full_name"] is not None:
        student.full_name = data["full_name"]
    if "branch" in data and data["branch"] is not None:
        student.branch = normalize_branch(data["branch"])

    semester_value = data["semester"] if "semester" in data else data.get("year")
    if "semester" in data or "year" in data:
        student.semester = (
            int(semester_value) if semester_value not in (None, "") else None
        )

    try:
        if "cgpa" in data:
            student.cgpa = parse_cgpa(data["cgpa"])
        if "phone" in data:
            student.phone = parse_phone(data["phone"])
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    if "email" in data and data["email"]:
        new_email = data["email"].lower().strip()
        existing = User.query.filter(User.email == new_email, User.id != student.user_id).first()
        if existing:
            return jsonify({"error": "Email already in use"}), 409
        student.user.email = new_email

    db.session.commit()
    return jsonify(_student_payload(student))


@placement_bp.delete("/students/<int:student_id>")
@jwt_required()
@role_required("placement")
def delete_student(student_id):
    """Remove a student profile, login, applications, and stored resume/offers."""
    student = StudentProfile.query.get_or_404(student_id)
    user = student.user
    if not user or user.role != "student":
        return jsonify({"error": "Not a student account"}), 400

    name = student.full_name
    resume_dir = current_app.config["UPLOAD_FOLDER"]
    offer_dir = current_app.config["OFFER_UPLOAD_FOLDER"]

    if student.resume_path:
        resume_file = os.path.join(resume_dir, student.resume_path)
        if os.path.isfile(resume_file):
            try:
                os.remove(resume_file)
            except OSError:
                pass

    for app_row in list(student.applications or []):
        if app_row.offer_letter_path:
            offer_file = os.path.join(offer_dir, app_row.offer_letter_path)
            if os.path.isfile(offer_file):
                try:
                    os.remove(offer_file)
                except OSError:
                    pass

    # Cascades: student_profile + applications
    db.session.delete(user)
    db.session.commit()
    return jsonify({"message": f"Deleted student {name}", "id": student_id})


@placement_bp.get("/reports")
@jwt_required()
@role_required("placement")
def reports():
    """Aggregate placement metrics for the dashboard."""
    students = StudentProfile.query.count()
    companies_total = CompanyProfile.query.count()
    companies_approved = (
        CompanyProfile.query.join(User)
        .filter(User.role == "company", User.is_approved.is_(True))
        .count()
    )
    companies_pending = (
        CompanyProfile.query.join(User)
        .filter(User.role == "company", User.is_approved.is_(False))
        .count()
    )
    drives_total = Drive.query.count()
    drives_active = Drive.query.filter_by(is_active=True).count()
    applications_total = Application.query.count()

    status_rows = (
        db.session.query(Application.status, func.count(Application.id))
        .group_by(Application.status)
        .all()
    )
    by_status = {status: count for status, count in status_rows}
    for key in (
        "applied",
        "shortlisted",
        "in_round",
        "waitlisted",
        "selected",
        "rejected",
    ):
        by_status.setdefault(key, 0)

    company_rows = (
        db.session.query(
            CompanyProfile.id,
            CompanyProfile.company_name,
            func.count(func.distinct(Drive.id)).label("drives"),
            func.count(Application.id).label("applicants"),
            func.sum(case((Application.status == "selected", 1), else_=0)).label("selected"),
        )
        .outerjoin(Drive, Drive.company_id == CompanyProfile.id)
        .outerjoin(Application, Application.drive_id == Drive.id)
        .group_by(CompanyProfile.id, CompanyProfile.company_name)
        .order_by(func.count(Application.id).desc())
        .all()
    )

    by_company = [
        {
            "company_id": row.id,
            "company_name": row.company_name,
            "drives": int(row.drives or 0),
            "applicants": int(row.applicants or 0),
            "selected": int(row.selected or 0),
        }
        for row in company_rows
    ]

    # Group case-insensitively so CSE / cse / Cse count as one branch
    branch_key = func.upper(func.trim(StudentProfile.branch))
    branch_rows = (
        db.session.query(branch_key, func.count(Application.id))
        .join(Application, Application.student_id == StudentProfile.id)
        .group_by(branch_key)
        .order_by(func.count(Application.id).desc())
        .all()
    )
    by_branch = [
        {"branch": (branch or "Unknown"), "applications": count}
        for branch, count in branch_rows
    ]

    selected = by_status.get("selected", 0)
    selection_rate = (
        round((selected / applications_total) * 100, 1) if applications_total else 0.0
    )

    return jsonify(
        {
            "summary": {
                "students": students,
                "companies_total": companies_total,
                "companies_approved": companies_approved,
                "companies_pending": companies_pending,
                "drives_total": drives_total,
                "drives_active": drives_active,
                "applications_total": applications_total,
                "selection_rate_percent": selection_rate,
            },
            "by_status": by_status,
            "by_company": by_company,
            "by_branch": by_branch,
        }
    )


@placement_bp.get("/announcements")
@jwt_required()
def list_announcements():
    rows = Announcement.query.order_by(Announcement.created_at.desc()).all()
    return jsonify([r.to_dict() for r in rows])


@placement_bp.post("/announcements")
@jwt_required()
@role_required("placement")
def create_announcement():
    data = request.get_json() or {}
    if not data.get("title") or not data.get("body"):
        return jsonify({"error": "title and body are required"}), 400

    from flask_jwt_extended import get_jwt_identity

    row = Announcement(
        title=data["title"],
        body=data["body"],
        created_by=int(get_jwt_identity()),
    )
    db.session.add(row)
    db.session.commit()
    return jsonify(row.to_dict()), 201


@placement_bp.get("/blocked-dates")
@jwt_required()
@role_required("placement", "company")
def list_blocked_dates():
    rows = BlockedDate.query.order_by(BlockedDate.start_date.asc()).all()
    return jsonify([r.to_dict() for r in rows])


@placement_bp.post("/blocked-dates")
@jwt_required()
@role_required("placement")
def create_blocked_date():
    from flask_jwt_extended import get_jwt_identity

    data = request.get_json() or {}
    title = data.get("title")
    start = data.get("start_date")
    end = data.get("end_date")
    if not title or not start or not end:
        return jsonify({"error": "title, start_date, and end_date are required"}), 400

    start_date = date.fromisoformat(start)
    end_date = date.fromisoformat(end)
    if end_date < start_date:
        return jsonify({"error": "end_date cannot be before start_date"}), 400

    row = BlockedDate(
        title=title,
        start_date=start_date,
        end_date=end_date,
        reason=data.get("reason"),
        created_by=int(get_jwt_identity()),
    )
    db.session.add(row)
    db.session.commit()
    return jsonify(row.to_dict()), 201


@placement_bp.delete("/blocked-dates/<int:block_id>")
@jwt_required()
@role_required("placement")
def delete_blocked_date(block_id):
    row = BlockedDate.query.get_or_404(block_id)
    db.session.delete(row)
    db.session.commit()
    return jsonify({"message": "Blocked date removed"})
