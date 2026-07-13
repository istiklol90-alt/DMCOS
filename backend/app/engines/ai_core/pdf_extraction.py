"""
PDF-to-text extraction. Closes a gap discovered before any real Claude API
call was ever made: document_text was previously just the uploaded
filename (see git history's Decision 042/043 commits), never the file's
actual content -- MockClaudeProvider never noticed because it ignores
document_text entirely by design, but ClaudeProvider would have silently
received a filename string as "the contract" on its first real call.

Uses pdfplumber -- verified beforehand against a real 13-page DMC
contract PDF (41,989 characters extracted cleanly, real rate/tax
terminology intact) before this was wired into the pipeline.

No file storage layer exists in this project (CLAUDE.md's reality-vs-docs
gap) -- text is extracted synchronously, directly from the uploaded
bytes, and only the resulting text is ever persisted (on
ContractIngestionJob.document_text). The raw PDF itself is never written
to disk or any blob store.
"""

import io

import pdfplumber


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """
    Extract all readable text from a PDF's raw bytes, page by page, joined
    with newlines. Raises ValueError (same convention as every other
    Engine's service.py) if the bytes aren't a valid PDF pdfplumber can
    open, or if not a single page yields any text -- e.g. a scanned/
    image-only PDF with no text layer, since pdfplumber does no OCR.
    """
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            pages = [page.extract_text() or "" for page in pdf.pages]
    except Exception as e:
        raise ValueError(f"Could not read this file as a PDF: {e}")

    text = "\n".join(pages).strip()
    if not text:
        raise ValueError(
            "No extractable text found in this PDF -- it may be a scanned/image-only "
            "document with no text layer (OCR is not implemented)"
        )
    return text
