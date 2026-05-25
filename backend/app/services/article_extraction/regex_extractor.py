"""
Fast deterministic article extractor using regex pattern matching.

Handles all numbering formats found in legal/regulatory documents:
  - Eastern Arabic numerals (١, ٢, ١٠ …)
  - Western Arabic digits   (1, 2, 10 …)
  - Uppercase Roman numerals (I, IV, XI …)
  - Single letters           (A, B, C …)
  - Mixed separators (4.1, A.1, IV.2 …)

Sub-articles are merged into their parent.
Backwards-numbered sub-sections are merged into the last top-level parent.
"""
from __future__ import annotations

import re

# ── Noise filters ──────────────────────────────────────────────────────────────

_NOISE_LINE_RE = re.compile(
    r'^\s*(?:Logo|Line\s+chart|Icon|<!--.*?-->)\s*$',
    re.IGNORECASE,
)
_TABLE_SEP_RE = re.compile(r'^\s*\|[\s\-|:]+\|\s*$')

# ── Number segment patterns ───────────────────────────────────────────────────

_EAST_AR = r'[٠-٩]+'
_WEST    = r'\d+'
_ROMAN   = r'(?:M{1,4}|CM|CD|DC{0,3}|C{1,4}|XC|XL|LX{0,3}|X{1,4}|IX|IV|VI{0,3}|I{1,4})'
_ALPHA   = r'[A-Za-z]'

_SEG     = '(?:' + _EAST_AR + '|' + _WEST + '|' + _ROMAN + '|' + _ALPHA + ')'
_SEP     = r'[./،,\-]'
MIXED_NUM = _SEG + '(?:' + _SEP + _SEG + ')*'

# ── Article heading patterns ──────────────────────────────────────────────────

_KEYWORDS = r'(?:Article|Section|Clause|مادة|المادة)'

# "## Article (NUMBER):" or "## Article NUMBER:"
_ART_RE = re.compile(
    r'^(#{1,4})\s+' + _KEYWORDS + r'\s*'
    r'[\(（]?(' + MIXED_NUM + r')[\)）]?\s*:?\s*$',
    re.IGNORECASE | re.UNICODE,
)

# "## NUMBER . Title"
_NUM_SECTION_RE = re.compile(
    r'^(#{1,4})\s+(' + MIXED_NUM + r')\s*\.\s+\S',
    re.UNICODE,
)

# Plain "Article (NUMBER):" — anchored so it doesn't match inline references
_ART_PLAIN_RE = re.compile(
    r'^\s*' + _KEYWORDS + r'\s*'
    r'[\(（]?(' + MIXED_NUM + r')[\)）]\s*:?\s*$',
    re.IGNORECASE | re.UNICODE,
)


def _detect_heading(line: str) -> str | None:
    m = _ART_RE.match(line)
    if m:
        return m.group(2)
    m = _NUM_SECTION_RE.match(line)
    if m:
        return m.group(2)
    m = _ART_PLAIN_RE.match(line)
    if m:
        return m.group(1)
    return None


# ── Number comparison helpers ─────────────────────────────────────────────────

_EAST_TO_WEST = str.maketrans('٠١٢٣٤٥٦٧٨٩', '0123456789')
_ROMAN_MAP = {'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100, 'D': 500, 'M': 1000}


def _roman_to_int(s: str) -> int:
    s = s.upper()
    result, prev = 0, 0
    for ch in reversed(s):
        v = _ROMAN_MAP.get(ch, 0)
        result = result - v if v < prev else result + v
        prev = v
    return result


def _num_to_float(num: str) -> float:
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


def _is_sub_of(child: str, parent: str) -> bool:
    for sep in '.،,/-':
        if child.startswith(parent + sep):
            return True
    return False


def _find_parent(num: str, seen: list[str]) -> str | None:
    for candidate in reversed(seen):
        if _is_sub_of(num, candidate):
            return candidate
    return None


def _numerically_before(a: str, b: str) -> bool:
    try:
        return _num_to_float(a) < _num_to_float(b)
    except Exception:
        return False


# ── Text cleaning ─────────────────────────────────────────────────────────────

def _clean_text(raw: str) -> str:
    out = []
    for line in raw.split('\n'):
        if _NOISE_LINE_RE.match(line):
            continue
        if _TABLE_SEP_RE.match(line):
            continue
        out.append(line)
    text = '\n'.join(out).strip()
    return re.sub(r'\n{3,}', '\n\n', text)


# ── Core extraction ───────────────────────────────────────────────────────────

def extract_articles(markdown: str) -> list[dict]:
    """
    Extract all numbered provisions from Noesia-processed markdown.
    Returns a list of {"articleNumber": str, "articleText": str} dicts.
    """
    lines = markdown.split('\n')

    # Pass 1: collect raw segments in document order
    segments: list[tuple[str, list[str]]] = []
    current_num: str | None = None
    current_lines: list[str] = []

    for line in lines:
        num = _detect_heading(line)
        if num:
            if current_num is not None:
                segments.append((current_num, current_lines))
            current_num = num
            current_lines = []
        elif current_num is not None:
            current_lines.append(line)

    if current_num is not None and current_lines:
        segments.append((current_num, current_lines))

    # Pass 2: merge sub-articles and backwards-numbered sub-sections
    articles: dict[str, list[str]] = {}
    order: list[str] = []
    last_top_level: str | None = None

    for num, seg_lines in segments:
        parent = _find_parent(num, order)

        # Backwards-numbered sub-section: "1 . NDMO" appearing after top-level "8"
        if not parent and last_top_level and _numerically_before(num, last_top_level):
            parent = last_top_level

        if parent:
            articles[parent].extend(['', '[' + num + ']'])
            articles[parent].extend(seg_lines)
        else:
            articles[num] = list(seg_lines)
            order.append(num)
            last_top_level = num

    # Build output
    result = []
    for num in order:
        text = _clean_text('\n'.join(articles[num]))
        if text:
            result.append({'articleNumber': num, 'articleText': text})

    return result
