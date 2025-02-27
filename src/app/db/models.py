# src/app/db/models.py

from sqlalchemy import Column, Integer, String
from .database import Base

class Device(Base):
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    ip_address = Column(String, unique=True, index=True)
    category = Column(String, index=True)
    os = Column(String, index=True)