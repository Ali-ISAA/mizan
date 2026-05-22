from app.services.article_extraction.state import ExtractionState

def test_extraction_state_has_required_keys():
    state: ExtractionState = {
        "document_id": "abc",
        "document_type": "base",
        "markdown": "## Article 1:\nText",
        "analysis": {},
        "articles": [],
        "validated_articles": [],
        "error": None,
    }
    assert state["document_id"] == "abc"
    assert state["articles"] == []
