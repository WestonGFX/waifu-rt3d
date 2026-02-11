from pathlib import Path


def _write_v2_dist(root: Path) -> None:
    assets = root / "assets"
    assets.mkdir(parents=True, exist_ok=True)
    (root / "index.html").write_text("<html><body><div id='root'></div></body></html>", encoding="utf-8")
    (assets / "app.js").write_text("console.log('v2');", encoding="utf-8")


def _write_neon_index(root: Path) -> None:
    root.mkdir(parents=True, exist_ok=True)
    (root / "index.html").write_text("<html><body><div id='neon-root'></div></body></html>", encoding="utf-8")


def test_root_defaults_to_neon(client, server_module, tmp_path: Path):
    neon = tmp_path / "neon"
    dist = tmp_path / "v2dist"
    _write_neon_index(neon)
    _write_v2_dist(dist)
    server_module.FRONTEND = neon
    server_module.FRONTEND_V2_DIST = dist

    response = client.get("/")

    assert response.status_code == 200
    assert "neon-root" in response.text
    assert "<div id='root'>" not in response.text


def test_root_uses_v2_when_flag_enabled(client, server_module, monkeypatch, tmp_path: Path):
    neon = tmp_path / "neon"
    dist = tmp_path / "v2dist"
    _write_neon_index(neon)
    _write_v2_dist(dist)
    server_module.FRONTEND = neon
    server_module.FRONTEND_V2_DIST = dist
    monkeypatch.setenv(server_module.DEFAULT_FRONTEND_ENV, "v2")

    response = client.get("/")

    assert response.status_code == 200
    assert "<div id='root'>" in response.text


def test_legacy_route_always_serves_neon(client, server_module, monkeypatch, tmp_path: Path):
    neon = tmp_path / "neon"
    dist = tmp_path / "v2dist"
    _write_neon_index(neon)
    _write_v2_dist(dist)
    server_module.FRONTEND = neon
    server_module.FRONTEND_V2_DIST = dist
    monkeypatch.setenv(server_module.DEFAULT_FRONTEND_ENV, "v2")

    response = client.get("/legacy")

    assert response.status_code == 200
    assert "neon-root" in response.text
    assert "<div id='root'>" not in response.text


def test_root_v2_flag_falls_back_to_neon_when_v2_missing(client, server_module, monkeypatch, tmp_path: Path):
    neon = tmp_path / "neon"
    _write_neon_index(neon)
    server_module.FRONTEND = neon
    server_module.FRONTEND_V2_DIST = tmp_path / "missing-v2"
    monkeypatch.setenv(server_module.DEFAULT_FRONTEND_ENV, "v2")

    response = client.get("/")

    assert response.status_code == 200
    assert "neon-root" in response.text


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
