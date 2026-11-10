from routes.applications import applications_bp
from routes.auth import auth_bp
from routes.drives import drives_bp
from routes.placement import placement_bp
from routes.students import students_bp


def register_blueprints(app):
    app.register_blueprint(auth_bp)
    app.register_blueprint(drives_bp)
    app.register_blueprint(applications_bp)
    app.register_blueprint(placement_bp)
    app.register_blueprint(students_bp)
