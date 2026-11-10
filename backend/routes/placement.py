from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy import case, func

from extensions import db
from models import Announcement, Application, CompanyProfile, Drive, StudentProfile, User
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
