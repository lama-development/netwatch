import os
import json
import logging  
import threading
#import asyncio
import time
from fastapi import FastAPI
from contextlib import asynccontextmanager
from fastapi.responses import StreamingResponse
from app.monitor import start_monitor

# Load devices from JSON
def read_devices():
    try:
        with open("src/config/devices.json", "r") as file:
            data = json.load(file)
            return data["devices"]
    except FileNotFoundError:
        return []

async def read_logs():
    # Streams log file contents to the client as new lines are added
    log_file_path = os.path.join("logs", "netwatch.log")

    if not os.path.exists(log_file_path):
        os.makedirs("logs")
    
    with open(log_file_path, "r", encoding="utf-8") as file:
        while True:
            line = file.readline()
            if not line:
                time.sleep(1)  # No new log, wait for a while
                continue
            yield line  # Send new line to the client

# Create an async context manager for lifespan
@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.basicConfig(level=logging.INFO)
    # Startup logic
    thread = threading.Thread(target=start_monitor)
    thread.daemon = True
    thread.start()
    logging.info("NetWatch started in the background")
    
    yield  # FastAPI will continue running
    
    # Shutdown logic (if any)
    logging.info("NetWatch API has been shutdown")

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