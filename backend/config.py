import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = os.path.abspath(os.path.dirname(__file__))


def _database_uri():
    uri = (os.getenv("DATABASE_URL") or "").strip()
    if not uri:
        uri = f"sqlite:///{os.path.join(BASE_DIR, 'placement.db')}"
    # Render/Heroku sometimes give postgres:// — SQLAlchemy wants postgresql://
    if uri.startswith("postgres://"):
        uri = uri.replace("postgres://", "postgresql://", 1)
    return uri


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "jwt-dev-secret-change-me")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=12)

    SQLALCHEMY_DATABASE_URI = _database_uri()
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads", "resumes")
    OFFER_UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads", "offers")
    MAX_CONTENT_LENGTH = 5 * 1024 * 1024  # 5 MB files

    # Comma-separated frontend origins for CORS (e.g. https://ascendia.vercel.app)
    FRONTEND_ORIGIN = (os.getenv("FRONTEND_ORIGIN") or "*").strip() or "*"
