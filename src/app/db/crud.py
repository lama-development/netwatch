# src/app/db/crud.py

from sqlalchemy.orm import Session
from .models import Device

def get_devices(db: Session):
    return db.query(Device).all()

def get_device(db: Session, device_id: int):
    return db.query(Device).filter(Device.id == device_id).first()

def create_device(db: Session, device_data: dict):
    device = Device(**device_data)
    db.add(device)
    db.commit()
    db.refresh(device)
    return device

def update_device(db: Session, device_id: int, device_data: dict):
    device = get_device(db, device_id)
    if device is None:
        return None
    for key, value in device_data.items():
        setattr(device, key, value)
    db.commit()
    db.refresh(device)
    return device

def delete_device(db: Session, device_id: int):
    device = get_device(db, device_id)
    if device:
        db.delete(device)
        db.commit()
        return True
    return False
