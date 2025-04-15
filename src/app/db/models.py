from sqlalchemy import Column, Integer, String, Float
from app.db.database import Base

class Device(Base):
    """
    SQLAlchemy model for network devices being monitored.
    
    Represents network devices with their properties and status information
    that is tracked and updated by the monitoring system.
    """
    __tablename__ = "devices"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    ip = Column(String, nullable=False, unique=True)
    type = Column(String, nullable=False)
    status = Column(String, default="Unknown")          # Updated by monitor
    mac_address = Column(String, nullable=True)
    owner = Column(String, nullable=True)
    packet_loss = Column(Float, default=0.0)            # Calculated by monitor
    jitter = Column(Float, default=0.0)                 # Calculated by monitor
    uptime = Column(Float, default=0.0)                 # Calculated by monitor
    custom_alerts = Column(String, nullable=True)       # Comma-separated values