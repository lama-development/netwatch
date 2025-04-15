import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Create data directory if it doesn't exist
db_folder = os.path.join("src", "data")
os.makedirs(db_folder, exist_ok=True)

# SQLite database URL with the database file path
SQLALCHEMY_DATABASE_URL = f"sqlite:///{os.path.join(db_folder, 'netwatch.db')}"

# Create SQLAlchemy engine with SQLite-specific parameters
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, 
    connect_args={"check_same_thread": False}  # Required for SQLite
)

# Create a session factory bound to the engine
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for declarative class definitions
Base = declarative_base()