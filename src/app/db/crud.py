from sqlalchemy.orm import Session
from .models import Device, Setting, Alert

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

# Settings CRUD operations
def get_all_settings(db: Session):
    """Retrieve all settings from the database."""
    settings = db.query(Setting).all()
    return {setting.key: setting.value for setting in settings}

def get_setting(db: Session, key: str):
    """Retrieve a specific setting by its key.
    
    Args:
        db: Database session
        key: The setting key to retrieve
        
    Returns:
        The setting value or None if not found
    """
    setting = db.query(Setting).filter(Setting.key == key).first()
    return setting.value if setting else None

def get_setting_with_default(db: Session, key: str, default_value: str):
    """Retrieve a setting with a default value if not found.
    
    Args:
        db: Database session
        key: The setting key to retrieve
        default_value: The default value to return if setting not found
        
    Returns:
        The setting value or the default value
    """
    setting = get_setting(db, key)
    return setting if setting is not None else default_value

def upsert_setting(db: Session, key: str, value: str, description: str = None):
    """Create or update a setting.
    
    Args:
        db: Database session
        key: The setting key
        value: The setting value
        description: Optional description of the setting
        
    Returns:
        The created or updated setting
    """
    setting = db.query(Setting).filter(Setting.key == key).first()
    if setting:
        setting.value = value
        if description:
            setting.description = description
    else:
        setting = Setting(key=key, value=value, description=description)
        db.add(setting)
    
    db.commit()
    db.refresh(setting)
    return setting

def delete_setting(db: Session, key: str):
    """Delete a setting from the database.
    
    Args:
        db: Database session
        key: The setting key to delete
        
    Returns:
        True if the setting was deleted, False if not found
    """
    setting = db.query(Setting).filter(Setting.key == key).first()
    if setting:
        db.delete(setting)
        db.commit()
        return True
    return False

# Alert CRUD operations
def get_alerts(db: Session, skip: int = 0, limit: int = 100, status: str = None):
    """
    Retrieve alerts from the database with optional filtering and pagination.
    
    Args:
        db: Database session
        skip: Number of records to skip (for pagination)
        limit: Maximum number of records to return
        status: Optional filter for alert status (active, acknowledged, resolved)
        
    Returns:
        List of Alert objects
    """
    query = db.query(Alert)
    if status:
        query = query.filter(Alert.status == status)
    return query.order_by(Alert.timestamp.desc()).offset(skip).limit(limit).all()

def get_alert(db: Session, alert_id: int):
    """
    Retrieve a specific alert by its ID.
    
    Args:
        db: Database session
        alert_id: ID of the alert to retrieve
        
    Returns:
        Alert object or None if not found
    """
    return db.query(Alert).filter(Alert.id == alert_id).first()

def create_alert(db: Session, alert_data: dict):
    """
    Create a new alert in the database.
    
    Args:
        db: Database session
        alert_data: Dictionary containing alert attributes
        
    Returns:
        The newly created Alert instance
    """
    alert = Alert(**alert_data)
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert

def update_alert_status(db: Session, alert_id: int, status: str):
    """
    Update the status of an alert.
    
    Args:
        db: Database session
        alert_id: ID of the alert to update
        status: New status value (active, acknowledged, resolved)
        
    Returns:
        Updated Alert object or None if not found
    """
    alert = get_alert(db, alert_id)
    if alert is None:
        return None
    alert.status = status
    db.commit()
    db.refresh(alert)
    return alert

def delete_alert(db: Session, alert_id: int):
    """
    Delete an alert from the database.
    
    Args:
        db: Database session
        alert_id: ID of the alert to delete
        
    Returns:
        True if the alert was deleted, False if not found
    """
    alert = get_alert(db, alert_id)
    if alert:
        db.delete(alert)
        db.commit()
        return True
    return False

def count_alerts_by_severity(db: Session, status: str = "active"):
    """
    Count alerts by severity for a given status.
    
    Args:
        db: Database session
        status: Alert status to filter by (default: active)
        
    Returns:
        Dictionary with counts for each severity level
    """
    query = db.query(Alert).filter(Alert.status == status)
    critical = query.filter(Alert.severity == "critical").count()
    warning = query.filter(Alert.severity == "warning").count()
    info = query.filter(Alert.severity == "info").count()
    
    return {
        "critical": critical,
        "warning": warning,
        "info": info,
        "total": critical + warning + info
    }
