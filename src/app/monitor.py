import os
import time
import json
import logging
import threading
from ping3 import ping
from app.db.database import SessionLocal
from app.db.models import Device, Alert
from app.db import crud

# Global shutdown event to gracefully terminate monitoring
shutdown_event = threading.Event()

def load_settings():
    """Load monitoring settings from the database."""
    default_settings = {
        "ping_timeout": "3",
        "log_level": "INFO",
        "check_interval": "30",
        "retry_interval": "1",
        "max_retries": "3"
    }
    
    db = SessionLocal()
    try:
        # Retrieve all settings from the database
        settings = crud.get_all_settings(db)
        
        # If settings are empty (first run), initialize with defaults
        if not settings:
            # Set default settings in the database
            for key, value in default_settings.items():
                descriptions = {
                    "ping_timeout": "Maximum time (in seconds) to wait for a ping response",
                    "log_level": "Verbosity of system logs (DEBUG, INFO, WARN, ERROR)",
                    "check_interval": "Delay (in seconds) between monitoring cycles",
                    "retry_interval": "Waiting time (in seconds) between retry attempts",
                    "max_retries": "Number of ping attempts before marking a device offline"
                }
                crud.upsert_setting(db, key, value, descriptions.get(key, ""))
            settings = default_settings
            
        # Convert string values to appropriate types
        result = {}
        for key, value in settings.items():
            if key in ["ping_timeout", "check_interval", "retry_interval", "max_retries"]:
                try:
                    result[key] = int(value)
                except (ValueError, TypeError):
                    result[key] = int(default_settings[key])
            else:
                result[key] = value
                
        return result
    except Exception as e:
        logging.error(f"Error loading settings from database: {e}")
        # Fallback to default settings if database access fails
        return {k: int(v) if k != "log_level" else v for k, v in default_settings.items()}
    finally:
        db.close()

def load_devices():
    """Load all devices from the database for monitoring."""
    db = SessionLocal()
    try:
        devices = db.query(Device).all()
        return [{"name": device.name, "ip": device.ip} for device in devices]
    except Exception as e:
        logging.error(f"Error loading devices from database: {e}")
        return []
    finally:
        db.close()

def update_device_status(ip, new_status, packet_loss=None, jitter=None):
    """Update the status of a device in the database by its IP, along with metrics."""
    db = SessionLocal()
    try:
        device = db.query(Device).filter(Device.ip == ip).first()
        if device:
            # Store the previous status to detect changes
            previous_status = device.status
            
            # Update device status and metrics
            device.status = new_status
            if packet_loss is not None:
                device.packet_loss = packet_loss
            if jitter is not None:
                device.jitter = jitter
            
            # Generate alerts for status changes or concerning metrics
            if previous_status != new_status:
                if new_status == "offline":
                    # Create a critical alert when device goes offline
                    create_alert(db, device.id, "critical", "Connectivity", 
                                f"Device {device.name} is offline",
                                f"The device at {device.ip} is no longer responding to ping requests.")
                elif previous_status == "offline" and new_status == "online":
                    # Create an info alert when device comes back online
                    create_alert(db, device.id, "info", "Connectivity", 
                                f"Device {device.name} is back online",
                                f"The device at {device.ip} has restored connectivity.")
            
            # Check for high packet loss if device is online
            if new_status == "online" and packet_loss is not None and packet_loss > 10:
                create_alert(db, device.id, "warning", "Performance", 
                            f"High packet loss detected: {packet_loss:.1f}%",
                            f"Device {device.name} ({device.ip}) is experiencing significant packet loss.")
            
            db.commit()
        else:
            logging.error(f"Device with IP {ip} not found for status update.")
    except Exception as e:
        logging.error(f"Error updating device status: {e}")
    finally:
        db.close()

def create_alert(db, device_id, severity, alert_type, message, description=None):
    """Create a new alert in the database."""
    try:
        # Check if there's already an active alert of the same type for this device
        existing_alert = db.query(Alert).filter(
            Alert.device_id == device_id,
            Alert.type == alert_type,
            Alert.message == message,
            Alert.status == "active"
        ).first()
        
        # Don't create duplicate alerts
        if existing_alert:
            return
            
        alert_data = {
            "device_id": device_id,
            "severity": severity,
            "type": alert_type,
            "message": message,
            "description": description,
            "status": "active"
        }
        crud.create_alert(db, alert_data)
        logging.info(f"Alert created: {severity} - {message}")
    except Exception as e:
        logging.error(f"Error creating alert: {e}")

def device_cycle(devices):
    """Create an infinite generator that cycles through the list of devices."""
    while True:
        for device in devices:
            yield device["name"], device["ip"]

def log_status(name, ip, status):
    """Log the monitoring status of a device."""
    logging.info(f"{name} ({ip}) is {status}")

def ping_devices(devices, device_gen, ping_timeout, retry_interval, max_retries):
    """Ping devices to check their status and update the database accordingly."""
    for device in devices:
        name, ip = next(device_gen)
        retries = 0
        packet_loss_pct = 0
        ping_times = []
        
        # Perform multiple pings to calculate metrics
        for _ in range(4):  # Send 4 pings per device
            response = ping(ip, timeout=ping_timeout)
            if response:
                ping_times.append(response)
                
        if ping_times:
            # Calculate packet loss percentage
            packet_loss_pct = (4 - len(ping_times)) * 25  # Each missed ping is 25%
            
            # Calculate jitter if we have at least 2 successful pings
            jitter = 0
            if len(ping_times) >= 2:
                # Simple jitter calculation (standard deviation)
                mean = sum(ping_times) / len(ping_times)
                variance = sum((t - mean) ** 2 for t in ping_times) / len(ping_times)
                jitter = variance ** 0.5 * 1000  # Convert to ms
            
            # Device is responding, mark as online
            status = "online"
            log_status(name, ip, status)
            update_device_status(ip, status, packet_loss_pct, jitter)
        else:
            # Start retry logic
            while retries < max_retries:
                status = f"offline, retrying ({retries + 1})"
                log_status(name, ip, status)
                retries += 1
                if retries < max_retries:
                    time.sleep(retry_interval)
                    response = ping(ip, timeout=ping_timeout)
                    if response:
                        # Device responded during retries
                        status = "online"
                        log_status(name, ip, status)
                        update_device_status(ip, status, 75, 0)  # High packet loss but responding
                        break
            
            if retries == max_retries and "offline" in status:
                final_status = "offline"
                log_status(name, ip, final_status)
                update_device_status(ip, final_status, 100, 0)  # 100% packet loss when offline

def start_monitor():
    """Start the device monitoring cycle."""
    logging.info("Starting device monitoring cycle...")
    while not shutdown_event.is_set():
        devices = load_devices()
        settings = load_settings()
        if not devices:
            logging.error("No devices found in this cycle.")
        else:
            device_gen = device_cycle(devices)
            ping_timeout = settings.get("ping_timeout", 1)
            retry_interval = settings.get("retry_interval", 5)
            max_retries = settings.get("max_retries", 3)
            ping_devices(devices, device_gen, ping_timeout, retry_interval, max_retries)
        logging.info(f"Cycle completed. Waiting {settings.get('check_interval', 60)} seconds before next cycle...")
        time.sleep(settings.get("check_interval", 60))

def stop_monitor():
    """Signal the monitor to stop."""
    shutdown_event.set()