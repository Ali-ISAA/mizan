from app.db.models.activity import ActivityLog


def test_activity_log_has_audit_columns():
    """ActivityLog must have the 4 new audit columns."""
    log = ActivityLog(
        action="user_login",
        severity="success",
        title="User signed in",
        description="ali@example.com signed in",
        actor_email="ali@example.com",
    )
    assert log.severity == "success"
    assert log.title == "User signed in"
    assert log.description == "ali@example.com signed in"
    assert log.actor_email == "ali@example.com"
