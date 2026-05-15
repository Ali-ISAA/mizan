import json
import logging
import re
from uuid import uuid4
from app.config import settings
from app.services.llm import chat as llm_chat
from app.db.models.mizan_document_chunk import MizanDocumentChunk
from app.db.models.base_document_chunk import BaseDocumentChunk
from app.db.models.compliance_report import ComplianceReport
from app.db.models.compliance_finding import ComplianceFinding

MAX_ARTICLE_TEXT_CHARS = 800  # truncate compliance article text
MAX_REGULATION_ARTICLE_CHARS = 200  # truncate each regulation article in context string

logger = logging.getLogger(__name__)


class ComplianceComparator:
    """Compares compliance document chunks against a regulation document using LiteLLM."""

    CHARS_PER_TOKEN = 4
    LLM_MAX_TOKENS = 1024

    async def compare(
        self,
        doc_a_chunks: list[MizanDocumentChunk],
        doc_b_chunks: list[BaseDocumentChunk]
    ) -> tuple[ComplianceReport, list[ComplianceFinding]]:
        """Main pipeline — kept for backward compatibility. Use compare_chunk() for live progress."""
        regulation_text = self.prepare_regulation(doc_b_chunks)
        all_findings = []
        for i, chunk in enumerate(doc_a_chunks, 1):
            finding = await self.compare_chunk(chunk, i, regulation_text)
            if finding:
                all_findings.append(finding)
        report, findings_objs = self._compile_report(all_findings)
        logger.info(f"Comparison complete: score={report.compliance_score}, chunks={len(all_findings)}")
        return report, findings_objs

    def prepare_regulation(self, doc_b_chunks: list) -> str:
        """Compress and format the regulation document once, reused for every chunk comparison."""
        compressed = [self._compress_chunk_obj(c) for c in doc_b_chunks]
        sections = []
        for i, chunk in enumerate(compressed, 1):
            sections.append(f"[Regulation | Chunk {i}]\n{chunk.text}")
        return "\n\n---\n\n".join(sections)

    # Keep old name as alias so existing callers don't break
    def prepare_doc_b(self, doc_b_chunks: list) -> str:
        return self.prepare_regulation(doc_b_chunks)

    async def compare_chunk(self, chunk_a, chunk_index: int, regulation_text: str) -> dict | None:
        """
        Assess a single compliance document chunk against the full regulation.
        Returns ONE finding dict (not a list) — one result per chunk.
        """
        chunk_a = self._compress_chunk_obj(chunk_a)
        system_prompt = self._build_system_prompt()
        user_prompt = self._build_user_prompt(chunk_a, chunk_index, regulation_text)
        try:
            raw = await self._call_llm(system_prompt, user_prompt)
            return self._parse_chunk_response(raw, chunk_index)
        except Exception as e:
            logger.error(f"Error processing chunk {chunk_index}: {e}")
            return None

    # ------------------------------------------------------------------ #
    #  Internal helpers                                                    #
    # ------------------------------------------------------------------ #

    def _compress_chunk_obj(self, chunk) -> object:
        chunk.text = self._compress_chunk(chunk.text)
        return chunk

    def _compress_chunk(self, text: str) -> str:
        text = re.sub(r'\n{3,}', '\n\n', text)
        text = re.sub(r' {2,}', ' ', text)
        boilerplate = [
            r'Page \d+ of \d+', r'CONFIDENTIAL',
            r'This page intentionally left blank',
            r'Document No\.:.*', r'Version \d+\.\d+',
        ]
        for pattern in boilerplate:
            text = re.sub(pattern, '', text, flags=re.IGNORECASE)
        text = text.strip()
        if self._estimate_tokens(text) > settings.max_tokens_per_chunk:
            max_chars = settings.max_tokens_per_chunk * self.CHARS_PER_TOKEN
            text = text[:max_chars] + "..." if len(text) > max_chars else text
        return text

    def _estimate_tokens(self, text: str) -> int:
        return len(text) // self.CHARS_PER_TOKEN

    def _build_system_prompt(self) -> str:
        return (
            "You are an expert compliance analyst. "
            "Assess the given compliance document chunk against the regulation document. "
            "Respond ONLY with valid JSON. No preamble, no markdown, no extra text."
        )

    def _build_user_prompt(self, chunk_a, chunk_index: int, regulation_text: str) -> str:
        return f"""Assess Chunk {chunk_index} of the Compliance Document against the Regulation.

COMPLIANCE DOCUMENT — Chunk {chunk_index}
{"=" * 60}
{chunk_a.text}

REGULATION DOCUMENT
{"=" * 60}
{regulation_text}

Return ONLY this JSON (one object, not an array):

{{
  "status": "<compliant|gap|conflict|missing>",
  "severity": "<critical|medium|low>",
  "issue": "<one-line description of the compliance problem, or 'Fully compliant'>",
  "recommendation": "<one-line fix, or 'No action required'>",
  "regulation_references": [
    "<paste the exact regulation chunk text that is relevant>"
  ]
}}

Rules:
- status must be one of: compliant, gap, conflict, missing
- severity must be one of: critical, medium, low
- regulation_references is a list of the relevant regulation chunks — include ALL that apply to this compliance chunk
- If fully compliant, set status=compliant, severity=low, issue='Fully compliant', regulation_references with the matching chunks"""

    async def _call_llm(self, system_prompt: str, user_prompt: str) -> str:
        return await llm_chat(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=self.LLM_MAX_TOKENS,
            temperature=0,
        )

    def _parse_chunk_response(self, raw_text: str, chunk_index: int) -> dict | None:
        """Parse a single-object JSON response for one chunk."""
        try:
            clean = raw_text.strip()
            if clean.startswith("```"):
                clean = clean.split("```")[1]
                if clean.startswith("json"):
                    clean = clean[4:]
            clean = clean.strip()

            data = json.loads(clean)

            # Normalize: accept both single object and {"findings": [...]}
            if "findings" in data and isinstance(data["findings"], list) and data["findings"]:
                data = data["findings"][0]

            refs = data.get("regulation_references", [])
            if isinstance(refs, str):
                refs = [refs]

            return {
                "chunk_index": chunk_index,
                "doc_a_section": f"Chunk {chunk_index}",
                "doc_b_section": "\n\n".join(refs) if refs else "",
                "regulation_references": refs,
                "status": data.get("status", "gap"),
                "severity": data.get("severity", "low"),
                "issue": data.get("issue", ""),
                "recommendation": data.get("recommendation", ""),
            }
        except (json.JSONDecodeError, IndexError, KeyError) as e:
            logger.warning(f"Failed to parse chunk {chunk_index} response: {e}\nRaw: {raw_text[:200]}")
            return None

    # ------------------------------------------------------------------ #
    #  Article-based comparison (regulation-driven)                        #
    # ------------------------------------------------------------------ #

    def prepare_compliance_articles(self, mizan_articles: list) -> str:
        """Format all compliance document articles into one context string, reused per base article."""
        sections = []
        for article in mizan_articles:
            text = (article.article_text or "")[:MAX_ARTICLE_TEXT_CHARS]
            if len(article.article_text or "") > MAX_ARTICLE_TEXT_CHARS:
                text += "…"
            sections.append(f"[{article.article_number}]\n{text}")
        return "\n\n".join(sections)

    async def compare_article(self, base_article, article_index: int, compliance_text: str) -> dict | None:
        """
        Assess one regulation article against all compliance document articles.
        Returns one finding dict, or None on failure.
        """
        system_prompt = (
            "You are an expert compliance analyst reviewing a company's policy document "
            "against a regulatory law. Your job is to determine whether each regulation article "
            "imposes a direct obligation on a company or employer, and if so, whether the "
            "company's policy document satisfies that obligation. "
            "Respond ONLY with valid JSON. No preamble, no markdown, no extra text."
        )
        req_text = (base_article.article_text or "")[:MAX_ARTICLE_TEXT_CHARS * 2]
        user_prompt = f"""Assess whether the following regulatory article is satisfied by the company's policy document.

REGULATORY ARTICLE
{"=" * 60}
[{base_article.article_number}]
{req_text}

COMPANY POLICY DOCUMENT
{"=" * 60}
{compliance_text}

Return ONLY this JSON (one object):

{{
  "status": "<compliant|gap|missing|not_applicable>",
  "severity": "<critical|medium|low|none>",
  "issue": "<one-line description of the gap, or 'Fully compliant', or 'Not applicable'>",
  "recommendation": "<one-line fix, or 'No action required'>",
  "compliance_articles": ["<article_number of policy section that addresses this, if any>"]
}}

Rules:
- First decide if this article imposes a DIRECT OBLIGATION on a company/employer (e.g. must provide X, must pay Y, must not do Z)
- If the article is DEFINITIONAL, ADMINISTRATIVE, PROCEDURAL, or governs GOVERNMENT AGENCIES (not employers), set status=not_applicable, severity=none
- If the article imposes a direct employer obligation:
  - compliant = the policy fully addresses it
  - gap = the policy partially addresses it
  - missing = the policy does not address it at all
- severity: critical if a mandatory employer obligation is completely absent, medium if partially, low if minor gap, none if not_applicable
- compliance_articles: policy section numbers that address this article (empty list if none or not_applicable)
- If fully compliant: status=compliant, severity=low, issue='Fully compliant', recommendation='No action required'
- If not applicable: status=not_applicable, severity=none, issue='Not applicable', recommendation='No action required'"""

        try:
            raw = await self._call_llm(system_prompt, user_prompt)
            return self._parse_article_response(raw, base_article, article_index)
        except Exception as e:
            logger.error(f"Error comparing article {article_index} ({base_article.article_number}): {e}")
            return None

    def _parse_article_response(self, raw_text: str, base_article, article_index: int) -> dict | None:
        try:
            clean = raw_text.strip()
            if clean.startswith("```"):
                clean = clean.split("```")[1]
                if clean.startswith("json"):
                    clean = clean[4:]
            clean = clean.strip()
            data = json.loads(clean)

            compliance_articles = data.get("compliance_articles", [])
            if isinstance(compliance_articles, str):
                compliance_articles = [compliance_articles]
            doc_b_section = ", ".join(a for a in compliance_articles if a) if compliance_articles else ""

            return {
                "chunk_index": article_index,
                "doc_a_section": base_article.article_number,
                "doc_b_section": doc_b_section,
                "status": data.get("status", "gap"),
                "severity": data.get("severity", "low"),
                "issue": data.get("issue", ""),
                "recommendation": data.get("recommendation", ""),
            }
        except (json.JSONDecodeError, KeyError) as e:
            logger.warning(f"Failed to parse article {article_index} response: {e}\nRaw: {raw_text[:200]}")
            return None

    # ------------------------------------------------------------------ #
    #  Compliance-doc-driven comparison (checks each policy section)       #
    # ------------------------------------------------------------------ #

    def prepare_regulation_articles(self, base_articles: list) -> str:
        """Format all regulation articles into one context string for use per compliance section."""
        sections = []
        for article in base_articles:
            text = (article.article_text or "")[:MAX_REGULATION_ARTICLE_CHARS]
            if len(article.article_text or "") > MAX_REGULATION_ARTICLE_CHARS:
                text += "…"
            sections.append(f"[{article.article_number}]\n{text}")
        return "\n\n".join(sections)

    async def compare_compliance_section(self, mizan_article, article_index: int, regulation_text: str) -> dict | None:
        """
        Assess one compliance doc section for accuracy against the full regulation.
        Returns one finding dict, or None on failure.
        This is compliance-doc-driven: we iterate over the policy sections and ask
        'is this section accurate per the law?' rather than iterating over law articles.
        """
        system_prompt = (
            "You are an expert compliance analyst. "
            "Given a company policy section and the full regulatory law, "
            "assess whether the policy section accurately and completely reflects what the law requires. "
            "Respond ONLY with valid JSON. No preamble, no markdown, no extra text."
        )
        section_text = (mizan_article.article_text or "")[:MAX_ARTICLE_TEXT_CHARS * 2]
        user_prompt = f"""Assess whether this company policy section accurately complies with the regulation.

COMPANY POLICY SECTION
{"=" * 60}
[{mizan_article.article_number}]
{section_text}

REGULATION
{"=" * 60}
{regulation_text}

Return ONLY this JSON (one object):

{{
  "status": "<compliant|gap|conflict>",
  "severity": "<critical|medium|low>",
  "issue": "<one-line description of the problem, or 'Fully compliant'>",
  "recommendation": "<one-line fix, or 'No action required'>",
  "regulation_articles": ["<article_number that this policy section relates to>"]
}}

Rules:
- compliant = the policy section accurately reflects the law (numbers, thresholds, entitlements match)
- gap = the policy partially addresses the requirement but understates or omits something
- conflict = the policy contradicts or violates the law (e.g., gives less than legally required)
- severity: critical if the policy violates the law, medium if gap is significant, low if minor or fully compliant
- regulation_articles: list of law article numbers this policy section relates to (can be empty for general sections)
- If fully compliant: status=compliant, severity=low, issue='Fully compliant', recommendation='No action required'"""

        try:
            raw = await self._call_llm(system_prompt, user_prompt)
            return self._parse_compliance_section_response(raw, mizan_article, article_index)
        except Exception as e:
            logger.error(f"Error assessing compliance section {article_index} ({mizan_article.article_number}): {e}")
            return None

    def _parse_compliance_section_response(self, raw_text: str, mizan_article, article_index: int) -> dict | None:
        try:
            clean = raw_text.strip()
            if clean.startswith("```"):
                clean = clean.split("```")[1]
                if clean.startswith("json"):
                    clean = clean[4:]
            clean = clean.strip()
            data = json.loads(clean)

            regulation_articles = data.get("regulation_articles", [])
            if isinstance(regulation_articles, str):
                regulation_articles = [regulation_articles]
            doc_b_section = ", ".join(a for a in regulation_articles if a) if regulation_articles else ""

            return {
                "chunk_index": article_index,
                "doc_a_section": mizan_article.article_number,
                "doc_b_section": doc_b_section,
                "status": data.get("status", "gap"),
                "severity": data.get("severity", "low"),
                "issue": data.get("issue", ""),
                "recommendation": data.get("recommendation", ""),
            }
        except (json.JSONDecodeError, KeyError) as e:
            logger.warning(f"Failed to parse compliance section {article_index} response: {e}\nRaw: {raw_text[:200]}")
            return None

    async def generate_report_narrative(
        self,
        doc_name: str,
        regulation_name: str,
        score: int,
        critical_count: int,
        medium_count: int,
        low_count: int,
        findings: list[dict],
    ) -> dict:
        """Generate AI executive summary and risk assessment from completed analysis findings."""
        non_compliant = [f for f in findings if f.get("status") not in ("compliant", "not_applicable")]
        compliant_count = sum(1 for f in findings if f.get("status") == "compliant")
        total_assessed = len([f for f in findings if f.get("status") != "not_applicable"])

        findings_lines = []
        for f in non_compliant[:15]:
            line = f"- [{f['status'].upper()}] {f['doc_a_section']}: {f['issue']}"
            if f.get("recommendation") and f["recommendation"] != "No action required":
                line += f" → Fix: {f['recommendation']}"
            findings_lines.append(line)

        system_prompt = (
            "You are a senior compliance officer writing a formal compliance assessment report. "
            "Write in a professional, direct business style. "
            "Respond ONLY with valid JSON. No markdown, no extra text."
        )

        user_prompt = f"""Write a compliance report narrative for the following analysis results.

DOCUMENT: {doc_name}
REGULATION: {regulation_name}
COMPLIANCE SCORE: {score}%
SECTIONS ASSESSED: {total_assessed}
COMPLIANT: {compliant_count}
ISSUES: {critical_count} critical, {medium_count} medium, {low_count} low

KEY FINDINGS:
{chr(10).join(findings_lines) if findings_lines else "No issues found — all sections compliant."}

Return ONLY this JSON:
{{
  "executive_summary": "<3-4 sentence professional summary. Cover: the overall score, which areas have the most serious gaps, and a general verdict on the document's compliance posture.>",
  "risk_assessment": "<2-3 sentences. Identify the 1-2 highest legal/operational risk areas from the findings and explain the potential implications if not addressed.>"
}}"""

        try:
            raw = await self._call_llm(system_prompt, user_prompt)
            clean = raw.strip()
            if clean.startswith("```"):
                clean = clean.split("```")[1]
                if clean.startswith("json"):
                    clean = clean[4:]
            clean = clean.strip()
            return json.loads(clean)
        except Exception as e:
            logger.error(f"Failed to generate report narrative: {e}")
            return {
                "executive_summary": f"This document scored {score}% compliance with {regulation_name}. {critical_count} critical issues and {medium_count} medium issues were identified across {total_assessed} assessed sections.",
                "risk_assessment": f"The {critical_count} critical findings represent the highest priority areas requiring immediate attention to ensure legal compliance.",
            }

    def _compile_report(self, all_findings: list) -> tuple[ComplianceReport, list[ComplianceFinding]]:
        """Compile per-article findings into a summary report."""
        # Exclude not_applicable articles from scoring — they don't impose direct obligations
        applicable = [f for f in all_findings if f.get("status") != "not_applicable"]
        not_applicable_count = len(all_findings) - len(applicable)

        compliant = [f for f in applicable if f.get("status") == "compliant"]
        non_compliant = [f for f in applicable if f.get("status") != "compliant"]
        critical = sum(1 for f in non_compliant if f.get("severity") == "critical")
        medium  = sum(1 for f in non_compliant if f.get("severity") == "medium")
        low     = sum(1 for f in non_compliant if f.get("severity") == "low")
        compliant_count = len(compliant)

        # Score = % of applicable articles that are fully compliant
        score = round((compliant_count / len(applicable)) * 100) if applicable else 100

        report = ComplianceReport(
            id=uuid4(),
            comparison_id=None,
            compliance_score=score,
            total_findings=len(non_compliant),
            critical_count=critical,
            medium_count=medium,
            low_count=low,
            summary=(
                f"{len(non_compliant)} issues across {len(applicable)} applicable articles "
                f"({not_applicable_count} articles not applicable to employers): "
                f"{critical} critical, {medium} medium, {low} low. "
                f"{compliant_count} articles fully compliant."
            ),
        )

        findings_objs = [
            ComplianceFinding(
                id=uuid4(),
                comparison_id=None,
                doc_a_section=f.get("doc_a_section", f"Chunk {f.get('chunk_index', '?')}"),
                doc_b_section=f.get("doc_b_section", ""),
                status=f.get("status", "gap"),
                severity=f.get("severity", "low"),
                issue=f.get("issue", ""),
                recommendation=f.get("recommendation", ""),
            )
            for f in all_findings
        ]

        return report, findings_objs
