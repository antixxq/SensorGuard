import csv
import io
import time
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text

from backend.app.main import create_app
from backend.app.models import Measurement, Settings
from backend.app.services import initialize, level, record, tick


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("SENSORGUARD_DEVICE_KEY", "test-only-secret")
    with TestClient(create_app(tmp_path / "test.db", run_simulator=False)) as client:
        yield client


def change(client, **kwargs):
    config = client.get("/api/settings").json()
    config.update(kwargs)
    response = client.put("/api/settings", json=config)
    assert response.status_code == 200
    return response.json()


def test_seed_utc_statistics_and_idempotence(client):
    assert client.get("/api/health").json()["status"] == "ok"
    assert client.get("/docs").status_code == 200
    current = client.get("/api/current").json()
    assert current["device_status"] == "demo"
    assert current["measurement"]["timestamp"].endswith("Z")
    factory = client.app.state.factory
    initialize(factory)
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(Measurement)) == 289
    data = client.get("/api/measurements?period=24h&limit=20").json()
    assert 1 <= len(data["items"]) <= 20
    assert data["source"] == "demo"
    stats = client.get("/api/stats?period=24h").json()
    assert stats["count"] >= 288
    assert (
        stats["temperature"]["min"]
        <= stats["temperature"]["average"]
        <= stats["temperature"]["max"]
    )
    assert client.get("/api/measurements?period=30d").status_code == 422
    assert client.get("/api/measurements?limit=5000").status_code == 422


@pytest.mark.parametrize(
    "value,metric,expected",
    [
        (28, "temperature", "normal"),
        (29, "temperature", "warning"),
        (31, "temperature", "critical"),
        (17, "temperature", "warning"),
        (15, "temperature", "critical"),
        (75, "humidity", "critical"),
    ],
)
def test_severity_boundaries(value, metric, expected):
    assert (
        level(
            value,
            18 if metric == "temperature" else 30,
            28 if metric == "temperature" else 65,
            metric,
        )[0]
        == expected
    )


def test_anomaly_dedup_read_and_recovery(client):
    for _ in range(2):
        assert (
            client.post(
                "/api/demo/anomaly", json={"metric": "temperature", "direction": "high"}
            ).status_code
            == 201
        )
    alerts = client.get("/api/alerts").json()["items"]
    assert len(alerts) == 1
    assert alerts[0]["severity"] == "critical"
    assert alerts[0]["source"] == "demo"
    assert client.patch(f"/api/alerts/{alerts[0]['id']}/read").json()["read"]
    assert client.patch("/api/alerts/999/read").status_code == 404
    with client.app.state.factory() as db:
        record(db, 23, 48, "demo")
        db.commit()
    assert client.get("/api/current").json()["levels"]["temperature"] == "normal"
    assert client.get("/api/alerts").json()["items"][0]["resolved_at"].endswith("Z")
    client.post("/api/demo/anomaly", json={})
    assert client.get("/api/alerts").json()["total"] == 2


def test_ingest_auth_validation_and_source_isolation(client, monkeypatch):
    payload = {"temperature": 24, "humidity": 52}
    assert client.post("/api/ingest", json=payload).status_code == 401
    headers = {"X-Device-Key": "test-only-secret"}
    assert client.post("/api/ingest", json=payload, headers=headers).status_code == 409
    change(client, mode="hardware")
    assert client.get("/api/current").json()["measurement"] is None
    assert client.get("/api/stats").json()["count"] == 0
    assert client.post("/api/demo/anomaly", json={}).status_code == 409
    assert (
        client.post(
            "/api/ingest", json={**payload, "humidity": 101}, headers=headers
        ).status_code
        == 422
    )
    result = client.post("/api/ingest", json=payload, headers=headers)
    assert result.status_code == 201 and result.json()["source"] == "hardware"
    assert client.get("/api/current").json()["device_status"] == "online"
    assert client.get("/api/stats").json()["count"] == 1
    monkeypatch.setenv("SENSORGUARD_DEVICE_KEY", "")
    assert client.post("/api/ingest", json=payload, headers=headers).status_code == 503


def test_settings_validation_persistence_and_recheck(client):
    settings = client.get("/api/settings").json()
    assert (
        client.put(
            "/api/settings", json={**settings, "humidity_min": 90, "humidity_max": 40}
        ).status_code
        == 422
    )
    assert (
        client.put(
            "/api/settings", json={**settings, "temperature_max": 81}
        ).status_code
        == 422
    )
    change(client, temperature_max=20)
    assert client.get("/api/settings").json()["temperature_max"] == 20
    assert client.get("/api/alerts").json()["total"] >= 1
    change(client, temperature_min=0, temperature_max=40)
    assert all(a["resolved_at"] for a in client.get("/api/alerts").json()["items"])


def test_simulator_pause_lease_and_offline(client):
    factory = client.app.state.factory
    change(client, simulation_enabled=False)
    with factory() as db:
        before = db.scalar(select(func.count()).select_from(Measurement))
        db.get(Settings, 1).last_tick = 0
        latest = db.scalar(
            select(Measurement).order_by(Measurement.timestamp.desc()).limit(1)
        )
        latest.timestamp = time.time() - 25
        db.commit()
    tick(factory)
    assert client.get("/api/current").json()["device_status"] == "offline"
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(Measurement)) == before
    change(client, simulation_enabled=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(lambda _: tick(factory), range(4)))
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(Measurement)) == before + 1
    assert client.get("/api/current").json()["device_status"] == "demo"


def test_csv_filters_and_empty_source(client):
    response = client.get("/api/export/csv?period=24h")
    assert response.status_code == 200
    rows = list(csv.DictReader(io.StringIO(response.text)))
    assert len(rows) >= 288
    assert all(r["source"] == "demo" and r["timestamp_utc"].endswith("Z") for r in rows)
    change(client, mode="hardware")
    assert (
        len(list(csv.DictReader(io.StringIO(client.get("/api/export/csv").text)))) == 0
    )


def test_humidity_anomaly_and_pagination(client):
    assert (
        client.post(
            "/api/demo/anomaly", json={"metric": "humidity", "direction": "low"}
        ).status_code
        == 201
    )
    assert client.get("/api/current").json()["levels"]["humidity"] == "critical"
    assert client.get("/api/alerts?limit=1&offset=1").json()["items"] == []
    change(client, humidity_max=95)
    assert (
        client.post(
            "/api/demo/anomaly", json={"metric": "humidity", "direction": "high"}
        ).status_code
        == 422
    )


def test_restart_preserves_settings_and_data(tmp_path):
    path = tmp_path / "restart.db"
    with TestClient(create_app(path, False)) as first:
        change(first, simulation_enabled=False, temperature_max=30)
        first.post("/api/demo/anomaly", json={})
    with TestClient(create_app(path, False)) as second:
        assert second.get("/api/settings").json()["temperature_max"] == 30
        assert second.get("/api/settings").json()["simulation_enabled"] is False
        assert second.get("/api/alerts").json()["total"] == 1
        with second.app.state.factory() as db:
            assert db.scalar(select(func.count()).select_from(Measurement)) == 290
