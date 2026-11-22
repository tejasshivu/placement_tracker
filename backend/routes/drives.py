from datetime import date

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt, get_jwt_identity, jwt_required, verify_jwt_in_request

from extensions import db
from models import Announcement, Application, BlockedDate, CompanyProfile, Drive, User
from rounds import (
    DRIVE_ROUND_KEYS,
    dump_round_details,
    merge_round_detail,
    parse_round_details,
    round_label,
)
from scheduling import find_drive_conflicts
from utils import (
    apply_sunday_college_flag,
    ensure_not_past_date,
    normalize_branches_csv,
    role_required,
)

drives_bp = Blueprint("drives", __name__, url_prefix="/api/drives")

VALID_STATUSES = {"proposed", "needs_reschedule", "scheduled", "completed", "cancelled"}
CALENDAR_STATUSES = {"proposed", "needs_reschedule", "scheduled"}


@drives_bp.get("/campus-calendar")
@jwt_required()
@role_required("company", "placement")
def campus_calendar():
    """Campus drive calendar for planning — company sees own + others' dated drives."""
    claims = get_jwt()
    user = User.query.get(int(get_jwt_identity()))
    my_company_id = None
    if claims.get("role") == "company" and user and user.company_profile:
        my_company_id = user.company_profile.id

    rows = (
        Drive.query.filter(
            Drive.is_active.is_(True),
            Drive.drive_date.isnot(None),
            Drive.status.in_(tuple(CALENDAR_STATUSES)),
        )
        .order_by(Drive.drive_date.asc(), Drive.drive_time.asc())
        .all()
    )

    drives = []
    for drive in rows:
        payload = drive.to_dict()
        payload["is_mine"] = bool(my_company_id and drive.company_id == my_company_id)
        drives.append(payload)

    blocked = [
        b.to_dict()
        for b in BlockedDate.query.order_by(BlockedDate.start_date.asc()).all()
    ]
    return jsonify({"drives": drives, "blocked_dates": blocked})


@drives_bp.get("")
@jwt_required(optional=True)
def list_drives():
    from eligibility import drive_eligibility
    from models import Application

    verify_jwt_in_request(optional=True)
    claims = get_jwt() or {}
    role = claims.get("role")
    user = None
    if get_jwt_identity() is not None:
        user = User.query.get(int(get_jwt_identity()))

    query = Drive.query.filter_by(is_active=True)
    if role == "student" or not role:
        query = query.filter(Drive.status == "scheduled")
    elif role == "company":
        if user and user.company_profile:
            query = query.filter(Drive.company_id == user.company_profile.id)

    rows = query.order_by(
        Drive.drive_date.asc(),
        Drive.drive_time.asc(),
        Drive.created_at.desc(),
    ).all()
    # Companies need conflict hints on their proposals before placement approves
    include_conflicts = role in ("placement", "company")

    # Students only see drives they are eligible for (CGPA + branch),
    # plus any drive they already applied to.
    if role == "student" and user and user.student_profile:
        student = user.student_profile
        applied_ids = {
            row.drive_id
            for row in Application.query.filter_by(student_id=student.id).all()
        }
        payload = []
        for drive in rows:
            eligible, reasons = drive_eligibility(student, drive)
            item = drive.to_dict(include_conflicts=include_conflicts)
            item["eligible"] = eligible
            item["eligibility_reasons"] = reasons
            if eligible or drive.id in applied_ids:
                payload.append(item)
        return jsonify(payload)

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

    try:
        drive_time = _parse_time(data.get("drive_time"))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    from utils import parse_cgpa

    try:
        min_cgpa = parse_cgpa(data.get("min_cgpa", 0.0), field_name="Min CGPA", allow_none=False)
        drive_date = ensure_not_past_date(
            _parse_date(data.get("drive_date")), field_name="Preferred date"
        )
        deadline = ensure_not_past_date(
            _parse_date(data.get("deadline")), field_name="Deadline"
        )
        _validate_alternate_dates(data.get("alternate_dates"))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    drive = Drive(
        company_id=company_id,
        title=data["title"],
        role=data.get("role"),
        package_lpa=data.get("package_lpa"),
        location=data.get("location"),
        drive_date=drive_date,
        drive_time=drive_time,
        deadline=deadline,
        alternate_dates=data.get("alternate_dates"),
        min_cgpa=min_cgpa,
        eligible_branches=normalize_branches_csv(data.get("eligible_branches")),
        description=data.get("description"),
        status=status,
        current_round="registration",
        placement_note=data.get("placement_note"),
    )
    apply_sunday_college_flag(drive)
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

    if claims.get("role") == "company":
        if drive.status not in ("proposed", "needs_reschedule", "scheduled"):
            return jsonify({"error": "This drive can no longer be edited"}), 400
        proposal_fields = {
            "title",
            "role",
            "package_lpa",
            "location",
            "description",
            "drive_date",
            "drive_time",
            "deadline",
            "alternate_dates",
            "min_cgpa",
            "eligible_branches",
        }
        if drive.status == "scheduled" and (set(data.keys()) & proposal_fields):
            return jsonify(
                {
                    "error": "Scheduled drives: ask placement to reschedule to change slot details"
                }
            ), 400

    for field in (
        "title",
        "role",
        "package_lpa",
        "location",
        "description",
        "is_active",
    ):
        if field in data:
            setattr(drive, field, data[field])
    if "min_cgpa" in data:
        from utils import parse_cgpa

        try:
            drive.min_cgpa = parse_cgpa(
                data["min_cgpa"], field_name="Min CGPA", allow_none=False
            )
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
    if "eligible_branches" in data:
        drive.eligible_branches = normalize_branches_csv(data["eligible_branches"])

    try:
        if "drive_date" in data:
            drive.drive_date = ensure_not_past_date(
                _parse_date(data["drive_date"]), field_name="Drive date"
            )
            if claims.get("role") == "company" and drive.status == "needs_reschedule":
                drive.status = "proposed"

        if "drive_time" in data:
            drive.drive_time = _parse_time(data["drive_time"])
            if claims.get("role") == "company" and drive.status == "needs_reschedule":
                drive.status = "proposed"

        if "deadline" in data:
            drive.deadline = ensure_not_past_date(
                _parse_date(data["deadline"]), field_name="Deadline"
            )

        if "alternate_dates" in data:
            _validate_alternate_dates(data.get("alternate_dates"))
            drive.alternate_dates = data.get("alternate_dates")
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    round_changed = False
    if "current_round" in data:
        new_round = data.get("current_round") or "registration"
        if new_round not in DRIVE_ROUND_KEYS:
            return jsonify({"error": "Invalid current_round"}), 400
        if new_round != (drive.current_round or "registration"):
            drive.current_round = new_round
            round_changed = True

    if "round_detail" in data and isinstance(data["round_detail"], dict):
        round_key = data["round_detail"].get("round") or drive.current_round or "registration"
        if round_key not in DRIVE_ROUND_KEYS:
            return jsonify({"error": "Invalid round in round_detail"}), 400
        try:
            if data["round_detail"].get("date"):
                ensure_not_past_date(
                    _parse_date(data["round_detail"]["date"]), field_name="Round date"
                )
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        details = parse_round_details(drive.round_details)
        details = merge_round_detail(details, round_key, data["round_detail"])
        drive.round_details = dump_round_details(details)

    if "round_details" in data and isinstance(data["round_details"], dict):
        # Full replace/merge of provided keys
        details = parse_round_details(drive.round_details)
        try:
            for key, patch in data["round_details"].items():
                if key not in DRIVE_ROUND_KEYS:
                    continue
                if isinstance(patch, dict):
                    if patch.get("date"):
                        ensure_not_past_date(
                            _parse_date(patch["date"]), field_name="Round date"
                        )
                    details = merge_round_detail(details, key, patch)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        drive.round_details = dump_round_details(details)

    if claims.get("role") == "placement":
        if "placement_note" in data:
            drive.placement_note = data["placement_note"]
        if "status" in data:
            if data["status"] not in VALID_STATUSES:
                return jsonify({"error": "Invalid status"}), 400
            drive.status = data["status"]

    if round_changed:
        _on_round_change(drive, user)

    apply_sunday_college_flag(drive)
    db.session.commit()
    return jsonify(drive.to_dict(include_conflicts=True))


@drives_bp.post("/<int:drive_id>/advance-round")
@jwt_required()
@role_required("placement", "company")
def advance_round(drive_id):
    """Move shortlisted applicants into the current round (status=in_round)."""
    drive = Drive.query.get_or_404(drive_id)
    claims = get_jwt()
    user = User.query.get(int(get_jwt_identity()))
    if claims.get("role") == "company" and drive.company_id != user.company_profile.id:
        return jsonify({"error": "Not your drive"}), 403

    updated = (
        Application.query.filter(
            Application.drive_id == drive.id,
            Application.status.in_(("shortlisted", "in_round")),
        ).update({Application.status: "in_round"}, synchronize_session=False)
    )
    db.session.commit()
    return jsonify(
        {
            "message": f"Moved {updated} applicant(s) into {round_label(drive.current_round)}",
            "updated": updated,
            "drive": drive.to_dict(),
        }
    )


def _on_round_change(drive, actor):
    """Announce round change and nudge shortlisted students into the round."""
    label = round_label(drive.current_round)
    company = drive.company.company_name if drive.company else "Company"
    info = parse_round_details(drive.round_details).get(drive.current_round or "", {}) or {}
    bits = []
    if info.get("date"):
        bits.append(f"Date: {info['date']}")
    if info.get("time"):
        bits.append(f"Time: {info['time']}")
    if info.get("venue"):
        bits.append(f"Venue: {info['venue']}")
    if info.get("meet_link"):
        bits.append(f"Link: {info['meet_link']}")
    detail = (" · ".join(bits) + "\n") if bits else ""

    body = (
        f"{company} · {drive.title} is now in {label}.\n"
        f"{detail}"
        f"Check your application status for next steps."
    )
    db.session.add(
        Announcement(
            title=f"Round update: {drive.title} → {label}",
            body=body,
            created_by=actor.id if actor else None,
        )
    )

    if (drive.current_round or "") not in {"registration", "completed"}:
        Application.query.filter(
            Application.drive_id == drive.id,
            Application.status == "shortlisted",
        ).update({Application.status: "in_round"}, synchronize_session=False)


@drives_bp.post("/<int:drive_id>/schedule")
@jwt_required()
@role_required("placement")
def schedule_action(drive_id):
    """Placement coordination actions for drive dates."""
    drive = Drive.query.get_or_404(drive_id)
    data = request.get_json() or {}
    action = data.get("action")

    try:
        if action == "approve":
            if data.get("drive_date"):
                drive.drive_date = ensure_not_past_date(
                    _parse_date(data["drive_date"]), field_name="Drive date"
                )
            if "drive_time" in data:
                drive.drive_time = _parse_time(data.get("drive_time"))
            if not drive.drive_date:
                return jsonify({"error": "drive_date is required to approve"}), 400
            ensure_not_past_date(drive.drive_date, field_name="Drive date")
            if drive.drive_date.weekday() == 6 and not data.get("college_confirmed"):
                return jsonify(
                    {
                        "error": "Sunday drive: confirm with college first, then approve again.",
                        "needs_college_confirm": True,
                    }
                ), 400
            drive.status = "scheduled"
            if "placement_note" in data:
                drive.placement_note = data["placement_note"]
            apply_sunday_college_flag(drive)
        elif action == "request_reschedule":
            drive.status = "needs_reschedule"
            drive.placement_note = data.get("placement_note") or "Please propose another date."
            if data.get("drive_date"):
                drive.drive_date = ensure_not_past_date(
                    _parse_date(data["drive_date"]), field_name="Drive date"
                )
            if "drive_time" in data:
                drive.drive_time = _parse_time(data.get("drive_time"))
        elif action == "cancel":
            drive.status = "cancelled"
            if "placement_note" in data:
                drive.placement_note = data["placement_note"]
        else:
            return jsonify({"error": "action must be approve, request_reschedule, or cancel"}), 400
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

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
    return date.fromisoformat(str(value)[:10])


def _validate_alternate_dates(value):
    """Accept comma-separated YYYY-MM-DD or YYYY-MM-DDTHH:MM (or 'YYYY-MM-DD HH:MM')."""
    if value in (None, ""):
        return
    for part in str(value).split(","):
        part = part.strip()
        if not part:
            continue
        date_part = part
        time_part = None
        if "T" in part:
            date_part, time_part = part.split("T", 1)
        elif " " in part:
            date_part, time_part = part.split(" ", 1)
        ensure_not_past_date(_parse_date(date_part.strip()), field_name="Alternate date")
        if time_part:
            _parse_time(time_part.strip()[:5])


def _parse_time(value):
    """Normalize to HH:MM or None."""
    if value in (None, ""):
        return None
    text = str(value).strip()
    parts = text.split(":")
    if len(parts) < 2:
        raise ValueError("drive_time must be HH:MM")
    hour = int(parts[0])
    minute = int(parts[1])
    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        raise ValueError("drive_time out of range")
    return f"{hour:02d}:{minute:02d}"
