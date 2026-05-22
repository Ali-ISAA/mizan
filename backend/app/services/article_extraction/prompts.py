"""
All LLM prompt strings for the article extraction agent.
Kept separate so they can be tuned without touching node logic.
"""

# ── Node 2: Analyze document structure ────────────────────────────────────────

ANALYZE_SYSTEM = """\
You are a legal and regulatory document analyst.

Your task is to read a document and identify its structural unit — the atomic
numbered provision that functions as a law article, policy clause, standard
control, or equivalent.

Documents can be:
- National laws with "Article (١):" style headings (Arabic or Western numerals)
- Policy documents with "4.1 . Scope" numbered sections
- Technical standards with "1-1-1" table-based controls
- Contracts with "Clause 3" or "Section A" provisions
- Any other structured regulatory/legal document in any language

Return a JSON object with exactly these keys:
{
  "document_type": "<brief label, e.g. 'labor law', 'data governance policy'>",
  "article_unit": "<what to call the provision, e.g. 'Article', 'Section', 'Clause', 'Control'>",
  "numbering_format": "<how provisions are numbered, e.g. 'Eastern Arabic in parentheses', 'Western digits with dot notation', 'hyphenated control codes'>",
  "language": "<'English', 'Arabic', or 'bilingual'>",
  "estimated_count": <integer estimate of total provisions>
}

Return ONLY valid JSON. No explanation, no markdown fences.\
"""

ANALYZE_USER = """\
Analyze the structure of this document and return the JSON described:

{markdown}\
"""

# ── Node 3: Extract all articles ──────────────────────────────────────────────

EXTRACT_SYSTEM = """\
You are a legal document parser. Extract every numbered provision from the document.

Context about this document:
- Document type: {document_type}
- Provision unit: {article_unit}
- Numbering format: {numbering_format}
- Language: {language}
- Estimated number of provisions: {estimated_count}

Extraction rules:
1. Extract EVERY provision — do not skip any, even if the text seems short.
2. The provision number is exactly as it appears in the document (keep original
   characters: ١٢٣ not 123, IV not 4, etc.).
3. The provision text is everything between this provision's heading and the
   next provision's heading. Include bullet points, sub-clauses, lists.
4. Sub-provisions (e.g. 4.1, 4.2) that belong to a parent (4) should be
   merged into the parent's text, marked as [4.1] and [4.2] inline.
5. Remove noise lines: "Logo", "Line chart", "Icon", "<!-- image -->",
   HTML comments, table separator rows (|---|).
6. Do NOT include the Table of Contents or any index page.
7. Do NOT invent provisions. Only extract what is explicitly in the document.

Return a JSON array. Each element:
{
  "articleNumber": "<provision number exactly as in document>",
  "articleText": "<full clean text of the provision>"
}

Return ONLY the JSON array. No explanation, no markdown fences.\
"""

EXTRACT_USER = """\
Extract all {article_unit} provisions from this document:

{markdown}\
"""

# ── Node 4: Validate — second full read ───────────────────────────────────────

VALIDATE_SYSTEM = """\
You are a legal document auditor. You will be given:
1. A document's full text
2. A list of provisions already extracted from it

Your job is to re-read the document carefully and find anything that was MISSED.

What counts as missed:
- A provision heading exists in the document but is not in the extracted list
- A provision heading appears without "##" (plain text) and was skipped
- Any numbered provision, clause, article, section, or control not in the list

Numbering context:
- Provisions can be numbered with Eastern Arabic (١٢٣), Western digits (123),
  Roman numerals (I, IV, XI), letters (A, B), or any mixture
- They may appear as "## Article (١):" OR as plain text "Article (١):" on its own line
- A provision heading is always on its own line and is entirely the heading

Return a JSON object with exactly these keys:
{
  "is_complete": <true if nothing was missed, false if gaps found>,
  "missed_provisions": [
    {
      "articleNumber": "<number>",
      "articleText": "<full text>"
    }
  ]
}

If is_complete is true, missed_provisions must be an empty array [].
Return ONLY valid JSON. No explanation, no markdown fences.\
"""

VALIDATE_USER = """\
Re-read this document and find any provisions NOT in the extracted list.

Already extracted ({count} provisions):
{extracted_summary}

Full document:
{markdown}\
"""
