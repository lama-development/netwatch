from sqlalchemy.orm import Session
from sqlalchemy import func
from .models import Device, Setting, Alert
import time
from functools import lru_cache
from typing import Dict, List, Optional, Tuple, Any

# Cache for database query results
_db_cache = {
    'settings': {},
    'settings_timestamp': 0,
    'devices_count': 0,
    'devices_timestamp': 0,
    'alerts_count': {},
    'alerts_timestamp': 0
}

# Cache TTL in seconds (5 minutes default)
CACHE_TTL = 300

def _is_cache_valid(cache_key: str) -> bool:
    """Check if a cache entry is still valid based on TTL."""
    timestamp_key = f"{cache_key}_timestamp"
    return (
        timestamp_key in _db_cache and
        time.time() - _db_cache[timestamp_key] < CACHE_TTL
    )

def invalidate_cache(cache_key: Optional[str] = None) -> None:
    """Invalidate specific or all cache entries."""
    global _db_cache
    if cache_key:
        # Invalidate specific cache entry
        if cache_key in _db_cache:
            _db_cache[cache_key] = {} if isinstance(_db_cache[cache_key], dict) else 0
            _db_cache[f"{cache_key}_timestamp"] = 0
    else:
        # Invalidate all cache entries
        _db_cache = {
            'settings': {},
            'settings_timestamp': 0,
            'devices_count': 0,
            'devices_timestamp': 0,
            'alerts_count': {},
            'alerts_timestamp': 0
        }

# Device CRUD operations with caching
def get_devices(db: Session):
    """Retrieve all devices from the database."""
    return db.query(Device).all()

def get_device(db: Session, device_id: int):
    """Retrieve a specific device by its ID."""
    return db.query(Device).filter(Device.id == device_id).first()

@lru_cache(maxsize=32)
def get_device_by_ip(db_session_id: int, ip: str) -> Optional[Dict[str, Any]]:
    """Retrieve a device by IP address with caching.
    
    Args:
        db_session_id: Unique ID of the session (used for LRU cache key)
        ip: The IP address to look up
        
    Returns:
        Device data as a dictionary or None if not found
    """
    db = Session.object_session(db.query(Device).first())
    device = db.query(Device).filter(Device.ip == ip).first()
    if not device:
        return None
    return {
        "id": device.id,
        "name": device.name,
        "ip": device.ip,
        "status": device.status,
        "type": device.type
    }

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
    invalidate_cache('devices_count')
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
        invalidate_cache('devices_count')
        return True
    return False

# Settings CRUD operations with caching
def get_all_settings(db: Session):
    """Retrieve all settings from the database with caching."""
    global _db_cache
    
    # Return cached settings if valid
    if _is_cache_valid('settings'):
        return _db_cache['settings']
    
    # Query database and update cache
    settings = db.query(Setting).all()
    settings_dict = {setting.key: setting.value for setting in settings}
    _db_cache['settings'] = settings_dict
    _db_cache['settings_timestamp'] = time.time()
    
    return settings_dict

def get_setting(db: Session, key: str):
    """Retrieve a specific setting by its key.
    
    Args:
        db: Database session
        key: The setting key to retrieve
        
    Returns:
        The setting value or None if not found
    """
    # First try to get from cache
    if _is_cache_valid('settings') and key in _db_cache['settings']:
        return _db_cache['settings'][key]
    
    # If not in cache or cache invalid, query database
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
    
    # Invalidate settings cache
    invalidate_cache('settings')
    
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
        invalidate_cache('settings')
        return True
    return False

# Alert CRUD operations with optimized queries
def get_alerts(db: Session, skip: int = 0, limit: int = 100, status: str = None, exclude_resolved: bool = False, include_history: bool = False):
    """
    Retrieve alerts from the database with optional filtering and pagination.
    
    Args:
        db: Database session
        skip: Number of records to skip (for pagination)
        limit: Maximum number of records to return
        status: Optional filter for alert status (active, resolved)
        exclude_resolved: If True, exclude alerts with status="resolved"
        include_history: If True, include resolved alerts (for history view)
        
    Returns:
        List of Alert objects
    """
    query = db.query(Alert)
    
    # Apply filters
    if status:
        query = query.filter(Alert.status == status)
    elif exclude_resolved and not include_history:
        query = query.filter(Alert.status != "resolved")
    elif include_history:
        # For history view, we want both active and resolved alerts
        pass
        
    # Always sort by timestamp, with most recent first
    query = query.order_by(Alert.timestamp.desc())
    
    return query.offset(skip).limit(limit).all()

def get_alert_history(db: Session, days_back: int = 30, skip: int = 0, limit: int = 100):
    """
    Retrieve alert history including resolved alerts.
    
    Args:
        db: Database session
        days_back: Number of days to look back for history
        skip: Number of records to skip (for pagination)
        limit: Maximum number of records to return
        
    Returns:
        List of Alert objects
    """
    from datetime import datetime, timedelta
    
    # Calculate the cutoff date
    cutoff_date = datetime.now() - timedelta(days=days_back)
    
    # Get all alerts (both active and resolved) from the cutoff date
    query = db.query(Alert).filter(Alert.timestamp >= cutoff_date)
    
    # Order by timestamp, most recent first
    query = query.order_by(Alert.timestamp.desc())
    
    return query.offset(skip).limit(limit).all()

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
    invalidate_cache('alerts_count')
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
    invalidate_cache('alerts_count')
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
        invalidate_cache('alerts_count')
        return True
    return False

def count_alerts_by_severity(db: Session, status: str = "active"):
    """
    Count alerts by severity for a given status with caching.
    
    Args:
        db: Database session
        status: Alert status to filter by (default: active)
        
    Returns:
        Dictionary with counts for each severity level
    """
    cache_key = f"alerts_count_{status}"
    
    # Check if we have a valid cached result
    if status in _db_cache['alerts_count'] and _is_cache_valid('alerts_count'):
        return _db_cache['alerts_count'][status]
    
    # Perform optimized query to count by severity in one database hit
    query = db.query(
        Alert.severity,
        func.count(Alert.id).label('count')
    ).filter(
        Alert.status == status
    ).group_by(
        Alert.severity
    )
    
    # Convert query results to a dictionary
    counts = {
        "critical": 0,
        "warning": 0,
        "info": 0,
        "total": 0
    }
    
    for severity, count in query:
        if severity in counts:
            counts[severity] = count
        counts["total"] += count
    
    # Cache the result
    if 'alerts_count' not in _db_cache:
        _db_cache['alerts_count'] = {}
    _db_cache['alerts_count'][status] = counts
    _db_cache['alerts_timestamp'] = time.time()
    
    return counts

def get_device_with_related_alerts(db: Session, device_id: int, alert_limit: int = 5):
    """
    Retrieve a device with its most recent related alerts in one efficient query.
    
    Args:
        db: Database session
        device_id: The device ID to retrieve
        alert_limit: Maximum number of alerts to include
        
    Returns:
        Tuple of (device, alerts) or (None, []) if device not found
    """
    device = get_device(db, device_id)
    if not device:
        return None, []
    
    # Get related alerts in a separate efficient query
    alerts = db.query(Alert).filter(
        Alert.device_id == device_id
    ).order_by(
        Alert.timestamp.desc()
    ).limit(alert_limit).all()
    
    return device, alerts
