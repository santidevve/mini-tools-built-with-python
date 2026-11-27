"""Webhook Lab — Interactive local Webhook & HTTP Request Inspector."""

from __future__ import annotations

import os
import re
import secrets
import shutil
from pathlib import Path
from typing import Any

from flask import (
    Flask,
    Response,
    abort,
    current_app,
    jsonify,
    redirect,
    render_template,
    request,
    url_for,
)

import db

SUPPORTED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]
FILTER_METHODS = ["ALL", "GET", "POST", "PUT", "PATCH", "DELETE"]
HOP_BY_HOP_HEADERS = {"host", "content-length", "connection", "accept-encoding"}


def _slugify_bin_id(name: str) -> str:
    """Create a short, URL-safe bin identifier from a human-readable name."""
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    prefix = slug[:20].strip("-") if slug else "bin"
    suffix = secrets.token_hex(3)
    return f"{prefix}-{suffix}"


def _parse_status_code(raw_value: Any, default: int = 200) -> int:
    """Validate an HTTP status code in [100, 599], raising ValueError if invalid."""
    if raw_value is None or str(raw_value).strip() == "":
        return default
    try:
        code = int(raw_value)
    except (TypeError, ValueError) as exc:
        raise ValueError("Status code must be an integer between 100 and 599.") from exc
    if not 100 <= code <= 599:
        raise ValueError("Status code must be between 100 and 599.")
    return code


def _extract_query_params() -> dict[str, Any]:
    """Extract query parameters, keeping single values flat and multi-values as lists."""
    params: dict[str, Any] = {}
    for key in request.args.keys():
        values = request.args.getlist(key)
        params[key] = values[0] if len(values) == 1 else values
    return params


def _replay_captured_request(bin_id: str, captured: dict[str, Any]) -> dict[str, Any]:
    """Replay a previously captured request against the local /hook/<bin_id> endpoint."""
    headers = {
        k: v
        for k, v in captured["headers"].items()
        if k.lower() not in HOP_BY_HOP_HEADERS
    }
    headers["X-Webhook-Lab-Replay-Of"] = str(captured["id"])

    hook_path = captured["path"] or f"/hook/{bin_id}"
    if not hook_path.startswith(f"/hook/{bin_id}"):
        hook_path = f"/hook/{bin_id}"

    with current_app.test_client() as client:
        resp = client.open(
            hook_path,
            method=captured["method"],
            query_string=captured["query_params"],
            headers=headers,
            data=captured["body"].encode("utf-8"),
        )
        payload = resp.get_json(silent=True) or {}

    new_request_id = payload.get("request_id")
    if new_request_id is not None:
        replayed = db.get_request(bin_id, int(new_request_id))
        if replayed is not None:
            return replayed
    return payload


def create_app(test_config: dict[str, Any] | None = None) -> Flask:
    """Application factory for Webhook Lab."""
    app = Flask(__name__, instance_relative_config=True)
    default_db = Path(app.root_path) / "instance" / "webhook_lab.sqlite"
    if os.environ.get("VERCEL") and test_config is None:
        tmp_db = Path("/tmp/webhook_lab.sqlite")
        if not tmp_db.exists() and default_db.exists():
            shutil.copy2(default_db, tmp_db)
        default_db = tmp_db
    app.config.from_mapping(
        SECRET_KEY=os.environ.get("WEBHOOK_LAB_SECRET", "dev-webhook-lab-key"),
        DATABASE=str(default_db),
    )

    if test_config is not None:
        app.config.update(test_config)

    db.init_app(app)

    @app.errorhandler(404)
    def handle_404(error: Any) -> tuple[Response | str, int]:
        if request.path.startswith("/api/") or request.path.startswith("/hook/"):
            return jsonify({"error": "Not found", "detail": str(error)}), 404
        return render_template("error.html", code=404, message="Resource not found."), 404

    # ------------------------------------------------------------------
    # Web UI Routes
    # ------------------------------------------------------------------

    @app.get("/")
    def index() -> str:
        bins = db.list_bins()
        total_requests = sum(b["request_count"] for b in bins)
        return render_template(
            "index.html",
            bins=bins,
            total_requests=total_requests,
        )

    @app.post("/bins")
    def create_bin_form() -> Response | tuple[str, int]:
        name = request.form.get("name", "").strip()
        description = request.form.get("description", "").strip()
        raw_status = request.form.get("default_status_code", "200")

        if not name:
            bins = db.list_bins()
            return (
                render_template(
                    "index.html",
                    bins=bins,
                    total_requests=sum(b["request_count"] for b in bins),
                    error="Bin name is required.",
                ),
                400,
            )

        try:
            status_code = _parse_status_code(raw_status, default=200)
        except ValueError as exc:
            bins = db.list_bins()
            return (
                render_template(
                    "index.html",
                    bins=bins,
                    total_requests=sum(b["request_count"] for b in bins),
                    error=str(exc),
                ),
                400,
            )

        bin_id = _slugify_bin_id(name)
        db.create_bin(
            bin_id=bin_id,
            name=name,
            description=description,
            default_status_code=status_code,
        )
        return redirect(url_for("bin_detail", bin_id=bin_id))

    @app.get("/bins/<bin_id>")
    def bin_detail(bin_id: str) -> str:
        bin_item = db.get_bin(bin_id)
        if bin_item is None:
            abort(404, description=f"Bin '{bin_id}' does not exist.")

        method_filter = request.args.get("method", "ALL").upper()
        if method_filter not in FILTER_METHODS:
            method_filter = "ALL"
        search_query = request.args.get("q", "").strip()

        captured_requests = db.list_requests(
            bin_id=bin_id,
            method=method_filter,
            search=search_query,
        )

        selected_id = request.args.get("selected", type=int)
        selected_request = None
        if captured_requests:
            if selected_id is not None:
                selected_request = next(
                    (r for r in captured_requests if r["id"] == selected_id),
                    captured_requests[0],
                )
            else:
                selected_request = captured_requests[0]

        hook_url = url_for("capture_webhook", bin_id=bin_id, _external=True)
        return render_template(
            "bin_detail.html",
            bin=bin_item,
            hook_url=hook_url,
            requests_list=captured_requests,
            selected_request=selected_request,
            method_filter=method_filter,
            search_query=search_query,
            filter_methods=FILTER_METHODS,
        )

    @app.post("/bins/<bin_id>/delete")
    def delete_bin_form(bin_id: str) -> Response:
        if not db.delete_bin(bin_id):
            abort(404)
        return redirect(url_for("index"))

    @app.post("/bins/<bin_id>/clear")
    def clear_bin_form(bin_id: str) -> Response:
        if db.get_bin(bin_id) is None:
            abort(404)
        db.clear_requests(bin_id)
        return redirect(url_for("bin_detail", bin_id=bin_id))

    @app.post("/bins/<bin_id>/simulate")
    def simulate_webhook(bin_id: str) -> Response:
        bin_item = db.get_bin(bin_id)
        if bin_item is None:
            abort(404)

        method = request.form.get("method", "POST").upper()
        if method not in {"GET", "POST", "PUT", "PATCH", "DELETE"}:
            method = "POST"
        content_type = request.form.get("content_type", "application/json").strip()
        body = request.form.get("body", "")
        query_raw = request.form.get("query_string", "").strip().lstrip("?")

        headers = {"X-Webhook-Lab-Source": "ui-simulator"}
        if content_type:
            headers["Content-Type"] = content_type

        target = f"/hook/{bin_id}"
        if query_raw:
            target = f"{target}?{query_raw}"

        with current_app.test_client() as client:
            resp = client.open(
                target,
                method=method,
                headers=headers,
                data=body.encode("utf-8") if method != "GET" else b"",
            )
            payload = resp.get_json(silent=True) or {}

        selected_id = payload.get("request_id")
        return redirect(url_for("bin_detail", bin_id=bin_id, selected=selected_id))

    @app.post("/bins/<bin_id>/requests/<int:request_id>/replay")
    def replay_request_form(bin_id: str, request_id: int) -> Response:
        if db.get_bin(bin_id) is None:
            abort(404)
        captured = db.get_request(bin_id, request_id)
        if captured is None:
            abort(404)

        replayed = _replay_captured_request(bin_id, captured)
        return redirect(
            url_for("bin_detail", bin_id=bin_id, selected=replayed.get("id"))
        )

    # ------------------------------------------------------------------
    # Webhook Capture Endpoint
    # ------------------------------------------------------------------

    @app.route("/hook/<bin_id>", methods=SUPPORTED_METHODS)
    @app.route("/hook/<bin_id>/<path:subpath>", methods=SUPPORTED_METHODS)
    def capture_webhook(bin_id: str, subpath: str = "") -> tuple[Response, int]:
        bin_item = db.get_bin(bin_id)
        if bin_item is None:
            return jsonify({"error": "Bin not found", "bin_id": bin_id}), 404

        raw_status = request.args.get("status")
        try:
            response_status = _parse_status_code(
                raw_status, default=bin_item["default_status_code"]
            )
        except ValueError:
            response_status = bin_item["default_status_code"]

        replay_header = request.headers.get("X-Webhook-Lab-Replay-Of")
        replayed_from_id: int | None = None
        is_replay = False
        if replay_header and replay_header.isdigit():
            replayed_from_id = int(replay_header)
            is_replay = True

        headers_dict = {
            k: v
            for k, v in request.headers.items()
            if k.lower() != "x-webhook-lab-replay-of"
        }
        raw_body = request.get_data(as_text=True) or ""
        full_path = f"/hook/{bin_id}" + (f"/{subpath}" if subpath else "")

        recorded = db.record_request(
            bin_id=bin_id,
            method=request.method,
            path=full_path,
            headers=headers_dict,
            query_params=_extract_query_params(),
            body=raw_body,
            content_type=request.content_type or "",
            remote_addr=request.remote_addr or "",
            status_code=response_status,
            is_replay=is_replay,
            replayed_from_id=replayed_from_id,
        )

        return (
            jsonify(
                {
                    "status": "captured",
                    "bin_id": bin_id,
                    "request_id": recorded["id"],
                    "method": recorded["method"],
                    "is_replay": recorded["is_replay"],
                    "timestamp": recorded["created_at"],
                }
            ),
            response_status,
        )

    # ------------------------------------------------------------------
    # JSON API Routes
    # ------------------------------------------------------------------

    @app.get("/api/bins")
    def api_list_bins() -> Response:
        return jsonify({"bins": db.list_bins()})

    @app.post("/api/bins")
    def api_create_bin() -> tuple[Response, int]:
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify({"error": "JSON body is required."}), 400

        name = str(data.get("name", "")).strip()
        if not name:
            return jsonify({"error": "Field 'name' is required."}), 400

        description = str(data.get("description", "")).strip()
        try:
            status_code = _parse_status_code(
                data.get("default_status_code"), default=200
            )
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

        bin_id = _slugify_bin_id(name)
        created = db.create_bin(
            bin_id=bin_id,
            name=name,
            description=description,
            default_status_code=status_code,
        )
        created["hook_url"] = url_for("capture_webhook", bin_id=bin_id, _external=True)
        return jsonify(created), 201

    @app.get("/api/bins/<bin_id>")
    def api_get_bin(bin_id: str) -> tuple[Response, int]:
        bin_item = db.get_bin(bin_id)
        if bin_item is None:
            return jsonify({"error": "Bin not found"}), 404
        return jsonify(bin_item), 200

    @app.delete("/api/bins/<bin_id>")
    def api_delete_bin(bin_id: str) -> tuple[Response, int]:
        if not db.delete_bin(bin_id):
            return jsonify({"error": "Bin not found"}), 404
        return jsonify({"deleted": True, "bin_id": bin_id}), 200

    @app.get("/api/bins/<bin_id>/requests")
    def api_list_requests(bin_id: str) -> tuple[Response, int]:
        if db.get_bin(bin_id) is None:
            return jsonify({"error": "Bin not found"}), 404
        method = request.args.get("method", "ALL")
        search = request.args.get("q", "")
        items = db.list_requests(bin_id=bin_id, method=method, search=search)
        return jsonify({"bin_id": bin_id, "count": len(items), "requests": items}), 200

    @app.delete("/api/bins/<bin_id>/requests")
    def api_clear_requests(bin_id: str) -> tuple[Response, int]:
        if db.get_bin(bin_id) is None:
            return jsonify({"error": "Bin not found"}), 404
        deleted = db.clear_requests(bin_id)
        return jsonify({"bin_id": bin_id, "cleared": deleted}), 200

    @app.post("/api/bins/<bin_id>/requests/<int:request_id>/replay")
    def api_replay_request(bin_id: str, request_id: int) -> tuple[Response, int]:
        if db.get_bin(bin_id) is None:
            return jsonify({"error": "Bin not found"}), 404
        captured = db.get_request(bin_id, request_id)
        if captured is None:
            return jsonify({"error": "Request not found"}), 404

        replayed = _replay_captured_request(bin_id, captured)
        return jsonify({"replayed": replayed}), 201

    @app.get("/api/bins/<bin_id>/export")
    def api_export_requests(bin_id: str) -> Response | tuple[Response, int]:
        bin_item = db.get_bin(bin_id)
        if bin_item is None:
            return jsonify({"error": "Bin not found"}), 404

        items = db.list_requests(bin_id=bin_id)
        payload = {
            "bin": bin_item,
            "exported_count": len(items),
            "requests": items,
        }
        response = current_app.response_class(
            response=current_app.json.dumps(payload, indent=2),
            status=200,
            mimetype="application/json",
        )
        response.headers["Content-Disposition"] = (
            f'attachment; filename="webhook-lab-{bin_id}.json"'
        )
        return response

    return app


app = create_app()

if __name__ == "__main__":
    app.run(debug=True, port=5000)
