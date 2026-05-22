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


def test_prompts_module_exports():
    from app.services.article_extraction import prompts
    assert hasattr(prompts, "ANALYZE_SYSTEM")
    assert hasattr(prompts, "ANALYZE_USER")
    assert hasattr(prompts, "EXTRACT_SYSTEM")
    assert hasattr(prompts, "EXTRACT_USER")
    assert hasattr(prompts, "VALIDATE_SYSTEM")
    assert hasattr(prompts, "VALIDATE_USER")
    for name in ["ANALYZE_SYSTEM", "ANALYZE_USER", "EXTRACT_SYSTEM",
                 "EXTRACT_USER", "VALIDATE_SYSTEM", "VALIDATE_USER"]:
        value = getattr(prompts, name)
        assert isinstance(value, str) and len(value) > 50
