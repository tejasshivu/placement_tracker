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
    cors.init_app(app, resources={r"/api/*": {"origins": "*"}})

    register_blueprints(app)

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok", "app": "college-placement-api"})

    with app.app_context():
        import models  # noqa: F401

        db.create_all()
        _ensure_sqlite_columns()

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

        app_cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(applications)").fetchall()}
        if "offer_letter_path" not in app_cols:
            conn.exec_driver_sql("ALTER TABLE applications ADD COLUMN offer_letter_path VARCHAR(255)")
        if "offer_original_name" not in app_cols:
            conn.exec_driver_sql(
                "ALTER TABLE applications ADD COLUMN offer_original_name VARCHAR(255)"
            )

        conn.commit()


app = create_app()

if __name__ == "__main__":
    app.run(debug=True, port=5000)
