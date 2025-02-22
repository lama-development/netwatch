# src/api/main.py

import os, json, logging, threading, time
from fastapi import FastAPI
from contextlib import asynccontextmanager
from fastapi.responses import StreamingResponse
from app.monitor import start_monitor, stop_monitor, load_settings

log_path = os.path.join("logs", "netwatch.log")

# Global event to signal when to stop reading logs
shutdown_event = threading.Event()

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
        format='[%(asctime)s] - %(message)s',
        encoding="utf-8",
        handlers=[
            logging.FileHandler(log_path), # Log to file
            logging.StreamHandler()  # Log to console as well
        ]
    )
    logging.info("NetWatch logger initiated.")

# Load devices from JSON
def read_devices():
    try:
        with open("src/config/devices.json", "r") as file:
            data = json.load(file)
            return data["devices"]
    except FileNotFoundError:
        return []

# Streams log file contents to the client as new lines are added
async def read_logs():
    with open(log_path, "r", encoding="utf-8") as file:
        while not shutdown_event.is_set():
            line = file.readline()
            if not line:
                time.sleep(1)  # No new log, wait for a while
                continue
            yield line  # Send new line to the client

# Create an async context manager for lifespan
@asynccontextmanager
async def lifespan(app: FastAPI):
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

@app.get("/")
def read_root():
    return {"message": "NetWatch API is running!"}

@app.get("/devices")
def get_devices():
    devices = read_devices()
    return {"devices": devices}

@app.get("/logs")
def get_logs():
    return StreamingResponse(read_logs(), media_type="text/plain")