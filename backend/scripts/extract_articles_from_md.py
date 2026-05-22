#!/usr/bin/env python3
"""
Standalone article extractor for Mizan base documents.

Reads the Noesia-processed markdown for every superadmin-uploaded base document,
extracts numbered articles using pattern matching (no LLM), and writes one JSON
file per document.

Numbering formats handled:
  - Eastern Arabic numerals (١, ٢, ١٠ …)
  - Western Arabic digits   (1, 2, 10 …)
  - Uppercase Roman numerals (I, IV, XI …)
  - Single letters           (A, B, C …)
  - Any mix with . / , ، -  separators (4.1, A.1, IV.2 …)

Sub-articles are merged into their parent (4.1 + 4.2 → merged into 4).
Backwards-numbered sub-sections (e.g. a "1 . NDMO" appearing after "8 . OpenData")
are also merged into the last top-level parent.

Article heading patterns recognised:
  1. ## Article (NUMBER):   — Arabic laws (Eastern or Western digits)
  2. ## Article NUMBER:     — bare variant
  3. ## Section / Clause / مادة / المادة + NUMBER
  4. ## NUMBER . Title      — numbered-section style (PoliciesEn etc.)

Usage (inside backend container):
    docker compose exec backend python scripts/extract_articles_from_md.py
    docker compose exec backend python scripts/extract_articles_from_md.py --doc-id UUID
    docker compose exec backend python scripts/extract_articles_from_md.py --output-dir /tmp/out
"""

import argparse
import asyncio
import json
import re
import sys
from pathlib import Path

# ── Noise lines ────────────────────────────────────────────────────────────────

NOISE_LINE_RE = re.compile(
    r'^\s*(?:Logo|Line\s+chart|Icon|<!--.*?-->)\s*$',
    re.IGNORECASE,
)
TABLE_SEP_RE = re.compile(r'^\s*\|[\s\-|:]+\|\s*$')

# ── Number patterns ────────────────────────────────────────────────────────────
# Note: all regex quantifiers use raw strings (not f-strings) to avoid {n,m} mangling.

_EAST_AR = r'[٠-٩]+'
_WEST    = r'\d+'
_ROMAN   = r'(?:M{1,4}|CM|CD|DC{0,3}|C{1,4}|XC|XL|LX{0,3}|X{1,4}|IX|IV|VI{0,3}|I{1,4})'
_ALPHA   = r'[A-Za-z]'

_SEG      = '(?:' + _EAST_AR + '|' + _WEST + '|' + _ROMAN + '|' + _ALPHA + ')'
_SEP      = r'[./،,\-]'
MIXED_NUM = _SEG + '(?:' + _SEP + _SEG + ')*'

# ── Article heading regexes ────────────────────────────────────────────────────

_KEYWORDS = r'(?:Article|Section|Clause|مادة|المادة)'

# Pattern A: "## Article (NUMBER):" or "## Article NUMBER:"
ART_RE = re.compile(
    r'^(#{1,4})\s+' + _KEYWORDS + r'\s*'
    r'[\(（]?(' + MIXED_NUM + r')[\)）]?\s*:?\s*$',
    re.IGNORECASE | re.UNICODE,
)

# Pattern B: "## NUMBER . Title" (dot-space required after the number)
NUM_SECTION_RE = re.compile(
    r'^(#{1,4})\s+(' + MIXED_NUM + r')\s*\.\s+\S',
    re.UNICODE,
)


def detect_article_heading(line: str):
    m = ART_RE.match(line)
    if m:
        return m.group(2)
    m = NUM_SECTION_RE.match(line)
    if m:
        return m.group(2)
    return None


# ── Number comparison helpers ──────────────────────────────────────────────────

_EAST_TO_WEST = str.maketrans('٠١٢٣٤٥٦٧٨٩', '0123456789')
_ROMAN_MAP = {'I':1,'V':5,'X':10,'L':50,'C':100,'D':500,'M':1000}


def _roman_to_int(s: str) -> int:
    s = s.upper()
    result, prev = 0, 0
    for ch in reversed(s):
        v = _ROMAN_MAP.get(ch, 0)
        result = result - v if v < prev else result + v
        prev = v
    return result


def _num_to_float(num: str) -> float:
    """Convert an article number to a comparable float (for ordering checks)."""
    west = num.translate(_EAST_TO_WEST)
    parts = re.split(r'[./،,\-]', west)
    result = 0.0
    for i, part in enumerate(parts):
        try:
            v = int(part)
        except ValueError:
            try:
                v = _roman_to_int(part)
            except Exception:
                v = (ord(part[0].upper()) - ord('A') + 1) if part else 0
        result += v / (1000 ** i)
    return result


def _numerically_before(a: str, b: str) -> bool:
    """True if a sorts before b (a < b numerically)."""
    try:
        return _num_to_float(a) < _num_to_float(b)
    except Exception:
        return False


# ── Sub-article detection ──────────────────────────────────────────────────────

def _is_sub_of(child: str, parent: str) -> bool:
    for sep in '.،,/-':
        if child.startswith(parent + sep):
            return True
    return False


def _find_parent(num: str, seen: list) -> str | None:
    """Return the most recently seen ancestor of num via prefix rule."""
    for candidate in reversed(seen):
        if _is_sub_of(num, candidate):
            return candidate
    return None


# ── Text cleaning ──────────────────────────────────────────────────────────────

def clean_text(raw: str) -> str:
    out = []
    for line in raw.split('\n'):
        if NOISE_LINE_RE.match(line):
            continue
        if TABLE_SEP_RE.match(line):
            continue
        out.append(line)
    text = '\n'.join(out).strip()
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text


# ── Core extraction ────────────────────────────────────────────────────────────

def extract_articles(markdown: str) -> list:
    lines = markdown.split('\n')

    # Pass 1 — collect raw segments in document order
    segments = []
    current_num = None
    current_lines = []

    for line in lines:
        num = detect_article_heading(line)
        if num:
            if current_num is not None:
                segments.append((current_num, current_lines))
            current_num = num
            current_lines = []
        elif current_num is not None:
            current_lines.append(line)

    if current_num is not None and current_lines:
        segments.append((current_num, current_lines))

    # Pass 2 — merge sub-articles and detect backwards-numbered sub-sections
    articles: dict = {}      # num → list[str]
    order: list = []         # top-level article numbers in insertion order
    last_top_level: str | None = None  # highest-numbered top-level seen so far

    for num, seg_lines in segments:
        # Rule 1: prefix sub-article (4.1 is sub of 4)
        parent = _find_parent(num, order)

        # Rule 2: backwards numbering (e.g. "1 . NDMO" after top-level "8")
        if not parent and last_top_level and _numerically_before(num, last_top_level):
            parent = last_top_level

        if parent:
            articles[parent].extend(['', '[' + num + ']'])
            articles[parent].extend(seg_lines)
        else:
            articles[num] = list(seg_lines)
            order.append(num)
            last_top_level = num   # update the frontier

    # Build output
    result = []
    for num in order:
        text = clean_text('\n'.join(articles[num]))
        if text:
            result.append({'articleNumber': num, 'articleText': text})

    return result


# ── Per-document processing ────────────────────────────────────────────────────

async def process_document(doc_id, filename, noesia_doc_id, output_dir):
    from app.services.noesia import NoesiaClient

    client = NoesiaClient()
    print(f'  Fetching markdown — {filename} …', flush=True)
    try:
        markdown = await client.get_document_content(noesia_doc_id)
    except Exception as exc:
        print(f'  ERROR: {exc}')
        return 0

    articles = extract_articles(markdown)

    safe_name = re.sub(r'[^\w\-.]', '_', filename)
    out_path = output_dir / (safe_name + '.json')
    out_path.write_text(
        json.dumps(articles, ensure_ascii=False, indent=2),
        encoding='utf-8',
    )
    print(f'  ✓  {len(articles):>4} articles  →  {out_path}')
    return len(articles)


# ── Entry point ────────────────────────────────────────────────────────────────

async def main(doc_id, output_dir):
    sys.path.insert(0, '/app')

    from app.db.session import AsyncSessionLocal
    from app.db.models.base_document import BaseDocument
    from sqlalchemy import select

    output_dir.mkdir(parents=True, exist_ok=True)

    async with AsyncSessionLocal() as db:
        q = select(
            BaseDocument.id,
            BaseDocument.filename,
            BaseDocument.noesia_document_id,
        ).where(
            BaseDocument.uploaded_by == 'superadmin',
            BaseDocument.processing_status == 'completed',
            BaseDocument.noesia_document_id.isnot(None),
        )
        if doc_id:
            q = q.where(BaseDocument.id == doc_id)

        rows = (await db.execute(q)).all()

    if not rows:
        print('No completed superadmin base documents found.')
        return

    print(f'Found {len(rows)} document(s).\n')
    total = 0
    for row in rows:
        total += await process_document(
            str(row.id), row.filename, row.noesia_document_id, output_dir,
        )

    print(f'\nTotal articles extracted : {total}')
    print(f'Output directory         : {output_dir}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Extract articles from Noesia markdown.')
    parser.add_argument('--doc-id', help='Process only this document UUID.')
    parser.add_argument(
        '--output-dir',
        default='/tmp/mizan-article-extracts',
        help='Output directory (default: /tmp/mizan-article-extracts).',
    )
    args = parser.parse_args()
    asyncio.run(main(args.doc_id, Path(args.output_dir)))
