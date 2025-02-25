# /src/api/main.py

import os, sys, json, logging, threading, time, asyncio
from fastapi import FastAPI, Request
from contextlib import asynccontextmanager
from fastapi.responses import StreamingResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles

# Add the src directory to sys.path explicitly
sys.path.append(os.getenv("PYTHONPATH", "src")) 
from app.monitor import start_monitor, stop_monitor, load_settings

# Paths
log_path = os.path.join("logs", "netwatch.log")
templates_path = os.path.join("src", "app", "templates")
templates = Jinja2Templates(directory=templates_path)

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
        format='[%(asctime)s] > %(message)s',
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

# Asynchronous generator to stream logs and show the full log on first access
async def tail_log(file_path: str):
    # Open the log file
    with open(file_path, "r", encoding="utf-8") as f:
        # Step 1: Yield the entire log file initially
        f.seek(0)
        # Read all the content of the log file up to the current point
        while True:
            line = f.readline()
            if line:
                yield f"data: {line.rstrip()}\n\n"
            else:
                # Once we've printed the entire file, switch to tailing the file
                break

        # Step 2: Start streaming new lines after we've printed the full file
        f.seek(0, os.SEEK_END)  # Start tailing from the end of the file
        while True:
            line = f.readline()
            if line:
                yield f"data: {line.rstrip()}\n\n"
            else:
                await asyncio.sleep(0.1)  # Wait for new lines

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

# Serve static files from the 'assets' directory
app.mount("/static", StaticFiles(directory="src/assets"), name="static")

@app.get("/navbar")
async def get_navbar(request: Request):
    return templates.TemplateResponse("navbar.html", {"request": request})

@app.get("/sidebar")
async def get_sidebar(request: Request):
    return templates.TemplateResponse("sidebar.html", {"request": request})

@app.get("/")
def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/devices")
def get_devices():
    devices = read_devices()
    return {"devices": devices}

@app.get("/logs")
async def get_logs_page(request: Request):
    # Render the dedicated HTML page
    return templates.TemplateResponse("logs.html", {"request": request})

@app.get("/stream")
async def stream_logs():
    return StreamingResponse(tail_log(log_path), media_type="text/event-stream")