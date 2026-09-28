"""In-app issue reporting: creates a GitHub issue in GITHUB_REPO.

The token stays on the server. Reports are validated, rate-limited per client IP,
@-mentions are neutralised, and a honeypot field drops naive spam bots. Without a
token the UI falls back to GitHub's own "new issue" page (prefilled).
"""
import threading
import time
from collections import deque
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Request
from sqlmodel import SQLModel

from .. import config
from ..i18n import AppError

router = APIRouter(prefix="/issues")

KINDS = {"bug": ("bug", "Bug"), "idea": ("enhancement", "Idea"), "question": ("question", "Question")}
PER_IP_LIMIT, PER_IP_WINDOW = 5, 600  # 5 reports per 10 minutes per client
_hits: dict[str, deque] = {}
_lock = threading.Lock()


class IssueIn(SQLModel):
    title: str
    description: str
    kind: str = "bug"
    context: dict[str, str] = {}
    website: str = ""  # honeypot: humans never see or fill this


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "?")


def _rate_limited(ip: str) -> bool:
    now = time.monotonic()
    with _lock:
        q = _hits.setdefault(ip, deque())
        while q and now - q[0] > PER_IP_WINDOW:
            q.popleft()
        if len(q) >= PER_IP_LIMIT:
            return True
        q.append(now)
        return False


def _clean(text: str, limit: int) -> str:
    # zero-width space after @ prevents pinging GitHub users/teams from anonymous reports
    return text.strip()[:limit].replace("@", "@​")


def render_body(issue: IssueIn) -> str:
    rows = "\n".join(f"| {_clean(k, 40)} | {_clean(v, 300).replace('|', '/')} |"
                     for k, v in list(issue.context.items())[:15])
    ctx = f"\n\n<details><summary>App context</summary>\n\n| | |\n|---|---|\n{rows}\n\n</details>" if rows else ""
    return f"{_clean(issue.description, 6000)}{ctx}\n\n---\n_Reported from the Baltic Truck Planner app._"


def new_issue_url(title: str = "", body: str = "") -> str:
    q = urlencode({k: v for k, v in (("title", title), ("body", body)) if v})
    return f"https://github.com/{config.GITHUB_REPO}/issues/new" + (f"?{q}" if q else "")


@router.get("/config")
def issue_config():
    return {"enabled": bool(config.GITHUB_TOKEN and config.GITHUB_REPO), "repo": config.GITHUB_REPO,
            "repo_url": f"https://github.com/{config.GITHUB_REPO}", "new_issue_url": new_issue_url()}


@router.post("")
def create_issue(issue: IssueIn, request: Request):
    title = issue.title.strip()
    if issue.website:  # honeypot tripped: pretend success, create nothing
        return {"number": None, "url": f"https://github.com/{config.GITHUB_REPO}/issues"}
    if not (3 <= len(title) <= 120) or len(issue.description.strip()) < 10:
        raise AppError("issues_invalid", 422)
    if not (config.GITHUB_TOKEN and config.GITHUB_REPO):
        raise AppError("issues_not_configured", 503)
    if _rate_limited(_client_ip(request)):
        raise AppError("issues_rate_limited", 429)

    label, prefix = KINDS.get(issue.kind, KINDS["bug"])
    payload = {"title": f"[{prefix}] {_clean(title, 120)}", "body": render_body(issue), "labels": [label, "from-app"]}
    try:
        r = httpx.post(
            f"https://api.github.com/repos/{config.GITHUB_REPO}/issues",
            json=payload,
            headers={"Authorization": f"Bearer {config.GITHUB_TOKEN}", "Accept": "application/vnd.github+json",
                     "X-GitHub-Api-Version": "2022-11-28", "User-Agent": config.HTTP_USER_AGENT},
            timeout=20,
        )
    except httpx.HTTPError as e:
        raise AppError("issues_github_error", 502, detail=str(e))
    if r.status_code != 201:
        detail = r.json().get("message", r.text) if r.headers.get("content-type", "").startswith("application/json") \
            else r.text
        raise AppError("issues_github_error", 502, detail=f"{r.status_code} {detail}"[:300])
    data = r.json()
    return {"number": data["number"], "url": data["html_url"]}
