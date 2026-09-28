import pytest
from fastapi.testclient import TestClient

from app import config
from app.api import issues
from app.i18n import localize_plan, msg, tr
from app.main import app


class FakeResp:
    def __init__(self, status, data):
        self.status_code, self._data, self.headers, self.text = status, data, {"content-type": "application/json"}, ""

    def json(self):
        return self._data


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(config, "GITHUB_TOKEN", "test-token")
    monkeypatch.setattr(config, "GITHUB_REPO", "owner/repo")
    issues._hits.clear()
    return TestClient(app)


GOOD = {"title": "Map does not load", "description": "Clicking optimize shows an error.", "kind": "bug",
        "context": {"page": "Planner", "lang": "lv"}}


def test_issue_created_with_labels_and_no_mentions(client, monkeypatch):
    sent = {}

    def fake_post(url, json, headers, timeout):
        sent.update(url=url, json=json, auth=headers["Authorization"])
        return FakeResp(201, {"number": 7, "html_url": "https://github.com/owner/repo/issues/7"})

    monkeypatch.setattr(issues.httpx, "post", fake_post)
    body = {**GOOD, "description": "Ping @someone please, it breaks."}
    r = client.post("/api/issues", json=body)
    assert r.status_code == 200 and r.json()["number"] == 7
    assert sent["url"].endswith("/repos/owner/repo/issues")
    assert sent["json"]["labels"] == ["bug", "from-app"]
    assert sent["json"]["title"] == "[Bug] Map does not load"
    assert "@someone" not in sent["json"]["body"] and "| page | Planner |" in sent["json"]["body"]


def test_issue_validation_translated(client):
    r = client.post("/api/issues", json={**GOOD, "title": "x"}, headers={"X-Lang": "lv"})
    assert r.status_code == 422 and r.json()["code"] == "issues_invalid"
    assert "virsrakstu" in r.json()["detail"]


def test_issue_rate_limit(client, monkeypatch):
    monkeypatch.setattr(issues.httpx, "post", lambda *a, **k: FakeResp(201, {"number": 1, "html_url": "u"}))
    codes = [client.post("/api/issues", json=GOOD).status_code for _ in range(issues.PER_IP_LIMIT + 1)]
    assert codes[-1] == 429 and set(codes[:-1]) == {200}


def test_honeypot_creates_nothing(client, monkeypatch):
    monkeypatch.setattr(issues.httpx, "post", lambda *a, **k: pytest.fail("must not call GitHub"))
    assert client.post("/api/issues", json={**GOOD, "website": "spam"}).status_code == 200


def test_not_configured(monkeypatch):
    monkeypatch.setattr(config, "GITHUB_TOKEN", "")
    r = TestClient(app).post("/api/issues", json=GOOD, headers={"X-Lang": "en"})
    assert r.status_code == 503 and r.json()["code"] == "issues_not_configured"
    assert TestClient(app).get("/api/issues/config").json()["enabled"] is False


def test_translations_complete_and_plan_localized():
    from app.i18n import MESSAGES

    assert all({"en", "lv"} <= set(v) for v in MESSAGES.values())
    plan = {"warnings": [msg("order_split", ref="ORD-1"), "legacy text"],
            "unserved": [{"id": 1, "reason_key": "exceeds_capacity", "reason": "x"}]}
    out = localize_plan(plan, "lv")
    assert out["warnings"][0]["text"] == tr("lv", "order_split", ref="ORD-1")
    assert out["warnings"][1]["text"] == "legacy text"
    assert out["unserved"][0]["reason"].startswith("pārsniedz")
