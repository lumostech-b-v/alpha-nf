#!/usr/bin/env python3
"""
Standalone script to run database migrations.
Run this script to migrate your database without starting the full server.

Usage:
    python run_migrations.py
"""

import sys
import os

# Add the pyServer directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.migrations import run_database_migrations
from app.core.database import Base, engine
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

def main():
    """Run database migrations"""
    logger.info("=" * 60)
    logger.info("Running Database Migrations")
    logger.info("=" * 60)
    
    try:
        # First, ensure all tables are created (SQLAlchemy models)
        logger.info("Creating/updating database tables from models...")
        Base.metadata.create_all(bind=engine)
        logger.info("✓ Database tables ensured")
        
        # Run migrations
        logger.info("Running migration scripts...")
        success = run_database_migrations()
        
        if success:
            logger.info("=" * 60)
            logger.info("✓ Migrations completed successfully!")
            logger.info("=" * 60)
            return 0
        else:
            logger.error("=" * 60)
            logger.error("✗ Migrations had issues - check logs above")
            logger.error("=" * 60)
            return 1
            
    except Exception as e:
        logger.error("=" * 60)
        logger.error(f"✗ Migration failed with error: {e}", exc_info=True)
        logger.error("=" * 60)
        return 1

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)

