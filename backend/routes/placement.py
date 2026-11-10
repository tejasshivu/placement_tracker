from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from extensions import db
from models import Announcement, CompanyProfile, User
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
