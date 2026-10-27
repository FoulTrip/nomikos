"""agent/files.py — Files API mínima del workshop (S1 real).

Todo vía api :8080 con Bearer de cuenta. NUNCA toca ground_truth/
(solo el proceso api puede leerlo).
Solo stdlib (el runner no exige el venv de brain).
"""

from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request

API_URL = os.getenv("AGENT_OS_API_URL", "http://localhost:8080/api").rstrip("/")


def _req(method: str, path: str, bearer: str, body: dict | None = None) -> tuple[int, dict]:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        API_URL + path,
        method=method,
        data=data,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {bearer}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read().decode() or "{}"
            return r.status, json.loads(raw)
    except urllib.error.HTTPError as e:
        try:
            raw = e.read().decode() or "{}"
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"ok": False, "error": f"HTTP {e.code}"}


def list_case_docs(case_id: str, bearer: str, api_url: str | None = None) -> dict:
    """GET /legal/cases/{id}/docs → {docs, case}."""
    global API_URL
    if api_url:
        API_URL = api_url.rstrip("/")
    q = urllib.parse.quote(case_id)
    code, body = _req("GET", f"/legal/cases/{q}/docs", bearer)
    if code != 200:
        raise RuntimeError(f"list_case_docs HTTP {code}: {body}")
    return body


def read_case_doc(case_id: str, name: str, bearer: str, api_url: str | None = None) -> str:
    """GET /legal/cases/{id}/docs/{name} → content."""
    global API_URL
    if api_url:
        API_URL = api_url.rstrip("/")
    q = urllib.parse.quote(case_id)
    n = urllib.parse.quote(name)
    code, body = _req("GET", f"/legal/cases/{q}/docs/{n}", bearer)
    if code != 200:
        raise RuntimeError(f"read_case_doc HTTP {code}: {body}")
    return str(body.get("content", ""))


def create_run(case_id: str, bearer: str, api_url: str | None = None) -> dict:
    global API_URL
    if api_url:
        API_URL = api_url.rstrip("/")
    code, body = _req("POST", "/legal/runs", bearer, {"case_id": case_id})
    if code != 200:
        raise RuntimeError(f"create_run HTTP {code}: {body}")
    return body


def append_turn(run_id: str, content: str, bearer: str, role: str = "agent",
                api_url: str | None = None) -> dict:
    global API_URL
    if api_url:
        API_URL = api_url.rstrip("/")
    q = urllib.parse.quote(run_id)
    code, body = _req("POST", f"/legal/runs/{q}/turns", bearer,
                      {"role": role, "content": content})
    if code != 200:
        raise RuntimeError(f"append_turn HTTP {code}: {body}")
    return body


def submit_memorandum(run_id: str, memorandum: str, bearer: str,
                      api_url: str | None = None) -> dict:
    global API_URL
    if api_url:
        API_URL = api_url.rstrip("/")
    q = urllib.parse.quote(run_id)
    code, body = _req("POST", f"/legal/runs/{q}/submit", bearer, {"memorandum": memorandum})
    if code != 200:
        raise RuntimeError(f"submit HTTP {code}: {body}")
    return body


def get_run(run_id: str, bearer: str, api_url: str | None = None) -> dict:
    global API_URL
    if api_url:
        API_URL = api_url.rstrip("/")
    q = urllib.parse.quote(run_id)
    code, body = _req("GET", f"/legal/runs/{q}", bearer)
    if code != 200:
        raise RuntimeError(f"get_run HTTP {code}: {body}")
    return body
