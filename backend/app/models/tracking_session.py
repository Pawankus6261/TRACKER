import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, BigInteger
from sqlalchemy.orm import relationship
from app.database import Base

class TrackingSession(Base):
    __tablename__ = "tracking_sessions"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(64), unique=True, index=True, nullable=False)
    owner_key = Column(String(64), unique=True, index=True, nullable=False)
    
    # Statuses: INITIALIZING, SEARCHING, LOW_ACCURACY, LIVE, STALE, STOPPED, ENDED, EXPIRED
    status = Column(String(20), default="INITIALIZING", nullable=False)
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    started_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)

    # Latest fix telemetry
    latest_latitude = Column(Float, nullable=True)
    latest_longitude = Column(Float, nullable=True)
    latest_accuracy = Column(Float, nullable=True)
    latest_speed = Column(Float, nullable=True)
    latest_heading = Column(Float, nullable=True)
    latest_timestamp = Column(BigInteger, nullable=True)

    # Best accuracy fix tracked during this session
    best_accuracy = Column(Float, nullable=True)
    best_accuracy_latitude = Column(Float, nullable=True)
    best_accuracy_longitude = Column(Float, nullable=True)
    best_accuracy_timestamp = Column(BigInteger, nullable=True)

    last_received_at = Column(DateTime, nullable=True)
    max_expected_speed_kmh = Column(Float, default=120.0, nullable=False)

    # Relationship to recorded location points
    location_points = relationship(
        "LocationPoint",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="LocationPoint.recorded_at.asc()"
    )
