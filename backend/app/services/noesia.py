import asyncio
import json
import logging
import os
from dataclasses import dataclass

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class NoesiaError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"Noesia API error {status_code}: {detail}")


@dataclass
class IngestResult:
    job_id: str
    collection_id: str | None
    document_map: dict[str, str]  # {noesia_doc_id: mizan_doc_id}
    job_detail: dict


class NoesiaClient:
    def __init__(self, base_url: str | None = None, token: str | None = None) -> None:
        self.base_url = (base_url or settings.noesia_api_url).rstrip("/")
        self.token = token or settings.noesia_pat

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.token}"}

    async def upload_documents(
        self,
        files: list[tuple[str, bytes, str, str, str]],
    ) -> list[tuple[str, str]]:
        async def _upload_one(display_filename, content, content_type, doc_id, document_name):
            stem, ext = os.path.splitext(display_filename)
            unique_filename = f"{stem}_{doc_id.replace('-', '')}{ext}"
            async with httpx.AsyncClient(timeout=120) as http:
                logger.info("upload: uploading %s as %s (%d bytes)", display_filename, unique_filename, len(content))
                resp = await http.post(
                    f"{self.base_url}/api/v1/developer/documents/upload",
                    headers=self._headers(),
                    files={"file": (unique_filename, content, content_type)},
                )
                if not resp.is_success:
                    logger.error("upload failed — %s %s", resp.status_code, resp.text[:200])
                    raise NoesiaError(resp.status_code, resp.text)
                doc_noesia_id = resp.json()["document_id"]
                logger.info("uploaded %s → noesia_id=%s", unique_filename, doc_noesia_id)
                return doc_noesia_id, doc_id

        return list(await asyncio.gather(*[_upload_one(*f) for f in files]))

    async def ingest_documents(
        self,
        document_pairs: list[tuple[str, str]],
        collection_name: str,
        project_id: str,
        idempotency_key: str,
    ) -> IngestResult:
        noesia_doc_ids = [pair[0] for pair in document_pairs]
        payload = {
            "document_ids": noesia_doc_ids,
            "profile_slug": settings.noesia_profile_slug,
            "vector_store": {"collection_name": collection_name, "action": "append"},
            "custom_metadata": {"project_id": project_id},
        }
        headers = {**self._headers(), "Idempotency-Key": idempotency_key}
        logger.info("ingest: creating job for document_ids=%s", noesia_doc_ids)
        async with httpx.AsyncClient(timeout=300) as http:
            resp = await http.post(
                f"{self.base_url}/api/v1/developer/ingests",
                headers=headers,
                data={"payload": json.dumps(payload)},
            )
            if not resp.is_success:
                logger.error("ingest failed — %s %s", resp.status_code, resp.text[:200])
                raise NoesiaError(resp.status_code, resp.text)
            data = resp.json()
        job_id = data["job_id"]
        logger.info("ingest: job_id=%s", job_id)
        async with httpx.AsyncClient(timeout=120) as http:
            start = await http.post(
                f"{self.base_url}/api/v1/developer/jobs/{job_id}/start",
                headers=self._headers(),
            )
            if not start.is_success:
                raise NoesiaError(start.status_code, start.text or f"HTTP {start.status_code}")
        collection_id, job_detail = await self._poll_for_completion(job_id)
        document_map = {noesia_id: dms_id for noesia_id, dms_id in document_pairs}
        return IngestResult(job_id=job_id, collection_id=collection_id, document_map=document_map, job_detail=job_detail)

    async def _poll_for_completion(self, job_id: str, timeout: int = 600, interval: int = 10):
        elapsed = 0
        last_detail: dict = {}
        while elapsed < timeout:
            last_detail = await self.get_job_status(job_id)
            status = last_detail.get("status")
            if status == "failed":
                error_msg = last_detail.get("error_message") or "(no error_message)"
                raise NoesiaError(422, f"Noesia job {job_id} failed: {error_msg}")
            if status == "completed":
                return last_detail.get("collection_id"), last_detail
            logger.info("job %s status=%s elapsed=%ds", job_id, status, elapsed)
            await asyncio.sleep(interval)
            elapsed += interval
        raise NoesiaError(408, f"Job {job_id} did not complete within {timeout}s")

    async def get_job_status(self, job_id: str) -> dict:
        last_exc: Exception | None = None
        for attempt in range(3):
            try:
                async with httpx.AsyncClient(timeout=30) as client:
                    resp = await client.get(
                        f"{self.base_url}/api/v1/developer/jobs/{job_id}",
                        headers=self._headers(),
                    )
                    if not resp.is_success:
                        raise NoesiaError(resp.status_code, resp.text)
                    return resp.json()
            except NoesiaError:
                raise
            except Exception as exc:
                last_exc = exc
                wait = 5 * (attempt + 1)
                logger.warning("get_job_status attempt %d failed (%s) — retrying in %ds", attempt + 1, exc, wait)
                await asyncio.sleep(wait)
        raise last_exc  # type: ignore[misc]

    async def get_document(self, document_id: str) -> dict:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.get(
                f"{self.base_url}/api/v1/developer/documents/{document_id}",
                headers=self._headers(),
            )
            if not resp.is_success:
                raise NoesiaError(resp.status_code, resp.text)
            return resp.json()

    async def get_chunks(self, collection_id: str, document_name: str | None = None, limit: int = 200) -> list[dict]:
        params: dict = {"limit": limit}
        if document_name:
            params["document_name"] = document_name
        async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
            resp = await client.get(
                f"{self.base_url}/api/v1/developer/collections/{collection_id}/chunks",
                headers=self._headers(),
                params=params,
            )
            if not resp.is_success:
                raise NoesiaError(resp.status_code, resp.text)
            data = resp.json()
        return data.get("chunks") or data.get("data") or data.get("items") or []

    async def delete_document(self, document_id: str) -> None:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.delete(
                f"{self.base_url}/api/v1/developer/documents/{document_id}",
                headers=self._headers(),
            )
            if not resp.is_success:
                raise NoesiaError(resp.status_code, resp.text)

    async def delete_collection(self, collection_id: str) -> None:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.delete(
                f"{self.base_url}/api/v1/developer/collections/{collection_id}",
                headers=self._headers(),
            )
            if not resp.is_success:
                raise NoesiaError(resp.status_code, resp.text)


noesia_client = NoesiaClient()
