import csv
import hmac
import io
import math
import time
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import Integer, cast, func, select, text
from sqlalchemy.orm import Session

from .config import device_key
from .models import Alert, Measurement, Settings
from .schemas import AnomalyInput, IngestInput, Period, SettingsInput
from .services import PERIODS, evaluate, iso, level, measurement_dict, record, wave

router = APIRouter(prefix="/api")


def session(request: Request):
    with request.app.state.factory() as db:
        yield db


DB = Annotated[Session, Depends(session)]


def scope(db: Session, period: Period) -> tuple[str, float]:
    return db.get(Settings, 1).mode, time.time() - PERIODS[period]


@router.get("/health")
def health(db: DB) -> dict:
    db.execute(text("SELECT 1"))
    return {"status": "ok", "service": "SensorGuard"}


@router.get("/settings", response_model=SettingsInput)
def settings(db: DB):
    return db.get(Settings, 1)


@router.put("/settings", response_model=SettingsInput)
def save_settings(payload: SettingsInput, db: DB):
    db.execute(text("BEGIN IMMEDIATE"))
    row = db.get(Settings, 1)
    for key, value in payload.model_dump().items():
        setattr(row, key, value)
    # Re-evaluate both sources when thresholds change; stale values never create new alerts.
    for source in ("demo", "hardware"):
        latest = db.scalar(
            select(Measurement)
            .where(Measurement.source == source)
            .order_by(Measurement.timestamp.desc())
            .limit(1)
        )
        if latest and time.time() - latest.timestamp <= 20:
            evaluate(db, latest, row, time.time())
    db.commit()
    return row


@router.get("/current")
def current(db: DB) -> dict:
    config = db.get(Settings, 1)
    latest = db.scalar(
        select(Measurement)
        .where(Measurement.source == config.mode)
        .order_by(Measurement.timestamp.desc())
        .limit(1)
    )
    fresh = latest is not None and time.time() - latest.timestamp <= 20
    levels = {
        metric: level(
            getattr(latest, metric),
            getattr(config, metric + "_min"),
            getattr(config, metric + "_max"),
            metric,
        )[0]
        if latest
        else "unknown"
        for metric in ("temperature", "humidity")
    }
    return {
        "measurement": measurement_dict(latest) if latest else None,
        "device_status": ("demo" if config.mode == "demo" else "online")
        if fresh
        else "offline",
        "fresh": fresh,
        "levels": levels,
        "mode": config.mode,
        "simulation_enabled": config.simulation_enabled,
        "hardware_configured": bool(device_key()),
        "server_time": iso(time.time()),
    }


@router.get("/measurements")
def measurements(
    db: DB, period: Period = "24h", limit: int = Query(600, ge=20, le=2000)
) -> dict:
    source, since = scope(db, period)
    width = math.ceil(PERIODS[period] / (limit - 1))
    bucket = cast(Measurement.timestamp / width, Integer)
    rows = db.execute(
        select(
            func.max(Measurement.timestamp),
            func.avg(Measurement.temperature),
            func.avg(Measurement.humidity),
            func.count(),
        )
        .where(Measurement.source == source, Measurement.timestamp >= since)
        .group_by(bucket)
        .order_by(bucket)
        .limit(limit)
    ).all()
    return {
        "source": source,
        "aggregation": "bucket mean",
        "bucket_seconds": width,
        "items": [
            {
                "timestamp": iso(t),
                "temperature": round(temp, 2),
                "humidity": round(hum, 2),
                "samples": count,
                "source": source,
            }
            for t, temp, hum, count in rows
        ],
    }


@router.get("/stats")
def stats(db: DB, period: Period = "24h") -> dict:
    source, since = scope(db, period)
    result: dict = {"source": source}
    for metric in ("temperature", "humidity"):
        column = getattr(Measurement, metric)
        average, minimum, maximum, count = db.execute(
            select(
                func.avg(column), func.min(column), func.max(column), func.count()
            ).where(Measurement.source == source, Measurement.timestamp >= since)
        ).one()
        result[metric] = {
            "average": round(average, 2) if average is not None else None,
            "min": minimum,
            "max": maximum,
        }
        result["count"] = count
    result["alert_count"] = db.scalar(
        select(func.count())
        .select_from(Alert)
        .where(Alert.source == source, Alert.timestamp >= since)
    )
    return result


@router.get("/alerts")
def alerts(
    db: DB,
    period: Period = "7d",
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> dict:
    source, since = scope(db, period)
    filters = (Alert.source == source, Alert.timestamp >= since)
    rows = db.scalars(
        select(Alert)
        .where(*filters)
        .order_by(Alert.id.desc())
        .offset(offset)
        .limit(limit)
    ).all()
    return {
        "total": db.scalar(select(func.count()).select_from(Alert).where(*filters)),
        "items": [
            {
                "id": a.id,
                "timestamp": iso(a.timestamp),
                "resolved_at": iso(a.resolved_at),
                "source": a.source,
                "metric": a.metric,
                "severity": a.severity,
                "message": a.message,
                "read": a.read,
            }
            for a in rows
        ],
    }


@router.patch("/alerts/{alert_id}/read")
def read_alert(alert_id: int, db: DB) -> dict:
    row = db.get(Alert, alert_id)
    if not row:
        raise HTTPException(404, "Alert not found")
    row.read = True
    db.commit()
    return {"id": row.id, "read": True}


@router.post("/ingest", status_code=201)
def ingest(
    payload: IngestInput, db: DB, x_device_key: str = Header(default="")
) -> dict:
    key = device_key()
    if not key:
        raise HTTPException(503, "Hardware key is not configured")
    if not hmac.compare_digest(key.encode(), x_device_key.encode()):
        raise HTTPException(401, "Invalid device key")
    db.execute(text("BEGIN IMMEDIATE"))
    if db.get(Settings, 1).mode != "hardware":
        raise HTTPException(409, "Switch to Hardware mode before ingesting readings")
    row = record(db, payload.temperature, payload.humidity, "hardware")
    db.commit()
    return measurement_dict(row)


@router.post("/demo/anomaly", status_code=201)
def anomaly(payload: AnomalyInput, db: DB) -> dict:
    db.execute(text("BEGIN IMMEDIATE"))
    config = db.get(Settings, 1)
    if config.mode != "demo":
        raise HTTPException(409, "Demo anomalies require Demo mode")
    values = dict(zip(("temperature", "humidity"), wave(time.time())))
    margin = 4 if payload.metric == "temperature" else 12
    high = payload.direction == "high"
    value = getattr(config, payload.metric + ("_max" if high else "_min")) + (
        margin if high else -margin
    )
    lower, upper = (-40, 80) if payload.metric == "temperature" else (0, 100)
    if not lower <= value <= upper:
        raise HTTPException(
            422,
            "No room for a critical anomaly in this direction. Change the threshold or direction.",
        )
    values[payload.metric] = value
    row = record(db, values["temperature"], values["humidity"], "demo")
    config.last_tick = (
        time.time() + 10
    )  # Keep the injected anomaly visible for about 15 seconds.
    db.commit()
    return measurement_dict(row)


@router.get("/export/csv")
def export(db: DB, period: Period = "24h") -> StreamingResponse:
    source, since = scope(db, period)
    filters = (Measurement.source == source, Measurement.timestamp >= since)
    count = db.scalar(select(func.count()).select_from(Measurement).where(*filters))
    if count > 150000:
        raise HTTPException(
            413, "Export exceeds 150,000 rows. Choose a shorter period."
        )
    # Snapshot the bounded result before the request session closes.
    rows = db.execute(
        select(
            Measurement.timestamp,
            Measurement.temperature,
            Measurement.humidity,
            Measurement.source,
        )
        .where(*filters)
        .order_by(Measurement.timestamp)
        .limit(150000)
    ).all()

    def generate():
        buffer = io.StringIO(newline="")
        writer = csv.writer(buffer)
        writer.writerow(
            ["timestamp_utc", "temperature_c", "humidity_percent", "source"]
        )
        yield buffer.getvalue()
        for timestamp, temperature, humidity, row_source in rows:
            buffer.seek(0)
            buffer.truncate(0)
            writer.writerow([iso(timestamp), temperature, humidity, row_source])
            yield buffer.getvalue()

    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="sensorguard-{source}-{period}.csv"'
        },
    )
