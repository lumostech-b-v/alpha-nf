"""
Simple database migration system.
Handles schema changes without losing data.
"""

import logging
from sqlalchemy import text
from app.core.database import engine

logger = logging.getLogger(__name__)

def run_database_migrations():
    """Run database migrations to migrate from old structure (plans/checkpoints) to new structure (patient->blocks)"""
    try:
        logger.info("Running database migrations...")
        
        with engine.connect() as conn:
            # Check current schema
            result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))
            tables = [row[0] for row in result.fetchall()]
            
            # Check if assessment table exists (should be removed)
            assessment_exists = 'assessments' in tables
            
            # Check if plans/checkpoints tables exist (old structure)
            plans_exists = 'plans' in tables
            checkpoints_exists = 'checkpoints' in tables
            
            # Check patients table columns
            patient_columns = []
            if 'patients' in tables:
                result = conn.execute(text("PRAGMA table_info(patients)"))
                patient_columns = [row[1] for row in result.fetchall()]
            
            # Check disorders table columns
            disorder_columns = []
            if 'disorders' in tables:
                result = conn.execute(text("PRAGMA table_info(disorders)"))
                disorder_columns = [row[1] for row in result.fetchall()]
            
            # Check blocks table columns
            blocks_columns = []
            if 'blocks' in tables:
                result = conn.execute(text("PRAGMA table_info(blocks)"))
                blocks_columns = [row[1] for row in result.fetchall()]
            
            # Check protocol_library table columns
            protocol_columns = []
            if 'protocol_library' in tables:
                result = conn.execute(text("PRAGMA table_info(protocol_library)"))
                protocol_columns = [row[1] for row in result.fetchall()]
            
            # Check if blocks table needs migration to new structure
            blocks_needs_migration = False
            if 'blocks' in tables:
                blocks_needs_migration = (
                    'order_index' in blocks_columns or
                    'session_count' in blocks_columns or
                    'current_session' in blocks_columns or
                    'checkpoint_session' in blocks_columns or
                    'is_completed' in blocks_columns or
                    'completed_at' in blocks_columns or
                    'start_session' not in blocks_columns or
                    'end_session' not in blocks_columns
                )
            
            # Check if checkpoints table needs to be created/updated (new structure)
            checkpoints_table_needs_creation = False
            checkpoints_columns = []
            if 'checkpoints' in tables:
                result = conn.execute(text("PRAGMA table_info(checkpoints)"))
                checkpoints_columns = [row[1] for row in result.fetchall()]
                # Check if it has the old structure (checkpoint_id) or missing new structure
                checkpoints_table_needs_creation = (
                    'checkpoint_id' in checkpoints_columns or
                    'session_value' not in checkpoints_columns or
                    'checkpoint_type' not in checkpoints_columns
                )
            else:
                checkpoints_table_needs_creation = True
                checkpoints_columns = []
            
            # Check if migration is needed (old structure migration)
            needs_migration = (
                assessment_exists or
                plans_exists or 
                (checkpoints_exists and checkpoints_columns and 'checkpoint_id' in checkpoints_columns) or  # Old checkpoints structure
                'disorder_id' not in patient_columns or
                'patient_id' not in disorder_columns or
                'version' not in disorder_columns or
                'checkpoint_id' in blocks_columns or
                'patient_id' not in blocks_columns or
                'patient_id' in protocol_columns
            )
            
            if needs_migration:
                logger.info("Migrating to simplified structure (removing assessments/plans/checkpoints, updating disorders/blocks/protocols)")
                _migrate_to_simplified_structure(conn, tables, patient_columns, disorder_columns, blocks_columns, protocol_columns)
                # Re-check blocks table after migration
                result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='blocks'"))
                if result.fetchone():
                    result = conn.execute(text("PRAGMA table_info(blocks)"))
                    blocks_columns_after = [row[1] for row in result.fetchall()]
                    blocks_needs_migration = (
                        'order_index' in blocks_columns_after or
                        'session_count' in blocks_columns_after or
                        'start_session' not in blocks_columns_after or
                        'end_session' not in blocks_columns_after
                    )
            else:
                logger.info("Database schema appears up to date, but checking critical columns...")
            
            # Always check and migrate blocks table to new structure if needed
            if blocks_needs_migration:
                logger.info("Migrating blocks table to new simplified structure (start_session/end_session)")
                _migrate_blocks_to_new_structure(conn)
            
            # Always check and create checkpoints table if needed
            if checkpoints_table_needs_creation:
                logger.info("Creating/updating checkpoints table with new structure")
                _migrate_checkpoints_table(conn, tables, checkpoints_columns)
            
            # ALWAYS check disorders table has patient_id and version (critical columns)
            if 'disorders' in tables:
                result = conn.execute(text("PRAGMA table_info(disorders)"))
                current_disorder_cols = [row[1] for row in result.fetchall()]
                if 'patient_id' not in current_disorder_cols or 'version' not in current_disorder_cols:
                    logger.warning("CRITICAL: disorders table missing patient_id or version - adding now...")
                    try:
                        if 'patient_id' not in current_disorder_cols:
                            conn.execute(text("ALTER TABLE disorders ADD COLUMN patient_id INTEGER"))
                            conn.commit()
                        if 'version' not in current_disorder_cols:
                            conn.execute(text("ALTER TABLE disorders ADD COLUMN version INTEGER DEFAULT 1"))
                            conn.execute(text("UPDATE disorders SET version = 1 WHERE version IS NULL"))
                            conn.commit()
                        logger.info("Successfully added missing columns to disorders table")
                    except Exception as e:
                        logger.error(f"Failed to add missing columns: {e}", exc_info=True)
            
            # Check if sessions table needs block_id column
            if 'sessions' in tables:
                result = conn.execute(text("PRAGMA table_info(sessions)"))
                session_columns = [row[1] for row in result.fetchall()]
                if 'block_id' not in session_columns:
                    logger.info("Adding block_id column to sessions table")
                    try:
                        conn.execute(text("ALTER TABLE sessions ADD COLUMN block_id INTEGER"))
                        conn.commit()
                        logger.info("block_id column added successfully")
                    except Exception as e:
                        logger.warning(f"Could not add block_id to sessions: {e}")

                # NOTE: session_type is a valid column on the Session model
                # (see app/sessions/models.py). A previous migration removed it
                # by recreating the sessions table on every startup, while
                # _migrate_add_new_columns re-added it on the same startup. That
                # tear-down/rebuild loop ran on every launch and the table
                # restore step could silently drop all session rows, leaving the
                # patient but wiping its sessions. Do NOT remove session_type.

                # Remove status column if it exists
                if 'status' in session_columns:
                    logger.info("Removing status column from sessions table...")
                    try:
                        # SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
                        _remove_status_column(conn)
                        logger.info("status column removed successfully")
                    except Exception as e:
                        logger.warning(f"Could not remove status from sessions: {e}")

            # Add new columns that were added to models but may not be in database
            _migrate_add_new_columns(conn, tables)

            conn.commit()
            logger.info("Database migrations completed successfully")
            return True
            
    except Exception as e:
        logger.error(f"Migration failed: {e}", exc_info=True)
        return False

def _migrate_to_simplified_structure(conn, tables, patient_columns, disorder_columns, blocks_columns, protocol_columns):
    """Migrate from old structure (plans/checkpoints) to new structure (patient->blocks directly)"""
    
    # Step 1: Remove assessment table if it exists
    if 'assessments' in tables:
        logger.info("Removing assessments table...")
        try:
            conn.execute(text("DROP TABLE IF EXISTS assessments"))
            conn.commit()
            logger.info("Assessments table removed")
        except Exception as e:
            logger.warning(f"Could not remove assessments table: {e}")
    
    # Step 2: Backup existing data if needed
    blocks_data = []
    disorders_data = []
    patient_disorder_map = {}  # Map patient_id -> disorder_id
    
    try:
        # If we have the old structure, migrate data
        if 'checkpoints' in tables and 'plans' in tables and 'blocks' in tables:
            logger.info("Migrating data from old structure...")
            
            # Get blocks with their checkpoint_id (old structure)
            try:
                result = conn.execute(text("""
                    SELECT b.id, b.order_index, b.checkpoint_id, b.protocol_id, 
                           b.session_count, b.current_session, b.is_completed, 
                           b.completed_at, b.created_at, b.updated_at,
                           cp.disorder_id, cp.plan_id, p.patient_id
                    FROM blocks b
                    LEFT JOIN checkpoints cp ON b.checkpoint_id = cp.id
                    LEFT JOIN plans p ON cp.plan_id = p.id
                """))
                blocks_data = result.fetchall()
                
                # Map patients to their disorders
                for block_row in blocks_data:
                    if len(block_row) >= 13:
                        patient_id = block_row[12]  # p.patient_id
                        disorder_id = block_row[10]  # cp.disorder_id
                        if patient_id and disorder_id:
                            patient_disorder_map[patient_id] = disorder_id
                
                logger.info(f"Backed up {len(blocks_data)} blocks, {len(patient_disorder_map)} patient-disorder mappings")
            except Exception as e:
                logger.warning(f"Could not backup blocks data: {e}")
        
        # Step 2: Drop old tables (plans and checkpoints)
        logger.info("Dropping old tables (plans, checkpoints)...")
        conn.execute(text("DROP TABLE IF EXISTS blocks"))
        conn.execute(text("DROP TABLE IF EXISTS checkpoints"))
        conn.execute(text("DROP TABLE IF EXISTS plans"))
        conn.commit()
        
        # Step 3: Add disorder_id to patients if it doesn't exist
        if 'patients' in tables and 'disorder_id' not in patient_columns:
            logger.info("Adding disorder_id column to patients table")
            try:
                conn.execute(text("ALTER TABLE patients ADD COLUMN disorder_id INTEGER"))
                conn.commit()
                logger.info("disorder_id column added to patients")
            except Exception as e:
                logger.warning(f"Could not add disorder_id to patients: {e}")
            
            # Update patient disorder_ids from backup
            for patient_id, disorder_id in patient_disorder_map.items():
                try:
                    conn.execute(
                        text("UPDATE patients SET disorder_id = ? WHERE id = ?"),
                        (disorder_id, patient_id)
                    )
                except Exception as e:
                    logger.warning(f"Could not update patient {patient_id} with disorder {disorder_id}: {e}")
        
        # Step 4: Recreate blocks table with new structure (start_session/end_session)
        # Note: We'll use the new migration function to handle this properly
        # For now, just create an empty table - the _migrate_blocks_to_new_structure will handle data migration
        logger.info("Blocks table will be created/migrated by _migrate_blocks_to_new_structure function")
        
        # Step 6: Update disorders table to add patient_id and version (CRITICAL - always check and add if missing)
        if 'disorders' in tables:
            logger.info("Checking disorders table for patient_id and version columns...")
            try:
                # Force check columns again to be sure
                result = conn.execute(text("PRAGMA table_info(disorders)"))
                current_columns = [row[1] for row in result.fetchall()]
                logger.info(f"Current disorders columns: {current_columns}")
                
                needs_patient_id = 'patient_id' not in current_columns
                needs_version = 'version' not in current_columns
                
                if needs_patient_id or needs_version:
                    logger.info(f"Adding missing columns: patient_id={needs_patient_id}, version={needs_version}")
                    
                    # Backup existing disorders data
                    result = conn.execute(text("SELECT * FROM disorders"))
                    disorders_data = result.fetchall()
                    column_names = [desc[0] for desc in result.description] if result.description else []
                    logger.info(f"Backed up {len(disorders_data)} existing disorders")
                    
                    # Add missing columns
                    if needs_patient_id:
                        logger.info("Adding patient_id column to disorders...")
                        conn.execute(text("ALTER TABLE disorders ADD COLUMN patient_id INTEGER"))
                        conn.commit()
                    
                    if needs_version:
                        logger.info("Adding version column to disorders...")
                        conn.execute(text("ALTER TABLE disorders ADD COLUMN version INTEGER DEFAULT 1"))
                        conn.commit()
                    
                    # Migrate existing disorders: assign to patients who reference them
                    if needs_patient_id and disorders_data:
                        logger.info("Migrating existing disorders to assign patient_id...")
                        for disorder_row in disorders_data:
                            disorder_id = disorder_row[column_names.index('id')] if 'id' in column_names else disorder_row[0]
                            # Find patient that references this disorder
                            try:
                                result = conn.execute(
                                    text("SELECT id FROM patients WHERE disorder_id = ?"),
                                    (disorder_id,)
                                )
                                patient = result.fetchone()
                                if patient:
                                    conn.execute(
                                        text("UPDATE disorders SET patient_id = ? WHERE id = ?"),
                                        (patient[0], disorder_id)
                                    )
                                    logger.info(f"Assigned disorder {disorder_id} to patient {patient[0]}")
                            except Exception as e:
                                logger.warning(f"Could not assign patient to disorder {disorder_id}: {e}")
                    
                    if needs_version:
                        conn.execute(text("UPDATE disorders SET version = 1 WHERE version IS NULL"))
                    
                    conn.commit()
                    logger.info("Disorders table successfully updated with missing columns")
                else:
                    logger.info("Disorders table already has patient_id and version columns")
            except Exception as e:
                logger.error(f"ERROR: Could not update disorders table structure: {e}", exc_info=True)
                # Re-raise to ensure we know about the failure
                raise
        else:
            logger.info("Creating disorders table with patient_id and version...")
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS disorders (
                    id INTEGER PRIMARY KEY,
                    patient_id INTEGER NOT NULL,
                    version INTEGER NOT NULL DEFAULT 1,
                    disorder VARCHAR NOT NULL,
                    left_alpha_excess BOOLEAN DEFAULT 0,
                    frontal_beta_low BOOLEAN DEFAULT 0,
                    high_beta_high BOOLEAN DEFAULT 0,
                    paf_slow BOOLEAN DEFAULT 0,
                    coherence BOOLEAN DEFAULT 0,
                    qeeg_other VARCHAR,
                    isi BOOLEAN DEFAULT 0,
                    gad7 BOOLEAN DEFAULT 0,
                    phq BOOLEAN DEFAULT 0,
                    wm BOOLEAN DEFAULT 0,
                    executive_c BOOLEAN DEFAULT 0,
                    sustained_a BOOLEAN DEFAULT 0,
                    cognitive_other VARCHAR,
                    trauma BOOLEAN DEFAULT 0,
                    rumination BOOLEAN DEFAULT 0,
                    anxiety BOOLEAN DEFAULT 0,
                    observation_note TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (patient_id) REFERENCES patients (id)
                )
            """))
            conn.commit()
            logger.info("Disorders table created")
        
        # Step 7: Remove patient_id from protocol_library table if it exists
        if 'protocol_library' in tables and 'patient_id' in protocol_columns:
            logger.info("Removing patient_id column from protocol_library table...")
            try:
                # SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
                # Backup existing data
                result = conn.execute(text("SELECT * FROM protocol_library"))
                protocols_data = result.fetchall()
                column_names = [desc[0] for desc in result.description] if result.description else []
                
                if protocols_data:
                    logger.info(f"Backing up {len(protocols_data)} protocols...")
                
                # Create new table without patient_id
                conn.execute(text("DROP TABLE protocol_library"))
                conn.execute(text("""
                    CREATE TABLE protocol_library (
                        id INTEGER PRIMARY KEY,
                        name VARCHAR(200) NOT NULL,
                        note TEXT,
                        features TEXT NOT NULL,
                        is_default BOOLEAN DEFAULT 0,
                        is_active BOOLEAN DEFAULT 1,
                        user_id INTEGER NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME,
                        FOREIGN KEY (user_id) REFERENCES users (id)
                    )
                """))
                
                # Restore data (skip patient_id column)
                for row in protocols_data:
                    # Map old columns to new structure
                    row_dict = dict(zip(column_names, row))
                    protocol_id = row_dict.get('id')
                    name = row_dict.get('name')
                    note = row_dict.get('note')
                    features = row_dict.get('features')
                    is_default = row_dict.get('is_default', False)
                    is_active = row_dict.get('is_active', True)
                    user_id = row_dict.get('user_id')
                    created_at = row_dict.get('created_at')
                    updated_at = row_dict.get('updated_at')
                    
                    if protocol_id and name and features and user_id:
                        conn.execute(text("""
                            INSERT INTO protocol_library (
                                id, name, note, features, is_default, is_active, 
                                user_id, created_at, updated_at
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """), (
                            protocol_id, name, note, 
                            features if isinstance(features, str) else str(features),
                            is_default, is_active, user_id, created_at, updated_at
                        ))
                
                conn.commit()
                logger.info("Protocol library table updated - patient_id removed")
            except Exception as e:
                logger.warning(f"Could not update protocol_library table: {e}")
        
        logger.info("Migration to simplified structure completed")
        
    except Exception as e:
        logger.error(f"Migration error: {e}", exc_info=True)
        # Still commit what we can
        conn.commit()

def _migrate_blocks_to_new_structure(conn):
    """Migrate blocks table from old structure (order_index, session_count, etc.) to new structure (start_session, end_session)"""
    try:
        logger.info("Starting blocks table migration...")
        
        # Step 1: Backup existing blocks data
        blocks_data = []
        try:
            # First check what columns exist
            result = conn.execute(text("PRAGMA table_info(blocks)"))
            columns_info = result.fetchall()
            existing_columns = [col[1] for col in columns_info]
            
            # Build SELECT query based on available columns
            select_columns = ['id', 'patient_id']
            if 'protocol_id' in existing_columns:
                select_columns.append('protocol_id')
            else:
                select_columns.append('NULL as protocol_id')
            
            if 'order_index' in existing_columns:
                select_columns.append('order_index')
            else:
                select_columns.append('0 as order_index')
            
            if 'session_count' in existing_columns:
                select_columns.append('session_count')
            else:
                select_columns.append('6 as session_count')
            
            # Add other columns if they exist
            for col in ['current_session', 'checkpoint_session', 'is_completed', 'completed_at', 'created_at', 'updated_at']:
                if col in existing_columns:
                    select_columns.append(col)
                else:
                    select_columns.append(f'NULL as {col}')
            
            query = f"""
                SELECT {', '.join(select_columns)}
                FROM blocks
                ORDER BY patient_id, {'order_index' if 'order_index' in existing_columns else 'id'}
            """
            
            result = conn.execute(text(query))
            blocks_data = result.fetchall()
            logger.info(f"Backed up {len(blocks_data)} blocks")
        except Exception as e:
            logger.warning(f"Could not backup blocks data: {e}")
            # If table doesn't exist or has wrong structure, create empty list
            blocks_data = []
        
        # Step 2: Calculate start_session and end_session for each patient's blocks
        # Group blocks by patient_id and calculate session ranges
        patient_blocks = {}
        
        # Get column order from the query result
        column_order = ['id', 'patient_id', 'protocol_id', 'order_index', 'session_count', 
                       'current_session', 'checkpoint_session', 'is_completed', 
                       'completed_at', 'created_at', 'updated_at']
        
        for block_row in blocks_data:
            try:
                # Map row values to columns (handle variable column count)
                block_id = block_row[0] if len(block_row) > 0 else None
                patient_id = block_row[1] if len(block_row) > 1 else None
                protocol_id = block_row[2] if len(block_row) > 2 else None
                order_index = block_row[3] if len(block_row) > 3 and block_row[3] is not None else 0
                session_count = block_row[4] if len(block_row) > 4 and block_row[4] is not None else 6
                
                if not block_id or not patient_id:
                    logger.warning(f"Skipping block row with missing id or patient_id: {block_row}")
                    continue
                
                created_at = block_row[9] if len(block_row) > 9 else None
                updated_at = block_row[10] if len(block_row) > 10 else None
                
                if patient_id not in patient_blocks:
                    patient_blocks[patient_id] = []
                
                patient_blocks[patient_id].append({
                    'id': block_id,
                    'protocol_id': protocol_id,
                    'order_index': order_index,
                    'session_count': session_count,
                    'created_at': created_at,
                    'updated_at': updated_at
                })
            except Exception as e:
                logger.warning(f"Could not process block row: {e}, row: {block_row}")
        
        # Calculate start_session and end_session based on order
        for patient_id, blocks in patient_blocks.items():
            # Sort by order_index
            blocks.sort(key=lambda x: x['order_index'])
            current_session = 1  # Start from session 1
            
            for block in blocks:
                block['start_session'] = current_session
                block['end_session'] = current_session + block['session_count'] - 1
                current_session = block['end_session'] + 1
        
        # Step 3: Drop and recreate blocks table with new structure
        logger.info("Recreating blocks table with new structure...")
        conn.execute(text("DROP TABLE IF EXISTS blocks"))
        conn.execute(text("""
            CREATE TABLE blocks (
                id INTEGER PRIMARY KEY,
                patient_id INTEGER NOT NULL,
                protocol_id INTEGER,
                start_session INTEGER NOT NULL,
                end_session INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (patient_id) REFERENCES patients (id),
                FOREIGN KEY (protocol_id) REFERENCES protocol_library (id)
            )
        """))
        conn.commit()
        
        # Step 4: Restore blocks data with new structure
        if blocks_data:
            logger.info("Restoring blocks with new structure...")
            for patient_id, blocks in patient_blocks.items():
                for block in blocks:
                    try:
                        conn.execute(text("""
                            INSERT INTO blocks (
                                id, patient_id, protocol_id, start_session, end_session,
                                created_at, updated_at
                            ) VALUES (?, ?, ?, ?, ?, ?, ?)
                        """), (
                            block['id'], patient_id, block['protocol_id'],
                            block['start_session'], block['end_session'],
                            block['created_at'], block['updated_at']
                        ))
                    except Exception as e:
                        logger.warning(f"Could not restore block {block['id']}: {e}")
            
            conn.commit()
            logger.info(f"Successfully migrated {len(blocks_data)} blocks to new structure")
        else:
            logger.info("No blocks data to migrate - table recreated with new structure")
        
        logger.info("Blocks table migration completed successfully")
        
    except Exception as e:
        logger.error(f"Blocks migration error: {e}", exc_info=True)
        conn.commit()  # Commit what we can
        raise

def _migrate_checkpoints_table(conn, tables, old_checkpoints_columns):
    """Create or migrate checkpoints table to new structure (patient_id, user_id, session_value, checkpoint_type)"""
    try:
        logger.info("Starting checkpoints table migration...")
        
        # Step 1: Backup old checkpoints data if it exists (old structure)
        old_checkpoints_data = []
        if 'checkpoints' in tables and 'checkpoint_id' in old_checkpoints_columns:
            try:
                # Try to get old checkpoints data (if it has old structure)
                result = conn.execute(text("SELECT * FROM checkpoints"))
                old_checkpoints_data = result.fetchall()
                column_names = [desc[0] for desc in result.description] if result.description else []
                logger.info(f"Backed up {len(old_checkpoints_data)} old checkpoints (may need manual migration)")
            except Exception as e:
                logger.warning(f"Could not backup old checkpoints: {e}")
        
        # Step 2: Drop old checkpoints table if it exists
        if 'checkpoints' in tables:
            logger.info("Dropping old checkpoints table...")
            conn.execute(text("DROP TABLE IF EXISTS checkpoints"))
            conn.commit()
        
        # Step 3: Create new checkpoints table
        logger.info("Creating new checkpoints table...")
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS checkpoints (
                id INTEGER PRIMARY KEY,
                patient_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                session_value INTEGER NOT NULL,
                checkpoint_type VARCHAR NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (patient_id) REFERENCES patients (id),
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        """))
        conn.commit()
        
        # Step 4: Note about old data migration
        if old_checkpoints_data:
            logger.warning(f"Found {len(old_checkpoints_data)} old checkpoints that need manual migration")
            logger.warning("Old checkpoints data structure is different - please migrate manually if needed")
        
        logger.info("Checkpoints table migration completed successfully")
        
    except Exception as e:
        logger.error(f"Checkpoints migration error: {e}", exc_info=True)
        conn.commit()  # Commit what we can
        raise

def _remove_session_type_column(conn):
    """Remove session_type column from sessions table by recreating the table"""
    try:
        logger.info("Starting session_type column removal...")

        # Step 1: Check if sessions table exists and has session_type column
        table_exists = False
        session_type_exists = False

        # Check if sessions table exists
        result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'"))
        if result.fetchone():
            table_exists = True
            # Check if session_type column exists
            result = conn.execute(text("PRAGMA table_info(sessions)"))
            columns_info = result.fetchall()
            existing_columns = [row[1] for row in columns_info]  # Column names are in index 1
            session_type_exists = 'session_type' in existing_columns

        if not table_exists:
            logger.info("Sessions table does not exist - nothing to migrate")
            return

        if not session_type_exists:
            logger.info("session_type column does not exist - nothing to remove")
            return

        logger.info("session_type column found - starting migration...")

        # Step 2: Backup existing sessions data
        result = conn.execute(text("SELECT * FROM sessions"))
        sessions_data = result.fetchall()

        # Safely get column names
        try:
            column_names = [desc[0] for desc in result.cursor.description] if hasattr(result, 'cursor') and result.cursor else []
        except AttributeError:
            # Fallback for SQLAlchemy result objects
            if hasattr(result, 'keys') and hasattr(result.keys, 'names'):
                column_names = result.keys.names()
            else:
                # If we can't get column names, just get basic info
                logger.warning("Could not determine column names, continuing...")
                column_names = []

        logger.info(f"Backed up {len(sessions_data)} sessions")

        # Step 3: Create new table without session_type
        logger.info("Recreating sessions table without session_type column...")
        # Check if temp backup already exists and remove it
        result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='temp_sessions_backup'"))
        if result.fetchone():
            conn.execute(text("DROP TABLE temp_sessions_backup"))
        # First rename the current table to backup
        conn.execute(text("ALTER TABLE sessions RENAME TO temp_sessions_backup"))
        conn.commit()

        # Create new table without session_type
        conn.execute(text("""
            CREATE TABLE sessions (
                id INTEGER PRIMARY KEY,
                patient_id INTEGER NOT NULL,
                doctor_id INTEGER NOT NULL,
                block_id INTEGER,
                protocol_type VARCHAR(50) NOT NULL,
                start_time DATETIME NOT NULL,
                end_time DATETIME,
                duration_seconds INTEGER,
                channels TEXT NOT NULL,
                sample_rate INTEGER DEFAULT 250,
                session_rounds INTEGER DEFAULT 3,
                overall_success_rate FLOAT,
                total_reward_time_seconds INTEGER,
                total_artifact_time_seconds INTEGER,
                average_impedance FLOAT,
                baseline_data TEXT,
                thresholds TEXT,
                raw_data_file VARCHAR(500),
                processed_data_file VARCHAR(500),
                doctor_notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                synced BOOLEAN DEFAULT 0,
                sync_timestamp DATETIME,
                FOREIGN KEY (patient_id) REFERENCES patients (id),
                FOREIGN KEY (doctor_id) REFERENCES users (id),
                FOREIGN KEY (block_id) REFERENCES blocks (id)
            )
        """))
        conn.commit()

        # Step 4: Restore sessions data (excluding session_type)
        if sessions_data and column_names:
            logger.info("Restoring sessions data without session_type...")
            for row in sessions_data:
                # Map row values to column names
                row_dict = dict(zip(column_names, row))
                # Build insert statement excluding session_type
                insert_columns = [col for col in column_names if col != 'session_type']
                placeholders = ', '.join(['?' for _ in insert_columns])
                values = [row_dict[col] for col in insert_columns if col in row_dict]

                columns_str = ', '.join(insert_columns)
                conn.execute(text(f"""
                    INSERT INTO sessions ({columns_str})
                    VALUES ({placeholders})
                """), values)

            conn.commit()
            logger.info(f"Successfully migrated {len(sessions_data)} sessions without session_type column")
        else:
            logger.info("No sessions data to migrate - table recreated without session_type column")

        # Clean up the backup table
        conn.execute(text("DROP TABLE temp_sessions_backup"))
        conn.commit()

        logger.info("session_type column removal completed successfully")

    except Exception as e:
        logger.error(f"session_type removal error: {e}", exc_info=True)
        # If there's an error, try to clean up and continue
        try:
            # Check if backup table exists and try to restore
            result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='temp_sessions_backup'"))
            if result.fetchone():
                # Restore from backup
                conn.execute(text("DROP TABLE IF EXISTS sessions"))
                conn.execute(text("ALTER TABLE temp_sessions_backup RENAME TO sessions"))
                logger.info("Sessions table restored from backup")
        except:
            pass  # Ignore errors during cleanup
        raise

def _remove_status_column(conn):
    """Remove status column from sessions table by recreating the table"""
    try:
        logger.info("Starting status column removal...")

        # Step 1: Backup existing sessions data
        result = conn.execute(text("SELECT * FROM sessions"))
        sessions_data = result.fetchall()
        column_names = [desc[0] for desc in result.description] if result.description else []
        logger.info(f"Backed up {len(sessions_data)} sessions")

        # Step 2: Create new table without status
        logger.info("Recreating sessions table without status column...")
        conn.execute(text("DROP TABLE IF EXISTS sessions"))
        conn.execute(text("""
            CREATE TABLE sessions (
                id INTEGER PRIMARY KEY,
                patient_id INTEGER NOT NULL,
                doctor_id INTEGER NOT NULL,
                block_id INTEGER,
                protocol_type VARCHAR(50) NOT NULL,
                start_time DATETIME NOT NULL,
                end_time DATETIME,
                duration_seconds INTEGER,
                channels TEXT NOT NULL,
                sample_rate INTEGER DEFAULT 250,
                session_rounds INTEGER DEFAULT 3,
                overall_success_rate FLOAT,
                total_reward_time_seconds INTEGER,
                total_artifact_time_seconds INTEGER,
                average_impedance FLOAT,
                baseline_data TEXT,
                thresholds TEXT,
                raw_data_file VARCHAR(500),
                processed_data_file VARCHAR(500),
                doctor_notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                synced BOOLEAN DEFAULT 0,
                sync_timestamp DATETIME,
                FOREIGN KEY (patient_id) REFERENCES patients (id),
                FOREIGN KEY (doctor_id) REFERENCES users (id),
                FOREIGN KEY (block_id) REFERENCES blocks (id)
            )
        """))
        conn.commit()

        # Step 3: Restore sessions data (excluding status)
        if sessions_data:
            logger.info("Restoring sessions data without status...")
            for row in sessions_data:
                row_dict = dict(zip(column_names, row))
                # Build insert statement excluding status
                insert_columns = [col for col in column_names if col != 'status']
                placeholders = ', '.join(['?' for _ in insert_columns])
                values = [row_dict[col] for col in insert_columns]

                columns_str = ', '.join(insert_columns)
                conn.execute(text(f"""
                    INSERT INTO sessions ({columns_str})
                    VALUES ({placeholders})
                """), values)

            conn.commit()
            logger.info(f"Successfully migrated {len(sessions_data)} sessions without status column")
        else:
            logger.info("No sessions data to migrate - table recreated without status column")

        logger.info("status column removal completed successfully")

    except Exception as e:
        logger.error(f"status removal error: {e}", exc_info=True)
        conn.commit()  # Commit what we can
        raise


def _migrate_add_new_columns(conn, tables):
    """Add new columns that were added to models but may not be in database (phone_number in patients, feedback_type in sessions)"""
    logger.info("Checking for new columns to add to existing tables...")

    # Check if patients table exists and get its columns
    if 'patients' in tables:
        result = conn.execute(text("PRAGMA table_info(patients)"))
        patient_columns = [row[1] for row in result.fetchall()]

        # Add phone_number column if it doesn't exist
        if 'phone_number' not in patient_columns:
            logger.info("Adding phone_number column to patients table")
            try:
                conn.execute(text("ALTER TABLE patients ADD COLUMN phone_number VARCHAR(200)"))
                conn.commit()
                logger.info("phone_number column added to patients successfully")
            except Exception as e:
                logger.error(f"Could not add phone_number to patients: {e}")

    # Check if sessions table exists and get its columns
    if 'sessions' in tables:
        result = conn.execute(text("PRAGMA table_info(sessions)"))
        session_columns = [row[1] for row in result.fetchall()]

        # Add feedback_type column if it doesn't exist
        if 'feedback_type' not in session_columns:
            logger.info("Adding feedback_type column to sessions table")
            try:
                conn.execute(text("ALTER TABLE sessions ADD COLUMN feedback_type VARCHAR(50)"))
                conn.commit()
                logger.info("feedback_type column added to sessions successfully")
            except Exception as e:
                logger.error(f"Could not add feedback_type to sessions: {e}")

        # Add session_type column if it doesn't exist
        if 'session_type' not in session_columns:
            logger.info("Adding session_type column to sessions table")
            try:
                conn.execute(text("ALTER TABLE sessions ADD COLUMN session_type VARCHAR(50) NOT NULL DEFAULT 'training'"))
                conn.commit()
                logger.info("session_type column added to sessions successfully")
            except Exception as e:
                logger.error(f"Could not add session_type to sessions: {e}")

        # Add protocol_type column if it doesn't exist
        if 'protocol_type' not in session_columns:
            logger.info("Adding protocol_type column to sessions table")
            try:
                conn.execute(text("ALTER TABLE sessions ADD COLUMN protocol_type VARCHAR(50)"))
                conn.commit()
                logger.info("protocol_type column added to sessions successfully")
            except Exception as e:
                logger.error(f"Could not add protocol_type to sessions: {e}")

        # Add session_rounds column if it doesn't exist
        if 'session_rounds' not in session_columns:
            logger.info("Adding session_rounds column to sessions table")
            try:
                conn.execute(text("ALTER TABLE sessions ADD COLUMN session_rounds INTEGER DEFAULT 5"))
                conn.commit()
                logger.info("session_rounds column added to sessions successfully")
            except Exception as e:
                logger.error(f"Could not add session_rounds to sessions: {e}")

        # Add overall_success_rate column if it doesn't exist
        if 'overall_success_rate' not in session_columns:
            logger.info("Adding overall_success_rate column to sessions table")
            try:
                conn.execute(text("ALTER TABLE sessions ADD COLUMN overall_success_rate FLOAT"))
                conn.commit()
                logger.info("overall_success_rate column added to sessions successfully")
            except Exception as e:
                logger.error(f"Could not add overall_success_rate to sessions: {e}")

        # Add total_reward_time_seconds column if it doesn't exist
        if 'total_reward_time_seconds' not in session_columns:
            logger.info("Adding total_reward_time_seconds column to sessions table")
            try:
                conn.execute(text("ALTER TABLE sessions ADD COLUMN total_reward_time_seconds INTEGER"))
                conn.commit()
                logger.info("total_reward_time_seconds column added to sessions successfully")
            except Exception as e:
                logger.error(f"Could not add total_reward_time_seconds to sessions: {e}")

        # Add total_artifact_time_seconds column if it doesn't exist
        if 'total_artifact_time_seconds' not in session_columns:
            logger.info("Adding total_artifact_time_seconds column to sessions table")
            try:
                conn.execute(text("ALTER TABLE sessions ADD COLUMN total_artifact_time_seconds INTEGER"))
                conn.commit()
                logger.info("total_artifact_time_seconds column added to sessions successfully")
            except Exception as e:
                logger.error(f"Could not add total_artifact_time_seconds to sessions: {e}")

        # Add average_impedance column if it doesn't exist
        if 'average_impedance' not in session_columns:
            logger.info("Adding average_impedance column to sessions table")
            try:
                conn.execute(text("ALTER TABLE sessions ADD COLUMN average_impedance FLOAT"))
                conn.commit()
                logger.info("average_impedance column added to sessions successfully")
            except Exception as e:
                logger.error(f"Could not add average_impedance to sessions: {e}")

        # Add baseline_data column if it doesn't exist
        if 'baseline_data' not in session_columns:
            logger.info("Adding baseline_data column to sessions table")
            try:
                conn.execute(text("ALTER TABLE sessions ADD COLUMN baseline_data TEXT"))
                conn.commit()
                logger.info("baseline_data column added to sessions successfully")
            except Exception as e:
                logger.error(f"Could not add baseline_data to sessions: {e}")

        # Add thresholds column if it doesn't exist
        if 'thresholds' not in session_columns:
            logger.info("Adding thresholds column to sessions table")
            try:
                conn.execute(text("ALTER TABLE sessions ADD COLUMN thresholds TEXT"))
                conn.commit()
                logger.info("thresholds column added to sessions successfully")
            except Exception as e:
                logger.error(f"Could not add thresholds to sessions: {e}")

        # Add doctor_notes column if it doesn't exist
        if 'doctor_notes' not in session_columns:
            logger.info("Adding doctor_notes column to sessions table")
            try:
                conn.execute(text("ALTER TABLE sessions ADD COLUMN doctor_notes TEXT"))
                conn.commit()
                logger.info("doctor_notes column added to sessions successfully")
            except Exception as e:
                logger.error(f"Could not add doctor_notes to sessions: {e}")

    # Check if disorders table needs new QEEG columns
    if 'disorders' in tables:
        result = conn.execute(text("PRAGMA table_info(disorders)"))
        disorder_columns = [row[1] for row in result.fetchall()]

        if 'high_tbr' not in disorder_columns:
            logger.info("Adding high_tbr column to disorders table")
            try:
                conn.execute(text("ALTER TABLE disorders ADD COLUMN high_tbr BOOLEAN DEFAULT 0"))
                conn.commit()
                logger.info("high_tbr column added to disorders successfully")
            except Exception as e:
                logger.error(f"Could not add high_tbr to disorders: {e}")

    logger.info("New columns migration completed")


def _update_run_database_migrations():
    """Updated main migration function to call the new columns migration"""
    # This would replace the original run_database_migrations function
    pass
