# src/app/db/crud.py

from sqlalchemy.orm import Session
from .models import Device

def get_devices(db: Session):
    return db.query(Device).all()

def get_device(db: Session, device_id: int):
    return db.query(Device).filter(Device.id == device_id).first()

def create_device(db: Session, name: str, ip_address: str, category: str, os: str):
    device = Device(name=name, ip_address=ip_address, category=category, os=os)
    db.add(device)
    db.commit()
    db.refresh(device)
    return device

def delete_device(db: Session, device: Device):
    db.delete(device)
    db.commit()

def update_device(db: Session, device_id: int, device_data):
    device = get_device(db, device_id)
    if device:
        device.name = device_data.name
        device.ip_address = device_data.ip_address
        device.category = device_data.category
        device.os = device_data.os
        db.commit()
        db.refresh(device)
    return device
