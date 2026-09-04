import os
from typing import List
from dotenv import load_dotenv

load_dotenv()

class Settings:
    PROJECT_NAME: str = "Live Device Tracking API"
    VERSION: str = "1.0.0"
    
    # Database: Default to local SQLite for instant zero-config launch,
    # or use PostgreSQL connection string via DATABASE_URL environment variable
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./tracking.db")
    
    # CORS Origins
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "*"
    ]
    
    # Rate limiting for incoming location pings (minimum time in seconds between pings per token)
    MIN_PING_INTERVAL_SEC: float = 0.5
    
    # Default session validity duration (hours)
    DEFAULT_SESSION_EXPIRES_HOURS: int = 24

    # Simultaneous Accuracy Providers (MapTiler + Google Maps Platform)
    MAPTILER_API_KEY: str = os.getenv("MAPTILER_API_KEY", "vOmhH4Y5ABEyhsT3zGtp").strip("'\" ")
    GOOGLE_API_KEY: str = os.getenv("GOOGLE_API_KEY", "").strip("'\" ")

settings = Settings()
