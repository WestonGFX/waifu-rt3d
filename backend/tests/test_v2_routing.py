from pathlib import Path


def _write_v2_dist(root: Path) -> None:
    assets = root / "assets"
    assets.mkdir(parents=True, exist_ok=True)
    (root / "index.html").write_text("<html><body><div id='root'></div></body></html>", encoding="utf-8")
    (assets / "app.js").write_text("console.log('v2');", encoding="utf-8")


def test_v2_spa_serves_static_file_before_spa_fallback(client, server_module, tmp_path: Path):
    dist = tmp_path / "v2dist"
    _write_v2_dist(dist)
    server_module.FRONTEND_V2_DIST = dist

    response = client.get("/v2/assets/app.js")

    assert response.status_code == 200
    assert "console.log('v2');" in response.text
    assert "<div id='root'>" not in response.text


def test_v2_spa_falls_back_to_index_for_client_routes(client, server_module, tmp_path: Path):
    dist = tmp_path / "v2dist"
    _write_v2_dist(dist)
    server_module.FRONTEND_V2_DIST = dist

    response = client.get("/v2/settings/profile")

    assert response.status_code == 200
    assert "<div id='root'>" in response.text
