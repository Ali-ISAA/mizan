# Import all models here so SQLAlchemy registers them with Base.metadata
from app.db.models.tenant import Tenant  # noqa: F401
from app.db.models.user import User  # noqa: F401
from app.db.models.project import Project  # noqa: F401
from app.db.models.document import MizanDocument  # noqa: F401
from app.db.models.analysis import AnalysisResult, RequirementItem, ComplianceMapping, GapItem  # noqa: F401
from app.db.models.activity import ActivityLog  # noqa: F401
from app.db.models.base_document import BaseDocument  # noqa: F401
