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


def test_parse_json_array_valid():
    from app.services.article_extraction.nodes import _parse_json_array
    raw = '[{"articleNumber": "1", "articleText": "Content"}]'
    result = _parse_json_array(raw)
    assert result is not None
    assert len(result) == 1
    assert result[0]["articleNumber"] == "1"

def test_parse_json_array_strips_fences():
    from app.services.article_extraction.nodes import _parse_json_array
    raw = '```json\n[{"articleNumber": "2", "articleText": "X"}]\n```'
    result = _parse_json_array(raw)
    assert result is not None
    assert result[0]["articleNumber"] == "2"

def test_parse_json_array_invalid_returns_none():
    from app.services.article_extraction.nodes import _parse_json_array
    assert _parse_json_array("not json") is None

def test_parse_json_object_valid():
    from app.services.article_extraction.nodes import _parse_json_object
    raw = '{"document_type": "law", "estimated_count": 10}'
    result = _parse_json_object(raw)
    assert result["document_type"] == "law"
    assert result["estimated_count"] == 10

def test_parse_json_object_invalid_returns_none():
    from app.services.article_extraction.nodes import _parse_json_object
    assert _parse_json_object("[1,2,3]") is None  # array, not object


def test_graph_compiles():
    from app.services.article_extraction.graph import build_graph
    graph = build_graph()
    assert "fetch_markdown" in graph.nodes
    assert "analyze_document" in graph.nodes
    assert "extract_articles" in graph.nodes
    assert "validate_extraction" in graph.nodes
    assert "save_to_db" in graph.nodes
