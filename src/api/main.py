# src/api/main.py

import os, sys, json, logging, threading, time, asyncio
from fastapi import FastAPI, Request, Depends
from contextlib import asynccontextmanager
from pydantic import BaseModel
from fastapi.responses import StreamingResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from typing import Optional, List
sys.path.append(os.getenv("PYTHONPATH", "src")) # Add the src directory to sys.path explicitly
from app.monitor import start_monitor, stop_monitor, load_settings
from app.db.database import SessionLocal, engine, Base
from app.db import models, crud

# Paths
log_path = os.path.join("logs", "netwatch.log")
templates_path = os.path.join("src", "app", "templates")
settings_path = os.path.join("src", "config", "settings.json")
templates = Jinja2Templates(directory=templates_path)

# Create tables if they don't exist
Base.metadata.create_all(bind=engine)

# Global event to signal when to stop reading logs
shutdown_event = threading.Event()

# Create an async context manager for lifespan
@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    setup_logger()
    # Startup logic
    thread = threading.Thread(target=start_monitor, daemon=True)
    thread.start()
    logging.info("NetWatch started in the background.")
    yield  # FastAPI keeps running until shutdown
    # Shutdown logic
    logging.info("NetWatch is shutting down...")
    stop_monitor()
    shutdown_event.set()  # Signal to stop reading logs
    thread.join(timeout=3)  # Wait for it to exit cleanly (timeout just in case)
    logging.info("NetWatch has been terminated.")

# Create the FastAPI app and use the lifespan event
app = FastAPI(lifespan=lifespan)

# Serve static files from the 'assets' directory
app.mount("/static", StaticFiles(directory="src/assets"), name="static")

''' ----- Pydantic Models ----- '''	
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
    subnet: Optional[str] = None
    gateway: Optional[str] = None
    dns: Optional[str] = None

''' ----- Helper Functions ----- '''
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def setup_logger():
    # Load settings from JSON file
    settings = load_settings()
    log_level = settings.get("log_level", "INFO").upper()  # Default to INFO if not found
    # Create 'logs' directory if it doesn't exist
    if not os.path.exists("logs"):
        os.makedirs("logs")
    # Clear the log file on startup
    open(log_path, "w").close()
    # Logger configuration
    logging.basicConfig(
        level=getattr(logging, log_level), # Set log level dynamically
        format='[%(asctime)s] > %(message)s',
        encoding="utf-8",
        handlers=[
            logging.FileHandler(log_path), # Log to file
            logging.StreamHandler()  # Log to console as well
        ]
    )
    logging.info("NetWatch logger initiated.")

def serialize_device(device):
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
        "custom_alerts": device.custom_alerts,
        "subnet": device.subnet,
        "gateway": device.gateway,
        "dns": device.dns
    }

# Asynchronous generator to stream logs and show the full log on first access
async def tail_log(file_path: str):
    # Open the log file
    with open(file_path, "r", encoding="utf-8") as f:
        # Yield the entire log file initially
        f.seek(0)
        # Read all the content of the log file up to the current point
        while True:
            line = f.readline()
            if line:
                yield f"data: {line.rstrip()}\n\n"
            else:
                # Once we've printed the entire file, switch to tailing the file
                break
        # Start streaming new lines after we've printed the full file
        f.seek(0, os.SEEK_END)  # Start tailing from the end of the file
        while True:
            line = f.readline()
            if line:
                yield f"data: {line.rstrip()}\n\n"
            else:
                await asyncio.sleep(0.1)  # Wait for new lines

''' ----- Components ----- '''
@app.get("/navbar")
async def get_navbar(request: Request):
    return templates.TemplateResponse("navbar.html", {"request": request})

@app.get("/sidebar")
async def get_sidebar(request: Request):
    return templates.TemplateResponse("sidebar.html", {"request": request})

''' ----- Pages ----- '''
@app.get("/")
def get_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/devices", response_class=HTMLResponse)
def devices_page(request: Request):
    return templates.TemplateResponse("devices.html", {"request": request})

@app.get("/logs")
async def get_logs(request: Request):
    return templates.TemplateResponse("logs.html", {"request": request})

@app.get("/stream")
async def get_stream():
    return StreamingResponse(tail_log(log_path), media_type="text/event-stream")

@app.get("/settings")
async def get_settings(request: Request):
    return templates.TemplateResponse("settings.html", {"request": request})

''' ----- API Endpoints ----- '''
@app.get("/api/settings")
async def get_api_settings():
    with open(settings_path, "r") as f:
        settings = json.load(f)
    return settings

@app.post("/api/settings")
async def update_api_settings(settings: Settings):
    with open(settings_path, "w") as f:
        json.dump(settings.dict(), f, indent=4)
    return {"message": "Impostazioni aggiornate con successo"}

@app.get("/api/devices")
def get_devices(db: Session = Depends(get_db)):
    devices = crud.get_devices(db)
    serialized = [serialize_device(device) for device in devices]
    return {"devices": serialized}

@app.post("/api/devices")
def add_device(device: DeviceCreate, db: Session = Depends(get_db)):
    device_data = device.dict()
    # Convert custom_alerts array to a comma-separated string
    device_data["custom_alerts"] = ",".join(device_data.get("custom_alerts", [])) if device_data.get("custom_alerts") else ""
    # Hidden fields are auto set or calculated later by monitoring
    device_data["status"] = "Unknown"
    device_data["packet_loss"] = 0.0
    device_data["jitter"] = 0.0
    device_data["uptime"] = 0.0
    new_device = crud.create_device(db, device_data)
    return new_device

@app.put("/api/devices/{device_id}")
def edit_device(device_id: int, device: DeviceCreate, db: Session = Depends(get_db)):
    device_data = device.dict()
    device_data["custom_alerts"] = ",".join(device_data.get("custom_alerts", [])) if device_data.get("custom_alerts") else ""
    updated = crud.update_device(db, device_id, device_data)
    if updated is None:
        raise HTTPException(status_code=404, detail="Device not found")
    return updated

@app.delete("/api/devices/{device_id}")
def remove_device(device_id: int, db: Session = Depends(get_db)):
    success = crud.delete_device(db, device_id)
    if not success:
        raise HTTPException(status_code=404, detail="Device not found")
    return {"message": "Device deleted successfully"}