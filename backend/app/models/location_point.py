import datetime
from sqlalchemy import Column, Integer, Float, String, Boolean, DateTime, BigInteger, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base

class LocationPoint(Base):
    __tablename__ = "location_points"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("tracking_sessions.id", ondelete="CASCADE"), index=True, nullable=False)

    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    accuracy = Column(Float, nullable=False)

    altitude = Column(Float, nullable=True)
    altitude_accuracy = Column(Float, nullable=True)
    speed = Column(Float, nullable=True)
    heading = Column(Float, nullable=True)

    recorded_at = Column(BigInteger, index=True, nullable=False) # device epoch ms
    received_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    quality = Column(String(20), nullable=False) # Excellent, Very Good, Good, Moderate, Poor, Very Poor
    is_outlier = Column(Boolean, default=False, nullable=False)

    session = relationship("TrackingSession", back_populates="location_points")
