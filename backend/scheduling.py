from models import BlockedDate, Drive


ACTIVE_SCHEDULE_STATUSES = {"proposed", "needs_reschedule", "scheduled"}


def _branch_set(value):
    if not value:
        return set()
    return {b.strip().lower() for b in value.split(",") if b.strip()}


def find_drive_conflicts(drive: Drive):
    """Return conflict warnings for a drive's current date/branches."""
    conflicts = []
    if not drive.drive_date:
        return conflicts

    same_day = (
        Drive.query.filter(
            Drive.id != drive.id,
            Drive.is_active.is_(True),
            Drive.drive_date == drive.drive_date,
            Drive.status.in_(tuple(ACTIVE_SCHEDULE_STATUSES)),
        )
        .all()
    )

    my_branches = _branch_set(drive.eligible_branches)
    for other in same_day:
        other_branches = _branch_set(other.eligible_branches)
        branch_overlap = sorted(my_branches & other_branches) if my_branches and other_branches else []
        overlaps_all = (not my_branches) or (not other_branches)
        conflicts.append(
            {
                "type": "drive_clash",
                "severity": "high" if (branch_overlap or overlaps_all) else "medium",
                "message": (
                    f"Conflicts with '{other.title}' ({other.company.company_name if other.company else 'company'}) "
                    f"on {other.drive_date.isoformat()}"
                    + (f" for branches: {', '.join(branch_overlap)}" if branch_overlap else "")
                ),
                "other_drive_id": other.id,
            }
        )

    blocked = BlockedDate.query.filter(
        BlockedDate.start_date <= drive.drive_date,
        BlockedDate.end_date >= drive.drive_date,
    ).all()
    for block in blocked:
        conflicts.append(
            {
                "type": "exam_or_blocked",
                "severity": "high",
                "message": (
                    f"Falls in blocked period '{block.title}' "
                    f"({block.start_date.isoformat()} to {block.end_date.isoformat()})"
                    + (f": {block.reason}" if block.reason else "")
                ),
                "blocked_date_id": block.id,
            }
        )

    return conflicts
