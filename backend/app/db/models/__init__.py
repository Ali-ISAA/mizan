# Import all models here so SQLAlchemy registers them with Base.metadata
from app.db.models.tenant import Tenant  # noqa: F401
from app.db.models.user import User  # noqa: F401
from app.db.models.document import MizanDocument  # noqa: F401
from app.db.models.analysis import AnalysisResult, RequirementItem, ComplianceMapping, GapItem  # noqa: F401
from app.db.models.activity import ActivityLog  # noqa: F401
from app.db.models.base_document import BaseDocument  # noqa: F401
from app.db.models.base_document_chunk import BaseDocumentChunk  # noqa: F401
from app.db.models.mizan_document_chunk import MizanDocumentChunk  # noqa: F401
from app.db.models.compliance_comparison import ComplianceComparison  # noqa: F401
from app.db.models.compliance_report import ComplianceReport  # noqa: F401
from app.db.models.compliance_finding import ComplianceFinding  # noqa: F401
