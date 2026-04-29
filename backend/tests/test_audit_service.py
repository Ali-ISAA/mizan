import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.asyncio
async def test_log_event_creates_activity_log():
    """log_event should add an ActivityLog to the DB session."""
    from app.services.audit import log_event

    mock_db = AsyncMock()
    mock_db.add = MagicMock()
    mock_db.commit = AsyncMock()

    tenant_id = uuid.uuid4()
    await log_event(
        db=mock_db,
        tenant_id=tenant_id,
        action="document_uploaded",
        severity="success",
        title="Document uploaded",
        description="test.pdf was uploaded",
        actor_email="ali@example.com",
    )

    mock_db.add.assert_called_once()
    added = mock_db.add.call_args[0][0]
    assert added.action == "document_uploaded"
    assert added.severity == "success"
    assert added.title == "Document uploaded"
    assert added.tenant_id == tenant_id
    mock_db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_log_event_never_raises():
    """log_event must swallow DB errors so the caller is never broken."""
    from app.services.audit import log_event

    mock_db = AsyncMock()
    mock_db.add = MagicMock(side_effect=Exception("DB exploded"))

    # Must NOT raise
    await log_event(
        db=mock_db,
        tenant_id=uuid.uuid4(),
        action="document_uploaded",
        severity="success",
        title="Document uploaded",
        description=None,
    )
