#!/usr/bin/env python3
"""
Demo script showing the complete protocol library workflow:
1. Login user
2. List patients
3. Choose patient
4. Initialize protocol library
5. Select a default protocol
"""

import requests
import json
import sys
import asyncio
import websockets
import time

# Configuration
BASE_URL = "http://localhost:8000"

def login_user():
    """Login and get authentication token"""
    print("🔐 Step 1: Logging in...")

    demo = input("demo mode?(y or n)").strip()
    if demo == "y":
        username = "testuser"
        password = "testpassword123"
    else:
        username = input("Enter username: ").strip()
        password = input("Enter password: ").strip()
    
    login_data = {
        "username": username,
        "password": password
    }
    
    try:
        response = requests.post(f"{BASE_URL}/users/login", json=login_data)
        if response.status_code == 200:
            data = response.json()
            if data.get("success"):
                token = data.get("token")
                user = data.get("user")
                user_id = data.get("user").get("id")
                print(f"✅ Login successful!")
                print(f"   Welcome, {user.get('first_name')} {user.get('last_name')}")
                print(f"   User ID: {user.get('id')}")
                return token, user_id
            else:
                print(f"❌ Login failed: {data.get('message')}")
                return None, None
        else:
            print(f"❌ Login request failed: {response.status_code}")
            return None, None
    except Exception as e:
        print(f"❌ Login error: {e}")
        return None, None

def new_patient(token, user_id):
    """Create a new patient for the current user"""
    print("\n👥 Step 2: Creating new patient...")
    
    headers = {"Authorization": f"Bearer {token}"}
    # Get patient details from user
    first_name = input("Enter patient first name: ").strip()
    last_name = input("Enter patient last name: ").strip()
    
    # Get date of birth
    while True:
        dob_str = input("Enter patient date of birth (YYYY-MM-DD): ").strip()
        try:
            from datetime import datetime
            date_of_birth = datetime.strptime(dob_str, "%Y-%m-%d").date()
            break
        except ValueError:
            print("❌ Invalid date format. Please use YYYY-MM-DD")
    
    # Optional fields
    phone_number = input("Enter patient phone number (optional, press Enter to skip): ").strip()
    if not phone_number:
        phone_number = None
    
    # Gender (optional)
    gender_input = input("Enter patient gender (m/f, optional, press Enter to skip): ").strip().lower()
    gender = None
    if gender_input in ['m', 'male']:
        gender = True
    elif gender_input in ['f', 'female']:
        gender = False
    
    patient_data = {
        "first_name": first_name,
        "last_name": last_name,
        "date_of_birth": dob_str,
        "phone_number": phone_number,
        "gender": gender,
        "doctor_id":user_id
    }
    
    try:
        response = requests.post(f"{BASE_URL}/patients/", headers=headers, json=patient_data)
        if response.status_code == 200:
            patient = response.json()
            print(f"✅ Created patient: {patient.get('first_name')} {patient.get('last_name')} (ID: {patient.get('id')})")
            return patient
        else:
            print(f"❌ Failed to create patient: {response.status_code}")
            print(f"   Response: {response.text}")
            return None
    except Exception as e:
        print(f"❌ Error creating patient: {e}")
        return None

def list_patients(token, user_id):
    """List all patients for the current user"""
    print("\n👥 Step 2: Listing patients...")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        response = requests.get(f"{BASE_URL}/patients/by-doctor/{user_id}", headers=headers)
        if response.status_code == 200:
            patients = response.json()
            if patients:
                print(f"✅ Found {len(patients)} patients:")
                for i, patient in enumerate(patients, 1):
                    print(f"   {i}. {patient.get('first_name')} {patient.get('last_name')} (ID: {patient.get('id')})")
                return patients
            else:
                print("ℹ️  No patients found")
                return []
        else:
            print(f"❌ Failed to get patients: {response.status_code}")
            return []
    except Exception as e:
        print(f"❌ Error getting patients: {e}")
        return []

def choose_patient(patients):
    """Let user choose a patient"""
    print("\n🎯 Step 3: Choosing patient...")
    
    if not patients:
        print("❌ No patients available")
        return None
    
    while True:
        try:
            choice = input(f"Enter patient number (1-{len(patients)}): ").strip()
            index = int(choice) - 1
            if 0 <= index < len(patients):
                patient = patients[index]
                print(f"✅ Selected: {patient.get('first_name')} {patient.get('last_name')} (ID: {patient.get('id')})")
                return patient
            else:
                print(f"❌ Please enter a number between 1 and {len(patients)}")
        except ValueError:
            print("❌ Please enter a valid number")

def initialize_protocol_library(token, patient_id):
    """Initialize default protocols for the selected patient"""
    print(f"\n📚 Step 4: Initializing protocol library for patient {patient_id}...")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        response = requests.post(f"{BASE_URL}/protocols/patient/{patient_id}/initialize-defaults", headers=headers)
        if response.status_code == 200:
            data = response.json()
            protocols_created = data.get("protocols_created", 0)
            print(f"✅ Protocol library initialized!")
            print(f"   Created {protocols_created} default protocols")
            return True
        else:
            print(f"❌ Failed to initialize protocols: {response.status_code}")
            if response.status_code == 404:
                print("   Patient not found or doesn't belong to you")
            return False
    except Exception as e:
        print(f"❌ Error initializing protocols: {e}")
        return False

def list_protocols(token, patient_id):
    """List all protocols for the selected patient"""
    print(f"\n📋 Step 5: Listing protocols for patient {patient_id}...")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        response = requests.get(f"{BASE_URL}/protocols/patient/{patient_id}", headers=headers)
        if response.status_code == 200:
            protocols = response.json()
            if protocols:
                print(f"✅ Found {len(protocols)} protocols:")
                for i, protocol in enumerate(protocols, 1):
                    is_default = "🔒" if protocol.get('is_default') else "🔓"
                    print(f"   {i}. {is_default} {protocol.get('name')} (ID: {protocol.get('id')})")
                    print(f"      Note: {protocol.get('note', 'No description')}")
                return protocols
            else:
                print("ℹ️  No protocols found")
                return []
        else:
            print(f"❌ Failed to get protocols: {response.status_code}")
            return []
    except Exception as e:
        print(f"❌ Error getting protocols: {e}")
        return []

def choose_protocol(protocols):
    """Let user choose a protocol"""
    print("\n🎯 Step 6: Choosing protocol...")
    
    if not protocols:
        print("❌ No protocols available")
        return None
    
    while True:
        try:
            choice = input(f"Enter protocol number (1-{len(protocols)}): ").strip()
            index = int(choice) - 1
            if 0 <= index < len(protocols):
                protocol = protocols[index]
                print(f"✅ Selected: {protocol.get('name')} (ID: {protocol.get('id')})")
                return protocol
            else:
                print(f"❌ Please enter a number between 1 and {len(protocols)}")
        except ValueError:
            print("❌ Please enter a valid number")

def show_protocol_details(protocol):
    """Show detailed information about the selected protocol"""
    print(f"\n📊 Protocol Details:")
    print(f"   Name: {protocol.get('name')}")
    print(f"   Note: {protocol.get('note', 'No description')}")
    print(f"   Type: {'Default Protocol' if protocol.get('is_default') else 'Custom Protocol'}")
    print(f"   Created: {protocol.get('created_at')}")
    
    features = protocol.get('features', {})
    if features:
        print(f"\n🔧 Protocol Features:")
        
        # Frequency bands
        freq_bands = features.get('frequency_bands')
        if freq_bands:
            print(f"   Frequency Bands:")
            for band, range_val in freq_bands.items():
                print(f"     - {band}: {range_val[0]}-{range_val[1]} Hz")
        
        # Channels
        channels = features.get('channels')
        if channels:
            print(f"   Channels: {', '.join(channels)}")
        
        # Other parameters
        threshold_type = features.get('threshold_type')
        if threshold_type:
            print(f"   Threshold Type: {threshold_type}")
        
        threshold_value = features.get('threshold_value')
        if threshold_value:
            print(f"   Threshold Value: {threshold_value}")
        
        feedback_type = features.get('feedback_type')
        if feedback_type:
            print(f"   Feedback Type: {feedback_type}")
        
        session_duration = features.get('session_duration')
        if session_duration:
            print(f"   Session Duration: {session_duration} minutes")
        
        # Show frequency bands (new protocol structure)
        frequency_bands = features.get('frequency_bands', [])
        if frequency_bands:
            print(f"\n📊 Frequency Bands:")
            for idx, band in enumerate(frequency_bands):
                print(f"   Band {idx + 1}:")
                print(f"     Frequency: {band.get('frequency')} Hz")
                print(f"     Range: {band.get('frequency_range', [])} Hz")
                print(f"     Channels: {', '.join(band.get('channels', []))}")
                print(f"     Type: {band.get('type', 'reward')}")
        
        # Show NF-core compatible features (legacy format if exists)
        nf_features = features.get('features')
        if nf_features:
            print(f"\n🧠 NF-Core Features:")
            print(f"   Features: {', '.join(nf_features)}")
            
            feature_modes = features.get('feature_modes', {})
            if feature_modes:
                print(f"   Feature Modes:")
                for feature, mode in feature_modes.items():
                    print(f"     - {feature}: {mode}")
            
            feature_weights = features.get('feature_weights', {})
            if feature_weights:
                print(f"   Feature Weights:")
                for feature, weight in feature_weights.items():
                    print(f"     - {feature}: {weight}")
            
            combination_method = features.get('combination_method')
            if combination_method:
                print(f"   Combination Method: {combination_method}")
            
            mapping = features.get('mapping')
            if mapping:
                print(f"   Mapping: {mapping}")

def convert_old_protocol_to_nfcore(protocol):
    """Convert old protocol format to NF-core compatible format"""
    features = protocol.get('features', {})
    
    # Check if this is an old protocol format
    if 'features' not in features or not features.get('features'):
        # This is an old protocol, convert it
        print(f"   Converting old protocol format to NF-core compatible...")
        
        # Extract frequency bands and convert to feature names
        freq_bands = features.get('frequency_bands', {})
        nf_features = []
        feature_modes = {}
        feature_weights = {}
        
        for band_name, freq_range in freq_bands.items():
            if band_name == 'alpha':
                nf_features.append('alpha')
                feature_modes['alpha'] = 'enhance'
                feature_weights['alpha'] = 1.0
            elif band_name == 'beta':
                nf_features.append('beta')
                feature_modes['beta'] = 'inhibit'
                feature_weights['beta'] = 0.5
            elif band_name == 'theta':
                nf_features.append('theta')
                feature_modes['theta'] = 'enhance'
                feature_weights['theta'] = 1.0
            elif band_name == 'smr':
                nf_features.append('smr')
                feature_modes['smr'] = 'enhance'
                feature_weights['smr'] = 1.0
            elif band_name == 'delta':
                nf_features.append('delta')
                feature_modes['delta'] = 'inhibit'
                feature_weights['delta'] = 0.5
            elif band_name == 'gamma':
                nf_features.append('gamma')
                feature_modes['gamma'] = 'inhibit'
                feature_weights['gamma'] = 0.5
        
        # If no features were found, default to alpha
        if not nf_features:
            nf_features = ['alpha']
            feature_modes = {'alpha': 'enhance'}
            feature_weights = {'alpha': 1.0}
        
        # Build NF-core compatible features
        nfcore_features = {
            "features": nf_features,
            "feature_modes": feature_modes,
            "feature_weights": feature_weights,
            "combination_method": "weighted_average",
            "mapping": "sigmoid",
            "session_duration": features.get('session_duration', 30),
            "session_type": "training",
            "protocol_type": protocol.get('name', 'default'),
            "session_rounds": 5,
            "channels": features.get('channels', ['F3', 'F4']),
            "reference_channels": features.get('reference_channels', ['A1', 'A2']),
            "threshold_type": features.get('threshold_type', 'percentile'),
            "threshold_value": features.get('threshold_value', 70.0),
            "feedback_type": features.get('feedback_type', 'visual')
        }
        
        return nfcore_features
    
    # Already in NF-core format
    return features

async def start_nfcore_session(protocol):
    """Start NF-core session with the selected protocol"""
    print(f"\n🧠 Step 7: Starting NF-core session with {protocol.get('name')}...")
    
    # Convert protocol to NF-core compatible format
    nfcore_features = convert_old_protocol_to_nfcore(protocol)
    
    # Build start command for NF-core
    start_command = {
        "start": True,
        "session_duration": nfcore_features.get('session_duration', 20),
        "features": nfcore_features.get('features', ['alpha']),
        "feature_modes": nfcore_features.get('feature_modes', {}),
        "feature_weights": nfcore_features.get('feature_weights', {}),
        "combination_method": nfcore_features.get('combination_method', 'weighted_average'),
        "mapping": nfcore_features.get('mapping', 'sigmoid'),
        "session_type": nfcore_features.get('session_type', 'training'),
        "protocol_type": nfcore_features.get('protocol_type', 'default'),
        "session_rounds": nfcore_features.get('session_rounds', 5),
        "custom_bands": {}  # Use default bands from config
    }
    
    print(f"   Session Duration: {start_command['session_duration']} seconds")
    print(f"   Number of Rounds: {start_command['session_rounds']}")
    print(f"   Round Duration: {start_command['session_duration'] / start_command['session_rounds']:.1f} seconds")
    print(f"   Features: {', '.join(start_command['features'])}")
    print(f"   Protocol Type: {start_command['protocol_type']}")
    print(f"   Mapping: {start_command['mapping']}")
    
    # WebSocket URL
    ws_url = "ws://localhost:8000/sp/nfcore_start"
    
    try:
        print(f"\n🔌 Connecting to NF-core WebSocket...")
        # Connect with explicit proxy settings to avoid SOCKS issues
        async with websockets.connect(
            ws_url,
            ping_interval=20,
            ping_timeout=10,
            close_timeout=10,
            # Disable proxy to avoid SOCKS issues
            proxy=None
        ) as websocket:
            print(f"✅ Connected to NF-core!")
            
            # Send start command
            print(f"📤 Sending start command...")
            await websocket.send(json.dumps(start_command))
            
            # Process responses
            print(f"🎯 Starting neurofeedback session...")
            print(f"   Press Ctrl+C to stop the session early")
            print(f"   Session will run for {start_command['session_duration']} seconds")
            print(f"\n📊 Real-time feedback:")
            print(f"   {'Time':<8} {'Type':<12} {'Feedback':<10} {'Features':<20}")
            print(f"   {'-'*8} {'-'*12} {'-'*10} {'-'*20}")
            
            session_start_time = time.time()
            feedback_count = 0
            
            async for message in websocket:
                try:
                    data = json.loads(message)
                    message_type = data.get('type', 'unknown')
                    current_time = int(time.time() - session_start_time)
                    
                    if message_type == 'welcome':
                        print(f"   {current_time:<8} {'Welcome':<12} {'':<10} {data.get('message', '')}")
                    
                    elif message_type == 'echo':
                        print(f"   {current_time:<8} {'Echo':<12} {'':<10} {data.get('message', '')}")
                    
                    elif message_type == 'feedback':
                        feedback_count += 1
                        feedback_val = data.get('feedback', 0.0)
                        selected_features = data.get('selected_features', [])
                        
                        # Show feedback every 5th update to avoid spam
                        if feedback_count % 5 == 0:
                            features_str = ', '.join(selected_features[:2])  # Show first 2 features
                            if len(selected_features) > 2:
                                features_str += "..."
                            print(f"   {current_time:<8} {'Feedback':<12} {feedback_val:<10.3f} {features_str:<20}")
                        
                        # Show baseline status occasionally
                        baseline_status = data.get('baseline_status', {})
                        if feedback_count % 20 == 0 and baseline_status:
                            all_ready = data.get('baseline_overall', {}).get('all_ready', False)
                            status = "Ready" if all_ready else "Collecting"
                            print(f"   {current_time:<8} {'Baseline':<12} {'':<10} {status}")
                    
                    elif message_type == 'session_update':
                        session_info = data.get('session_info', {})
                        patient_name = session_info.get('patientName', 'Unknown')
                        protocol_type = session_info.get('protocolType', 'Unknown')
                        print(f"   {current_time:<8} {'Session':<12} {'':<10} {patient_name} - {protocol_type}")
                    
                    elif message_type == 'round_complete':
                        round_num = data.get('round_number', 0)
                        total_rounds = data.get('total_rounds', 1)
                        print(f"   {current_time:<8} {'Round Complete':<12} {'':<10} Round {round_num}/{total_rounds} finished!")
                        print(f"   {current_time:<8} {'Waiting':<12} {'':<10} Press Enter to resume next round...")
                        
                        # Wait for user input to resume
                        try:
                            input()  # Wait for user to press Enter
                            # Send resume message
                            resume_msg = {"type": "resume"}
                            await websocket.send(json.dumps(resume_msg))
                            print(f"   {current_time:<8} {'Resume':<12} {'':<10} Resuming next round...")
                        except KeyboardInterrupt:
                            print(f"   {current_time:<8} {'Stopping':<12} {'':<10} Session stopped by user")
                            break
                    
                    elif message_type == 'round_start':
                        round_num = data.get('round_number', 0)
                        total_rounds = data.get('total_rounds', 1)
                        print(f"   {current_time:<8} {'Round Start':<12} {'':<10} Starting round {round_num}/{total_rounds}")
                    
                    elif message_type == 'complete':
                        total_rounds = data.get('total_rounds', 1)
                        print(f"   {current_time:<8} {'Complete':<12} {'':<10} All {total_rounds} rounds finished!")
                        break
                    
                    elif message_type == 'error':
                        error_msg = data.get('message', 'Unknown error')
                        print(f"   {current_time:<8} {'Error':<12} {'':<10} {error_msg}")
                        break
                
                except json.JSONDecodeError as e:
                    print(f"   {current_time:<8} {'Error':<12} {'':<10} JSON decode error: {e}")
                except Exception as e:
                    print(f"   {current_time:<8} {'Error':<12} {'':<10} {e}")
            
            print(f"\n✅ NF-core session completed!")
            print(f"   Total feedback updates: {feedback_count}")
            print(f"   Session duration: {int(time.time() - session_start_time)} seconds")
            
    except ConnectionRefusedError:
        print(f"❌ Failed to connect to NF-core WebSocket")
        print(f"   Make sure the server is running on {ws_url}")
        print(f"   Start the server with: python -m uvicorn app.core.main:app --reload")
        return False
    except OSError as e:
        if "SOCKS" in str(e) or "proxy" in str(e).lower():
            print(f"❌ Network proxy issue detected")
            print(f"   Error: {e}")
            print(f"   Try running with: export http_proxy= && export https_proxy= && python demo_protocol_workflow.py")
            print(f"   Or check your network proxy settings")
        else:
            print(f"❌ Network error: {e}")
        return False
    except Exception as e:
        print(f"❌ Error during NF-core session: {e}")
        print(f"   Error type: {type(e).__name__}")
        return False
    
    return True

def ask_start_nfcore(protocol):
    """Ask user if they want to start NF-core session"""
    print(f"\n🚀 Step 7: NF-core Integration")
    print(f"   Selected Protocol: {protocol.get('name')}")
    print(f"   This protocol is now ready to use with NF-core!")
    
    while True:
        choice = input(f"\nDo you want to start a live NF-core session with this protocol? (y/n): ").strip().lower()
        if choice in ['y', 'yes']:
            return True
        elif choice in ['n', 'no']:
            return False
        else:
            print("❌ Please enter 'y' for yes or 'n' for no")

def create_default_plan(token, patient):
    """Create a default plan for the patient"""
    print("\n📋 Creating default plan...")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Create default plan with minimal data
    plan_data = {
        "patient_id": patient.get('id')
    }
    
    try:
        response = requests.post(f"{BASE_URL}/planning/plans/default", headers=headers, json=plan_data)
        if response.status_code == 200:
            plan = response.json()
            print(f"✅ Created default plan (ID: {plan.get('id')})")
            return plan
        else:
            print(f"❌ Failed to create default plan: {response.status_code}")
            print(f"   Response: {response.text}")
            return None
    except Exception as e:
        print(f"❌ Error creating default plan: {e}")
        return None

def get_patient_plan(token, patient):
    """Get the plan for the patient (each patient has one plan)"""
    print(f"\n📋 Getting plan for {patient.get('first_name')} {patient.get('last_name')}...")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        response = requests.get(f"{BASE_URL}/planning/plans/patient/{patient.get('id')}", headers=headers)
        if response.status_code == 200:
            plans = response.json()
            if plans:
                plan = plans[0]  # Each patient has only one plan
                print(f"✅ Found plan (ID: {plan.get('id')})")
                return plan
            else:
                print("ℹ️  No plan found")
                return None
        else:
            print(f"❌ Failed to get plan: {response.status_code}")
            return None
    except Exception as e:
        print(f"❌ Error getting plan: {e}")
        return None

def create_default_checkpoint(token, plan, order_index):
    """Create a default checkpoint for the plan"""
    print(f"\n🎯 Creating default checkpoint {order_index}...")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    checkpoint_data = {
        "order_index": order_index,
        "plan_id": plan.get('id')
    }
    
    try:
        response = requests.post(f"{BASE_URL}/planning/checkpoints/default", headers=headers, json=checkpoint_data)
        if response.status_code == 200:
            checkpoint = response.json()
            print(f"✅ Created default checkpoint {order_index} (ID: {checkpoint.get('id')})")
            return checkpoint
        else:
            print(f"❌ Failed to create checkpoint: {response.status_code}")
            print(f"   Response: {response.text}")
            return None
    except Exception as e:
        print(f"❌ Error creating checkpoint: {e}")
        return None

def create_default_block(token, checkpoint, order_index, session_count=6):
    """Create a default block for the checkpoint"""
    print(f"\n📦 Creating default block {order_index}...")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    block_data = {
        "order_index": order_index,
        "session_count": session_count,
        "checkpoint_id": checkpoint.get('id')
    }
    
    try:
        response = requests.post(f"{BASE_URL}/planning/blocks/default", headers=headers, json=block_data)
        if response.status_code == 200:
            block = response.json()
            print(f"✅ Created default block {order_index} (ID: {block.get('id')})")
            print(f"   Sessions: {block.get('current_session')}/{block.get('session_count')}")
            return block
        else:
            print(f"❌ Failed to create block: {response.status_code}")
            print(f"   Response: {response.text}")
            return None
    except Exception as e:
        print(f"❌ Error creating block: {e}")
        return None

def list_checkpoints_and_blocks(token, plan):
    """List all checkpoints and blocks for a plan"""
    print(f"\n📋 Listing checkpoints and blocks for plan (ID: {plan.get('id')})...")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        response = requests.get(f"{BASE_URL}/planning/plans/{plan.get('id')}", headers=headers)
        if response.status_code == 200:
            plan_details = response.json()
            checkpoints = plan_details.get('checkpoints', [])
            
            if checkpoints:
                print(f"✅ Found {len(checkpoints)} checkpoints:")
                for checkpoint in checkpoints:
                    print(f"\n   🎯 Checkpoint {checkpoint.get('order_index')} (ID: {checkpoint.get('id')})")
                    print(f"      Status: {'✅ Completed' if checkpoint.get('is_completed') else '⏳ Active'}")
                    
                    blocks = checkpoint.get('blocks', [])
                    if blocks:
                        print(f"      📦 Blocks ({len(blocks)}):")
                        for block in blocks:
                            print(f"         • Block {block.get('order_index')} (ID: {block.get('id')})")
                            print(f"           Sessions: {block.get('current_session')}/{block.get('session_count')}")
                            print(f"           Status: {'✅ Completed' if block.get('is_completed') else '⏳ Active'}")
                    else:
                        print(f"      📦 No blocks found")
            else:
                print("ℹ️  No checkpoints found")
        else:
            print(f"❌ Failed to get plan details: {response.status_code}")
    except Exception as e:
        print(f"❌ Error getting plan details: {e}")

def get_current_block(token, patient):
    """Get the current active block for a patient"""
    print(f"\n📍 Getting current block for {patient.get('first_name')} {patient.get('last_name')}...")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        response = requests.get(f"{BASE_URL}/planning/blocks/current/patient/{patient.get('id')}", headers=headers)
        if response.status_code == 200:
            block = response.json()
            print(f"✅ Current block (ID: {block.get('id')})")
            print(f"   Sessions: {block.get('current_session')}/{block.get('session_count')}")
            print(f"   Status: {'✅ Completed' if block.get('is_completed') else '⏳ Active'}")
            return block
        elif response.status_code == 404:
            print("ℹ️  No active block found for this patient")
            return None
        else:
            print(f"❌ Failed to get current block: {response.status_code}")
            return None
    except Exception as e:
        print(f"❌ Error getting current block: {e}")
        return None

def create_disorder(token):
    """Create a disorder with just the name (simplified workflow)"""
    print(f"\n🏥 Creating Disorder Assessment")
    print("=" * 40)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Get disorder name only
    disorder_name = input("Enter disorder name (e.g., ADHD, Anxiety, Depression): ").strip()
    if not disorder_name:
        disorder_name = "General Disorder"
    
    print(f"✅ Creating disorder: {disorder_name}")
    print("ℹ️  All other fields will be set to false (can be updated later)")
    
    # Create disorder with just the name, everything else defaults to false
    disorder_data = {
        "disorder": disorder_name,
        "left_alpha_excess": False,
        "frontal_beta_low": False,
        "high_beta_high": False,
        "paf_slow": False,
        "coherence": False,
        "qeeg_other": None,
        "isi": False,
        "gad7": False,
        "phq": False,
        "wm": False,
        "executive_c": False,
        "sustained_a": False,
        "cognitive_other": None,
        "trauma": False,
        "rumination": False,
        "anxiety": False,
        "observation_note": None
    }
    
    try:
        response = requests.post(f"{BASE_URL}/planning/disorders/", headers=headers, json=disorder_data)
        if response.status_code == 200:
            disorder = response.json()
            print(f"✅ Created disorder: {disorder.get('disorder')} (ID: {disorder.get('id')})")
            return disorder
        else:
            print(f"❌ Failed to create disorder: {response.status_code}")
            print(f"   Response: {response.text}")
            return None
    except Exception as e:
        print(f"❌ Error creating disorder: {e}")
        return None

def assign_protocol_to_block(token, block, patient_id, user_id):
    """Assign a protocol to a block"""
    print(f"\n🔧 Assigning Protocol to Block {block.get('order_index')}")
    print("=" * 50)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # First try to assign default protocol
    print("🔄 Assigning default protocol...")
    try:
        response = requests.post(
            f"{BASE_URL}/planning/blocks/{block.get('id')}/assign-default-protocol",
            headers=headers,
            json={"patient_id": patient_id, "user_id": user_id}
        )
        if response.status_code == 200:
            updated_block = response.json()
            protocol_id = updated_block.get('protocol_id')
            if protocol_id:
                print(f"✅ Assigned default protocol (ID: {protocol_id})")
                return updated_block
            else:
                print("ℹ️  No default protocol available")
        else:
            print(f"❌ Failed to assign default protocol: {response.status_code}")
    except Exception as e:
        print(f"❌ Error assigning default protocol: {e}")
    
    # If no default protocol, let user choose
    print("\n📋 Available protocols:")
    try:
        response = requests.get(f"{BASE_URL}/protocols/patient/{patient_id}", headers=headers)
        if response.status_code == 200:
            protocols = response.json()
            if protocols:
                print(f"Found {len(protocols)} protocols:")
                for i, protocol in enumerate(protocols, 1):
                    is_default = "🔒" if protocol.get('is_default') else "🔓"
                    print(f"   {i}. {is_default} {protocol.get('name')} (ID: {protocol.get('id')})")
                
                while True:
                    try:
                        choice = input(f"Enter protocol number (1-{len(protocols)}): ").strip()
                        index = int(choice) - 1
                        if 0 <= index < len(protocols):
                            selected_protocol = protocols[index]
                            break
                        else:
                            print(f"❌ Please enter a number between 1 and {len(protocols)}")
                    except ValueError:
                        print("❌ Please enter a valid number")
                
                # Assign selected protocol
                try:
                    response = requests.post(
                        f"{BASE_URL}/planning/blocks/{block.get('id')}/assign-protocol",
                        headers=headers,
                        json={"protocol_id": selected_protocol.get('id')}
                    )
                    if response.status_code == 200:
                        updated_block = response.json()
                        print(f"✅ Assigned protocol: {selected_protocol.get('name')} (ID: {selected_protocol.get('id')})")
                        return updated_block
                    else:
                        print(f"❌ Failed to assign protocol: {response.status_code}")
                        return block
                except Exception as e:
                    print(f"❌ Error assigning protocol: {e}")
                    return block
            else:
                print("ℹ️  No protocols available")
                return block
        else:
            print(f"❌ Failed to get protocols: {response.status_code}")
            return block
    except Exception as e:
        print(f"❌ Error getting protocols: {e}")
        return block

def simplified_workflow(token, patient, user_id):
    """Simplified workflow: Create disorder → Choose protocol → Start session"""
    print(f"\n🚀 Simplified Workflow for {patient.get('first_name')} {patient.get('last_name')}")
    print("=" * 60)
    
    # Step 1: Create disorder (just name)
    disorder = create_disorder(token)
    if not disorder:
        print("❌ Failed to create disorder")
        return
    
    # Step 2: Choose protocol
    print(f"\n🔧 Step 2: Choose Protocol")
    print("=" * 30)
    
    headers = {"Authorization": f"Bearer {token}"}
    try:
        response = requests.get(f"{BASE_URL}/protocols/patient/{patient.get('id')}", headers=headers)
        if response.status_code == 200:
            protocols = response.json()
            if protocols:
                print(f"Available protocols for {patient.get('first_name')}:")
                for i, protocol in enumerate(protocols, 1):
                    is_default = "🔒" if protocol.get('is_default') else "🔓"
                    print(f"   {i}. {is_default} {protocol.get('name')} (ID: {protocol.get('id')})")
                
                while True:
                    try:
                        choice = input(f"Enter protocol number (1-{len(protocols)}): ").strip()
                        index = int(choice) - 1
                        if 0 <= index < len(protocols):
                            selected_protocol = protocols[index]
                            print(f"✅ Selected protocol: {selected_protocol.get('name')}")
                            break
                        else:
                            print(f"❌ Please enter a number between 1 and {len(protocols)}")
                    except ValueError:
                        print("❌ Please enter a valid number")
            else:
                print("ℹ️  No protocols available, using default")
                selected_protocol = None
        else:
            print(f"❌ Failed to get protocols: {response.status_code}")
            selected_protocol = None
    except Exception as e:
        print(f"❌ Error getting protocols: {e}")
        selected_protocol = None
    
    # Step 3: Start session (optional)
    if selected_protocol:
        print(f"\n🎯 Step 3: Start Session")
        print("=" * 25)
        print(f"Selected Protocol: {selected_protocol.get('name')}")
        print(f"Disorder: {disorder.get('disorder')}")
        
        while True:
            choice = input(f"\nDo you want to start a session with this protocol? (y/n): ").strip().lower()
            if choice in ['y', 'yes']:
                print(f"🚀 Starting session with {selected_protocol.get('name')}...")
                # Here you could call the NF-core session function
                print(f"✅ Session would start here (NF-core integration)")
                break
            elif choice in ['n', 'no']:
                print(f"ℹ️  Session skipped")
                break
            else:
                print("❌ Please enter 'y' for yes or 'n' for no")
    
    print(f"\n🎉 Simplified workflow completed!")
    print(f"   Disorder: {disorder.get('disorder')}")
    print(f"   Protocol: {selected_protocol.get('name') if selected_protocol else 'None'}")
    print(f"   Ready for session!")

def main():
    """Main workflow"""
    print("🚀 Protocol Library Demo Workflow")
    print("=" * 50)
    
    # Step 1: Login
    token, user_id = login_user()
    if not token:
        print("❌ Cannot proceed without authentication")
        sys.exit(1)
    
    # Step 2: List patients
    patients = list_patients(token, user_id)
    if not patients:
        print("❌ Cannot proceed without patients, please create a patient first")
        added_patient = new_patient(token, user_id)
        patients = list_patients(token, user_id)
        if not patients:
            print("❌ Failed to create patient or list patients")
            sys.exit(1)
    
    
    # Step 3: Choose patient
    patient = choose_patient(patients)
    if not patient:
        print("❌ No patient selected")
        sys.exit(1)
    
    patient_id = patient.get('id')
    
    # Step 4: Initialize protocol library
    if not initialize_protocol_library(token, patient_id):
        print("❌ Failed to initialize protocol library")
        sys.exit(1)
    
    # Step 5: List protocols
    protocols = list_protocols(token, patient_id)
    if not protocols:
        print("❌ No protocols available")
        sys.exit(1)
    
    # Step 6: Choose protocol
    selected_protocol = choose_protocol(protocols)
    if not selected_protocol:
        print("❌ No protocol selected")
        sys.exit(1)
    
    # Step 7: Show protocol details
    show_protocol_details(selected_protocol)
    
    # Step 8: Ask if user wants to start NF-core session
    if ask_start_nfcore(selected_protocol):
        try:
            # Run the async NF-core session
            asyncio.run(start_nfcore_session(selected_protocol))
        except KeyboardInterrupt:
            print(f"\n\n⏹️  NF-core session stopped by user")
        except Exception as e:
            print(f"\n❌ Error running NF-core session: {e}")
    
    # Step 9: Simplified workflow: disorder → protocol → session
    print(f"\n📋 Step 9: Simplified workflow...")
    simplified_workflow(token, patient, user_id)
    
    print(f"\n🎉 Workflow completed successfully!")
    print(f"   Patient: {patient.get('first_name')} {patient.get('last_name')}")
    print(f"   Protocol: {selected_protocol.get('name')}")
    print(f"   Protocol ID: {selected_protocol.get('id')}")
    print(f"\n💡 You can now use this protocol for neurofeedback sessions!")
    print(f"   The protocol is stored in the database and ready for future use.")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n👋 Demo cancelled by user")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        sys.exit(1)
