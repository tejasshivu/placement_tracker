"""Create a default placement-team admin account."""

from app import create_app
from extensions import db
from models import User


def seed():
    app = create_app()
    with app.app_context():
        email = "placement@college.edu"
        existing = User.query.filter_by(email=email).first()
        if existing:
            print("Placement user already exists:", email)
            return

        user = User(email=email, role="placement", is_approved=True)
        user.set_password("placement123")
        db.session.add(user)
        db.session.commit()
        print("Created placement user")
        print("  email:   ", email)
        print("  password:", "placement123")


if __name__ == "__main__":
    seed()
