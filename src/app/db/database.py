# src/app/db/database.py

import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

db_folder = os.path.join("src", "data")
os.makedirs(db_folder, exist_ok=True)
SQLALCHEMY_DATABASE_URL = f"sqlite:///{os.path.join(db_folder, 'netwatch.db')}"

engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()