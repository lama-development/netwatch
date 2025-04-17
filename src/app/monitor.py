import os
import time
import json
import logging
import threading
import concurrent.futures
from datetime import datetime
from collections import defaultdict, deque
from ping3 import ping
from app.db.database import SessionLocal
from app.db.models import Device, Alert
from app.db import crud

# Global shutdown event to gracefully terminate monitoring
shutdown_event = threading.Event()
# Global cache for settings to reduce database reads
settings_cache = {}
settings_cache_time = 0
# Alert notification queue
alert_queue = deque(maxlen=100)
# Device status cache to detect changes
device_status_cache = {}
# Metrics history for trend analysis (limited size circular buffer)
metrics_history = defaultdict(lambda: deque(maxlen=10))

def load_settings(force_refresh=False):
    """Load monitoring settings from the database with caching."""
    global settings_cache, settings_cache_time
    
    # Return cached settings if fresh (less than 5 minutes old)
    current_time = time.time()
    if not force_refresh and settings_cache and (current_time - settings_cache_time < 300):
        return settings_cache
    
    default_settings = {
        "ping_timeout": "3",
        "log_level": "INFO",
        "check_interval": "30",
        "retry_interval": "1",
        "max_retries": "3",
        "parallel_pings": "True",  # New setting for parallelization
        "ping_count": "3",         # New setting to control ping count
        "cache_ttl": "300"         # TTL for cache in seconds
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
                    "max_retries": "Number of ping attempts before marking a device offline",
                    "parallel_pings": "Enable parallel pinging of devices (True/False)",
                    "ping_count": "Number of pings to send per device for metrics calculation",
                    "cache_ttl": "Time to live (in seconds) for cached data"
                }
                crud.upsert_setting(db, key, value, descriptions.get(key, ""))
            settings = default_settings
            
        # Convert string values to appropriate types
        result = {}
        for key, value in settings.items():
            if key in ["ping_timeout", "check_interval", "retry_interval", "max_retries", "ping_count", "cache_ttl"]:
                try:
                    result[key] = int(value)
                except (ValueError, TypeError):
                    result[key] = int(default_settings.get(key, "0"))
            elif key == "parallel_pings":
                result[key] = value.lower() == "true"
            else:
                result[key] = value
        
        # Update cache
        settings_cache = result
        settings_cache_time = current_time
        
        return result
    except Exception as e:
        logging.error(f"Error loading settings from database: {e}")
        # Fallback to default settings if database access fails
        return {k: (int(v) if k in ["ping_timeout", "check_interval", "retry_interval", "max_retries", "ping_count", "cache_ttl"] 
                   else (v.lower() == "true" if k == "parallel_pings" else v)) 
                for k, v in default_settings.items()}
    finally:
        db.close()

def load_devices():
    """Load all devices from the database for monitoring."""
    db = SessionLocal()
    try:
        devices = db.query(Device).all()
        return [{
            "id": device.id,
            "name": device.name, 
            "ip": device.ip,
            "type": device.type,
            "status": device.status,
            "packet_loss": device.packet_loss,
            "jitter": device.jitter
        } for device in devices]
    except Exception as e:
        logging.error(f"Error loading devices from database: {e}")
        return []
    finally:
        db.close()

def update_device_status(device_id, ip, new_status, packet_loss=None, jitter=None):
    """Update the status of a device in the database by its IP, along with metrics."""
    global device_status_cache, metrics_history
    
    db = SessionLocal()
    try:
        device = db.query(Device).filter(Device.id == device_id).first()
        if not device:
            device = db.query(Device).filter(Device.ip == ip).first()
            
        if device:
            # Store the previous status to detect changes
            previous_status = device.status
            previous_key = f"{device.id}:{previous_status}"
            current_key = f"{device.id}:{new_status}"
            
            # Check if this is a real status change or just a metrics update
            status_changed = (
                previous_status != new_status and
                device_status_cache.get(previous_key) != current_key
            )
            
            # Update device status and metrics
            device.status = new_status
            if packet_loss is not None:
                device.packet_loss = packet_loss
                # Store in history for trend analysis
                metrics_history[f"{device.id}:packet_loss"].append(packet_loss)
            if jitter is not None:
                device.jitter = jitter
                # Store in history for trend analysis
                metrics_history[f"{device.id}:jitter"].append(jitter)
            
            # Update the device's uptime if it's online
            if new_status == "online":
                # Increment the uptime counter (assuming check_interval is in seconds)
                settings = load_settings()
                check_interval = settings.get("check_interval", 30)
                device.uptime = device.uptime + (check_interval / 3600)  # Convert to hours
                
                # If device has transitioned from offline to online, resolve any active alerts
                if previous_status == "offline":
                    # Auto-resolve any active connectivity alerts for this device
                    auto_resolve_alerts(db, device)
                    
            elif new_status == "offline" and previous_status == "online":
                # Reset uptime counter when device goes offline
                device.uptime = 0
                
            # Generate alerts for status changes or concerning metrics
            if status_changed:
                if new_status == "offline":
                    # Create a critical alert when device goes offline
                    create_alert(db, device.id, "critical", "Connectivity", 
                                f"Device {device.name} is offline",
                                f"The device at {device.ip} is no longer responding to ping requests.")
                # Rimuovo la creazione dell'alert info quando un device torna online
                # Lo storico sarà disponibile nella cronologia degli alert
                
                # Update cache with the new status
                device_status_cache[current_key] = time.time()
            
            # Check for high packet loss if device is online
            if new_status == "online" and packet_loss is not None and packet_loss > 10:
                # Check trend - alert only if packet loss is consistently high or increasing
                history = metrics_history.get(f"{device.id}:packet_loss", [])
                # Need at least 2 points to establish a trend
                if len(history) >= 2 and history[-2] <= packet_loss:
                    create_alert(db, device.id, "warning", "Performance", 
                               f"High packet loss detected: {packet_loss:.1f}%",
                               f"Device {device.name} ({device.ip}) is experiencing significant packet loss.")
            
            db.commit()
        else:
            logging.error(f"Device with IP {ip} not found for status update.")
    except Exception as e:
        logging.error(f"Error updating device status: {e}")
        db.rollback()
    finally:
        db.close()

def auto_resolve_alerts(db, device):
    """Automatically resolve active alerts when a device comes back online."""
    try:
        # Find all active alerts for this device
        active_alerts = db.query(Alert).filter(
            Alert.device_id == device.id,
            Alert.status == "active"
        ).all()
        
        current_time = datetime.now()
        
        # Resolve each alert and calculate incident duration
        for alert in active_alerts:
            # Calculate incident duration
            start_time = alert.timestamp
            duration_seconds = (current_time - start_time).total_seconds()
            
            # Format duration as a human-readable string
            hours, remainder = divmod(duration_seconds, 3600)
            minutes, seconds = divmod(remainder, 60)
            duration_formatted = f"{int(hours)}h {int(minutes)}m {int(seconds)}s"
            
            # Update the alert
            alert.status = "resolved"
            alert.resolved_at = current_time
            alert.duration = duration_formatted
            alert.resolution_note = "Automatically resolved - device is back online"
            
            logging.info(f"Auto-resolved alert '{alert.message}' for {device.name}. Duration: {duration_formatted}")
            
        db.commit()
        
        # Clear from notification queue
        global alert_queue
        alert_queue = deque([a for a in alert_queue if not (a['device_id'] == device.id)], maxlen=100)
        
    except Exception as e:
        logging.error(f"Error auto-resolving alerts: {e}")
        db.rollback()

def create_alert(db, device_id, severity, alert_type, message, description=None):
    """Create a new alert in the database and add to notification queue."""
    try:
        # Check if there's already an active alert of the same type for this device
        existing_alert = db.query(Alert).filter(
            Alert.device_id == device_id,
            Alert.type == alert_type,
            Alert.message == message,
            Alert.status == "active"
        ).first()
        
        # Don't create duplicate alerts if there's an active one
        if existing_alert:
            logging.info(f"Alert già esistente per il device {device_id}, non ne creo uno nuovo")
            return
        
        # Pulisci la cache dello stato del dispositivo per consentire la creazione di 
        # nuovi alert anche se un alert simile è stato risolto recentemente
        for key in list(device_status_cache.keys()):
            if str(device_id) in key:
                logging.info(f"Rimuovo chiave dalla cache: {key}")
                del device_status_cache[key]
        
        # Crea il nuovo alert
        alert_data = {
            "device_id": device_id,
            "severity": severity,
            "type": alert_type,
            "message": message,
            "description": description,
            "status": "active"
        }
        
        logging.info(f"Creazione nuovo alert: {message} per device {device_id}")
        new_alert = crud.create_alert(db, alert_data)
        
        # Add to notification queue for real-time updates
        if new_alert:
            alert_queue.append({
                "id": new_alert.id,
                "device_id": device_id,
                "severity": severity,
                "message": message,
                "timestamp": time.time()
            })
            
            logging.info(f"Alert creato con successo: {severity} - {message}")
        else:
            logging.error(f"Errore nella creazione dell'alert per il device {device_id}")
    except Exception as e:
        logging.error(f"Error creating alert: {e}")

def ping_device(device, settings):
    """Ping a single device and calculate metrics."""
    name = device["name"]
    ip = device["ip"]
    device_id = device["id"]
    ping_timeout = settings.get("ping_timeout", 1)
    retry_interval = settings.get("retry_interval", 5)
    max_retries = settings.get("max_retries", 3)
    ping_count = settings.get("ping_count", 3)
    
    retries = 0
    packet_loss_pct = 0
    ping_times = []
    
    # Perform multiple pings to calculate metrics
    for _ in range(ping_count):
        response = ping(ip, timeout=ping_timeout)
        if response:
            ping_times.append(response)
    
    if ping_times:
        # Calculate packet loss percentage
        packet_loss_pct = (ping_count - len(ping_times)) * (100 / ping_count)
        
        # Calculate jitter if we have at least 2 successful pings
        jitter = 0
        if len(ping_times) >= 2:
            # Simple jitter calculation (standard deviation)
            mean = sum(ping_times) / len(ping_times)
            variance = sum((t - mean) ** 2 for t in ping_times) / len(ping_times)
            jitter = variance ** 0.5 * 1000  # Convert to ms
        
        # Device is responding, mark as online
        status = "online"
        logging.info(f"{name} ({ip}) is {status}")
        update_device_status(device_id, ip, status, packet_loss_pct, jitter)
        return True
    else:
        # Start retry logic
        while retries < max_retries:
            status = f"offline, retrying ({retries + 1})"
            logging.info(f"{name} ({ip}) is {status}")
            retries += 1
            if retries < max_retries:
                time.sleep(retry_interval)
                response = ping(ip, timeout=ping_timeout)
                if response:
                    # Device responded during retries
                    status = "online"
                    logging.info(f"{name} ({ip}) is {status}")
                    update_device_status(device_id, ip, status, 75, 0)  # High packet loss but responding
                    return True
        
        # Device is not responding after all retries
        final_status = "offline"
        logging.info(f"{name} ({ip}) is {final_status}")
        update_device_status(device_id, ip, final_status, 100, 0)  # 100% packet loss when offline
        return False

def ping_devices_parallel(devices, settings):
    """Ping multiple devices in parallel using a thread pool."""
    device_count = len(devices)
    if device_count == 0:
        return
        
    # Determine max workers - don't create more threads than needed
    # Also cap at 10 threads to avoid overwhelming the system
    max_workers = min(device_count, 10)
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all ping tasks
        future_to_device = {
            executor.submit(ping_device, device, settings): device 
            for device in devices
        }
        
        # Process results as they complete
        for future in concurrent.futures.as_completed(future_to_device):
            device = future_to_device[future]
            try:
                future.result()  # Get the ping result
            except Exception as e:
                logging.error(f"Error monitoring device {device['name']}: {e}")

def ping_devices_sequential(devices, settings):
    """Ping devices sequentially."""
    for device in devices:
        try:
            ping_device(device, settings)
        except Exception as e:
            logging.error(f"Error monitoring device {device['name']}: {e}")

def get_latest_alerts(limit=10):
    """Get the most recent alerts from the notification queue."""
    return list(alert_queue)[-limit:]

def clear_old_cache_entries():
    """Clean up old cache entries."""
    current_time = time.time()
    settings = load_settings()
    cache_ttl = settings.get("cache_ttl", 300)
    
    # Clean up device status cache
    expired_keys = [k for k, v in device_status_cache.items() 
                   if current_time - v > cache_ttl]
    for key in expired_keys:
        del device_status_cache[key]

def start_monitor():
    """Start the device monitoring cycle."""
    logging.info("Starting device monitoring cycle...")
    while not shutdown_event.is_set():
        try:
            devices = load_devices()
            settings = load_settings()
            
            if not devices:
                logging.error("No devices found in this cycle.")
            else:
                # Clean up old cache entries periodically
                clear_old_cache_entries()
                
                # Use parallel or sequential pinging based on settings
                if settings.get("parallel_pings", True):
                    ping_devices_parallel(devices, settings)
                else:
                    ping_devices_sequential(devices, settings)
                    
            check_interval = settings.get("check_interval", 60)
            logging.info(f"Cycle completed. Waiting {check_interval} seconds before next cycle...")
            
            # Use a loop with short sleeps to check shutdown more frequently
            for _ in range(check_interval):
                if shutdown_event.is_set():
                    break
                time.sleep(1)
                
        except Exception as e:
            logging.error(f"Error in monitoring cycle: {e}")
            # Wait a bit before trying again after an error
            time.sleep(5)

def stop_monitor():
    """Signal the monitor to stop."""
    shutdown_event.set()
    logging.info("Monitor shutdown signal received.")