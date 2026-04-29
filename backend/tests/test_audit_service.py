import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


def _make_mock_session():
    """Return a mock async context manager that behaves like AsyncSessionLocal()."""
    mock_session = AsyncMock()
    mock_session.add = MagicMock()
    mock_session.commit = AsyncMock()
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    # AsyncSessionLocal is called as a callable that returns the context manager
    mock_factory = MagicMock(return_value=mock_session)
    return mock_factory, mock_session


@pytest.mark.asyncio
async def test_log_event_creates_activity_log():
    """log_event must write an ActivityLog using its own isolated session."""
    mock_factory, mock_session = _make_mock_session()

    with patch("app.db.session.AsyncSessionLocal", mock_factory):
        # Re-import so the patched module is used inside log_event's local import
        import importlib
        import app.services.audit as audit_module
        importlib.reload(audit_module)
        from app.services.audit import log_event

        tenant_id = uuid.uuid4()
        await log_event(
            tenant_id=tenant_id,
            action="document_uploaded",
            severity="success",
            title="Document uploaded",
            description="test.pdf was uploaded",
            actor_email="ali@example.com",
        )

    mock_session.add.assert_called_once()
    added = mock_session.add.call_args[0][0]
    assert added.action == "document_uploaded"
    assert added.severity == "success"
    assert added.title == "Document uploaded"
    assert added.tenant_id == tenant_id
    mock_session.commit.assert_called_once()


@pytest.mark.asyncio
async def test_log_event_never_raises():
    """log_event must swallow exceptions so the caller is never broken."""
    mock_session = AsyncMock()
    mock_session.add = MagicMock(side_effect=Exception("DB exploded"))
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)
    mock_factory = MagicMock(return_value=mock_session)

    with patch("app.db.session.AsyncSessionLocal", mock_factory):
        import importlib
        import app.services.audit as audit_module
        importlib.reload(audit_module)
        from app.services.audit import log_event

        # Must NOT raise
        await log_event(
            tenant_id=uuid.uuid4(),
            action="test",
            severity="info",
            title="Test",
        )
