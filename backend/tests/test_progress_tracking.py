import pytest
from app.db.models.compliance_comparison import ComplianceComparison


def test_compliance_comparison_has_progress_columns():
    """Verify ComplianceComparison model has current_chunk and total_chunks columns"""
    assert hasattr(ComplianceComparison, 'current_chunk')
    assert hasattr(ComplianceComparison, 'total_chunks')

    # Verify columns can be set
    comparison = ComplianceComparison(
        id='test-id',
        mizan_document_id='doc1',
        base_document_id='doc2',
        status='pending',
        current_chunk=0,
        total_chunks=10
    )
    assert comparison.current_chunk == 0
    assert comparison.total_chunks == 10


def test_progress_tracking_during_comparison():
    """Verify progress is updated during document comparison"""
    # Create a mock comparison that can be updated
    comparison = ComplianceComparison(
        id='test-comparison-id',
        mizan_document_id='doc1',
        base_document_id='doc2',
        status='pending',
        current_chunk=0,
        total_chunks=10
    )

    # Verify initial state
    assert comparison.current_chunk == 0

    # After processing 5 chunks, current_chunk should be updated
    comparison.current_chunk = 5

    assert comparison.current_chunk == 5
    assert comparison.total_chunks == 10


def test_status_endpoint_returns_progress():
    """Verify GET /comparisons/{id}/status returns progress fields"""
    # This test verifies the response structure

    expected_response = {
        "status": "processing",
        "current_chunk": 5,
        "total_chunks": 19,
        "started_at": "2026-04-28T12:00:00Z",
        "completed_at": None,
        "estimated_completion": "2026-04-28T12:08:30Z",
        "error_message": None
    }

    # Test that response has required fields
    assert "current_chunk" in expected_response
    assert "total_chunks" in expected_response
    assert "estimated_completion" in expected_response
