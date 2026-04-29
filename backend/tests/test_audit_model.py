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


def test_activity_log_audit_column_defaults():
    """severity defaults to 'info' and title defaults to '' — verified via column metadata."""
    from sqlalchemy import inspect
    mapper = inspect(ActivityLog)
    col_defaults = {col.key: col.columns[0].default.arg for col in mapper.column_attrs if col.columns[0].default is not None}
    assert col_defaults.get("severity") == "info"
    assert col_defaults.get("title") == ""
