# src/app/monitor.py

import os, time, json, logging, itertools, threading
from ping3 import ping

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

# Function to load devices from config/devices.json
def load_devices():
    devices_path = os.path.join("src", "config", "devices.json")
    try:
        with open(devices_path, "r") as file:
            data = json.load(file)
            return data["devices"]
    except FileNotFoundError:
        logging.error("File 'devices.json' not found in config folder.")
        return []
    except json.JSONDecodeError:
        logging.error("Could not read 'devices.json' file.")
        return []

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
                break
            # If ping fails, increase retry count and try again after a short delay
            else:
                status = f"offline, retrying ({retries + 1})"
                log_status(name, ip, status) 
                retries += 1
                if retries < max_retries:
                    time.sleep(retry_interval)
        # If max retries reached and still offline, log the final status as offline
        if retries == max_retries and status.startswith("offline"):
            log_status(name, ip, "offline (max retries reached)")

# Function to start the monitor
def start_monitor():
    # Load settings and devices
    settings = load_settings()
    devices = load_devices()
    # Access individual settings
    ping_timeout = settings.get("ping_timeout", 1)  # Default to 1 if not found
    check_interval = settings.get("check_interval", 60)  # Default to 60 seconds
    retry_interval = settings.get("retry_interval", 5)  # Default to 5 seconds
    max_retries = settings.get("max_retries", 3)  # Default to 3 retries

    if not devices:
        logging.error("No devices found. Exiting...")
        exit()
    # Initialize the device generator and start monitoring
    logging.info("Starting device monitoring cycle...")
    device_gen = device_cycle(devices)
    # Main loop
    while not shutdown_event.is_set():  # Stop when event is set
        ping_devices(devices, device_gen, ping_timeout, retry_interval, max_retries)
        logging.info(f"Cycle completed. Waiting {check_interval} seconds before next cycle...")
        time.sleep(check_interval) 

def stop_monitor():
    shutdown_event.set()  # Signal the monitor to stop