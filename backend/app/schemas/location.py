import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator

class LocationPayload(BaseModel):
    latitude: float = Field(..., description="Latitude coordinate between -90 and 90")
    longitude: float = Field(..., description="Longitude coordinate between -180 and 180")
    accuracy: float = Field(..., description="Raw GPS accuracy in meters as reported by device")
    altitude: Optional[float] = Field(None, description="Altitude in meters")
    altitudeAccuracy: Optional[float] = Field(None, description="Altitude accuracy in meters")
    speed: Optional[float] = Field(None, description="Speed in m/s")
    heading: Optional[float] = Field(None, description="Heading in degrees (0-360)")
    timestamp: int = Field(..., description="Device timestamp in epoch milliseconds")

    @field_validator("latitude")
    @classmethod
    def validate_latitude(cls, v: float) -> float:
        if not (-90.0 <= v <= 90.0):
            raise ValueError("Latitude must be between -90 and 90 degrees.")
        return v

    @field_validator("longitude")
    @classmethod
    def validate_longitude(cls, v: float) -> float:
        if not (-180.0 <= v <= 180.0):
            raise ValueError("Longitude must be between -180 and 180 degrees.")
        return v

    @field_validator("accuracy")
    @classmethod
    def validate_accuracy(cls, v: float) -> float:
        if v < 0:
            raise ValueError("Accuracy cannot be negative.")
        return v

class LocationPointResponse(BaseModel):
    id: int
    latitude: float
    longitude: float
    accuracy: float
    altitude: Optional[float] = None
    altitude_accuracy: Optional[float] = None
    speed: Optional[float] = None
    heading: Optional[float] = None
    recorded_at: int
    received_at: datetime.datetime
    quality: str
    is_outlier: bool

    class Config:
        from_attributes = True
