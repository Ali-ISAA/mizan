"""Policy-first compliance report agent.

For every company policy article (MizanDocumentArticle), identifies which
regulation articles it addresses and evaluates how correctly it implements
each requirement. Saves one ComplianceFinding per policy article.

Data saved:
  - ComplianceFinding per policy article (doc_b_section=policy_article_number,
    doc_a_section=law_articles_addressed, status, severity, issue,
    recommendation, coverage_score, gaps, policy_sections)
  - ComplianceReport with aggregate scores and LLM narratives
"""
from __future__ import annotations

import json
import logging
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.base_document import BaseDocument
from app.db.models.base_document_article import BaseDocumentArticle
from app.db.models.compliance_comparison import ComplianceComparison
from app.db.models.compliance_finding import ComplianceFinding
from app.db.models.compliance_report import ComplianceReport
from app.db.models.document import MizanDocument
from app.db.models.mizan_document_article import MizanDocumentArticle
from app.services import llm

logger = logging.getLogger(__name__)

_POLICY_ARTICLE_TEXT_MAX = 1000
_REG_ARTICLE_PREVIEW = 150

# ── Compliance → DB status mapping ────────────────────────────────────────────

_COMPLIANCE_TO_STATUS = {
    "compliant": "compliant",
    "partially_compliant": "gap",
    "non_compliant": "gap",
    "not_applicable": "not_applicable",
}

_COMPLIANCE_TO_SEVERITY = {
    "compliant": "none",
    "partially_compliant": "medium",
    "non_compliant": "critical",
    "not_applicable": "none",
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _strip_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        first_newline = text.find("\n")
        if first_newline != -1:
            text = text[first_newline + 1:]
        if text.endswith("```"):
            text = text[: text.rfind("```")]
    return text.strip()


def _build_regulation_index(regulation_articles: list[BaseDocumentArticle]) -> str:
    """Compact index of all regulation articles for the LLM to search through."""
    lines = [f"[{a.article_number}] {a.article_text[:_REG_ARTICLE_PREVIEW]}" for a in regulation_articles]
    return "\n".join(lines)


def _fallback_policy_result(article: MizanDocumentArticle) -> dict[str, Any]:
    return {
        "addressed_articles": [],
        "overall_compliance_score": 0,
        "overall_status": "non_compliant",
        "summary_violations": ["Analysis failed — manual review required"],
        "summary_recommendation": "",
    }


# ── LLM prompts ───────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are a senior legal compliance auditor. Given one section of a company policy document and a list of labour law articles, identify which law articles this policy section addresses and evaluate how correctly it implements each requirement.

Compliance definitions:
- "compliant": the policy correctly meets or exceeds the law requirement (numbers, thresholds, procedures match or are more generous)
- "partially_compliant": the policy addresses this requirement but has specific gaps, incorrect thresholds, or missing sub-requirements
- "non_compliant": the policy contradicts the law or gives less than the law requires
- "not_applicable": this policy section does not address any specific employer obligation from the law

Return ONLY a JSON object with exactly these keys:
{"addressed_articles": [{"law_article": "<article number as string>", "compliance_status": "compliant"|"partially_compliant"|"non_compliant", "compliance_score": <integer 0-100>, "violations": ["<specific way policy fails>"], "recommendation": "<one corrective action>"}], "overall_compliance_score": <integer 0-100>, "overall_status": "compliant"|"partially_compliant"|"non_compliant"|"not_applicable", "summary_violations": ["<key issues>"], "summary_recommendation": "<main corrective action>"}

If the section addresses no specific law requirement, set overall_status to "not_applicable" and addressed_articles to [].
No markdown, no extra keys.\
"""

_NARRATIVE_SYSTEM = """\
You are a compliance analyst generating a board-ready report.
Return ONLY a JSON object with exactly three keys:
- executive_summary: 3-4 sentences covering overall score, worst areas, and verdict
- risk_assessment: 2-3 sentences on top legal/operational risks
- top_action_items: JSON array of up to 10 objects, each {"priority": int, "article": str, "action": str}
No markdown, no extra keys.\
"""


async def _evaluate_policy_section(
    policy_article: MizanDocumentArticle,
    regulation_index: str,
) -> dict[str, Any]:
    user_content = (
        f"POLICY SECTION [{policy_article.article_number}]:\n"
        f"{policy_article.article_text[:_POLICY_ARTICLE_TEXT_MAX]}\n\n"
        f"LABOUR LAW ARTICLES (find which ones this policy section addresses):\n"
        f"{regulation_index}"
    )
    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]
    try:
        raw = await llm.chat(messages, temperature=0, max_tokens=2048)
    except Exception as exc:
        logger.warning("LLM call failed for policy section '%s': %s", policy_article.article_number, exc)
        return _fallback_policy_result(policy_article)

    clean = _strip_fences(raw)
    try:
        parsed = json.loads(clean)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    logger.warning("Unparseable JSON for policy section '%s': %s…", policy_article.article_number, raw[:200])
    return _fallback_policy_result(policy_article)


# ── Agent ─────────────────────────────────────────────────────────────────────

class ComplianceReportAgent:
    """Policy-first compliance analysis agent.

    Evaluates each company policy article against all regulation articles,
    saving one ComplianceFinding per policy article and a ComplianceReport.
    """

    async def run(
        self,
        comparison_id: uuid.UUID,
        db: AsyncSession,
    ) -> None:
        from datetime import datetime

        # ── Fetch context ────────────────────────────────────────────────────
        comparison = await db.get(ComplianceComparison, comparison_id)
        mizan_doc: MizanDocument = await db.get(MizanDocument, comparison.mizan_document_id)
        base_doc: BaseDocument = await db.get(BaseDocument, comparison.base_document_id)

        reg_result = await db.execute(
            select(BaseDocumentArticle)
            .where(BaseDocumentArticle.base_document_id == comparison.base_document_id)
            .order_by(BaseDocumentArticle.article_index)
        )
        regulation_articles = list(reg_result.scalars().all())

        policy_result = await db.execute(
            select(MizanDocumentArticle)
            .where(MizanDocumentArticle.mizan_document_id == comparison.mizan_document_id)
            .order_by(MizanDocumentArticle.article_index)
        )
        policy_articles = list(policy_result.scalars().all())

        logger.info(
            "ComplianceReportAgent: evaluating %d policy sections against %d regulation articles (comparison=%s)",
            len(policy_articles), len(regulation_articles), comparison_id,
        )

        regulation_index = _build_regulation_index(regulation_articles)

        # ── Set progress totals ──────────────────────────────────────────────
        comparison.total_chunks = len(policy_articles)
        comparison.current_chunk = 0
        comparison.status = "processing"
        comparison.started_at = datetime.utcnow()
        await db.commit()

        # ── Evaluate each policy article against the full regulation ─────────
        counts = {"compliant": 0, "partially_compliant": 0, "non_compliant": 0, "not_applicable": 0}
        gap_risk = {"critical": 0, "high": 0, "medium": 0, "low": 0}
        score_sum = 0
        applicable_count = 0
        top_gaps: list[dict] = []

        for idx, policy_article in enumerate(policy_articles):
            result = await _evaluate_policy_section(policy_article, regulation_index)

            overall_status = result.get("overall_status", "non_compliant")
            compliance_score = int(result.get("overall_compliance_score", 0))
            summary_violations = result.get("summary_violations", [])
            summary_recommendation = result.get("summary_recommendation", "")
            addressed_articles = result.get("addressed_articles", [])

            # Law articles this policy section addresses
            law_article_refs = [
                str(a.get("law_article", ""))
                for a in addressed_articles
                if a.get("law_article")
            ]

            status = _COMPLIANCE_TO_STATUS.get(overall_status, "gap")
            severity = _COMPLIANCE_TO_SEVERITY.get(overall_status, "medium")
            issue = "; ".join(str(v) for v in summary_violations) if summary_violations else (
                "Fully compliant" if status == "compliant" else "No specific violations identified"
            )

            db.add(ComplianceFinding(
                comparison_id=comparison_id,
                doc_a_section=", ".join(law_article_refs) if law_article_refs else "—",
                doc_b_section=str(policy_article.article_number),
                status=status,
                severity=severity,
                issue=issue,
                recommendation=summary_recommendation,
                coverage_score=compliance_score,
                gaps=addressed_articles,  # full per-law-article compliance details
                policy_sections=law_article_refs,
            ))

            # Aggregate
            key = overall_status if overall_status in counts else "non_compliant"
            counts[key] += 1
            if overall_status != "not_applicable":
                score_sum += compliance_score
                applicable_count += 1
                if overall_status in ("non_compliant", "partially_compliant"):
                    risk = "critical" if overall_status == "non_compliant" else "medium"
                    gap_risk[risk] += 1
                    if len(top_gaps) < 10:
                        top_gaps.append({
                            "priority": len(top_gaps) + 1,
                            "article": str(policy_article.article_number),
                            "action": summary_recommendation or f"Fix compliance issues in policy section {policy_article.article_number}",
                        })

            comparison.current_chunk = idx + 1
            await db.commit()

        # ── Compute score ────────────────────────────────────────────────────
        # Average compliance score across applicable policy sections
        overall_score = round(score_sum / applicable_count) if applicable_count else 0
        total_gaps = counts["non_compliant"] + counts["partially_compliant"]

        summary = (
            f"{counts['compliant']} policy sections fully compliant, "
            f"{counts['partially_compliant']} partially compliant, "
            f"{counts['non_compliant']} non-compliant, "
            f"{counts['not_applicable']} not applicable. "
            f"Critical: {gap_risk['critical']}, Medium: {gap_risk['medium']}."
        )

        # ── Generate narratives ──────────────────────────────────────────────
        executive_summary, risk_assessment = await self._generate_narratives(
            mizan_doc_name=mizan_doc.name,
            base_doc_name=base_doc.filename,
            overall_score=overall_score,
            counts=counts,
            gap_risk=gap_risk,
            top_gaps=top_gaps,
        )

        # ── Save report ──────────────────────────────────────────────────────
        report = ComplianceReport(
            comparison_id=comparison_id,
            compliance_score=overall_score,
            total_findings=total_gaps,
            critical_count=gap_risk["critical"] + gap_risk["high"],
            medium_count=gap_risk["medium"],
            low_count=gap_risk["low"],
            summary=summary,
            regulation_coverage_score=overall_score,
            fully_covered_count=counts["compliant"],
            partially_covered_count=counts["partially_compliant"],
            executive_summary=executive_summary,
            risk_assessment=risk_assessment,
            raw_response={"top_action_items": top_gaps, "avg_compliance_score": overall_score},
        )
        db.add(report)

        comparison.status = "completed"
        comparison.completed_at = datetime.utcnow()
        await db.commit()

        logger.info(
            "ComplianceReportAgent done: comparison=%s score=%d%% (applicable=%d/%d policy sections)",
            comparison_id, overall_score, applicable_count, len(policy_articles),
        )

    async def _generate_narratives(
        self,
        mizan_doc_name: str,
        base_doc_name: str,
        overall_score: int,
        counts: dict,
        gap_risk: dict,
        top_gaps: list[dict],
    ) -> tuple[str, str]:
        user_content = (
            f"Policy document: {mizan_doc_name}\n"
            f"Regulation: {base_doc_name}\n"
            f"Overall compliance score: {overall_score}/100\n"
            f"Fully compliant sections: {counts['compliant']}, "
            f"Partially compliant: {counts['partially_compliant']}, "
            f"Non-compliant: {counts['non_compliant']}, "
            f"Not applicable: {counts['not_applicable']}\n"
            f"Critical gaps: {gap_risk['critical']}, Medium: {gap_risk['medium']}\n"
            f"Top issues:\n{json.dumps(top_gaps, ensure_ascii=False, indent=2)}"
        )
        messages = [
            {"role": "system", "content": _NARRATIVE_SYSTEM},
            {"role": "user", "content": user_content},
        ]
        fallback_exec = (
            f"The policy document '{mizan_doc_name}' achieved an overall compliance score of "
            f"{overall_score}/100 against '{base_doc_name}'. "
            f"{counts['compliant']} sections are fully compliant, "
            f"{counts['partially_compliant']} partially, and {counts['non_compliant']} are non-compliant."
        )
        fallback_risk = (
            f"There are {gap_risk['critical'] + gap_risk['medium']} compliance gaps "
            f"that may expose the organization to legal penalties. Manual review is strongly recommended."
        )
        try:
            raw = await llm.chat(messages, temperature=0, max_tokens=1500)
            parsed = json.loads(_strip_fences(raw))
            return parsed.get("executive_summary", fallback_exec), parsed.get("risk_assessment", fallback_risk)
        except Exception as exc:
            logger.warning("Narrative generation failed: %s", exc)
            return fallback_exec, fallback_risk
