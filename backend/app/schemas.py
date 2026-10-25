from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

Period = Literal["1h", "6h", "24h", "7d"]


class SettingsInput(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False, from_attributes=True)
    temperature_min: float = Field(default=18, ge=-40, le=80)
    temperature_max: float = Field(default=28, ge=-40, le=80)
    humidity_min: float = Field(default=30, ge=0, le=100)
    humidity_max: float = Field(default=65, ge=0, le=100)
    mode: Literal["demo", "hardware"] = "demo"
    simulation_enabled: bool = True

    @model_validator(mode="after")
    def ordered(self) -> Self:
        if (
            self.temperature_min >= self.temperature_max
            or self.humidity_min >= self.humidity_max
        ):
            raise ValueError("Minimum must be less than maximum for each metric")
        return self


class IngestInput(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    temperature: float = Field(ge=-40, le=80)
    humidity: float = Field(ge=0, le=100)


class AnomalyInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    metric: Literal["temperature", "humidity"] = "temperature"
    direction: Literal["high", "low"] = "high"
