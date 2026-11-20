"""Student ↔ drive eligibility checks (CGPA + branch)."""

from utils import normalize_branch


def drive_eligibility(student, drive):
    """
    Return (eligible: bool, reasons: list[str]).
    Empty reasons means eligible (or no hard constraints).
    """
    reasons = []
    if student is None:
        return False, ["Student profile required"]

    min_cgpa = drive.min_cgpa
    if min_cgpa not in (None, ""):
        try:
            min_cgpa = float(min_cgpa)
        except (TypeError, ValueError):
            min_cgpa = 0.0
        if min_cgpa > 0:
            if student.cgpa is None:
                reasons.append(f"Set CGPA in profile (min {min_cgpa})")
            elif float(student.cgpa) < min_cgpa:
                reasons.append(f"Minimum CGPA required: {min_cgpa}")

    raw_branches = (drive.eligible_branches or "").strip()
    if raw_branches:
        allowed = {
            normalize_branch(part)
            for part in raw_branches.split(",")
            if part and part.strip()
        }
        allowed.discard(None)
        student_branch = normalize_branch(student.branch)
        if not student_branch:
            reasons.append(f"Set branch in profile (open to: {raw_branches})")
        elif student_branch not in allowed:
            reasons.append(f"Your branch is not eligible (open to: {raw_branches})")

    return len(reasons) == 0, reasons
