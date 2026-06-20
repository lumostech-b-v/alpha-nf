from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
import sys

def get_user_data_dir():
    """
    Get the user data directory for storing the database.
    This ensures the database is always in a writable location.
    """
    if sys.platform == 'win32':
        # Windows: Use AppData\Local
        appdata = os.getenv('LOCALAPPDATA', os.path.expanduser('~\\AppData\\Local'))
        user_data_dir = os.path.join(appdata, 'NeuroFeedbackSystem')
    elif sys.platform == 'darwin':
        # macOS: Use ~/Library/Application Support
        user_data_dir = os.path.join(os.path.expanduser('~'), 'Library', 'Application Support', 'NeuroFeedbackSystem')
    else:
        # Linux: Use ~/.local/share
        user_data_dir = os.path.join(os.path.expanduser('~'), '.local', 'share', 'NeuroFeedbackSystem')
    
    # Ensure the directory exists
    os.makedirs(user_data_dir, exist_ok=True)
    return user_data_dir

def is_writable(path):
    """Check if a directory is writable."""
    try:
        test_file = os.path.join(path, '.write_test')
        with open(test_file, 'w') as f:
            f.write('test')
        os.remove(test_file)
        return True
    except (OSError, IOError):
        return False

def get_database_path():
    """
    Get the correct database path for both development and packaged exe modes.
    
    When running as a packaged exe (frozen), try to use the exe directory first,
    but fall back to user data directory if not writable.
    In development, it's in the pyServer directory.
    """
    if getattr(sys, 'frozen', False):
        # Running as compiled exe
        application_path = os.path.dirname(sys.executable)
        
        # Check if the application directory is writable
        if is_writable(application_path):
            db_path = os.path.join(application_path, 'app.db')
            print(f"Database path: {db_path} (using exe directory)")  # Debug logging
            return db_path
        else:
            # Fall back to user data directory (always writable)
            user_data_dir = get_user_data_dir()
            db_path = os.path.join(user_data_dir, 'app.db')
            print(f"Database path: {db_path} (using user data directory - exe directory not writable)")  # Debug logging
            return db_path
    else:
        # Running as script - go up two levels from app/core to pyServer
        application_path = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        db_path = os.path.join(application_path, 'app.db')
        # Ensure the directory exists
        os.makedirs(application_path, exist_ok=True)
        print(f"Database path: {db_path} (development mode)")  # Debug logging
        return db_path

# how are we connecting to the DB?
# Use environment variable or construct path based on execution mode
if "DATABASE_URL" in os.environ:
    DATABASE_URL = os.getenv("DATABASE_URL")
else:
    db_file_path = get_database_path()
    DATABASE_URL = f"sqlite:///{db_file_path}"

# Create engine with production-ready settings
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # Needed for SQLite
    echo=False,  # Disable SQL debugging in production for performance
    pool_pre_ping=False,  # Verify connections before use. False for efficiency
)

# DB session
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
