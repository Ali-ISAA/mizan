import json
import logging
import re
from typing import Optional
from uuid import uuid4
from app.config import settings
from app.services.llm import chat as llm_chat
from app.db.models.mizan_document_chunk import MizanDocumentChunk
from app.db.models.base_document_chunk import BaseDocumentChunk
from app.db.models.compliance_report import ComplianceReport
from app.db.models.compliance_finding import ComplianceFinding

logger = logging.getLogger(__name__)


class ComplianceComparator:
    """Compares document chunks using LiteLLM."""

    CHARS_PER_TOKEN = 4  # Approximate: 1 token ~ 4 characters
    LLM_MAX_TOKENS = 1024

    async def compare(
        self,
        doc_a_chunks: list[MizanDocumentChunk],
        doc_b_chunks: list[BaseDocumentChunk]
    ) -> tuple[ComplianceReport, list[ComplianceFinding]]:
        """
        Main comparison pipeline.

        Loops through each Doc A chunk and compares against all Doc B chunks.
        Returns aggregated report + individual findings.
        """
        logger.info(f"Starting comparison: {len(doc_a_chunks)} Doc A chunks vs {len(doc_b_chunks)} Doc B chunks")

        # Compress chunks
        doc_a_chunks = [self._compress_chunk_obj(c) for c in doc_a_chunks]
        doc_b_chunks = [self._compress_chunk_obj(c) for c in doc_b_chunks]

        # Pre-format Doc B (reuse across all calls)
        doc_b_formatted = self._format_chunks(doc_b_chunks, "Regulatory Document")

        all_findings = []

        # Loop: one Doc A chunk vs all Doc B chunks
        for i, chunk_a in enumerate(doc_a_chunks, 1):
            logger.info(f"Processing Doc A chunk {i}/{len(doc_a_chunks)}")

            system_prompt = self._build_system_prompt()
            user_prompt = self._build_user_prompt(chunk_a, doc_b_formatted)

            try:
                raw_response = await self._call_llm(system_prompt, user_prompt)
                findings = self._parse_response(raw_response)
                all_findings.extend(findings)
            except Exception as e:
                logger.error(f"Error processing chunk {chunk_a.id}: {e}")
                continue

        # Compile report
        report, findings_objs = self._compile_report(all_findings)
        logger.info(f"Comparison complete: Score={report.compliance_score}, Findings={report.total_findings}")

        return report, findings_objs

    def _compress_chunk_obj(self, chunk) -> object:
        """Compress a chunk object in place."""
        chunk.text = self._compress_chunk(chunk.text)
        return chunk

    def _compress_chunk(self, text: str) -> str:
        """Remove noise tokens: whitespace, boilerplate."""
        # Remove excessive whitespace
        text = re.sub(r'\n{3,}', '\n\n', text)
        text = re.sub(r' {2,}', ' ', text)

        # Remove common boilerplate
        boilerplate = [
            r'Page \d+ of \d+',
            r'CONFIDENTIAL',
            r'This page intentionally left blank',
            r'Document No\.:.*',
            r'Version \d+\.\d+',
        ]
        for pattern in boilerplate:
            text = re.sub(pattern, '', text, flags=re.IGNORECASE)

        text = text.strip()

        # Truncate if too long
        if self._estimate_tokens(text) > settings.max_tokens_per_chunk:
            max_chars = settings.max_tokens_per_chunk * self.CHARS_PER_TOKEN
            text = text[:max_chars] + "..." if len(text) > max_chars else text

        return text

    def _estimate_tokens(self, text: str) -> int:
        """Estimate tokens (1 token ~ 4 characters)."""
        return len(text) // self.CHARS_PER_TOKEN

    def _format_chunks(self, chunks: list, label: str) -> str:
        """Format chunks into labeled sections."""
        sections = []
        for i, chunk in enumerate(chunks, 1):
            header = f"[{label} | Section {i}]"
            sections.append(f"{header}\n{chunk.text}")
        return "\n\n---\n\n".join(sections)

    def _build_system_prompt(self) -> str:
        return """You are an expert compliance analyst. Compare the Document A section against Document B and identify compliance issues.

Respond ONLY with valid JSON. No preamble, no markdown. Just raw JSON."""

    def _build_user_prompt(self, chunk_a, doc_b_formatted: str) -> str:
        """Build the comparison prompt."""
        return f"""Review this section from Document A for compliance against Document B.

DOCUMENT A SECTION
{"=" * 60}
{chunk_a.text}

DOCUMENT B (Full Reference)
{"=" * 60}
{doc_b_formatted}

Return ONLY this JSON structure:

{{
  "findings": [
    {{
      "doc_a_section": "<section from Doc A>",
      "doc_b_section": "<relevant section from Doc B>",
      "status": "<compliant|gap|conflict|missing>",
      "severity": "<critical|medium|low>",
      "issue": "<one-line issue or 'Fully compliant'>",
      "recommendation": "<one-line fix or 'No action required'>"
    }}
  ]
}}"""

    async def _call_llm(self, system_prompt: str, user_prompt: str) -> str:
        """Call LLM via llm.py service (provider-agnostic)."""
        return await llm_chat(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=self.LLM_MAX_TOKENS,
            temperature=0,
        )

    def _parse_response(self, raw_text: str) -> list[dict]:
        """Parse JSON findings from LLM response."""
        try:
            # Clean markdown code blocks if present
            clean = raw_text.strip()
            if clean.startswith("```"):
                clean = clean.split("```")[1]
                if clean.startswith("json"):
                    clean = clean[4:]
            clean = clean.strip()

            data = json.loads(clean)
            return data.get("findings", [])
        except (json.JSONDecodeError, IndexError) as e:
            logger.warning(f"Failed to parse LLM response: {e}")
            return []

    def _compile_report(self, all_findings: list) -> tuple[ComplianceReport, list[ComplianceFinding]]:
        """Compile findings into report."""
        critical = sum(1 for f in all_findings if f.get("severity") == "critical")
        medium = sum(1 for f in all_findings if f.get("severity") == "medium")
        low = sum(1 for f in all_findings if f.get("severity") == "low")

        # Score: 100 - penalties
        score = max(0, 100 - (critical * 15) - (medium * 5) - (low * 2))

        report = ComplianceReport(
            id=uuid4(),
            comparison_id=None,  # Will be set by task
            compliance_score=score,
            total_findings=len(all_findings),
            critical_count=critical,
            medium_count=medium,
            low_count=low,
            summary=f"{len(all_findings)} findings: {critical} critical, {medium} medium, {low} low"
        )

        findings_objs = [
            ComplianceFinding(
                id=uuid4(),
                comparison_id=None,
                doc_a_section=f.get("doc_a_section", "N/A"),
                doc_b_section=f.get("doc_b_section", "N/A"),
                status=f.get("status", "gap"),
                severity=f.get("severity", "low"),
                issue=f.get("issue", ""),
                recommendation=f.get("recommendation", "")
            )
            for f in all_findings
        ]

        return report, findings_objs
