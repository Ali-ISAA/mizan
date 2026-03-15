"""Compliance report generator — produces PDF or JSON reports."""
import io
import json
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


def generate_json_report(project_data: dict, analysis_data: dict, requirements: list[dict], gaps: list[dict]) -> bytes:
    """Generate a structured JSON compliance report."""
    report = {
        "report_type": "compliance_analysis",
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "project": {
            "id": str(project_data.get("id", "")),
            "name": project_data.get("name", ""),
            "description": project_data.get("description", ""),
        },
        "summary": {
            "overall_score": analysis_data.get("overall_score", 0),
            "requirements_count": analysis_data.get("requirements_count", 0),
            "met_count": analysis_data.get("met_count", 0),
            "partial_count": analysis_data.get("partial_count", 0),
            "not_met_count": analysis_data.get("not_met_count", 0),
            "critical_gaps": analysis_data.get("critical_gaps", 0),
            "major_gaps": analysis_data.get("major_gaps", 0),
            "minor_gaps": analysis_data.get("minor_gaps", 0),
            "executive_summary": analysis_data.get("executive_summary", ""),
        },
        "requirements": requirements,
        "gaps": gaps,
    }
    return json.dumps(report, indent=2, default=str).encode("utf-8")


def generate_pdf_report(project_data: dict, analysis_data: dict, requirements: list[dict], gaps: list[dict]) -> bytes:
    """Generate a PDF compliance report using reportlab."""
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=2*cm, bottomMargin=2*cm, leftMargin=2*cm, rightMargin=2*cm)
        styles = getSampleStyleSheet()
        story = []

        # Title
        title_style = ParagraphStyle("Title", parent=styles["Title"], fontSize=24, spaceAfter=6, textColor=colors.HexColor("#1e293b"))
        story.append(Paragraph("Compliance Analysis Report", title_style))
        story.append(Paragraph(f"Project: {project_data.get('name', '')}", styles["Heading2"]))
        story.append(Paragraph(f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}", styles["Normal"]))
        story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e2e8f0")))
        story.append(Spacer(1, 0.5*cm))

        # Score
        score = analysis_data.get("overall_score", 0)
        score_color = colors.green if score >= 80 else colors.orange if score >= 50 else colors.red
        score_style = ParagraphStyle("Score", parent=styles["Heading1"], fontSize=32, textColor=score_color)
        story.append(Paragraph(f"Overall Compliance Score: {score:.1f}%", score_style))
        story.append(Spacer(1, 0.3*cm))

        # Stats table
        stats_data = [
            ["Metric", "Count"],
            ["Requirements Analyzed", str(analysis_data.get("requirements_count", 0))],
            ["Fully Met", str(analysis_data.get("met_count", 0))],
            ["Partially Met", str(analysis_data.get("partial_count", 0))],
            ["Not Met", str(analysis_data.get("not_met_count", 0))],
            ["Critical Gaps", str(analysis_data.get("critical_gaps", 0))],
            ["Major Gaps", str(analysis_data.get("major_gaps", 0))],
            ["Minor Gaps", str(analysis_data.get("minor_gaps", 0))],
        ]
        stats_table = Table(stats_data, colWidths=[10*cm, 4*cm])
        stats_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("ALIGN", (1, 0), (1, -1), "CENTER"),
            ("PADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(stats_table)
        story.append(Spacer(1, 0.5*cm))

        # Executive summary
        if analysis_data.get("executive_summary"):
            story.append(Paragraph("Executive Summary", styles["Heading2"]))
            story.append(Paragraph(analysis_data["executive_summary"], styles["Normal"]))
            story.append(Spacer(1, 0.3*cm))

        # Gaps section
        if gaps:
            story.append(Paragraph("Compliance Gaps", styles["Heading2"]))
            severity_colors = {"critical": colors.HexColor("#fee2e2"), "major": colors.HexColor("#fef3c7"), "minor": colors.HexColor("#f0fdf4")}
            for gap in gaps[:50]:  # Limit to 50 gaps in PDF
                sev = gap.get("severity", "major")
                bg = severity_colors.get(sev, colors.white)
                gap_data = [
                    [Paragraph(f"<b>[{sev.upper()}]</b> {gap.get('gap_description', '')[:200]}", styles["Normal"])],
                ]
                if gap.get("recommendation"):
                    gap_data.append([Paragraph(f"<i>Recommendation:</i> {gap['recommendation'][:200]}", styles["Normal"])])
                t = Table(gap_data, colWidths=[16*cm])
                t.setStyle(TableStyle([
                    ("BACKGROUND", (0, 0), (-1, -1), bg),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                    ("PADDING", (0, 0), (-1, -1), 8),
                    ("BOTTOMPADDING", (0, -1), (-1, -1), 4),
                ]))
                story.append(t)
                story.append(Spacer(1, 0.2*cm))

        doc.build(story)
        return buffer.getvalue()

    except ImportError:
        logger.warning("reportlab not available — falling back to JSON report")
        return generate_json_report(project_data, analysis_data, requirements, gaps)
    except Exception as exc:
        logger.error("PDF generation failed: %s", exc)
        return generate_json_report(project_data, analysis_data, requirements, gaps)
