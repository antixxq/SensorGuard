import asyncio
import logging
import math
import time
from datetime import datetime, timezone

from sqlalchemy import select, text
from sqlalchemy.orm import Session, sessionmaker

from .models import Alert, Measurement, Settings

PERIODS = {"1h": 3600, "6h": 21600, "24h": 86400, "7d": 604800}
logger = logging.getLogger(__name__)


def iso(timestamp: float | None) -> str | None:
    return (
        datetime.fromtimestamp(timestamp, timezone.utc)
        .isoformat()
        .replace("+00:00", "Z")
        if timestamp is not None
        else None
    )


def measurement_dict(row: Measurement) -> dict:
    return {
        "id": row.id,
        "timestamp": iso(row.timestamp),
        "temperature": row.temperature,
        "humidity": row.humidity,
        "source": row.source,
    }


def level(value: float, minimum: float, maximum: float, metric: str) -> tuple[str, str]:
    distance = max(minimum - value, value - maximum, 0)
    severity = (
        "normal"
        if distance == 0
        else "critical"
        if distance >= (3 if metric == "temperature" else 10)
        else "warning"
    )
    return severity, "low" if value < minimum else "high"


def evaluate(db: Session, row: Measurement, settings: Settings, now: float) -> None:
    for metric in ("temperature", "humidity"):
        value = getattr(row, metric)
        severity, direction = level(
            value,
            getattr(settings, metric + "_min"),
            getattr(settings, metric + "_max"),
            metric,
        )
        active = db.scalars(
            select(Alert).where(
                Alert.source == row.source,
                Alert.metric == metric,
                Alert.resolved_at.is_(None),
            )
        ).all()
        same = False
        for alert in active:
            if alert.severity == severity and alert.direction == direction:
                same = True
            else:
                alert.resolved_at = now
        if severity != "normal" and not same:
            bound = getattr(
                settings, metric + ("_min" if direction == "low" else "_max")
            )
            unit = "°C" if metric == "temperature" else "%"
            db.add(
                Alert(
                    timestamp=now,
                    source=row.source,
                    metric=metric,
                    direction=direction,
                    severity=severity,
                    message=f"{metric.title()} {value:.1f}{unit} is {'below' if direction == 'low' else 'above'} the {bound:g}{unit} limit.",
                )
            )


def record(
    db: Session,
    temperature: float,
    humidity: float,
    source: str,
    now: float | None = None,
) -> Measurement:
    now = time.time() if now is None else now
    row = Measurement(
        timestamp=now,
        temperature=round(temperature, 2),
        humidity=round(humidity, 2),
        source=source,
    )
    db.add(row)
    evaluate(db, row, db.get(Settings, 1), now)
    db.flush()
    return row


def wave(timestamp: float) -> tuple[float, float]:
    # Continuous deterministic waves: reproducible history, no discontinuous random walk.
    return (
        23.2 + 1.8 * math.sin(timestamp / 4300) + 0.4 * math.sin(timestamp / 310),
        47.5 + 6 * math.sin(timestamp / 5200 + 1) + 1.2 * math.sin(timestamp / 420),
    )


def initialize(factory: sessionmaker[Session]) -> None:
    with factory() as db:
        db.execute(text("BEGIN IMMEDIATE"))
        if db.get(Settings, 1) is None:
            settings = Settings(id=1)
            db.add(settings)
            db.flush()
            now = time.time()
            for offset in range(86400, -1, -300):
                temperature, humidity = wave(now - offset)
                db.add(
                    Measurement(
                        timestamp=now - offset,
                        temperature=round(temperature, 2),
                        humidity=round(humidity, 2),
                        source="demo",
                    )
                )
            settings.last_tick = now
        db.commit()


def tick(factory: sessionmaker[Session]) -> None:
    with factory() as db:
        # A database-backed lease prevents duplicate samples even with overlapping processes.
        db.execute(text("BEGIN IMMEDIATE"))
        settings = db.get(Settings, 1)
        now = time.time()
        if (
            settings.mode == "demo"
            and settings.simulation_enabled
            and now - settings.last_tick >= 5
        ):
            record(db, *wave(now), "demo", now)
            settings.last_tick = now
        db.commit()


async def simulator(factory: sessionmaker[Session]) -> None:
    while True:
        try:
            await asyncio.to_thread(tick, factory)
        except Exception:
            logger.exception("Simulator tick failed; retrying on next tick")
        await asyncio.sleep(1)
