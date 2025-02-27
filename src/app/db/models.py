# src/app/db/models.py

from sqlalchemy import Column, Integer, String, Float
from app.db.database import Base

class Device(Base):
    __tablename__ = "devices"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    ip = Column(String, nullable=False, unique=True)
    type = Column(String, nullable=False)
    status = Column(String, default="Unknown")          # Hidden; updated by monitor
    mac_address = Column(String, nullable=True)
    owner = Column(String, nullable=True)
    packet_loss = Column(Float, default=0.0)            # Hidden; calculated by monitor
    jitter = Column(Float, default=0.0)                 # Hidden; calculated by monitor
    uptime = Column(Float, default=0.0)                 # Hidden; calculated by monitor
    custom_alerts = Column(String, nullable=True)       # e.g., comma-separated values
    subnet = Column(String, nullable=True)              # Advanced
    gateway = Column(String, nullable=True)             # Advanced
    dns = Column(String, nullable=True)                 # Advanced