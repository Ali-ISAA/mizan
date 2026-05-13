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
