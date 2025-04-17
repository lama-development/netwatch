import os
import sys
import json
import logging
import threading
import asyncio
import time
from contextlib import asynccontextmanager
from typing import Optional, List, Dict
from datetime import datetime, timedelta

# Third-party imports
from fastapi import FastAPI, Request, Depends, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy.orm import Session

# Local application imports
sys.path.append(os.getenv("PYTHONPATH", "src"))
from app.monitor import start_monitor, stop_monitor, load_settings, get_latest_alerts
from app.db.database import SessionLocal, engine, Base
from app.db import models, crud


# ---------------------------------------------------------------------------
# Global Paths and Configuration
# ---------------------------------------------------------------------------
LOG_DIR = "logs"
LOG_FILE = os.path.join(LOG_DIR, "netwatch.log")
TEMPLATES_DIR = os.path.join("src", "app", "templates")

# Initialize Jinja2 templates for HTML rendering
templates = Jinja2Templates(directory=TEMPLATES_DIR)

# Global event used to signal shutdown for background tasks
shutdown_event = threading.Event()

# Cache for expensive operations
_cache = {
    'log_lines': [],
    'log_last_modified': 0,
    'device_status': {
        'data': {'online': 0, 'offline': 0, 'unknown': 0},
        'last_updated': 0
    },
    'connected_clients': set()
}


# ---------------------------------------------------------------------------
# Helper Functions and Dependencies
# ---------------------------------------------------------------------------
def setup_logger() -> None:
    """
    Configure the logging system for the application.
    Loads settings from the database, ensures the logs directory exists,
    clears the previous log file, and sets up logging handlers.
    """
    settings = load_settings()
    log_level = settings.get("log_level", "INFO").upper()

    # Create logs directory if it does not exist
    if not os.path.exists(LOG_DIR):
        os.makedirs(LOG_DIR)

    # Clear the log file on startup
    with open(LOG_FILE, "w", encoding="utf-8") as log_file:
        log_file.truncate(0)

    # Configure logging to file and console
    logging.basicConfig(
        level=getattr(logging, log_level, logging.INFO),
        format='[%(asctime)s] > %(message)s',
        encoding="utf-8",
        handlers=[
            logging.FileHandler(LOG_FILE),
            #   logging.StreamHandler()
        ]
    )
    logging.info("Logger initialized with level %s", log_level)

def get_db():
    """
    Dependency generator for creating and closing a database session.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def serialize_device(device: models.Device) -> dict:
    """
    Serialize a device instance into a dictionary.
    """
    return {
        "id": device.id,
        "name": device.name,
        "ip": device.ip,
        "type": device.type,
        "status": device.status,
        "mac_address": device.mac_address,
        "owner": device.owner,
        "packet_loss": device.packet_loss,
        "jitter": device.jitter,
        "uptime": device.uptime,
        "custom_alerts": device.custom_alerts
    }

def cache_log_content(force_refresh=False):
    """Cache log content to reduce file reads."""
    global _cache
    
    # Check if file has been modified since last read
    try:
        last_modified = os.path.getmtime(LOG_FILE)
        if not force_refresh and last_modified <= _cache['log_last_modified']:
            return _cache['log_lines']
            
        # File has been modified, read and cache it
        with open(LOG_FILE, "r", encoding="utf-8") as f:
            _cache['log_lines'] = f.readlines()
            _cache['log_last_modified'] = last_modified
            return _cache['log_lines']
    except Exception as e:
        logging.error(f"Error caching log content: {e}")
        return []

async def tail_log(file_path: str):
    """
    Asynchronously stream log entries from the specified log file
    using Server-Sent Events (SSE). Uses caching to reduce disk I/O.
    """
    client_id = id(asyncio.current_task())
    _cache['connected_clients'].add(client_id)
    
    try:
        # Initial log content from cache
        log_lines = cache_log_content(force_refresh=True)
        for line in log_lines:
            yield f"data: {line.rstrip()}\n\n"
        
        # Track last line to avoid duplicates
        last_line_index = len(log_lines) - 1 if log_lines else -1
        
        # Stream new entries
        while not shutdown_event.is_set():
            log_lines = cache_log_content()
            
            # If there are new lines, send them
            if last_line_index < len(log_lines) - 1:
                for i in range(last_line_index + 1, len(log_lines)):
                    yield f"data: {log_lines[i].rstrip()}\n\n"
                last_line_index = len(log_lines) - 1
                
            await asyncio.sleep(0.5)
    finally:
        # Remove client from connected set when connection closes
        _cache['connected_clients'].discard(client_id)

async def update_device_status_cache(background_tasks: BackgroundTasks):
    """Update the device status cache in background."""
    db = SessionLocal()
    try:
        devices = crud.get_devices(db)
        online_count = sum(
            1 for d in devices if d.status and "online" in d.status.lower()
        )
        offline_count = sum(
            1 for d in devices if d.status and "offline" in d.status.lower()
        )
        total = len(devices)
        unknown_count = total - online_count - offline_count
        
        # Update cache
        _cache['device_status']['data'] = {
            "online": online_count,
            "offline": offline_count,
            "unknown": unknown_count,
        }
        _cache['device_status']['last_updated'] = time.time()
    except Exception as exc:
        logging.error(f"Error updating device status cache: {exc}")
    finally:
        db.close()

async def stream_device_status_impl():
    """Internal implementation of device status streaming."""
    client_id = id(asyncio.current_task())
    _cache['connected_clients'].add(client_id)
    
    try:
        # Ensure we have fresh data at the start of a new connection
        bg_tasks = BackgroundTasks()
        await update_device_status_cache(bg_tasks)
        
        # Send initial data immediately after updating
        yield f"data: {json.dumps(_cache['device_status']['data'])}\n\n"
        
        # Stream updates
        while not shutdown_event.is_set():
            # Fetch update only if cache is stale (older than 5 seconds)
            current_time = time.time()
            if current_time - _cache['device_status']['last_updated'] > 5:
                bg_tasks = BackgroundTasks()
                await update_device_status_cache(bg_tasks)
            
            # Send current data regardless
            yield f"data: {json.dumps(_cache['device_status']['data'])}\n\n"
            await asyncio.sleep(5)  # Update every 5 seconds
    finally:
        # Remove client from connected set
        _cache['connected_clients'].discard(client_id)

# ---------------------------------------------------------------------------
# Application Lifespan and Initialization
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Async context manager for the application's lifespan.
    Sets up logging, initializes the database, starts background monitoring,
    and handles graceful shutdown.
    """
    # Create database tables if they do not exist
    Base.metadata.create_all(bind=engine)
    setup_logger()

    # Pre-cache device status at startup
    background_tasks = BackgroundTasks()
    await update_device_status_cache(background_tasks)

    # Start background monitoring as a daemon thread
    monitor_thread = threading.Thread(target=start_monitor, daemon=True)
    monitor_thread.start()
    logging.info("Background monitoring started.")

    # Yield control to run the application
    yield

    # Shutdown procedures
    logging.info("Shutting down application...")
    stop_monitor()
    shutdown_event.set()  # Signal streaming functions to stop
    monitor_thread.join(timeout=3)
    logging.info("Application shutdown complete.")

# Create the FastAPI app with lifespan management
app = FastAPI(lifespan=lifespan)

# Mount static files (e.g., assets)
app.mount("/static", StaticFiles(directory=os.path.join("src", "assets")), name="static")


# ---------------------------------------------------------------------------
# Pydantic Models for Request Validation
# ---------------------------------------------------------------------------
class Settings(BaseModel):
    ping_timeout: int
    log_level: str
    check_interval: int
    retry_interval: int
    max_retries: int
    parallel_pings: bool
    ping_count: int
    cache_ttl: int


class DeviceCreate(BaseModel):
    name: str
    ip: str
    type: str
    mac_address: Optional[str] = None
    owner: Optional[str] = None
    custom_alerts: Optional[List[str]] = []


class AlertResponse(BaseModel):
    id: int
    device_id: int
    device_name: str
    timestamp: str
    severity: str
    type: str
    message: str
    description: Optional[str] = None
    status: str


# ---------------------------------------------------------------------------
# Template Endpoints (View Components)
# ---------------------------------------------------------------------------
@app.get("/navbar", response_class=HTMLResponse)
async def get_navbar(request: Request):
    """
    Render the navigation bar component.
    """
    return templates.TemplateResponse("components/navbar.html", {"request": request})


@app.get("/sidebar", response_class=HTMLResponse)
async def get_sidebar(request: Request):
    """
    Render the sidebar component.
    """
    return templates.TemplateResponse("components/sidebar.html", {"request": request})


# ---------------------------------------------------------------------------
# Page Routes
# ---------------------------------------------------------------------------
@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """
    Render the home page.
    """
    return templates.TemplateResponse("pages/index.html", {"request": request})


@app.get("/devices", response_class=HTMLResponse)
async def devices_page(request: Request):
    """
    Render the devices management page.
    """
    return templates.TemplateResponse("pages/devices.html", {"request": request})


@app.get("/logs", response_class=HTMLResponse)
async def logs_page(request: Request):
    """
    Render the logs display page.
    """
    return templates.TemplateResponse("pages/logs.html", {"request": request})


@app.get("/settings", response_class=HTMLResponse)
async def settings_page(request: Request):
    """
    Render the settings page.
    """
    return templates.TemplateResponse("pages/settings.html", {"request": request})


@app.get("/alerts", response_class=HTMLResponse)
async def alerts_page(request: Request):
    """
    Render the alerts management page.
    """
    return templates.TemplateResponse("pages/alerts.html", {"request": request})


# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/settings")
async def get_api_settings(db: Session = Depends(get_db)):
    """
    Retrieve application settings from the database.
    """
    try:
        settings_data = crud.get_all_settings(db)
        if not settings_data:
            # If no settings exist, load defaults
            settings_data = load_settings(force_refresh=True)
        return settings_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving settings: {str(e)}")


@app.post("/api/settings")
async def update_api_settings(settings: Settings, db: Session = Depends(get_db)):
    """
    Update application settings in the database.
    """
    try:
        # Get descriptions from existing settings if available
        existing_settings = db.query(models.Setting).all()
        descriptions = {s.key: s.description for s in existing_settings}
        
        # Update each setting in the database
        for key, value in settings.dict().items():
            description = descriptions.get(key, "")
            # Convert boolean to string
            if isinstance(value, bool):
                value = str(value)
            crud.upsert_setting(db, key, str(value), description)
        
        # Force refresh of cached settings
        load_settings(force_refresh=True)
        
        return {"message": "Settings updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating settings: {str(e)}")


@app.get("/api/devices")
def get_devices(db: Session = Depends(get_db)):
    """
    Retrieve all devices from the database.
    """
    devices = crud.get_devices(db)
    return {"devices": [serialize_device(device) for device in devices]}


@app.post("/api/devices")
def add_device(device: DeviceCreate, db: Session = Depends(get_db)):
    """
    Create a new device in the database.
    """
    device_data = device.dict()
    # Convert custom_alerts list to a comma-separated string
    device_data["custom_alerts"] = (
        ",".join(device_data.get("custom_alerts", []))
        if device_data.get("custom_alerts")
        else ""
    )
    # Set default values for auto-calculated fields
    device_data["status"] = "Unknown"
    device_data["packet_loss"] = 0.0
    device_data["jitter"] = 0.0
    device_data["uptime"] = 0.0
    new_device = crud.create_device(db, device_data)
    return new_device


@app.put("/api/devices/{device_id}")
def edit_device(device_id: int, device: DeviceCreate, db: Session = Depends(get_db)):
    """
    Update an existing device identified by device_id.
    """
    device_data = device.dict()
    device_data["custom_alerts"] = (
        ",".join(device_data.get("custom_alerts", []))
        if device_data.get("custom_alerts")
        else ""
    )
    updated_device = crud.update_device(db, device_id, device_data)
    if updated_device is None:
        raise HTTPException(status_code=404, detail="Device not found")
    return updated_device


@app.delete("/api/devices/{device_id}")
def remove_device(device_id: int, db: Session = Depends(get_db)):
    """
    Delete a device identified by device_id.
    """
    if not crud.delete_device(db, device_id):
        raise HTTPException(status_code=404, detail="Device not found")
    return {"message": "Device deleted successfully"}


@app.get("/stream")
async def stream_logs():
    """
    Stream the log file content as a Server-Sent Events (SSE) stream.
    """
    return StreamingResponse(tail_log(LOG_FILE), media_type="text/event-stream")


@app.get("/stream/device_status")
async def stream_device_status(background_tasks: BackgroundTasks):
    """
    Stream the real-time status of devices as a Server-Sent Events (SSE) stream.
    """
    return StreamingResponse(stream_device_status_impl(), media_type="text/event-stream")


@app.get("/stream/alerts")
async def stream_alerts():
    """
    Stream real-time alerts as a Server-Sent Events (SSE) stream.
    Using the alert queue from monitor module instead of querying the database.
    """
    client_id = id(asyncio.current_task())
    _cache['connected_clients'].add(client_id)
    
    try:
        # Invia immediatamente gli alert esistenti
        initial_alerts = get_latest_alerts()
        if initial_alerts:
            yield f"data: {json.dumps(initial_alerts)}\n\n"
        
        # Function to yield latest alerts
        async def generate():
            last_sent_time = time.time()
            
            while not shutdown_event.is_set():
                # Get latest alerts from the queue
                alerts = get_latest_alerts()
                new_alerts = [a for a in alerts if a['timestamp'] > last_sent_time]
                
                if new_alerts:
                    # Update last sent time
                    last_sent_time = time.time()
                    yield f"data: {json.dumps(new_alerts)}\n\n"
                
                await asyncio.sleep(1)
                
        # Genera il flusso SSE
        async for data in generate():
            yield data
            
    finally:
        _cache['connected_clients'].discard(client_id)
        logging.info(f"Client SSE {client_id} disconnesso")


@app.get("/api/alerts")
def get_api_alerts(
    skip: int = 0, 
    limit: int = 100, 
    status: Optional[str] = None,
    exclude_resolved: bool = False,
    db: Session = Depends(get_db)
):
    """
    Retrieve alerts with optional filtering and pagination.
    """
    try:
        alerts = crud.get_alerts(db, skip=skip, limit=limit, status=status, exclude_resolved=exclude_resolved)
        
        # Format the alerts with device names
        result = []
        for alert in alerts:
            # Get the device name
            device = crud.get_device(db, alert.device_id)
            device_name = device.name if device else "Unknown Device"
            
            # Format the timestamp
            timestamp = alert.timestamp.isoformat() if alert.timestamp else None
            
            result.append({
                "id": alert.id,
                "device_id": alert.device_id,
                "device_name": device_name,
                "timestamp": timestamp,
                "severity": alert.severity,
                "type": alert.type,
                "message": alert.message,
                "description": alert.description,
                "status": alert.status
            })
        
        return {"alerts": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving alerts: {str(e)}")


@app.get("/api/alerts/summary")
def get_alerts_summary(db: Session = Depends(get_db)):
    """
    Get a summary of active alerts by severity.
    """
    try:
        summary = crud.count_alerts_by_severity(db, status="active")
        return summary
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving alert summary: {str(e)}")


@app.put("/api/alerts/{alert_id}/acknowledge")
def acknowledge_alert(alert_id: int, db: Session = Depends(get_db)):
    """
    Acknowledge an alert.
    """
    try:
        updated_alert = crud.update_alert_status(db, alert_id, "acknowledged")
        if not updated_alert:
            raise HTTPException(status_code=404, detail="Alert not found")
        return {"message": "Alert acknowledged successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error acknowledging alert: {str(e)}")


@app.put("/api/alerts/{alert_id}/resolve")
def resolve_alert(alert_id: int, db: Session = Depends(get_db)):
    """
    Resolve an alert.
    """
    try:
        updated_alert = crud.update_alert_status(db, alert_id, "resolved")
        if not updated_alert:
            raise HTTPException(status_code=404, detail="Alert not found")
        return {"message": "Alert resolved successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error resolving alert: {str(e)}")


@app.get("/api/metrics/{device_id}")
def get_device_metrics(device_id: int, timeframe: str = "1h", db: Session = Depends(get_db)):
    """
    Get historical metrics for a device.
    Timeframe can be '1h', '24h', '7d' to specify how far back to look.
    """
    try:
        # Get the device to ensure it exists
        device = crud.get_device(db, device_id)
        if not device:
            raise HTTPException(status_code=404, detail="Device not found")
            
        # Determine the time range
        now = datetime.now()
        time_ranges = {
            "1h": now - timedelta(hours=1),
            "24h": now - timedelta(days=1),
            "7d": now - timedelta(days=7)
        }
        
        from_time = time_ranges.get(timeframe, now - timedelta(hours=1))
        
        # This would typically query a time-series database or logs
        # For now, return current metrics
        return {
            "device_id": device_id,
            "name": device.name,
            "current": {
                "status": device.status,
                "packet_loss": device.packet_loss,
                "jitter": device.jitter,
                "uptime": device.uptime
            },
            "timeframe": timeframe,
            # In a real implementation, this would come from historical data
            "history": []
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving device metrics: {str(e)}")


@app.post("/api/refresh_monitoring")
async def refresh_monitoring():
    """
    Restart the monitoring system to apply setting changes immediately.
    This will stop the current monitoring thread and start a new one.
    """
    try:
        # Import shutdown_event directly to be able to reset it
        from app.monitor import shutdown_event
        
        # Stop the current monitoring
        stop_monitor()
        logging.info("Monitoring stopped for refresh")
        
        # Small delay to ensure clean shutdown
        await asyncio.sleep(1)
        
        # Reset the shutdown event so the new thread won't exit immediately
        shutdown_event.clear()
        
        # Start a new monitoring thread
        monitor_thread = threading.Thread(target=start_monitor, daemon=True)
        monitor_thread.start()
        logging.info("Monitoring restarted after settings change")
        
        return {"message": "Monitoring system refreshed successfully"}
    except Exception as e:
        logging.error(f"Error refreshing monitoring: {e}")
        raise HTTPException(status_code=500, detail=f"Error refreshing monitoring: {str(e)}")


@app.get("/api/alerts/history")
def get_api_alert_history(
    days: int = 30,
    skip: int = 0, 
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """
    Retrieve alert history with optional filtering and pagination.
    """
    try:
        alerts = crud.get_alert_history(db, days_back=days, skip=skip, limit=limit)
        
        # Format the alerts with device names and calculated data
        result = []
        for alert in alerts:
            # Get the device name
            device = crud.get_device(db, alert.device_id)
            device_name = device.name if device else "Unknown Device"
            
            # Format timestamps
            timestamp = alert.timestamp.isoformat() if alert.timestamp else None
            resolved_at = alert.resolved_at.isoformat() if alert.resolved_at else None
            
            result.append({
                "id": alert.id,
                "device_id": alert.device_id,
                "device_name": device_name,
                "timestamp": timestamp,
                "severity": alert.severity,
                "type": alert.type,
                "message": alert.message,
                "description": alert.description,
                "status": alert.status,
                "resolved_at": resolved_at,
                "duration": alert.duration,
                "resolution_note": alert.resolution_note
            })
        
        return {"alerts": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving alert history: {str(e)}")


@app.get("/api/alerts/{alert_id}")
def get_alert_by_id(alert_id: int, db: Session = Depends(get_db)):
    """
    Retrieve a specific alert by its ID.
    """
    try:
        alert = crud.get_alert(db, alert_id)
        if not alert:
            raise HTTPException(status_code=404, detail="Alert not found")
            
        # Get the device name
        device = crud.get_device(db, alert.device_id)
        device_name = device.name if device else "Unknown Device"
        
        # Format timestamps
        timestamp = alert.timestamp.isoformat() if alert.timestamp else None
        resolved_at = alert.resolved_at.isoformat() if alert.resolved_at else None
        
        # Format the response
        result = {
            "id": alert.id,
            "device_id": alert.device_id,
            "device_name": device_name,
            "timestamp": timestamp,
            "severity": alert.severity,
            "type": alert.type,
            "message": alert.message,
            "description": alert.description,
            "status": alert.status,
            "resolved_at": resolved_at,
            "duration": alert.duration,
            "resolution_note": alert.resolution_note
        }
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error retrieving alert details: {e}")
        raise HTTPException(status_code=500, detail=f"Error retrieving alert details: {str(e)}")