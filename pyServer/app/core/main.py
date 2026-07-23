import os
import sys
import logging
from datetime import datetime, timezone
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Add the parent directory to sys.path to ensure proper imports
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(os.path.dirname(current_dir))
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from app.users.routes import router as users_router # routes for the user
from app.patients.routes import router as patients_router # routes for the patients
from app.sessions.routes import router as sessions_router # routes for the sessoins
from app.protocols.routes import router as protocols_router # routes for the protocols
from app.planning.routes import router as planning_router # routes for the planning
from signal_processing.sp_routes import router as sp_router

# Database setup: ensure tables exist on startup
from app.core.database import Base, engine
# Import models so SQLAlchemy knows about them before create_all
import app.users.models  # noqa: F401
import app.patients.models  # noqa: F401
import app.sessions.models  # noqa: F401
import app.protocols.models  # noqa: F401
import app.planning.models  # noqa: F401

LOGGER_NAME = "pyserver.api"
logger = logging.getLogger(LOGGER_NAME)

def configure_logging() -> None:
    if logger.handlers:
        return
    level = os.getenv("LOG_LEVEL", "INFO").upper()
    
    # Determine log file location based on execution mode
    if getattr(sys, 'frozen', False):
        # Running as compiled exe - log next to exe
        log_dir = os.path.dirname(sys.executable)
    else:
        # Running as script - log in pyServer directory
        log_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    
    log_file = os.path.join(log_dir, 'backend.log')
    
    # File handler for persistent logging
    try:
        file_handler = logging.FileHandler(log_file, mode='a')
        file_handler.setFormatter(logging.Formatter(
            fmt="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S%z",
        ))
        logger.addHandler(file_handler)
        print(f"Logging to file: {log_file}")
    except Exception as e:
        print(f"Failed to create log file: {e}")
    
    # Console handler for immediate feedback
    handler = logging.StreamHandler()
    formatter = logging.Formatter(
        fmt="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S%z",
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(level)

def create_app() -> FastAPI:
    configure_logging()

    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Startup events
        try:
            Base.metadata.create_all(bind=engine)
            logger.info("Database tables ensured (create_all)")

            # Run database migrations to ensure schema alignment
            from app.core.migrations import run_database_migrations
            if run_database_migrations():
                logger.info("Database migrations completed successfully")
            else:
                logger.warning("Database migrations had issues - check logs")

        except Exception as exc:
            logger.exception("Failed ensuring DB tables: %s", exc)

        # Sync default protocols for all existing users (fixes stale data on Windows)
        try:
            from app.core.database import SessionLocal as _SessionLocal
            from app.protocols.crud import sync_all_default_protocols
            _db = _SessionLocal()
            try:
                sync_all_default_protocols(_db)
                logger.info("Default protocols synced")
            finally:
                _db.close()
        except Exception as exc:
            logger.warning("Protocol sync skipped: %s", exc)

        logger.info("API startup complete")

        # Yield control to the application
        yield

        # Shutdown events
        logger.info("API shutdown")

    app = FastAPI(title="NeuroFeedback API", version="2.1.4", lifespan=lifespan)
    
    # CORS configuration
    cors_origins = os.getenv("CORS_ORIGINS", "*")
    allow_all = cors_origins.strip() == "*"
    origins = [o.strip() for o in cors_origins.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if allow_all else origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    

    # Include all routers
    app.include_router(users_router)
    app.include_router(patients_router)
    app.include_router(sessions_router)
    app.include_router(protocols_router)  # Protocol library routes
    app.include_router(planning_router)  # Planning routes
    app.include_router(sp_router)  # Signal processing routes
    
    # Root endpoints
    @app.get("/", response_class=JSONResponse)
    async def root():
        return {
            "name": "neurofeedback-api",
            "version": app.version,
            "time": datetime.now(timezone.utc).isoformat(),
            "message": "API is running"
        }
    
    @app.get("/health", response_class=JSONResponse)
    async def health():
        return {
            "status": "ok",
            "uptime_s": None,
            "dependencies": {"fastapi": True},
            "time": datetime.now(timezone.utc).isoformat(),
        }
    
    return app

app = create_app()

# TODO: Protocol Library Integration with NF-Core
# ==============================================
# The following tasks need to be completed to fully integrate the protocol library with nf-core:
#
# 1. PROTOCOL EXECUTION ENGINE
#    - Create a protocol execution service that can load protocol features and apply them to live EEG data
#    - Implement real-time feature extraction based on protocol specifications (frequency bands, channels, etc.)
#    - Add protocol validation to ensure features are compatible with nf-core processing pipeline
#
# 2. NF-CORE INTEGRATION
#    - Modify signal_processing/live_pipeline.py to accept protocol configurations
#    - Update feature extraction in signal_processing/features.py to use protocol-defined parameters
#    - Integrate protocol feedback mechanisms with signal_processing/feedback.py
#    - Add protocol-specific normalization methods to signal_processing/normalization.py
#
# 3. SESSION MANAGEMENT
#    - Link sessions to specific protocols in the database
#    - Add protocol selection interface in the frontend
#    - Implement protocol switching during live sessions
#    - Store protocol performance metrics and results
#
# 4. FRONTEND INTEGRATION
#    - Create protocol library management UI (add, edit, delete protocols)
#    - Add protocol selection interface for sessions
#    - Display protocol features and parameters in a user-friendly format
#    - Implement protocol performance visualization and analytics
#
# 5. ADVANCED FEATURES
#    - Add protocol templates and presets for common neurofeedback applications
#    - Implement protocol sharing between users
#    - Add protocol versioning and history tracking
#    - Create protocol validation and testing tools
#
# 6. TESTING AND VALIDATION
#    - Add unit tests for protocol CRUD operations
#    - Create integration tests for protocol execution with mock EEG data
#    - Add protocol compatibility validation
#    - Implement protocol performance benchmarking
#
# 7. DOCUMENTATION
#    - Create protocol library user guide
#    - Document protocol feature specifications and formats
#    - Add API documentation for protocol endpoints
#    - Create examples of custom protocol creation

def run() -> None:
    """Launch development server"""
    import uvicorn
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    log_level = os.getenv("LOG_LEVEL", "info")
    uvicorn.run(
        "app.core.main:app",
        host=host,
        port=port,
        log_level=log_level,
        reload=os.getenv("RELOAD", "false").lower() == "true",
        workers=int(os.getenv("WORKERS", "1")),
    )

if __name__ == "__main__":
    run()
