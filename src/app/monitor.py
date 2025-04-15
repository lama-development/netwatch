import os
import time
import json
import logging
import threading
from ping3 import ping
from app.db.database import SessionLocal
from app.db.models import Device

# Global shutdown event to gracefully terminate monitoring
shutdown_event = threading.Event()

def load_settings():
    """Load monitoring settings from the configuration file."""
    settings_path = os.path.join("src", "config", "settings.json")
    try:
        with open(settings_path, "r") as file:
            return json.load(file)
    except FileNotFoundError:
        logging.error("File 'settings.json' not found in config folder.")
        return {}
    except json.JSONDecodeError:
        logging.error("Could not read 'settings.json' file.")
        return {}

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

def update_device_status(ip, new_status):
    """Update the status of a device in the database by its IP."""
    db = SessionLocal()
    try:
        device = db.query(Device).filter(Device.ip == ip).first()
        if device:
            device.status = new_status
            db.commit()
        else:
            logging.error(f"Device with IP {ip} not found for status update.")
    except Exception as e:
        logging.error(f"Error updating device status: {e}")
    finally:
        db.close()

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
        while retries < max_retries:
            response = ping(ip, timeout=ping_timeout)
            if response:
                status = "online"
                log_status(name, ip, status)
                update_device_status(ip, status)
                break
            else:
                status = f"offline, retrying ({retries + 1})"
                log_status(name, ip, status)
                retries += 1
                if retries < max_retries:
                    time.sleep(retry_interval)
        if retries == max_retries and status.startswith("offline"):
            final_status = "offline"
            log_status(name, ip, final_status)
            update_device_status(ip, final_status)

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