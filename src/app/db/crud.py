from sqlalchemy.orm import Session
from .models import Device

def get_devices(db: Session):
    """Retrieve all devices from the database."""
    return db.query(Device).all()

def get_device(db: Session, device_id: int):
    """Retrieve a specific device by its ID."""
    return db.query(Device).filter(Device.id == device_id).first()

def create_device(db: Session, device_data: dict):
    """Create a new device in the database.
    
    Args:
        db: Database session
        device_data: Dictionary containing device attributes
        
    Returns:
        The newly created device instance
    """
    device = Device(**device_data)
    db.add(device)
    db.commit()
    db.refresh(device)
    return device

def update_device(db: Session, device_id: int, device_data: dict):
    """Update an existing device's attributes.
    
    Args:
        db: Database session
        device_id: ID of the device to update
        device_data: Dictionary containing device attributes to update
        
    Returns:
        The updated device instance or None if device not found
    """
    device = get_device(db, device_id)
    if device is None:
        return None
    for key, value in device_data.items():
        setattr(device, key, value)
    db.commit()
    db.refresh(device)
    return device

def delete_device(db: Session, device_id: int):
    """Delete a device from the database.
    
    Args:
        db: Database session
        device_id: ID of the device to delete
        
    Returns:
        True if the device was deleted, False if not found
    """
    device = get_device(db, device_id)
    if device:
        db.delete(device)
        db.commit()
        return True
    return False
