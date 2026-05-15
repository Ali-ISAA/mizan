"""Analytics API — real compliance data for the Reports & Analytics page."""
from fastapi import APIRouter, Depends
from sqlalchemy import select, func, and_, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import require_user
from app.db.models.user import User
from app.db.models.document import MizanDocument
from app.db.models.compliance_comparison import ComplianceComparison
from app.db.models.compliance_report import ComplianceReport
from app.db.models.compliance_finding import ComplianceFinding
from app.db.session import get_db

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("")
async def get_analytics(
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all analytics data needed for the Reports & Analytics page."""
    tid = user.tenant_id

    # ── Overview counts ────────────────────────────────────────────────────────
    total_docs = await db.scalar(
        select(func.count(MizanDocument.id)).where(
            MizanDocument.tenant_id == tid,
            MizanDocument.processing_status == "completed",
            MizanDocument.deleted_at.is_(None),
        )
    ) or 0

    total_comparisons = await db.scalar(
        select(func.count(ComplianceComparison.id)).where(
            ComplianceComparison.tenant_id == tid,
            ComplianceComparison.status == "completed",
        )
    ) or 0

    # Average score and issue totals across latest comparison per document
    latest_subq = (
        select(
            ComplianceComparison.mizan_document_id.label("doc_id"),
            func.max(ComplianceComparison.created_at).label("max_ts"),
        )
        .where(
            ComplianceComparison.tenant_id == tid,
            ComplianceComparison.status == "completed",
        )
        .group_by(ComplianceComparison.mizan_document_id)
        .subquery()
    )

    latest_reports_q = await db.execute(
        select(ComplianceReport)
        .join(ComplianceComparison, ComplianceComparison.id == ComplianceReport.comparison_id)
        .join(
            latest_subq,
            and_(
                ComplianceComparison.mizan_document_id == latest_subq.c.doc_id,
                ComplianceComparison.created_at == latest_subq.c.max_ts,
            ),
        )
    )
    latest_reports = latest_reports_q.scalars().all()

    avg_score = round(sum(r.compliance_score for r in latest_reports) / len(latest_reports)) if latest_reports else 0
    active_issues = sum(r.total_findings for r in latest_reports)
    critical_issues = sum(r.critical_count for r in latest_reports)
    medium_issues = sum(r.medium_count for r in latest_reports)

    # ── Compliance trend by month ───────────────────────────────────────────────
    trend_rows = await db.execute(text("""
        SELECT
            TO_CHAR(cr.created_at, 'Mon YYYY')            AS month,
            DATE_TRUNC('month', cr.created_at)             AS month_ts,
            ROUND(AVG(cr.compliance_score))                AS avg_score,
            COUNT(cc.id)                                   AS comparisons
        FROM compliance_reports cr
        JOIN compliance_comparisons cc ON cc.id = cr.comparison_id
        WHERE cc.tenant_id = :tid AND cc.status = 'completed'
        GROUP BY TO_CHAR(cr.created_at, 'Mon YYYY'), DATE_TRUNC('month', cr.created_at)
        ORDER BY DATE_TRUNC('month', cr.created_at)
    """), {"tid": str(tid)})

    compliance_trend = [
        {"month": row.month, "score": int(row.avg_score), "comparisons": row.comparisons}
        for row in trend_rows.fetchall()
    ]

    # ── Risk distribution (findings breakdown) ─────────────────────────────────
    finding_counts_q = await db.execute(text("""
        SELECT cf.status, cf.severity, COUNT(*) AS cnt
        FROM compliance_findings cf
        JOIN compliance_comparisons cc ON cc.id = cf.comparison_id
        WHERE cc.tenant_id = :tid
        GROUP BY cf.status, cf.severity
    """), {"tid": str(tid)})

    status_counts: dict[str, int] = {}
    severity_counts: dict[str, int] = {}
    for row in finding_counts_q.fetchall():
        if row.status != "not_applicable":
            status_counts[row.status] = status_counts.get(row.status, 0) + row.cnt
            if row.severity != "none":
                severity_counts[row.severity] = severity_counts.get(row.severity, 0) + row.cnt

    risk_distribution = [
        {"name": "Compliant",      "value": status_counts.get("compliant", 0),    "color": "#10b981"},
        {"name": "Gap",            "value": status_counts.get("gap", 0),           "color": "#f59e0b"},
        {"name": "Conflict",       "value": status_counts.get("conflict", 0),      "color": "#ef4444"},
        {"name": "Missing",        "value": status_counts.get("missing", 0),       "color": "#dc2626"},
    ]
    risk_distribution = [r for r in risk_distribution if r["value"] > 0]

    # ── Top issues ─────────────────────────────────────────────────────────────
    top_issues_q = await db.execute(text("""
        SELECT cf.issue, cf.severity, COUNT(*) AS cnt
        FROM compliance_findings cf
        JOIN compliance_comparisons cc ON cc.id = cf.comparison_id
        WHERE cc.tenant_id = :tid
          AND cf.status NOT IN ('compliant', 'not_applicable')
          AND cf.issue != '' AND cf.issue IS NOT NULL
        GROUP BY cf.issue, cf.severity
        ORDER BY cnt DESC
        LIMIT 8
    """), {"tid": str(tid)})

    top_issues = [
        {"issue": row.issue, "severity": row.severity, "count": row.cnt}
        for row in top_issues_q.fetchall()
    ]

    # ── Per-document breakdown ─────────────────────────────────────────────────
    docs_q = await db.execute(text("""
        SELECT
            md.name                 AS doc_name,
            cr.compliance_score     AS score,
            cr.total_findings       AS issues,
            cr.critical_count       AS critical,
            cr.medium_count         AS medium,
            bd.filename             AS regulation,
            cc.completed_at         AS completed_at
        FROM compliance_reports cr
        JOIN compliance_comparisons cc ON cc.id = cr.comparison_id
        JOIN (
            SELECT mizan_document_id AS doc_id, MAX(created_at) AS max_ts
            FROM compliance_comparisons
            WHERE tenant_id = :tid AND status = 'completed'
            GROUP BY mizan_document_id
        ) latest ON latest.doc_id = cc.mizan_document_id AND latest.max_ts = cc.created_at
        JOIN mizan_documents md ON md.id = cc.mizan_document_id
        JOIN base_documents bd ON bd.id = cc.base_document_id
        ORDER BY cr.compliance_score DESC
    """), {"tid": str(tid)})

    documents = [
        {
            "name": row.doc_name,
            "score": row.score,
            "issues": row.issues,
            "critical": row.critical,
            "medium": row.medium,
            "regulation": row.regulation,
            "completed_at": row.completed_at.isoformat() if row.completed_at else None,
        }
        for row in docs_q.fetchall()
    ]

    # ── Regulation breakdown ───────────────────────────────────────────────────
    reg_q = await db.execute(text("""
        SELECT
            bd.filename                         AS regulation,
            ROUND(AVG(cr.compliance_score))     AS avg_score,
            COUNT(DISTINCT cc.mizan_document_id) AS doc_count,
            SUM(cr.total_findings)              AS total_issues,
            SUM(cr.critical_count)              AS critical_total
        FROM compliance_reports cr
        JOIN compliance_comparisons cc ON cc.id = cr.comparison_id
        JOIN base_documents bd ON bd.id = cc.base_document_id
        WHERE cc.tenant_id = :tid AND cc.status = 'completed'
        GROUP BY bd.filename
        ORDER BY avg_score ASC
    """), {"tid": str(tid)})

    regulation_breakdown = [
        {
            "regulation": row.regulation,
            "avg_score": int(row.avg_score),
            "doc_count": row.doc_count,
            "total_issues": row.total_issues,
            "critical_total": row.critical_total,
        }
        for row in reg_q.fetchall()
    ]

    return {
        "overview": {
            "avg_score": avg_score,
            "total_documents": total_docs,
            "total_comparisons": total_comparisons,
            "active_issues": active_issues,
            "critical_issues": critical_issues,
            "medium_issues": medium_issues,
        },
        "compliance_trend": compliance_trend,
        "risk_distribution": risk_distribution,
        "severity_distribution": [
            {"name": "Critical", "value": severity_counts.get("critical", 0), "color": "#dc2626"},
            {"name": "Medium",   "value": severity_counts.get("medium", 0),   "color": "#f59e0b"},
            {"name": "Low",      "value": severity_counts.get("low", 0),      "color": "#10b981"},
        ],
        "top_issues": top_issues,
        "documents": documents,
        "regulation_breakdown": regulation_breakdown,
    }
