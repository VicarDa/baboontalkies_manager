#!/usr/bin/env python3

import argparse
import contextlib
import json
import os
import re
import shutil
import sys
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path

SYSTEM_FONT_CANDIDATES = [
    Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf"),
    Path("/System/Library/Fonts/Supplemental/Arial.ttf"),
    Path("/System/Library/Fonts/Supplemental/Times New Roman.ttf"),
]

PAGE_SEPARATOR = "\n<<<BT_PAGE_BREAK>>>\n"
PAGE_MARKER_PATTERN = re.compile(
    rf"\{{(?P<page_id>\d+)\}}{re.escape(PAGE_SEPARATOR)}"
)


def resolve_fallback_font() -> Path:
    for candidate in SYSTEM_FONT_CANDIDATES:
        if candidate.exists():
            return candidate

    raise RuntimeError("No usable local fallback font was found on this machine")


def ensure_font_file(target_path: Path, source_path: Path):
    if target_path.exists():
        return

    target_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source_path, target_path)


def ensure_runtime_fonts():
    from marker.settings import settings as marker_settings
    from surya.settings import settings as surya_settings

    fallback_font = resolve_fallback_font()
    target_paths = {Path(marker_settings.FONT_PATH)}
    target_paths.update(Path(font_path) for font_path in surya_settings.RECOGNITION_RENDER_FONTS.values())

    for target_path in target_paths:
        ensure_font_file(target_path, fallback_font)


def render_cover(pdf_path: Path, output_path: Path):
    import fitz

    document = fitz.open(pdf_path)
    try:
        if document.page_count <= 0:
            raise RuntimeError("PDF is empty")

        page = document.load_page(0)
        matrix = fitz.Matrix(2, 2)
        pixmap = page.get_pixmap(matrix=matrix, alpha=False)
        pixmap.save(output_path)
        return document.page_count
    finally:
        document.close()


def split_markdown_by_page(markdown_text: str, page_count: int):
    matches = list(PAGE_MARKER_PATTERN.finditer(markdown_text or ""))
    pages = []

    if not matches:
        normalized = (markdown_text or "").strip()
        total_pages = max(page_count or 0, 1)
        for page_index in range(total_pages):
            pages.append(
                {
                    "pageNumber": page_index + 1,
                    "pageIndex": page_index,
                    "contentMarkdown": normalized if page_index == 0 else "",
                }
            )
        return pages

    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(markdown_text)
        page_index = int(match.group("page_id"))
        page_content = markdown_text[start:end].strip()
        pages.append(
            {
                "pageNumber": page_index + 1,
                "pageIndex": page_index,
                "contentMarkdown": page_content,
            }
        )

    pages.sort(key=lambda item: item["pageIndex"])
    existing_indexes = {page["pageIndex"] for page in pages}
    for page_index in range(page_count or 0):
        if page_index in existing_indexes:
            continue
        pages.append(
            {
                "pageNumber": page_index + 1,
                "pageIndex": page_index,
                "contentMarkdown": "",
            }
        )

    pages.sort(key=lambda item: item["pageIndex"])
    return pages


def build_content_markdown(pages):
    sections = []
    for page in pages:
        heading = f"## Page {page['pageNumber']}"
        content = (page.get("contentMarkdown") or "").strip()
        section = heading if not content else f"{heading}\n\n{content}"
        sections.append(section.rstrip())

    return "\n\n---\n\n".join(filter(None, sections)).strip()


def parse_pdf(input_path: Path, output_dir: Path):
    os.environ.setdefault("TORCH_DEVICE", "cpu")
    output_dir.mkdir(parents=True, exist_ok=True)
    ensure_runtime_fonts()

    from marker.converters.pdf import PdfConverter
    from marker.models import create_model_dict
    from marker.output import text_from_rendered

    cover_path = output_dir / "cover.png"
    content_path = output_dir / "content.md"
    pages_json_path = output_dir / "pages.json"
    parse_json_path = output_dir / "parse.json"

    page_count = render_cover(input_path, cover_path)

    converter = PdfConverter(
        artifact_dict=create_model_dict(),
        config={
            "paginate_output": True,
            "page_separator": PAGE_SEPARATOR,
        },
    )
    rendered = converter(str(input_path))
    paginated_markdown, _, _ = text_from_rendered(rendered)
    pages = split_markdown_by_page(paginated_markdown, page_count)
    content_markdown = build_content_markdown(pages)

    page_entries = []
    for page in pages:
        page_entries.append(
            {
                "page_number": page["pageNumber"],
                "page_index": page["pageIndex"],
                "char_count": len(page["contentMarkdown"]),
                "content_markdown": page["contentMarkdown"],
            }
        )

    content_path.write_text(content_markdown, encoding="utf-8")
    pages_json_path.write_text(
        json.dumps(
            {
                "page_count": page_count,
                "pages": page_entries,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    parser_version = version("marker-pdf")
    parse_payload = {
        "success": True,
        "parser_name": "marker",
        "parser_version": parser_version,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "page_count": page_count,
        "files": {
            "cover": cover_path.name,
            "content": content_path.name,
            "pages_index": pages_json_path.name,
        },
        "content_markdown": content_markdown,
        "pages": page_entries,
    }
    parse_json_path.write_text(
        json.dumps(parse_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    return {
        "success": True,
        "parser_name": "marker",
        "parser_version": parser_version,
        "page_count": page_count,
        "cover_path": str(cover_path),
        "content_path": str(content_path),
        "pages_index_path": str(pages_json_path),
        "parse_json_path": str(parse_json_path),
    }


def main():
    parser = argparse.ArgumentParser(description="Parse PDF with Marker and export cover/markdown/json")
    parser.add_argument("--input", required=True, help="Input PDF path")
    parser.add_argument("--output-dir", required=True, help="Output directory")
    args = parser.parse_args()

    try:
        with contextlib.redirect_stdout(sys.stderr):
            result = parse_pdf(Path(args.input), Path(args.output_dir))
        print(json.dumps(result, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({
            "success": False,
            "error": str(exc),
        }, ensure_ascii=False))


if __name__ == "__main__":
    main()
