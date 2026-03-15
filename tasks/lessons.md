# Mizan — Lessons Learned

_Updated as mistakes are caught and patterns identified._

## Noesia Integration
- Always use two-step flow: upload file first → then create ingest job with document_ids
- Never pass `custom_metadata` in the upload step — only in the ingest payload
- Make uploaded filenames unique per document ID (append first 8 chars of UUID) to prevent Noesia path collisions
- Poll job status with retry on transient DNS errors (up to 3 attempts with backoff)

## Database
- Use `async with AsyncSession` everywhere in API routes
- Never use sync SQLAlchemy in async context
- Always soft-delete (set `deleted_at`) rather than hard-delete

## Celery
- Celery tasks must be sync functions wrapping `asyncio.run(async_pipeline())`
- Use `--pool=solo` for local dev to avoid multiprocessing issues on Windows/macOS
