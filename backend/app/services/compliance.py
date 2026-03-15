"""Compliance analysis engine.

Workflow:
1. Extract requirements from Doc A text using LLM
2. For each requirement, search Doc B's Qdrant collection for matching clauses
3. Use LLM to assess compliance per requirement (met / partial / not_met)
4. Identify gaps, assign severity
5. Compute overall score
"""
import logging
from dataclasses import dataclass, field

from app.services import llm as llm_service
from app.services.qdrant_search import search as qdrant_search

logger = logging.getLogger(__name__)


@dataclass
class RequirementAnalysis:
    requirement_text: str
    section_ref: str | None
    compliance_status: str  # met | partial | not_met
    confidence_score: float
    ai_commentary: str
    matched_clause_text: str | None
    doc_b_section_ref: str | None
    match_score: float | None
    order_index: int


@dataclass
class GapAnalysis:
    requirement_text: str
    requirement_index: int
    gap_description: str
    severity: str  # critical | major | minor
    recommendation: str
    order_index: int


@dataclass
class ComplianceAnalysisResult:
    requirements: list[RequirementAnalysis] = field(default_factory=list)
    gaps: list[GapAnalysis] = field(default_factory=list)
    overall_score: float = 0.0
    met_count: int = 0
    partial_count: int = 0
    not_met_count: int = 0
    critical_gaps: int = 0
    major_gaps: int = 0
    minor_gaps: int = 0
    executive_summary: str = ""


def _classify_gap_severity(compliance_status: str, confidence_score: float) -> str:
    """Classify gap severity based on compliance status and confidence."""
    if compliance_status == "not_met":
        return "critical" if confidence_score >= 0.7 else "major"
    elif compliance_status == "partial":
        return "minor" if confidence_score >= 0.7 else "major"
    return "minor"


def _compute_score(met: int, partial: int, not_met: int) -> float:
    """Compute overall compliance score (0-100)."""
    total = met + partial + not_met
    if total == 0:
        return 0.0
    return round((met + 0.5 * partial) / total * 100, 1)


async def analyze_compliance(
    doc_a_text: str,
    doc_a_name: str,
    collection_name: str,
) -> ComplianceAnalysisResult:
    """Run full compliance analysis.

    Args:
        doc_a_text: Full text of the requirements document
        doc_a_name: Display name of Doc A (for LLM context)
        collection_name: Noesia/Qdrant collection containing Doc B chunks

    Returns:
        ComplianceAnalysisResult with all requirements, mappings, gaps, and scores
    """
    result = ComplianceAnalysisResult()

    # Step 1: Extract requirements from Doc A
    logger.info("Extracting requirements from '%s'", doc_a_name)
    raw_requirements = await llm_service.extract_requirements(doc_a_text, doc_a_name)
    if not raw_requirements:
        logger.warning("No requirements extracted from '%s'", doc_a_name)
        return result

    logger.info("Extracted %d requirements from '%s'", len(raw_requirements), doc_a_name)

    # Step 2: For each requirement, search Doc B for matching clauses + assess compliance
    gap_order = 0
    for idx, req in enumerate(raw_requirements):
        req_text = req.get("requirement_text", "")
        section_ref = req.get("section_ref")

        if not req_text.strip():
            continue

        # Search Doc B's collection for semantically relevant chunks
        matches = await qdrant_search(
            collection_name=collection_name,
            query=req_text,
            top_k=5,
        )

        matched_texts = [m["text"] for m in matches if m.get("text")]
        top_match = matches[0] if matches else None
        matched_clause_text = top_match["text"] if top_match else None
        match_score = top_match["score"] if top_match else None
        doc_b_section_ref = top_match.get("metadata", {}).get("section") if top_match else None

        # Assess compliance
        assessment = await llm_service.assess_compliance(req_text, matched_texts)
        compliance_status = assessment.get("compliance_status", "not_met")
        confidence_score = float(assessment.get("confidence_score", 0.0))
        ai_commentary = assessment.get("ai_commentary", "")

        req_analysis = RequirementAnalysis(
            requirement_text=req_text,
            section_ref=section_ref,
            compliance_status=compliance_status,
            confidence_score=confidence_score,
            ai_commentary=ai_commentary,
            matched_clause_text=matched_clause_text,
            doc_b_section_ref=doc_b_section_ref,
            match_score=match_score,
            order_index=idx,
        )
        result.requirements.append(req_analysis)

        # Count statuses
        if compliance_status == "met":
            result.met_count += 1
        elif compliance_status == "partial":
            result.partial_count += 1
        else:
            result.not_met_count += 1

        # Create gap items for non-met requirements
        if compliance_status in ("partial", "not_met"):
            severity = _classify_gap_severity(compliance_status, confidence_score)
            recommendation = await llm_service.generate_gap_recommendation(req_text, compliance_status)
            gap_description = (
                f"Requirement not fully addressed: {req_text[:200]}"
                if compliance_status == "not_met"
                else f"Requirement partially addressed: {req_text[:200]}"
            )
            result.gaps.append(GapAnalysis(
                requirement_text=req_text,
                requirement_index=idx,
                gap_description=gap_description,
                severity=severity,
                recommendation=recommendation,
                order_index=gap_order,
            ))
            gap_order += 1
            if severity == "critical":
                result.critical_gaps += 1
            elif severity == "major":
                result.major_gaps += 1
            else:
                result.minor_gaps += 1

        logger.info(
            "Requirement %d/%d: status=%s confidence=%.2f",
            idx + 1, len(raw_requirements), compliance_status, confidence_score,
        )

    # Step 3: Compute overall score
    result.overall_score = _compute_score(result.met_count, result.partial_count, result.not_met_count)
    logger.info(
        "Analysis complete: score=%.1f%% met=%d partial=%d not_met=%d gaps=%d",
        result.overall_score, result.met_count, result.partial_count, result.not_met_count, len(result.gaps),
    )

    return result
