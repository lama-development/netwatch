# /src/app/monitor.py

import os, time, json, logging, itertools, threading
from ping3 import ping
from app.db.database import SessionLocal
from app.db.models import Device

shutdown_event = threading.Event()  # Create a global shutdown event

# Function to load settings from config/settings.json
def load_settings():
    settings_path = os.path.join("src", "config", "settings.json")
    try:
        with open(settings_path, "r") as file:
            data = json.load(file)
            return data
    except FileNotFoundError:
        logging.error("File 'settings.json' not found in config folder.")
        return {}
    except json.JSONDecodeError:
        logging.error("Could not read 'settings.json' file.")
        return {}

def load_devices():
    db = SessionLocal()
    try:
        devices = db.query(Device).all()
        # Convert to a list of dictionaries for backward compatibility with your monitor logic
        return [{"name": device.name, "ip": device.ip} for device in devices]
    except Exception as e:
        logging.error("Error loading devices from database: " + str(e))
        return []
    finally:
        db.close()

"""Update the status of a device in the database by its IP """
def update_device_status(ip, new_status):
    db = SessionLocal()
    try:
        device = db.query(Device).filter(Device.ip == ip).first()
        if device:
            device.status = new_status
            db.commit()
        else:
            logging.error(f"Device with IP {ip} not found for status update.")
    except Exception as e:
        logging.error("Error updating device status: " + str(e))
    finally:
        db.close()

# Function to create a device cycle generator
def device_cycle(devices):
    while True:
        for device in devices:
            yield device["name"], device["ip"]

# Function to log the status of a device
def log_status(name, ip, status):
    logging.info(f"{name} ({ip}) is {status}")

# Function to monitor devices by pinging them
def ping_devices(devices, device_gen, ping_timeout, retry_interval, max_retries):
    for device in devices:
        # Get the next device from the cycle
        name, ip = next(device_gen)
        # Try to ping the device up to `max_retries` times
        retries = 0
        while retries < max_retries:
            # Perform the ping
            response = ping(ip, timeout=ping_timeout)
            # If ping is successful, log the device as online and break
            if response:
                status = "online"
                log_status(name, ip, status)
                update_device_status(ip, status)
                break  # Exit the retry loop if ping is successful
            else:
                status = f"offline, retrying ({retries + 1})"
                log_status(name, ip, status)
                retries += 1
                if retries < max_retries:
                    time.sleep(retry_interval)
        # If max retries reached and still offline, log the final status as offline
        if retries == max_retries and status.startswith("offline"):
            final_status = "offline"
            log_status(name, ip, final_status)
            update_device_status(ip, final_status)

# Function to start the monitor
def start_monitor():
    logging.info("Starting device monitoring cycle...")
    while not shutdown_event.is_set():
        # Reload devices and settings each cycle so new ones are included
        devices = load_devices()
        settings = load_settings()
        if not devices:
            logging.error("No devices found in this cycle.")
        else:
            # Create a new device generator with the updated list.
            device_gen = device_cycle(devices)
            ping_timeout = settings.get("ping_timeout", 1)
            retry_interval = settings.get("retry_interval", 5)
            max_retries = settings.get("max_retries", 3)
            ping_devices(devices, device_gen, ping_timeout, retry_interval, max_retries)
        logging.info(f"Cycle completed. Waiting {settings.get("check_interval", 60)} seconds before next cycle...")
        time.sleep(settings.get("check_interval", 60))


def stop_monitor():
    shutdown_event.set()  # Signal the monitor to stop