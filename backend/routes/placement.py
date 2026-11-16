from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy import case, func

from extensions import db
from datetime import date

from models import Announcement, Application, BlockedDate, CompanyProfile, Drive, StudentProfile, User
from utils import role_required

placement_bp = Blueprint("placement", __name__, url_prefix="/api/placement")


@placement_bp.get("/companies/pending")
@jwt_required()
@role_required("placement")
def pending_companies():
    companies = (
        CompanyProfile.query.join(User)
        .filter(User.role == "company", User.is_approved.is_(False))
        .all()
    )
    return jsonify(
        [
            {**c.to_dict(), "email": c.user.email, "is_approved": c.user.is_approved}
            for c in companies
        ]
    )


@placement_bp.post("/companies/<int:company_id>/approve")
@jwt_required()
@role_required("placement")
def approve_company(company_id):
    company = CompanyProfile.query.get_or_404(company_id)
    company.user.is_approved = True
    db.session.commit()
    return jsonify({"message": "Company approved", "company": company.to_dict()})


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
    return jsonify(
        [
            {
                "id": s.id,
                "full_name": s.full_name,
                "email": s.user.email,
                "branch": s.branch,
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

    for field in ("full_name", "branch", "phone"):
        if field in data and data[field] is not None:
            setattr(student, field, data[field])

    if "year" in data:
        student.year = int(data["year"]) if data["year"] not in (None, "") else None
    if "cgpa" in data:
        student.cgpa = float(data["cgpa"]) if data["cgpa"] not in (None, "") else None

    if "email" in data and data["email"]:
        new_email = data["email"].lower().strip()
        existing = User.query.filter(User.email == new_email, User.id != student.user_id).first()
        if existing:
            return jsonify({"error": "Email already in use"}), 409
        student.user.email = new_email

    db.session.commit()
    return jsonify(_student_payload(student))


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
    for key in ("applied", "shortlisted", "selected", "rejected"):
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

    branch_rows = (
        db.session.query(StudentProfile.branch, func.count(Application.id))
        .join(Application, Application.student_id == StudentProfile.id)
        .group_by(StudentProfile.branch)
        .order_by(func.count(Application.id).desc())
        .all()
    )
    by_branch = [
        {"branch": branch or "Unknown", "applications": count}
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
