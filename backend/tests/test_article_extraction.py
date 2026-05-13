from app.db.models.base_document_article import BaseDocumentArticle
from app.db.models.mizan_document_article import MizanDocumentArticle
import uuid


def test_base_document_article_instantiation():
    article = BaseDocumentArticle(
        base_document_id=uuid.uuid4(),
        article_index=0,
        article_number="1",
        article_text="Full text of article 1.",
    )
    assert article.article_number == "1"
    assert article.article_index == 0


def test_mizan_document_article_instantiation():
    article = MizanDocumentArticle(
        mizan_document_id=uuid.uuid4(),
        article_index=0,
        article_number="2.1",
        article_text="Full text of article 2.1.",
    )
    assert article.article_number == "2.1"


def test_deduplicate_keeps_first_occurrence():
    from app.tasks.extract_articles import _deduplicate_articles
    articles = [
        {"article_number": "1", "article_text": "First text"},
        {"article_number": "2", "article_text": "Second text"},
        {"article_number": "1", "article_text": "Duplicate — should be dropped"},
        {"article_number": "3", "article_text": "Third text"},
    ]
    result = _deduplicate_articles(articles)
    assert len(result) == 3
    assert result[0]["article_number"] == "1"
    assert result[0]["article_text"] == "First text"
    assert result[1]["article_number"] == "2"
    assert result[2]["article_number"] == "3"


def test_deduplicate_is_case_sensitive():
    from app.tasks.extract_articles import _deduplicate_articles
    articles = [
        {"article_number": "1", "article_text": "Lowercase"},
        {"article_number": "1", "article_text": "Also lowercase — duplicate"},
    ]
    result = _deduplicate_articles(articles)
    assert len(result) == 1


def test_build_batches_overlap():
    from app.tasks.extract_articles import _build_batches

    batch_size, overlap = 5, 2
    chunks = [{"text": str(i)} for i in range(20)]
    batches = _build_batches(chunks, batch_size=batch_size, overlap=overlap)
    # First batch: indices 0-4
    assert [c["text"] for c in batches[0]] == ["0", "1", "2", "3", "4"]
    # Second batch: last 2 of first (3,4) + next 5 (5,6,7,8,9) → indices 3-9
    assert [c["text"] for c in batches[1]] == ["3", "4", "5", "6", "7", "8", "9"]
    # Each batch has at most batch_size + overlap elements
    for batch in batches:
        assert len(batch) <= batch_size + overlap


def test_build_batches_fewer_than_batch_size():
    from app.tasks.extract_articles import _build_batches

    chunks = [{"text": "a"}, {"text": "b"}]
    batches = _build_batches(chunks, batch_size=15, overlap=2)
    assert len(batches) == 1
    assert len(batches[0]) == 2


def test_parse_llm_response_valid():
    from app.tasks.extract_articles import _parse_llm_extraction

    raw = '[{"article_number": "1", "article_text": "Content of article 1"}]'
    result = _parse_llm_extraction(raw)
    assert result is not None
    assert len(result) == 1
    assert result[0]["article_number"] == "1"


def test_parse_llm_response_strips_markdown():
    from app.tasks.extract_articles import _parse_llm_extraction

    raw = '```json\n[{"article_number": "2", "article_text": "Text"}]\n```'
    result = _parse_llm_extraction(raw)
    assert result is not None
    assert result[0]["article_number"] == "2"


def test_parse_llm_response_invalid_returns_none():
    from app.tasks.extract_articles import _parse_llm_extraction

    result = _parse_llm_extraction("not valid json at all")
    assert result is None
