"""Tests for Webhook Lab Flask application."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app import create_app


@pytest.fixture()
def client(tmp_path: Path):
    """Create a Flask test client backed by an isolated temporary SQLite database."""
    db_file = tmp_path / "test_webhook_lab.sqlite"
    app = create_app(
        {
            "TESTING": True,
            "DATABASE": str(db_file),
        }
    )
    with app.test_client() as test_client:
        yield test_client


def _create_sample_bin(client, name: str = "Stripe Events", status_code: int = 200) -> dict:
    resp = client.post(
        "/api/bins",
        json={"name": name, "description": "Billing hooks", "default_status_code": status_code},
    )
    assert resp.status_code == 201
    return resp.get_json()


def test_dashboard_loads_empty(client):
    resp = client.get("/")
    assert resp.status_code == 200
    assert b"Webhook Lab" in resp.data
    assert b"No webhook bins yet." in resp.data


def test_create_bin_via_form_and_api_validation(client):
    # Form submission without name returns 400
    bad_form = client.post("/bins", data={"name": "   "})
    assert bad_form.status_code == 400
    assert b"Bin name is required." in bad_form.data

    # Form submission with invalid status code returns 400
    bad_status = client.post("/bins", data={"name": "Orders", "default_status_code": "999"})
    assert bad_status.status_code == 400
    assert b"Status code must be between 100 and 599." in bad_status.data

    # Valid form submission redirects to bin detail
    ok_form = client.post(
        "/bins",
        data={"name": "Orders Hook", "description": "Checkout events", "default_status_code": "201"},
        follow_redirects=True,
    )
    assert ok_form.status_code == 200
    assert b"Orders Hook" in ok_form.data

    # API validation errors
    assert client.post("/api/bins", data="not-json").status_code == 400
    assert client.post("/api/bins", json={"name": ""}).status_code == 400
    assert client.post("/api/bins", json={"name": "Test", "default_status_code": 99}).status_code == 400


def test_webhook_capture_multiple_methods_and_404(client):
    # Unknown bin returns 404 JSON
    missing = client.post("/hook/nonexistent-bin", json={"hello": "world"})
    assert missing.status_code == 404
    assert missing.get_json()["error"] == "Bin not found"

    created = _create_sample_bin(client, name="Multi Method", status_code=202)
    bin_id = created["id"]

    # POST JSON
    post_resp = client.post(
        f"/hook/{bin_id}",
        query_string={"env": "staging"},
        headers={"X-Custom-Header": "alpha-123"},
        json={"event": "payment.succeeded", "amount": 2500},
    )
    assert post_resp.status_code == 202
    assert post_resp.get_json()["status"] == "captured"
    assert post_resp.get_json()["method"] == "POST"

    # GET with subpath & query override status
    get_resp = client.get(f"/hook/{bin_id}/health?ping=1&status=200")
    assert get_resp.status_code == 200
    assert get_resp.get_json()["method"] == "GET"

    # PUT and DELETE
    assert client.put(f"/hook/{bin_id}", data="raw-put-payload").status_code == 202
    assert client.delete(f"/hook/{bin_id}").status_code == 202

    # Verify stored requests via API
    list_resp = client.get(f"/api/bins/{bin_id}/requests")
    assert list_resp.status_code == 200
    data = list_resp.get_json()
    assert data["count"] == 4
    methods = [item["method"] for item in data["requests"]]
    assert set(methods) == {"POST", "GET", "PUT", "DELETE"}

    # Check formatted JSON and headers on the POST request
    post_item = next(item for item in data["requests"] if item["method"] == "POST")
    assert post_item["parsed_json"] == {"event": "payment.succeeded", "amount": 2500}
    assert post_item["query_params"] == {"env": "staging"}
    assert post_item["headers"]["X-Custom-Header"] == "alpha-123"


def test_filtering_and_search(client):
    bin_id = _create_sample_bin(client, name="Filter Bin")["id"]

    client.post(f"/hook/{bin_id}", json={"event": "invoice.paid", "id": "inv_1"})
    client.post(f"/hook/{bin_id}", json={"event": "customer.created", "id": "cus_2"})
    client.put(f"/hook/{bin_id}", json={"event": "invoice.updated", "id": "inv_3"})

    # Filter by method
    put_only = client.get(f"/api/bins/{bin_id}/requests?method=PUT").get_json()
    assert put_only["count"] == 1
    assert put_only["requests"][0]["method"] == "PUT"

    # Search by body text
    invoice_hits = client.get(f"/api/bins/{bin_id}/requests?q=invoice").get_json()
    assert invoice_hits["count"] == 2

    # Combined method + search on UI
    ui_resp = client.get(f"/bins/{bin_id}?method=POST&q=invoice")
    assert ui_resp.status_code == 200
    assert b"inv_1" in ui_resp.data
    assert b"cus_2" not in ui_resp.data


def test_simulate_and_replay_request(client):
    bin_id = _create_sample_bin(client, name="Replay Bin")["id"]

    # Simulate from UI
    sim_resp = client.post(
        f"/bins/{bin_id}/simulate",
        data={
            "method": "POST",
            "content_type": "application/json",
            "query_string": "source=ui",
            "body": '{"order_id": 42}',
        },
        follow_redirects=True,
    )
    assert sim_resp.status_code == 200
    assert b"order_id" in sim_resp.data

    requests_data = client.get(f"/api/bins/{bin_id}/requests").get_json()["requests"]
    assert len(requests_data) == 1
    original_id = requests_data[0]["id"]

    # Replay via API
    replay_resp = client.post(f"/api/bins/{bin_id}/requests/{original_id}/replay")
    assert replay_resp.status_code == 201
    replayed = replay_resp.get_json()["replayed"]
    assert replayed["is_replay"] is True
    assert replayed["replayed_from_id"] == original_id
    assert replayed["parsed_json"] == {"order_id": 42}
    assert replayed["query_params"] == {"source": "ui"}

    # Replay missing request returns 404
    assert client.post(f"/api/bins/{bin_id}/requests/9999/replay").status_code == 404


def test_export_clear_and_delete_bin(client):
    bin_id = _create_sample_bin(client, name="Export Bin")["id"]
    client.post(f"/hook/{bin_id}", json={"hello": "export"})

    # Export JSON
    export_resp = client.get(f"/api/bins/{bin_id}/export")
    assert export_resp.status_code == 200
    assert "attachment;" in export_resp.headers["Content-Disposition"]
    exported = json.loads(export_resp.data.decode("utf-8"))
    assert exported["exported_count"] == 1
    assert exported["requests"][0]["parsed_json"] == {"hello": "export"}

    # Clear logs
    clear_resp = client.delete(f"/api/bins/{bin_id}/requests")
    assert clear_resp.status_code == 200
    assert clear_resp.get_json()["cleared"] == 1
    assert client.get(f"/api/bins/{bin_id}/requests").get_json()["count"] == 0

    # Delete bin
    del_resp = client.delete(f"/api/bins/{bin_id}")
    assert del_resp.status_code == 200
    assert client.get(f"/api/bins/{bin_id}").status_code == 404
    assert client.get(f"/bins/{bin_id}").status_code == 404
