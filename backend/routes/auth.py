import secrets
from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request
from flask_jwt_extended import create_access_token, get_jwt_identity, jwt_required

from extensions import db
from models import CompanyProfile, StudentProfile, User

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@auth_bp.post("/register/student")
def register_student():
    data = request.get_json() or {}
    required = ["email", "password", "full_name"]
    if not all(data.get(k) for k in required):
        return jsonify({"error": "email, password, and full_name are required"}), 400

    if User.query.filter_by(email=data["email"].lower().strip()).first():
        return jsonify({"error": "Email already registered"}), 409

    user = User(email=data["email"].lower().strip(), role="student", is_approved=True)
    user.set_password(data["password"])
    db.session.add(user)
    db.session.flush()

    profile = StudentProfile(
        user_id=user.id,
        full_name=data["full_name"],
        branch=data.get("branch"),
        year=data.get("year"),
        cgpa=data.get("cgpa"),
        phone=data.get("phone"),
    )
    db.session.add(profile)
    db.session.commit()

    return jsonify({"message": "Student registered", "user": user.to_dict()}), 201


@auth_bp.post("/register/company")
def register_company():
    data = request.get_json() or {}
    required = ["email", "password", "company_name"]
    if not all(data.get(k) for k in required):
        return jsonify({"error": "email, password, and company_name are required"}), 400

    if User.query.filter_by(email=data["email"].lower().strip()).first():
        return jsonify({"error": "Email already registered"}), 409

    # Companies need placement approval before full access
    user = User(email=data["email"].lower().strip(), role="company", is_approved=False)
    user.set_password(data["password"])
    db.session.add(user)
    db.session.flush()

    profile = CompanyProfile(
        user_id=user.id,
        company_name=data["company_name"],
        website=data.get("website"),
        hr_contact=data.get("hr_contact"),
        description=data.get("description"),
    )
    db.session.add(profile)
    db.session.commit()

    return jsonify({"message": "Company registered; awaiting approval", "user": user.to_dict()}), 201


@auth_bp.post("/login")
def login():
    data = request.get_json() or {}
    email = (data.get("email") or "").lower().strip()
    password = data.get("password") or ""

    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return jsonify({"error": "Invalid email or password"}), 401

    token = create_access_token(
        identity=str(user.id),
        additional_claims={"role": user.role, "email": user.email},
    )
    return jsonify({"access_token": token, "user": user.to_dict()})


@auth_bp.get("/me")
@jwt_required()
def me():
    user = User.query.get(int(get_jwt_identity()))
    if not user:
        return jsonify({"error": "User not found"}), 404

    payload = user.to_dict()
    if user.role == "student" and user.student_profile:
        payload["profile"] = user.student_profile.to_dict()
    elif user.role == "company" and user.company_profile:
        payload["profile"] = user.company_profile.to_dict()
    return jsonify(payload)


@auth_bp.post("/forgot-password")
def forgot_password():
    """
    Beginner-friendly reset flow (no real email yet).
    In production you would email the reset link instead of returning the token.
    """
    data = request.get_json() or {}
    email = (data.get("email") or "").lower().strip()
    if not email:
        return jsonify({"error": "email is required"}), 400

    user = User.query.filter_by(email=email).first()

    # Same response shape whether or not the email exists (avoid account enumeration)
    generic = {
        "message": "If that email exists, a reset link is ready. Use it within 30 minutes.",
    }

    if not user:
        return jsonify(generic)

    token = secrets.token_urlsafe(32)
    user.reset_token = token
    user.reset_token_expires = datetime.now(timezone.utc) + timedelta(minutes=30)
    db.session.commit()

    # Dev/learning mode: return token so UI can show a reset link without email SMTP
    generic["dev_reset_token"] = token
    generic["dev_reset_path"] = f"/reset-password?token={token}"
    print(f"[password-reset] {email} -> {generic['dev_reset_path']}")
    return jsonify(generic)


@auth_bp.post("/reset-password")
def reset_password():
    data = request.get_json() or {}
    token = (data.get("token") or "").strip()
    new_password = data.get("new_password") or ""

    if not token or not new_password:
        return jsonify({"error": "token and new_password are required"}), 400
    if len(new_password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    user = User.query.filter_by(reset_token=token).first()
    if not user or not user.reset_token_expires:
        return jsonify({"error": "Invalid or expired reset link"}), 400

    expires = user.reset_token_expires
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        return jsonify({"error": "Reset link has expired. Request a new one."}), 400

    user.set_password(new_password)
    user.reset_token = None
    user.reset_token_expires = None
    db.session.commit()
    return jsonify({"message": "Password updated. You can log in now."})
