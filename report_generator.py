"""
PDF report generator for LegalScope document analysis.
Uses ReportLab to produce a professional legal-style PDF.
"""

import io
import re
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether,
)


NAVY = colors.HexColor("#0d1220")
DARK_BG = colors.HexColor("#141c32")
BLUE_ACCENT = colors.HexColor("#3b82f6")
GOLD_ACCENT = colors.HexColor("#c9a84c")
RED_FLAG = colors.HexColor("#ef4444")
GREEN = colors.HexColor("#22c55e")
ORANGE = colors.HexColor("#f97316")
TEXT_DARK = colors.HexColor("#1f2937")
TEXT_MID = colors.HexColor("#4b5563")
TEXT_LIGHT = colors.HexColor("#6b7280")

SECTION_ICONS = {
    "WHAT THIS IS": "Overview",
    "THE PARTIES": "Parties",
    "YOUR KEY OBLIGATIONS": "Obligations",
    "RESTRICTIONS ON YOU": "Restrictions",
    "IMPORTANT DATES & NUMBERS": "Key Dates & Figures",
    "RESTRICTIONS ON YOU": "Restrictions",
    "RED FLAGS": "Red Flags",
    "MISSING PROTECTIONS": "Missing Protections",
    "HOW TO EXIT": "Exit / Termination",
    "VERDICT": "Verdict",
}


def _build_styles():
    styles = getSampleStyleSheet()

    styles.add(ParagraphStyle(
        "ReportTitle",
        parent=styles["Title"],
        fontSize=22,
        leading=28,
        textColor=TEXT_DARK,
        spaceAfter=4,
        fontName="Helvetica-Bold",
    ))
    styles.add(ParagraphStyle(
        "ReportSubtitle",
        parent=styles["Normal"],
        fontSize=10,
        leading=14,
        textColor=TEXT_LIGHT,
        spaceAfter=20,
    ))
    styles.add(ParagraphStyle(
        "SectionHeading",
        parent=styles["Heading2"],
        fontSize=13,
        leading=18,
        textColor=BLUE_ACCENT,
        spaceBefore=16,
        spaceAfter=6,
        fontName="Helvetica-Bold",
    ))
    styles.add(ParagraphStyle(
        "BodyText2",
        parent=styles["Normal"],
        fontSize=10,
        leading=15,
        textColor=TEXT_MID,
        spaceAfter=4,
    ))
    styles.add(ParagraphStyle(
        "BulletItem",
        parent=styles["Normal"],
        fontSize=10,
        leading=15,
        textColor=TEXT_MID,
        leftIndent=18,
        spaceAfter=3,
        bulletIndent=6,
        bulletFontSize=10,
    ))
    styles.add(ParagraphStyle(
        "VerdictStyle",
        parent=styles["Normal"],
        fontSize=11,
        leading=16,
        textColor=TEXT_DARK,
        backColor=colors.HexColor("#f0f9ff"),
        borderPadding=(10, 12, 10, 12),
        spaceBefore=8,
        spaceAfter=8,
        fontName="Helvetica-Bold",
    ))
    styles.add(ParagraphStyle(
        "RedFlagItem",
        parent=styles["Normal"],
        fontSize=10,
        leading=15,
        textColor=colors.HexColor("#991b1b"),
        leftIndent=18,
        spaceAfter=3,
        bulletIndent=6,
    ))
    styles.add(ParagraphStyle(
        "Footer",
        parent=styles["Normal"],
        fontSize=7,
        leading=10,
        textColor=TEXT_LIGHT,
        alignment=1,
    ))
    return styles


def _parse_analysis(text):
    """Split the auto-analysis text into (heading, body) sections."""
    known = list(SECTION_ICONS.keys())
    pattern = "|".join(re.escape(h) for h in known)
    parts = re.split(rf"({pattern})", text)

    sections = []
    i = 0
    while i < len(parts):
        chunk = parts[i].strip()
        if chunk in known and i + 1 < len(parts):
            heading = chunk
            body = parts[i + 1].strip()
            sections.append((heading, body))
            i += 2
        else:
            if chunk and not sections:
                sections.append(("OVERVIEW", chunk))
            i += 1
    return sections


def _render_section(heading, body, styles):
    """Return a list of flowables for one report section."""
    elements = []

    display = SECTION_ICONS.get(heading, heading.title())

    if heading == "RED FLAGS":
        color = RED_FLAG
    elif heading == "VERDICT":
        color = GOLD_ACCENT
    else:
        color = BLUE_ACCENT

    style = ParagraphStyle(
        f"Heading_{heading[:10]}",
        parent=styles["SectionHeading"],
        textColor=color,
    )
    elements.append(Paragraph(display, style))

    elements.append(HRFlowable(
        width="100%", thickness=0.5,
        color=colors.HexColor("#e5e7eb"),
        spaceAfter=8,
    ))

    if heading == "VERDICT":
        elements.append(Paragraph(body, styles["VerdictStyle"]))
        return elements

    lines = body.split("\n")
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith(("-", "•", "–", "*")):
            text = re.sub(r"^[-•–*]\s*", "", stripped)
            if heading == "RED FLAGS":
                bullet_style = styles["RedFlagItem"]
            else:
                bullet_style = styles["BulletItem"]
            elements.append(Paragraph(f"• {text}", bullet_style))
        else:
            elements.append(Paragraph(stripped, styles["BodyText2"]))

    return elements


def generate_pdf(analysis_text, filename="document", readability=None):
    """
    Generate a PDF report from the auto-analysis text.

    Returns bytes of the PDF file.
    """
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        topMargin=0.6 * inch,
        bottomMargin=0.8 * inch,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
    )

    styles = _build_styles()
    story = []

    # Header bar
    header_data = [[
        Paragraph(
            '<font color="#3b82f6"><b>LegalScope</b></font>'
            '&nbsp;&nbsp;<font color="#9ca3af" size="8">Legal Document Analysis Report</font>',
            styles["Normal"],
        )
    ]]
    header_table = Table(header_data, colWidths=[doc.width])
    header_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ("TOPPADDING", (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
        ("LEFTPADDING", (0, 0), (-1, -1), 16),
        ("LINEBELOW", (0, 0), (-1, -1), 2, BLUE_ACCENT),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 12))

    # Document title + meta
    story.append(Paragraph(f"Analysis: {filename}", styles["ReportTitle"]))
    meta = f"Generated {datetime.now().strftime('%B %d, %Y at %I:%M %p')}"
    if readability:
        meta += (
            f"&nbsp;&nbsp;|&nbsp;&nbsp;"
            f"Readability: {readability.get('label', 'N/A')} "
            f"(Grade {readability.get('grade', '?')}, Score {readability.get('score', '?')})"
        )
    story.append(Paragraph(meta, styles["ReportSubtitle"]))

    # Sections
    sections = _parse_analysis(analysis_text)
    for heading, body in sections:
        section_flowables = _render_section(heading, body, styles)
        story.append(KeepTogether(section_flowables))

    # Footer
    story.append(Spacer(1, 30))
    story.append(HRFlowable(
        width="100%", thickness=0.5,
        color=colors.HexColor("#e5e7eb"),
        spaceAfter=8,
    ))
    story.append(Paragraph(
        "This report was generated by LegalScope — AI-powered legal document analysis. "
        "This is not legal advice. Always consult a qualified legal professional.",
        styles["Footer"],
    ))

    doc.build(story)
    buf.seek(0)
    return buf.read()


# ─── Shared helpers ───────────────────────────────────────────

def _build_header(styles, doc_width, subtitle_text):
    header_data = [[
        Paragraph(
            '<font color="#c9a84c"><b>LegalScope</b></font>'
            f'&nbsp;&nbsp;<font color="#9ca3af" size="8">{subtitle_text}</font>',
            styles["Normal"],
        )
    ]]
    header_table = Table(header_data, colWidths=[doc_width])
    header_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ("TOPPADDING", (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
        ("LEFTPADDING", (0, 0), (-1, -1), 16),
        ("LINEBELOW", (0, 0), (-1, -1), 2, GOLD_ACCENT),
    ]))
    return header_table


def _build_footer(styles):
    elements = [
        Spacer(1, 30),
        HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e5e7eb"), spaceAfter=8),
        Paragraph(
            "This report was generated by LegalScope — AI-powered legal analysis. "
            "This is not legal advice. Always consult a qualified legal professional.",
            styles["Footer"],
        ),
    ]
    return elements


def _render_body_text(text, styles, heading_color=BLUE_ACCENT):
    """Render a block of text, handling bullet lines and plain paragraphs."""
    elements = []
    for line in text.split("\n"):
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith(("-", "•", "–", "*")):
            cleaned = re.sub(r"^[-•–*]\s*", "", stripped)
            elements.append(Paragraph(f"• {cleaned}", styles["BulletItem"]))
        elif re.match(r"^\d+[\.\)]\s", stripped):
            cleaned = re.sub(r"^\d+[\.\)]\s*", "", stripped)
            elements.append(Paragraph(f"• {cleaned}", styles["BulletItem"]))
        else:
            elements.append(Paragraph(stripped, styles["BodyText2"]))
    return elements


# ─── Case Analysis Report ─────────────────────────────────────

def generate_case_report_pdf(case_name, messages, files=None):
    """
    Generate a PDF from the case analysis chat history.

    messages: list of {"role": "user"|"ai", "text": str}
    """
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        topMargin=0.6 * inch, bottomMargin=0.8 * inch,
        leftMargin=0.75 * inch, rightMargin=0.75 * inch,
    )

    styles = _build_styles()
    styles.add(ParagraphStyle(
        "UserQuery",
        parent=styles["Normal"],
        fontSize=10, leading=14,
        textColor=colors.HexColor("#1e40af"),
        fontName="Helvetica-Bold",
        spaceBefore=12, spaceAfter=4,
    ))
    styles.add(ParagraphStyle(
        "AiResponse",
        parent=styles["Normal"],
        fontSize=10, leading=15,
        textColor=TEXT_MID,
        leftIndent=10, spaceAfter=8,
    ))

    story = []

    story.append(_build_header(styles, doc.width, "Case Analysis Report"))
    story.append(Spacer(1, 12))

    story.append(Paragraph(case_name, styles["ReportTitle"]))
    meta = f"Generated {datetime.now().strftime('%B %d, %Y at %I:%M %p')}"
    if files:
        meta += f"&nbsp;&nbsp;|&nbsp;&nbsp;{len(files)} document(s) analyzed"
    story.append(Paragraph(meta, styles["ReportSubtitle"]))

    if files:
        story.append(Paragraph("Documents", styles["SectionHeading"]))
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e5e7eb"), spaceAfter=8))
        for f in files:
            name = f.get("name", "Unknown") if isinstance(f, dict) else str(f)
            story.append(Paragraph(f"• {name}", styles["BulletItem"]))
        story.append(Spacer(1, 8))

    story.append(Paragraph("Analysis", styles["SectionHeading"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e5e7eb"), spaceAfter=8))

    for msg in messages:
        if msg.get("role") == "user":
            story.append(Paragraph(f"Q: {msg['text']}", styles["UserQuery"]))
        else:
            story.extend(_render_body_text(msg.get("text", ""), styles))
            story.append(Spacer(1, 6))

    story.extend(_build_footer(styles))

    doc.build(story)
    buf.seek(0)
    return buf.read()


# ─── Mock Trial Report ────────────────────────────────────────

def generate_trial_report_pdf(case_name, history=None, coaching=None,
                              plaintiff=None, defense=None, ruling=None):
    """Generate a PDF from a multi-round mock trial simulation."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        topMargin=0.6 * inch, bottomMargin=0.8 * inch,
        leftMargin=0.75 * inch, rightMargin=0.75 * inch,
    )

    styles = _build_styles()
    styles.add(ParagraphStyle(
        "CoachLabel",
        parent=styles["Normal"],
        fontSize=9, leading=12,
        textColor=GOLD_ACCENT,
        fontName="Helvetica-Bold",
        spaceBefore=10, spaceAfter=4,
    ))

    PLAINTIFF_COLOR = colors.HexColor("#2563eb")
    DEFENSE_COLOR = colors.HexColor("#dc2626")

    PHASE_TITLES = {
        "opening": "Opening Argument",
        "rebuttal": "Rebuttal",
        "closing": "Closing Statement",
    }
    ROLE_CONFIG = {
        "plaintiff": ("Plaintiff", PLAINTIFF_COLOR),
        "defense": ("Opposing Counsel", DEFENSE_COLOR),
        "judge": ("Judicial Ruling", GOLD_ACCENT),
    }

    story = []
    story.append(_build_header(styles, doc.width, "Mock Trial Report"))
    story.append(Spacer(1, 12))
    story.append(Paragraph(case_name, styles["ReportTitle"]))

    rounds = len(set(h.get("phase", "") for h in (history or [])))
    meta = f"Generated {datetime.now().strftime('%B %d, %Y at %I:%M %p')}"
    meta += f"&nbsp;&nbsp;|&nbsp;&nbsp;{rounds} round(s)"
    story.append(Paragraph(meta, styles["ReportSubtitle"]))

    if history:
        current_phase = None
        for entry in history:
            phase = entry.get("phase", "")
            role = entry.get("role", "")
            text = entry.get("text", "")

            if phase != current_phase:
                current_phase = phase
                phase_title = PHASE_TITLES.get(phase, phase.title())
                phase_style = ParagraphStyle(
                    f"Phase_{phase}", parent=styles["SectionHeading"],
                    textColor=BLUE_ACCENT, fontSize=14,
                )
                story.append(Spacer(1, 10))
                story.append(Paragraph(f"Round: {phase_title}", phase_style))
                story.append(HRFlowable(
                    width="100%", thickness=1, color=BLUE_ACCENT, spaceAfter=10,
                ))

            label, color = ROLE_CONFIG.get(role, (role.title(), TEXT_MID))
            heading_style = ParagraphStyle(
                f"H_{role}_{phase}", parent=styles["SectionHeading"],
                textColor=color, fontSize=12,
            )
            story.append(Paragraph(label, heading_style))
            story.append(HRFlowable(
                width="100%", thickness=0.5,
                color=colors.HexColor("#e5e7eb"), spaceAfter=6,
            ))
            story.extend(_render_body_text(text, styles))
            story.append(Spacer(1, 6))
    else:
        if plaintiff:
            h = ParagraphStyle("PH", parent=styles["SectionHeading"], textColor=PLAINTIFF_COLOR)
            story.append(Paragraph("Plaintiff's Argument", h))
            story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e5e7eb"), spaceAfter=8))
            story.extend(_render_body_text(plaintiff, styles))
            story.append(Spacer(1, 8))
        if defense:
            h = ParagraphStyle("DH", parent=styles["SectionHeading"], textColor=DEFENSE_COLOR)
            story.append(Paragraph("Opposing Counsel's Response", h))
            story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e5e7eb"), spaceAfter=8))
            story.extend(_render_body_text(defense, styles))
            story.append(Spacer(1, 8))
        if ruling:
            h = ParagraphStyle("RH", parent=styles["SectionHeading"], textColor=GOLD_ACCENT)
            story.append(Paragraph("Judicial Ruling", h))
            story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e5e7eb"), spaceAfter=8))
            story.extend(_render_body_text(ruling, styles))

    if coaching and isinstance(coaching, dict) and coaching.get("score"):
        story.append(Spacer(1, 14))
        coach_heading = ParagraphStyle(
            "CoachH", parent=styles["SectionHeading"], textColor=GOLD_ACCENT,
        )
        story.append(Paragraph(f"Final Coach Scorecard — {coaching['score']}/10", coach_heading))
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e5e7eb"), spaceAfter=8))

        for section, items in [
            ("Strengths", coaching.get("strengths", [])),
            ("Weaknesses", coaching.get("weaknesses", [])),
            ("Tips", coaching.get("tips", [])),
            ("Missing Elements", coaching.get("missing", [])),
        ]:
            if items:
                story.append(Paragraph(section, styles["CoachLabel"]))
                for item in items:
                    story.append(Paragraph(f"• {item}", styles["BulletItem"]))

    story.extend(_build_footer(styles))
    doc.build(story)
    buf.seek(0)
    return buf.read()
