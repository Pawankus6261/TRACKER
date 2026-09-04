import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from app.schemas.location import LocationPointResponse

class SessionCreateRequest(BaseModel):
    max_expected_speed_kmh: Optional[float] = Field(120.0, description="Max expected speed for GPS jump filtering")
    expires_hours: Optional[int] = Field(24, ge=1, le=168)

class SessionCreateResponse(BaseModel):
    token: str
    secure_token: Optional[str] = None
    owner_key: str
    tracking_url: str
    status: str
    created_at: datetime.datetime
    expires_at: Optional[datetime.datetime] = None

class SessionPublicResponse(BaseModel):
    token: str
    secure_token: Optional[str] = None
    status: str # INITIALIZING, SEARCHING, LOW_ACCURACY, LIVE, STALE, STOPPED, ENDED, EXPIRED
    created_at: datetime.datetime
    started_at: Optional[datetime.datetime] = None
    expires_at: Optional[datetime.datetime] = None
    max_expected_speed_kmh: float

    class Config:
        from_attributes = True

class OwnerDashboardResponse(BaseModel):
    token: str
    secure_token: Optional[str] = None
    owner_key: str
    status: str
    stale_status: str # LIVE, DELAYED, STALE
    seconds_since_last_fix: Optional[int] = None
    
    # Latest position
    latest_latitude: Optional[float] = None
    latest_longitude: Optional[float] = None
    latest_accuracy: Optional[float] = None
    latest_speed: Optional[float] = None
    latest_heading: Optional[float] = None
    latest_timestamp: Optional[int] = None
    latest_quality: Optional[str] = None

    # Best accuracy
    best_accuracy: Optional[float] = None
    best_accuracy_latitude: Optional[float] = None
    best_accuracy_longitude: Optional[float] = None
    best_accuracy_timestamp: Optional[int] = None

    created_at: datetime.datetime
    started_at: Optional[datetime.datetime] = None
    ended_at: Optional[datetime.datetime] = None
    expires_at: Optional[datetime.datetime] = None
    last_received_at: Optional[datetime.datetime] = None

    history: List[LocationPointResponse] = []

    class Config:
        from_attributes = True
