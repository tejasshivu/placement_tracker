import os

from flask import Flask, jsonify

from config import Config
from extensions import cors, db, jwt, migrate
from routes import register_blueprints


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
    os.makedirs(app.config["OFFER_UPLOAD_FOLDER"], exist_ok=True)

    db.init_app(app)
    jwt.init_app(app)
    migrate.init_app(app, db)
    origins = app.config.get("FRONTEND_ORIGIN") or "*"
    if origins != "*":
        origins = [o.strip() for o in origins.split(",") if o.strip()]
    cors.init_app(app, resources={r"/api/*": {"origins": origins}})

    register_blueprints(app)

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok", "app": "college-placement-api"})

    with app.app_context():
        import models  # noqa: F401

        db.create_all()
        _ensure_sqlite_columns()
        _normalize_branch_casing()

    return app


def _ensure_sqlite_columns():
    """Add new columns on existing SQLite DBs (create_all won't alter tables)."""
    uri = db.engine.url
    if uri.drivername != "sqlite":
        return

    with db.engine.connect() as conn:
        student_cols = {
            row[1] for row in conn.exec_driver_sql("PRAGMA table_info(student_profiles)").fetchall()
        }
        if "resume_original_name" not in student_cols:
            conn.exec_driver_sql(
                "ALTER TABLE student_profiles ADD COLUMN resume_original_name VARCHAR(255)"
            )
        if "resume_sha256" not in student_cols:
            conn.exec_driver_sql(
                "ALTER TABLE student_profiles ADD COLUMN resume_sha256 VARCHAR(64)"
            )

        user_cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(users)").fetchall()}
        if "reset_token" not in user_cols:
            conn.exec_driver_sql("ALTER TABLE users ADD COLUMN reset_token VARCHAR(64)")
        if "reset_token_expires" not in user_cols:
            conn.exec_driver_sql("ALTER TABLE users ADD COLUMN reset_token_expires DATETIME")

        drive_cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(drives)").fetchall()}
        if "status" not in drive_cols:
            conn.exec_driver_sql("ALTER TABLE drives ADD COLUMN status VARCHAR(30) DEFAULT 'scheduled'")
            conn.exec_driver_sql("UPDATE drives SET status = 'scheduled' WHERE status IS NULL")
        if "placement_note" not in drive_cols:
            conn.exec_driver_sql("ALTER TABLE drives ADD COLUMN placement_note TEXT")
        if "alternate_dates" not in drive_cols:
            conn.exec_driver_sql("ALTER TABLE drives ADD COLUMN alternate_dates VARCHAR(255)")
        if "drive_time" not in drive_cols:
            conn.exec_driver_sql("ALTER TABLE drives ADD COLUMN drive_time VARCHAR(5)")
        if "current_round" not in drive_cols:
            conn.exec_driver_sql(
                "ALTER TABLE drives ADD COLUMN current_round VARCHAR(30) DEFAULT 'registration'"
            )
            conn.exec_driver_sql(
                "UPDATE drives SET current_round = 'registration' WHERE current_round IS NULL"
            )
        if "round_details" not in drive_cols:
            conn.exec_driver_sql("ALTER TABLE drives ADD COLUMN round_details TEXT")

        app_cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(applications)").fetchall()}
        if "offer_letter_path" not in app_cols:
            conn.exec_driver_sql("ALTER TABLE applications ADD COLUMN offer_letter_path VARCHAR(255)")
        if "offer_original_name" not in app_cols:
            conn.exec_driver_sql(
                "ALTER TABLE applications ADD COLUMN offer_original_name VARCHAR(255)"
            )
        if "last_round_cleared" not in app_cols:
            conn.exec_driver_sql("ALTER TABLE applications ADD COLUMN last_round_cleared VARCHAR(30)")
        if "round_attendance" not in app_cols:
            conn.exec_driver_sql("ALTER TABLE applications ADD COLUMN round_attendance TEXT")

        company_cols = {
            row[1] for row in conn.exec_driver_sql("PRAGMA table_info(company_profiles)").fetchall()
        }
        if "hr_name" not in company_cols:
            conn.exec_driver_sql("ALTER TABLE company_profiles ADD COLUMN hr_name VARCHAR(120)")

        conn.commit()


def _normalize_branch_casing():
    """Collapse mixed-case branch values (CSE vs cse) to uppercase (SQLite + Postgres)."""
    from models import Drive, StudentProfile
    from utils import normalize_branch, normalize_branches_csv

    dirty = False
    for student in StudentProfile.query.filter(StudentProfile.branch.isnot(None)).all():
        fixed = normalize_branch(student.branch)
        if fixed != student.branch:
            student.branch = fixed
            dirty = True

    for drive in Drive.query.filter(Drive.eligible_branches.isnot(None)).all():
        fixed = normalize_branches_csv(drive.eligible_branches)
        if fixed != drive.eligible_branches:
            drive.eligible_branches = fixed
            dirty = True

    if dirty:
        db.session.commit()


app = create_app()

if __name__ == "__main__":
    # 0.0.0.0 = reachable from phone on the same Wi‑Fi (not only this PC)
    port = int(os.environ.get("PORT", "5000"))
    app.run(debug=os.getenv("FLASK_DEBUG", "1") == "1", host="0.0.0.0", port=port)
