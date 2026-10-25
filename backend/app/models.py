from sqlalchemy import Boolean, Float, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class Settings(Base):
    __tablename__ = "settings"
    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    temperature_min: Mapped[float] = mapped_column(Float, default=18)
    temperature_max: Mapped[float] = mapped_column(Float, default=28)
    humidity_min: Mapped[float] = mapped_column(Float, default=30)
    humidity_max: Mapped[float] = mapped_column(Float, default=65)
    mode: Mapped[str] = mapped_column(String, default="demo")
    simulation_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_tick: Mapped[float] = mapped_column(Float, default=0)


class Measurement(Base):
    __tablename__ = "measurements"
    id: Mapped[int] = mapped_column(primary_key=True)
    timestamp: Mapped[float] = mapped_column(Float)
    temperature: Mapped[float] = mapped_column(Float)
    humidity: Mapped[float] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String)
    __table_args__ = (Index("ix_measurement_source_time", "source", "timestamp"),)


class Alert(Base):
    __tablename__ = "alerts"
    id: Mapped[int] = mapped_column(primary_key=True)
    timestamp: Mapped[float] = mapped_column(Float)
    resolved_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    source: Mapped[str] = mapped_column(String)
    metric: Mapped[str] = mapped_column(String)
    direction: Mapped[str] = mapped_column(String)
    severity: Mapped[str] = mapped_column(String)
    message: Mapped[str] = mapped_column(String)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    __table_args__ = (Index("ix_alert_source_time", "source", "timestamp"),)
