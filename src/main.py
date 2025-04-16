import os
import sys
import json
import logging
import threading
import asyncio
from contextlib import asynccontextmanager
from typing import Optional, List, Dict

# Third-party imports
from fastapi import FastAPI, Request, Depends, HTTPException
from fastapi.responses import StreamingResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy.orm import Session

# Local application imports
sys.path.append(os.getenv("PYTHONPATH", "src"))
from app.monitor import start_monitor, stop_monitor, load_settings
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

async def tail_log(file_path: str):
    """
    Asynchronously stream log entries from the specified log file
    using Server-Sent Events (SSE). Yields new log lines as they
    are written to the file.
    """
    with open(file_path, "r", encoding="utf-8") as f:
        # Yield existing log content
        f.seek(0)
        for line in f:
            yield f"data: {line.rstrip()}\n\n"
        # Move to the end of file for tailing new entries
        f.seek(0, os.SEEK_END)
        while not shutdown_event.is_set():
            line = f.readline()
            if line:
                yield f"data: {line.rstrip()}\n\n"
            else:
                await asyncio.sleep(0.1)


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

    # Start background monitoring as a daemon thread
    monitor_thread = threading.Thread(target=start_monitor, daemon=True)
    monitor_thread.start()
    logging.info("Background monitoring started.")

    # Yield control to run the application
    yield

    # Shutdown procedures
    logging.info("Shutting down application...")
    stop_monitor()
    shutdown_event.set()  # Signal tail_log to stop streaming
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
            settings_data = load_settings()
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
            crud.upsert_setting(db, key, str(value), description)
        
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
async def stream_device_status():
    """
    Stream the real-time status of devices as a Server-Sent Events (SSE) stream.
    """
    async def event_generator():
        while True:
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
                data = {
                    "online": online_count,
                    "offline": offline_count,
                    "unknown": unknown_count,
                }
                yield f"data: {json.dumps(data)}\n\n"
            except Exception as exc:
                yield f"data: {json.dumps({'error': str(exc)})}\n\n"
            finally:
                db.close()
            await asyncio.sleep(5)  # Update every 5 seconds

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/api/alerts")
def get_api_alerts(
    skip: int = 0, 
    limit: int = 100, 
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Retrieve alerts with optional filtering and pagination.
    """
    try:
        alerts = crud.get_alerts(db, skip=skip, limit=limit, status=status)
        
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