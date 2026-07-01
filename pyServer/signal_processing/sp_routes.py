import time
import os
import csv
import numpy as np
import logging
import asyncio
from collections import deque
from datetime import datetime, timezone
from weakref import WeakSet

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, FileResponse
from app.protocols import crud as protocol_crud
from app.protocols.utils import protocol_to_signal_processing_format
from app.patients.crud import PatientCRUD
_patient_crud = PatientCRUD()

from signal_processing.device_acquisition import DeviceAcquisition, find_serial_port
from signal_processing.config import cfg
from signal_processing.preprocessing import PlotterAlignedFilterChain
from signal_processing.features import compute_features
from signal_processing.feedback import sigmoid_map, linear_map
from signal_processing.artifact import amplitude_threshold_epochs, eye_blink_detection, emg_detection

VISUALIZATION_SCALE = 1e6  # Convert volts to microvolts for plotting
VISUALIZATION_Y_LIMITS = (-150.0, 150.0)

LOGGER_NAME = "pyserver.api"
logger = logging.getLogger(LOGGER_NAME)


def _eeg_recordings_dir() -> str:
    """
    Return a writable directory for filtered-EEG recordings, alongside the
    app database (user-data dir on packaged builds, pyServer/ in dev).
    """
    try:
        from app.core.database import get_database_path
        base = os.path.dirname(get_database_path())
    except Exception:
        base = os.getcwd()
    rec_dir = os.path.join(base, "eeg_recordings")
    os.makedirs(rec_dir, exist_ok=True)
    return rec_dir


def _open_filtered_eeg_csv(patient_id, channel_indices):
    """
    Open a CSV that records the EEG signal both RAW (pre-filter) and AFTER the
    notch + bandpass filter chain, for the channels the protocol actually uses
    (values in µV). channel_indices are 0-based; columns are labelled with the
    1-based channel number. Returns (file_handle, csv_writer, path) or
    (None, None, None) if it could not be created. One row per sample.
    """
    try:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        pid = patient_id if patient_id is not None else "unknown"
        path = os.path.join(_eeg_recordings_dir(), f"eeg_filtered_p{pid}_{ts}.csv")
        f = open(path, "w", newline="", encoding="utf-8")
        writer = csv.writer(f)
        header = ["timestamp", "sample_index", "session_time_s", "round", "phase"]
        for idx in channel_indices:
            header += [f"channel_{idx + 1}_raw_uv", f"channel_{idx + 1}_filtered_uv"]
        writer.writerow(header)
        f.flush()
        logger.info(
            "Recording raw + filtered (post notch+bandpass) EEG for channels %s to %s",
            [idx + 1 for idx in channel_indices], path,
        )
        return f, writer, path
    except Exception as e:
        logger.error("Could not open EEG recording CSV, recording disabled: %s", e)
        return None, None, None

router = APIRouter(prefix="/sp", tags=["Signal Processing"])

active_connections = WeakSet()


@router.get("/device/status")
async def device_status() -> JSONResponse:
    """Return current device status."""
    try:
        available_ports = find_serial_port()
        if available_ports:
            return JSONResponse({
                "status": "available",
                "using_mock": False,
                "ports": available_ports,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
        else:
            return JSONResponse({
                "status": "unavailable",
                "using_mock": False,
                "message": "No serial ports found",
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
    except Exception as e:
        logger.error(f"Error in device_status endpoint: {e}")
        return JSONResponse({
            "status": "error",
            "message": str(e),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }, status_code=500)


@router.websocket("/nfcore_start")
async def nfcore(websocket: WebSocket) -> None:
    """WebSocket endpoint for real-time neurofeedback signal processing"""
    acq = None
    eeg_csv_file = None
    try:
        await websocket.accept()
        active_connections.add(websocket)
        logger.info("WebSocket connected")

        await websocket.send_json({
            "type": "welcome",
            "time": datetime.now(timezone.utc).isoformat(),
            "message": "WebSocket ready for streaming",
        })

        start_command = await websocket.receive_json()
        logger.debug("server received start_command: %s", start_command)

        await websocket.send_json({
            "type": "echo",
            "time": datetime.now(timezone.utc).isoformat(),
            "message": f"Start command received {start_command}"
        })

        if start_command.get("start"):
            # Get session parameters
            total_session_duration = float(start_command.get("session_duration", 1500.0))
            session_rounds = int(start_command.get("session_rounds", 5))
            total_session_duration = max(10.0, min(3600.0, total_session_duration))

            # TEMPORARY TESTING: Change round duration to 30 seconds instead of default 300 seconds (5 minutes)
            # Revert this change to default behavior after testing
            round_duration = 30.0  # 30 seconds for testing
            logger.info(f"Total session duration: {total_session_duration} seconds")
            logger.info(f"Number of rounds: {session_rounds}")
            logger.info(f"Round duration: {round_duration} seconds (TEMPORARY TESTING VALUE)")

            # Load protocol if specified
            protocol_id = start_command.get("protocol_id")
            if protocol_id:
                from app.core.database import SessionLocal
                db = SessionLocal()
                try:
                    user_id = start_command.get("user_id")
                    if not user_id:
                        await websocket.send_json({
                            "type": "error",
                            "message": "user_id required when using protocol_id",
                            "time": datetime.now(timezone.utc).isoformat()
                        })
                        return

                    protocol = protocol_crud.get_protocol(db, protocol_id, user_id)
                    if not protocol:
                        await websocket.send_json({
                            "type": "error",
                            "message": f"Protocol {protocol_id} not found",
                            "time": datetime.now(timezone.utc).isoformat()
                        })
                        return

                    sp_config = protocol_to_signal_processing_format(protocol)
                    selected_features = sp_config["selected_features"]
                    feature_modes = sp_config["feature_modes"]
                    feature_weights = sp_config["feature_weights"]
                    combination_method = sp_config["combination_method"]
                    bands = sp_config["bands"]
                    logger.info(f"Using protocol {protocol_id}: {protocol.name}")
                    logger.info(f"Protocol bands: {bands}")
                except Exception as e:
                    logger.error(f"Error loading or converting protocol: {e}")
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Protocol error: {str(e)}",
                        "time": datetime.now(timezone.utc).isoformat()
                    })
                    return
                finally:
                    db.close()
            else:
                # Use legacy format
                selected_features = start_command.get("features", ["alpha"])
                feature_modes = start_command.get("feature_modes", {})
                feature_weights = start_command.get("feature_weights", {})
                combination_method = start_command.get("combination_method", "weighted_average")
                user_bands = start_command.get("custom_bands", {})
                bands = {**cfg.bands, **user_bands}

            # Resolve patient name from DB
            patient_name = "Unknown"
            patient_id = start_command.get("patientId")
            if patient_id:
                from app.core.database import SessionLocal
                patient_db = SessionLocal()
                try:
                    patient_obj = _patient_crud.get(patient_db, int(patient_id))
                    if patient_obj:
                        patient_name = f"{patient_obj.first_name} {patient_obj.last_name}"
                except Exception as e:
                    logger.warning(f"Could not resolve patient name: {e}")
                finally:
                    patient_db.close()

            # Validate features
            valid_features = []
            for feature in selected_features:
                # Check if feature is in bands dict (could be regular band or ratio)
                if feature in bands:
                    valid_features.append(feature)
                else:
                    logger.warning(f"Feature '{feature}' not found in available bands, skipping")

            if not valid_features:
                await websocket.send_json({
                    "type": "error",
                    "message": "No valid features selected",
                    "time": datetime.now(timezone.utc).isoformat()
                })
                return

            selected_features = valid_features
            logger.info(f"Selected features: {selected_features}")
            logger.info(f"Available bands: {list(bands.keys())}")

            # Compute which channel indices are explicitly referenced by the protocol bands.
            # If no band specifies a channel, all DSP runs on whatever channels are acquired;
            # in that case we default to showing just CH1 (index 0) since the typical
            # single-electrode placement only produces signal there.
            _active_indices: set = set()
            for _band_cfg in bands.values():
                if isinstance(_band_cfg, tuple) and len(_band_cfg) == 3:
                    _active_indices.add(int(_band_cfg[2]))
                elif isinstance(_band_cfg, dict):
                    for _key in ("channel_indices", "numerator_channel_index", "denominator_channel_index"):
                        _val = _band_cfg.get(_key)
                        if isinstance(_val, list):
                            _active_indices.update(int(x) for x in _val)
                        elif isinstance(_val, int):
                            _active_indices.add(_val)
            active_channel_count = len(_active_indices) if _active_indices else 1

            # Initialize device and send start command
            # Try to use real device first, fall back to simulated if it fails
            use_simulated = False
            try:
                acq = DeviceAcquisition(target_channels=3, fs=cfg.fs, verbose=True)
                device_channels = acq.target_channels
                fs = acq.fs

                # Send start command to device
                if hasattr(acq, 'send_command'):
                    acq.send_command("Contl_STRT_AQU")
                    logger.info("Sent start acquisition command to device")
                
                # Test if device is actually sending data (wait up to 2 seconds)
                logger.info("Testing device data acquisition...")
                test_block = acq.read_samples(10, timeout=2.0)
                if test_block is None or test_block.size == 0:
                    logger.warning("Device not sending data, falling back to simulated acquisition")
                    use_simulated = True
                    acq.stop()
                    acq = None
            except Exception as e:
                logger.warning(f"Failed to initialize device: {e}. Falling back to simulated acquisition")
                use_simulated = True
                acq = None
            
            # Use simulated acquisition if device failed
            if use_simulated or acq is None:
                from signal_processing.acquisition import SimulatedAcquisition
                logger.info("Using SimulatedAcquisition for testing/demo")
                acq = SimulatedAcquisition(fs=cfg.fs, channels=3)
                device_channels = 3
                fs = cfg.fs

            # Setup processing parameters
            epoch_seconds = 1.0  # 1 second processing window
            overlap = 0.0        # No overlap - process every 1 second
            epoch_samples = int(epoch_seconds * fs)
            step_samples = max(1, int(epoch_samples * (1.0 - overlap)))

            # Filtering chain aligned with realtime_plotter_mac.py (HP -> LP -> Notch)
            filter_chain = PlotterAlignedFilterChain(fs=fs)

            buffer = np.zeros((0, device_channels), dtype=np.float64)

            # Record the filtered EEG signal (post notch+bandpass) to a CSV on disk,
            # but only for the channels the protocol actually works on (defaults to
            # CH1 when no band names a channel — the typical single-electrode case).
            eeg_csv_channel_indices = sorted(_active_indices) if _active_indices else [0]
            eeg_csv_channel_indices = [i for i in eeg_csv_channel_indices if 0 <= i < device_channels]
            if not eeg_csv_channel_indices:
                eeg_csv_channel_indices = [0]
            eeg_csv_file, eeg_csv_writer, eeg_csv_path = _open_filtered_eeg_csv(
                patient_id, eeg_csv_channel_indices
            )
            eeg_sample_index = 0

            # Session variables
            logger.info("Starting device-backed neurofeedback loop with rounds")
            session_start_time = time.time()
            last_session_update = session_start_time
            last_feedback_send = session_start_time  # Track last feedback send time
            last_eeg_send = session_start_time  # Track last EEG data send time
            last_message_check = session_start_time  # Track last message check time
            message_check_interval = 0.5  # Check for messages every 0.5 seconds
            feedback_interval = 1.0  # Send feedback every 1 second
            eeg_update_interval = 0.1  # Send EEG data every 0.1 seconds (10 Hz update rate)
            current_round = 1
            round_start_time = session_start_time

            round_duration = total_session_duration / session_rounds  # Duration of each round in seconds
            # Fixed baseline duration: 30 seconds for all rounds
            baseline_collection_duration = 30.0
            baseline_history_len = max(1, int(cfg.fs * baseline_collection_duration * 2))

            # Threshold smoothing parameters
            threshold_smoothing_alpha = 0.1  # EMA alpha for threshold display smoothing (lower = smoother)
            threshold_update_interval = 5.0  # Only update displayed threshold every N seconds
            last_threshold_update_time = time.time()

            def build_round_state():
                return {
                    "baseline_buffers": {
                        feature: deque(maxlen=baseline_history_len)
                        for feature in selected_features
                    },
                    "feature_thresholds": {},
                    "smoothed_thresholds": {},  # Smoothed thresholds for display
                    "baseline_locked": False,
                }

            round_state = build_round_state()

            # Session-level success accumulator (survives round resets)
            session_epoch_history: list[float] = []  # one entry per epoch: 1 if all features won, else 0

            # Flag to track if we're waiting for resume command
            waiting_for_resume = False

            # Main session loop
            while current_round <= session_rounds:
                if websocket.client_state == websocket.client_state.DISCONNECTED:
                    logger.warning("WebSocket disconnected, breaking loop")
                    break

                current_time = time.time()
                round_elapsed = current_time - round_start_time

                # If we're waiting for resume, skip all processing until resume is received
                if waiting_for_resume:
                    await asyncio.sleep(0.01)  # Small delay to prevent busy waiting
                    continue

                if round_elapsed >= round_duration:
                    # Round completed
                    logger.info(f"Round {current_round} completed after {round_elapsed:.1f} seconds")
                    await websocket.send_json({
                        "type": "round_complete",
                        "message": f"Round #{current_round} done",
                        "round_number": current_round,
                        "total_rounds": session_rounds,
                        "round_duration": round_elapsed,
                        "raw_data_file": eeg_csv_path,
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    })

                    if current_round >= session_rounds:
                        # All rounds done, wait for resume
                        logger.info("All rounds completed. Waiting for resume to finalize session...")
                        waiting_for_resume = True  # Set flag to stop processing
                        resume_received = False

                        while not resume_received:
                            try:
                                message = await asyncio.wait_for(websocket.receive_json(), timeout=300.0)

                                if message.get("type") == "resume":
                                    logger.info("Resume message received - finalizing session")
                                    resume_received = True
                                elif message.get("type") == "stop":
                                    logger.info("Stop message received, ending session")
                                    # Send stop command to device
                                    if hasattr(acq, 'send_command'):
                                        acq.send_command("Contl_STOP_AQU")
                                        logger.info("Sent stop acquisition command to device")
                                    return
                                else:
                                    logger.warning(f"Unexpected message type: {message.get('type')}")

                            except asyncio.TimeoutError:
                                logger.warning("Timeout waiting for resume message, finalizing session")
                                resume_received = True
                            except Exception as e:
                                logger.error(f"Error waiting for resume message: {e}")
                                resume_received = True

                        waiting_for_resume = False  # Reset flag to resume processing
                        break
                    else:
                        # More rounds, wait for resume
                        logger.info(f"Waiting for resume message to start round {current_round + 1}...")
                        waiting_for_resume = True  # Set flag to stop processing
                        resume_received = False

                        while not resume_received:
                            try:
                                message = await asyncio.wait_for(websocket.receive_json(), timeout=300.0)

                                if message.get("type") == "resume":
                                    logger.info(f"Resume message received for round {current_round + 1}")
                                    resume_received = True
                                elif message.get("type") == "stop":
                                    logger.info("Stop message received, ending session")
                                    # Send stop command to device
                                    if hasattr(acq, 'send_command'):
                                        acq.send_command("Contl_STOP_AQU")
                                        logger.info("Sent stop acquisition command to device")
                                    return
                                else:
                                    logger.warning(f"Unexpected message type: {message.get('type')}")

                            except asyncio.TimeoutError:
                                logger.warning("Timeout waiting for resume message, continuing to next round")
                                resume_received = True
                            except Exception as e:
                                logger.error(f"Error waiting for resume message: {e}")
                                break

                        waiting_for_resume = False  # Reset flag to resume processing
                        current_round += 1
                        round_start_time = time.time()
                        round_state = build_round_state()
                        logger.info(f"Starting round {current_round}")

                        await websocket.send_json({
                            "type": "round_start",
                            "message": f"Starting round {current_round}",
                            "round_number": current_round,
                            "total_rounds": session_rounds,
                            "timestamp": datetime.now(timezone.utc).isoformat()
                        })
                else:
                    # Normal processing for current round
                    # Check for incoming commands periodically (non-blocking)
                    if current_time - last_message_check >= message_check_interval:
                        last_message_check = current_time
                        try:
                            # Use a very short timeout to check for messages without blocking
                            message = await asyncio.wait_for(websocket.receive_json(), timeout=0.001)
                            if message.get("type") == "update_feedback_interval":
                                new_interval = message.get("interval")
                                if new_interval is not None and isinstance(new_interval, (int, float)) and 0.1 <= new_interval <= 10.0:
                                    feedback_interval = float(new_interval)
                                    logger.info(f"Feedback interval updated to {feedback_interval} seconds")
                                    await websocket.send_json({
                                        "type": "feedback_interval_updated",
                                        "interval": feedback_interval,
                                        "timestamp": datetime.now(timezone.utc).isoformat()
                                    })
                                else:
                                    logger.warning(f"Invalid feedback interval value: {new_interval}. Must be between 0.1 and 10.0 seconds.")
                            elif message.get("type") == "stop":
                                logger.info("Stop message received, ending session")
                                if hasattr(acq, 'send_command'):
                                    acq.send_command("Contl_STOP_AQU")
                                    logger.info("Sent stop acquisition command to device")
                                return
                        except asyncio.TimeoutError:
                            # No message available, continue with normal processing
                            pass
                        except Exception as e:
                            logger.debug(f"Error checking for messages (non-critical): {e}")
                    
                    # Get data from device
                    block = acq.read_samples(step_samples, timeout=10.0)

                    if block is None or block.size == 0:
                        # Log periodically to avoid spam (every 100 iterations = ~1 second)
                        no_data_count = getattr(acq, '_no_data_count', 0)
                        acq._no_data_count = no_data_count + 1
                        if no_data_count % 100 == 0:
                            logger.warning(f"No data received from device (attempt {no_data_count}). Device may not be connected or sending data.")
                        await asyncio.sleep(0.001)
                        continue
                    
                    # Reset no-data counter on successful read
                    if hasattr(acq, '_no_data_count'):
                        acq._no_data_count = 0

                    # Process buffer
                    buffer = np.vstack([buffer, block])
                    if buffer.shape[0] > epoch_samples:
                        buffer = buffer[-epoch_samples:, :]

                    if buffer.shape[0] < epoch_samples:
                        continue

                    # Apply the same filter chain as realtime_plotter_mac.py (no CAR, HP->LP->Notch)
                    x_clean = filter_chain.process(buffer)

                    # Prepare visualization data scaled to microvolts for frontend plots
                    num_channels_to_send = min(3, x_clean.shape[1])
                    samples_to_send = min(200, x_clean.shape[0])
                    x_clean_visual = x_clean * VISUALIZATION_SCALE
                    if samples_to_send > 0 and num_channels_to_send > 0:
                        eeg_visualization_block = x_clean_visual[-samples_to_send:, :num_channels_to_send]
                    else:
                        eeg_visualization_block = np.zeros((0, num_channels_to_send))
                    eeg_visualization_data = eeg_visualization_block.tolist()

                    # Send EEG visualization data unconditionally so the plot always
                    # updates even when an artifact epoch is about to be gated out.
                    current_time = time.time()
                    if current_time - last_eeg_send >= eeg_update_interval:
                        eeg_payload = {
                            "type": "eeg_data",
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "eeg_data": {
                                "channels": eeg_visualization_data,
                                "channel_names": ["Channel 1", "Channel 2", "Channel 3"],
                                "active_channel_count": active_channel_count,
                                "sampling_rate": int(fs),
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                                "plot_limits": {
                                    "min": VISUALIZATION_Y_LIMITS[0],
                                    "max": VISUALIZATION_Y_LIMITS[1]
                                },
                                "signal_stats": {
                                    "mean_values": [float(np.nanmean(x_clean_visual[:, ch_idx])) if x_clean_visual.shape[0] > 0 else 0.0 for ch_idx in range(min(x_clean_visual.shape[1], 3))],
                                    "std_values": [float(np.nanstd(x_clean_visual[:, ch_idx])) if x_clean_visual.shape[0] > 0 else 0.0 for ch_idx in range(min(x_clean_visual.shape[1], 3))],
                                    "min_values": [float(np.nanmin(x_clean_visual[:, ch_idx])) if x_clean_visual.shape[0] > 0 else 0.0 for ch_idx in range(min(x_clean_visual.shape[1], 3))],
                                    "max_values": [float(np.nanmax(x_clean_visual[:, ch_idx])) if x_clean_visual.shape[0] > 0 else 0.0 for ch_idx in range(min(x_clean_visual.shape[1], 3))]
                                }
                            }
                        }
                        try:
                            await websocket.send_json(eeg_payload)
                            last_eeg_send = current_time
                        except Exception as e:
                            logger.error(f"Failed to send EEG data: {e}")

                    # Artifact check — notify the user but never skip an epoch.
                    # Artifacts are informational only; blocking epochs would stall baseline.
                    if cfg.ARTIFACT_CHECK:
                        x_uv = x_clean * VISUALIZATION_SCALE
                        x_raw_uv = buffer * VISUALIZATION_SCALE

                        artifact_result = None

                        if not np.all(amplitude_threshold_epochs(x_uv, threshold_uv=500_000.0)):
                            artifact_result = {"type": "amplitude", "message": "High amplitude artifact detected"}

                        if artifact_result is None:
                            blink = eye_blink_detection(x_uv, fs, threshold_uv=60.0)
                            if blink["detected"]:
                                artifact_result = blink

                        if artifact_result is None:
                            emg = emg_detection(x_raw_uv, fs, emg_low=40.0, ratio_threshold=0.35)
                            if emg["detected"]:
                                artifact_result = emg

                        if artifact_result is not None:
                            try:
                                await websocket.send_json({
                                    "type": "artifact",
                                    "artifact_type": artifact_result["type"],
                                    "message": artifact_result["message"],
                                    "timestamp": datetime.now(timezone.utc).isoformat()
                                })
                            except Exception as e:
                                logger.error(f"Failed to send artifact alert: {e}")

                    # Extract features
                    # Scale signal to microvolts before computing features
                    # Features are computed as amplitude (µV) not power (µV²) - this is standard for NF apps
                    # The compute_features function returns sqrt(power) by default to get amplitude
                    features = compute_features(x_clean * VISUALIZATION_SCALE, fs, bands, return_amplitude=True)

                    # Process each feature (band powers only)
                    feature_values = {}
                    z_scores = {}
                    baseline_status = {}

                    for feature_name in selected_features:
                        if feature_name in features:
                            feature_val = features[feature_name]
                            feature_mean = float(np.nanmean(np.atleast_1d(feature_val)))
                            feature_values[feature_name] = feature_mean
                            if not round_state["baseline_locked"]:
                                round_state["baseline_buffers"][feature_name].append(feature_mean)
                        else:
                            feature_values[feature_name] = 0.0

                    # Lock baseline and derive static thresholds once each round
                    if (not round_state["baseline_locked"]
                            and round_elapsed >= baseline_collection_duration):
                        thresholds = {}
                        reward_threshold_pct = start_command.get("reward_threshold_percentage", 20.0) / 100.0
                        inhibit_threshold_pct = start_command.get("inhibit_threshold_percentage", 20.0) / 100.0

                        for feature_name in selected_features:
                            buf = round_state["baseline_buffers"][feature_name]
                            if len(buf) > 0:
                                baseline_mean = float(np.mean(buf))

                                mode = feature_modes.get(feature_name, "enhance")

                                if mode == "inhibit":
                                    thresholds[feature_name] = baseline_mean * (1 - inhibit_threshold_pct)
                                else:  # enhance mode
                                    thresholds[feature_name] = baseline_mean * (1 + reward_threshold_pct)
                            else:
                                thresholds[feature_name] = float(feature_values.get(feature_name, 0.0))
                        round_state["feature_thresholds"] = thresholds
                        # Initialize smoothed thresholds to the same values
                        round_state["smoothed_thresholds"] = thresholds.copy()
                        round_state["baseline_locked"] = True
                        logger.info(
                            "Baseline locked after %.1f seconds for round %s (reward=%.0f%%, inhibit=%.0f%%)",
                            round_elapsed,
                            current_round,
                            reward_threshold_pct * 100,
                            inhibit_threshold_pct * 100,
                        )

                    baseline_progress = min(1.0, round_elapsed / baseline_collection_duration) if baseline_collection_duration > 0 else 1.0
                    for feature_name in selected_features:
                        buf = round_state["baseline_buffers"][feature_name]
                        threshold = round_state["feature_thresholds"].get(feature_name)
                        baseline_status[feature_name] = {
                            "is_ready": round_state["baseline_locked"] and threshold is not None,
                            "progress": baseline_progress,
                            "samples_collected": len(buf),
                            "baseline_locked": round_state["baseline_locked"],
                        }
                        if threshold is not None and threshold != 0.0:
                            value = feature_values.get(feature_name, 0.0)
                            z_scores[feature_name] = float((value - threshold) / abs(threshold))
                        else:
                            z_scores[feature_name] = 0.0

                    all_baselines_ready = bool(round_state["baseline_locked"] and round_state["feature_thresholds"])
                    min_baseline_progress = baseline_progress
                    total_samples_collected = int(
                        sum(len(buf) for buf in round_state["baseline_buffers"].values())
                    )

                    training_phase = "training" if round_state["baseline_locked"] else "baseline"
                    training_phase_message = (
                        "Training in progress" if round_state["baseline_locked"] else "Taking baseline"
                    )

                    # Persist the EEG signal both raw (pre-filter) and filtered
                    # (post notch+bandpass), in µV. buffer is the raw epoch fed into
                    # the filter chain; x_clean is its filtered output — same shape,
                    # aligned sample-by-sample. overlap=0 so each epoch is a fresh,
                    # non-overlapping block: the recording is continuous, no duplicates.
                    if eeg_csv_writer is not None:
                        try:
                            raw_uv = buffer * VISUALIZATION_SCALE
                            x_clean_uv = x_clean * VISUALIZATION_SCALE
                            row_ts = datetime.now(timezone.utc).isoformat()
                            epoch_session_time = time.time() - session_start_time
                            for s in range(x_clean_uv.shape[0]):
                                channel_cols = []
                                for ch in eeg_csv_channel_indices:
                                    channel_cols.append(round(float(raw_uv[s, ch]), 4))
                                    channel_cols.append(round(float(x_clean_uv[s, ch]), 4))
                                eeg_csv_writer.writerow([
                                    row_ts,
                                    eeg_sample_index,
                                    round(epoch_session_time + s / fs, 4),
                                    current_round,
                                    training_phase,
                                    *channel_cols,
                                ])
                                eeg_sample_index += 1
                            eeg_csv_file.flush()
                        except Exception as e:
                            logger.error("Failed writing EEG row: %s", e)

                    # Combine features
                    if len(feature_values) == 1:
                        combined_value = list(feature_values.values())[0]
                    else:
                        if combination_method == "weighted_average":
                            weights = []
                            values = []
                            for feat, val in feature_values.items():
                                weight = feature_weights.get(feat, 1.0)
                                weights.append(weight)
                                values.append(val)
                            combined_value = np.average(values, weights=weights)
                        elif combination_method == "product":
                            combined_value = np.prod(list(feature_values.values()))
                        elif combination_method == "max":
                            combined_value = np.max(list(feature_values.values()))
                        elif combination_method == "min":
                            combined_value = np.min(list(feature_values.values()))
                        else:
                            combined_value = np.mean(list(feature_values.values()))

                    mapping_type = start_command.get("mapping", "fixed_threshold")

                    # Overall success rate = % of epochs where every feature won simultaneously
                    overall_success_rate = float(np.mean(session_epoch_history)) if session_epoch_history else 0.0

                    # Calculate feedback using static thresholds collected during baseline
                    if not round_state["baseline_locked"]:
                        feedback_val = 0.0
                    else:
                        feature_successes = []
                        feature_binaries = []
                        for feature_name in selected_features:
                            threshold = round_state["feature_thresholds"].get(feature_name)
                            value = feature_values.get(feature_name)
                            if threshold is None or value is None:
                                continue

                            mode = feature_modes.get(feature_name, "enhance")

                            if mapping_type == "sigmoid":
                                z = z_scores.get(feature_name, 0.0)
                                if mode == "inhibit":
                                    z = -z
                                success = sigmoid_map(z, gain=5.0, shift=0.0, clip=(0.0, 1.0))

                            elif mapping_type == "linear":
                                z = z_scores.get(feature_name, 0.0)
                                if mode == "inhibit":
                                    z = -z
                                success = linear_map(z, a=0.5, b=0.5, clip=(0.0, 1.0))

                            else:  # fixed_threshold
                                if mode == "enhance":
                                    success = 1.0 if value >= threshold else 0.0
                                else:
                                    success = 1.0 if value <= threshold else 0.0

                            feature_successes.append(success)
                            feature_binaries.append(1.0 if success >= 0.5 else 0.0)

                        # Epoch counts as a win only if every feature wins
                        epoch_binary = 1.0 if feature_binaries and all(b == 1.0 for b in feature_binaries) else 0.0
                        session_epoch_history.append(epoch_binary)

                        feedback_val = float(np.mean(feature_successes)) if feature_successes else 0.0

                    # Send updates
                    current_time = time.time()
                    session_time_elapsed = int(current_time - session_start_time)

                    if current_time - last_session_update >= 1.0:
                        session_update_payload = {
                            "type": "session_update",
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "session_time": session_time_elapsed,
                            "overall_success_rate": overall_success_rate,
                            "session_info": {
                                "patientName": patient_name,
                                "sessionType": start_command.get("session_type", "training"),
                                "protocolType": start_command.get("protocol_type", "TBR"),
                                "currentRound": current_round,
                                "totalRounds": session_rounds
                            }
                        }

                        try:
                            await websocket.send_json(session_update_payload)
                            last_session_update = current_time
                        except Exception as e:
                            logger.error("Failed to send session update: %s", e)

                        # Only current_threshold is consumed by the frontend (chart threshold
                        # line fallback); the former rolling success_rate/stats were dead.
                        threshold_stats = {}
                        for feature_name in selected_features:
                            threshold = round_state["feature_thresholds"].get(feature_name)
                            if threshold is None:
                                continue
                            threshold_stats[feature_name] = {
                                "current_threshold": float(threshold),
                            }

                    # Only send feedback every 1 second (throttle feedback updates)
                    time_since_last_feedback = current_time - last_feedback_send
                    
                    if time_since_last_feedback >= feedback_interval:
                        # Update smoothed thresholds using EMA for stable display
                        # Only update if baseline is locked and thresholds exist
                        if round_state["baseline_locked"] and round_state["feature_thresholds"]:
                            for feature_name in selected_features:
                                raw_threshold = round_state["feature_thresholds"].get(feature_name)
                                if raw_threshold is not None:
                                    smoothed = round_state["smoothed_thresholds"].get(feature_name, raw_threshold)
                                    # Apply EMA smoothing to reduce jitter
                                    new_smoothed = threshold_smoothing_alpha * raw_threshold + (1 - threshold_smoothing_alpha) * smoothed
                                    round_state["smoothed_thresholds"][feature_name] = new_smoothed
                        
                        # Build band_info with name and Hz range for frontend display
                        band_info = {}
                        for feature_name in selected_features:
                            if feature_name in bands:
                                band_config = bands[feature_name]
                                
                                # Check if this is a ratio feature
                                if isinstance(band_config, dict) and "numerator" in band_config and "denominator" in band_config:
                                    # This is a ratio feature
                                    numerator_name = band_config.get("numerator")
                                    denominator_name = band_config.get("denominator")
                                    
                                    # Get frequency ranges for numerator and denominator
                                    numerator_range = None
                                    denominator_range = None
                                    
                                    if numerator_name in bands:
                                        num_config = bands[numerator_name]
                                        if isinstance(num_config, (tuple, list)) and len(num_config) >= 2:
                                            numerator_range = (float(num_config[0]), float(num_config[1]))
                                    
                                    if denominator_name in bands:
                                        den_config = bands[denominator_name]
                                        if isinstance(den_config, (tuple, list)) and len(den_config) >= 2:
                                            denominator_range = (float(den_config[0]), float(den_config[1]))
                                    
                                    # Create display name for ratio
                                    if numerator_range and denominator_range:
                                        display_name = f"{numerator_name.title()}/{denominator_name.title()} Ratio"
                                        hz_label = (
                                            f"({numerator_range[0]:.0f}–{numerator_range[1]:.0f} Hz)"
                                            f" / ({denominator_range[0]:.0f}–{denominator_range[1]:.0f} Hz)"
                                        )
                                    else:
                                        display_name = feature_name.replace("_", " ").title()
                                        hz_label = display_name
                                    
                                    band_info[feature_name] = {
                                        "name": display_name,
                                        "hz_range": None,  # Ratios don't have a single Hz range
                                        "hz_label": hz_label,
                                        "mode": feature_modes.get(feature_name, "enhance"),
                                        "unit": "ratio",
                                        "numerator": numerator_name,
                                        "denominator": denominator_name,
                                        "numerator_range": numerator_range,
                                        "denominator_range": denominator_range
                                    }
                                else:
                                    # This is a regular frequency band
                                    if isinstance(band_config, (tuple, list)) and len(band_config) >= 2:
                                        low, high = float(band_config[0]), float(band_config[1])
                                        # Create a display-friendly band name
                                        # Convert feature name like "reward_0" or "inhibit_1" to readable format
                                        display_name = feature_name.replace("_", " ").title()
                                        band_info[feature_name] = {
                                            "name": display_name,
                                            "hz_range": [low, high],
                                            "hz_label": f"{low:.0f}–{high:.0f} Hz",
                                            "mode": feature_modes.get(feature_name, "enhance"),
                                            "unit": "µV"  # We're now using amplitude (µV) not power (µV²)
                                        }
                        
                        # Prepare and send feedback
                        payload = {
                            "type": "feedback",
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "session_time": session_time_elapsed,
                            "selected_features": selected_features,
                            "feature_modes": feature_modes,
                            "combination_method": combination_method,
                            "combined_value": float(combined_value),
                            "feedback": feedback_val,
                            "overall_success_rate": overall_success_rate,
                            "raw_data_file": eeg_csv_path,
                            "individual_features": {},
                            "z_scores": z_scores,
                            "raw_band_powers": {},
                            "band_info": band_info,  # Add band info with Hz ranges
                            "baseline_status": baseline_status,
                            "baseline_overall": {
                                "all_ready": all_baselines_ready,
                                "min_progress": min_baseline_progress,
                                "total_samples": total_samples_collected,
                                "status": "collecting" if not all_baselines_ready else "ready"
                            },
                            "training_phase": training_phase,
                            "training_phase_message": training_phase_message,
                            "threshold_stats": threshold_stats,
                            "signal_info": {
                                "raw_data_shape": [int(buffer.shape[0]), int(buffer.shape[1])] if buffer.size > 0 else [0, 0],
                                "processed_data_shape": [int(x_clean.shape[0]), int(x_clean.shape[1])] if x_clean.size > 0 else [0, 0],
                                "channel_names": ["C3", "Cz", "C4"][:device_channels],  # Use actual device channel count
                                "active_channel_count": active_channel_count,
                                "sampling_rate": int(fs),
                                "epoch_samples": int(epoch_samples),
                                "step_samples": int(step_samples),
                                "visualization_scale": VISUALIZATION_SCALE,
                                "plot_limits": {
                                    "min": VISUALIZATION_Y_LIMITS[0],
                                    "max": VISUALIZATION_Y_LIMITS[1]
                                }
                            }
                        }

                        for feature_name in selected_features:
                            payload["individual_features"][feature_name] = feature_values.get(feature_name, 0.0)

                        payload["feature_thresholds"] = {}
                        for feature_name in selected_features:
                            # Use smoothed threshold for display to reduce jitter
                            smoothed_threshold = round_state["smoothed_thresholds"].get(feature_name)
                            raw_threshold = round_state["feature_thresholds"].get(feature_name)
                            threshold = smoothed_threshold if smoothed_threshold is not None else raw_threshold
                            if threshold is None:
                                continue
                            current_value = float(feature_values.get(feature_name, 0.0))
                            mode = feature_modes.get(feature_name, "enhance")
                            if mode == "enhance":
                                success = bool(current_value >= threshold)
                            else:
                                success = bool(current_value <= threshold)
                            payload["feature_thresholds"][feature_name] = {
                                "threshold": float(threshold),
                                "raw_threshold": float(raw_threshold) if raw_threshold is not None else None,
                                "current_value": current_value,
                                "success": success,
                                "mode": mode
                            }

                        for band_name in bands.keys():
                            if band_name in features:
                                payload["raw_band_powers"][f"{band_name}_mean"] = float(features[band_name].mean())

                        # Add EEG visualization data to the payload
                        payload["eeg_data"] = {
                            "channels": eeg_visualization_data,
                            "channel_names": ["Channel 1", "Channel 2", "Channel 3"],
                            "active_channel_count": active_channel_count,
                            "sampling_rate": int(fs),
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "plot_limits": {
                                "min": VISUALIZATION_Y_LIMITS[0],
                                "max": VISUALIZATION_Y_LIMITS[1]
                            },
                            "signal_stats": {
                                "mean_values": [float(np.nanmean(x_clean_visual[:, ch_idx])) if x_clean_visual.shape[0] > 0 else 0.0 for ch_idx in range(min(x_clean_visual.shape[1], 5))],
                                "std_values": [float(np.nanstd(x_clean_visual[:, ch_idx])) if x_clean_visual.shape[0] > 0 else 0.0 for ch_idx in range(min(x_clean_visual.shape[1], 5))],
                                "min_values": [float(np.nanmin(x_clean_visual[:, ch_idx])) if x_clean_visual.shape[0] > 0 else 0.0 for ch_idx in range(min(x_clean_visual.shape[1], 5))],
                                "max_values": [float(np.nanmax(x_clean_visual[:, ch_idx])) if x_clean_visual.shape[0] > 0 else 0.0 for ch_idx in range(min(x_clean_visual.shape[1], 5))]
                            }
                        }

                        try:
                            await websocket.send_json(payload)
                            last_feedback_send = current_time  # Update last feedback send time
                            # Log periodically to verify feedback is being sent (every 25th message to avoid spam)
                            feedback_count = getattr(websocket, '_feedback_count', 0)
                            websocket._feedback_count = feedback_count + 1
                            if feedback_count % 25 == 0:  # Every 25th message (since we're sending less frequently)
                                logger.info(f"Sending feedback #{feedback_count}: type={payload['type']}, has_eeg_data={bool(payload.get('eeg_data'))}, channels={len(payload.get('eeg_data', {}).get('channels', [])) if payload.get('eeg_data') else 0}, round={current_round}, interval={feedback_interval}s")
                        except Exception as e:
                            logger.error("Failed to send payload: %s", e)
                            logger.error(f"Payload that failed: type={payload.get('type')}, keys={list(payload.keys())}")
                            import traceback
                            logger.error(traceback.format_exc())
                            break

                    await asyncio.sleep(0.01)

    except Exception as e:
        logger.error("Error in main processing: %s", e)
        # Send stop command to device on error
        if acq and hasattr(acq, 'send_command'):
            try:
                acq.send_command("Contl_STOP_AQU")
                logger.info("Sent stop acquisition command to device due to processing error")
            except Exception as device_error:
                logger.error(f"Error sending stop command to device: {device_error}")
        
        # Stop acquisition if it has a stop method
        if acq and hasattr(acq, 'stop'):
            try:
                acq.stop()
            except Exception as stop_error:
                logger.error(f"Error stopping acquisition: {stop_error}")
        
        try:
            await websocket.send_json({
                "type": "error",
                "message": f"Processing error: {str(e)}",
                "time": datetime.now(timezone.utc).isoformat()
            })
        except:
            pass
    finally:
        # Always ensure device is stopped in cleanup
        if acq and hasattr(acq, 'send_command'):
            try:
                acq.send_command("Contl_STOP_AQU")
                logger.info("Sent stop acquisition command to device in cleanup")
            except Exception as e:
                logger.error(f"Error sending stop command during cleanup: {e}")
        
        active_connections.discard(websocket)
        if acq:
            try:
                acq.stop()
            except Exception as e:
                logger.error(f"Error stopping device: {e}")

        # Close the filtered-EEG recording file
        if eeg_csv_file is not None:
            try:
                eeg_csv_file.close()
                logger.info("Closed filtered EEG recording file")
            except Exception as e:
                logger.error(f"Error closing filtered EEG file: {e}")

        active_connections.discard(websocket)


@router.post("/nfcore_stop")
async def stop_nfcore() -> JSONResponse:
    """Endpoint to stop all active neurofeedback processing sessions"""
    try:
        stop_count = 0
        for ws in list(active_connections):
            try:
                await ws.close(code=1000)
                stop_count += 1
            except Exception as e:
                logger.error(f"Error closing websocket: {str(e)}")

        return JSONResponse({
            "status": "success",
            "message": f"Stopped {stop_count} active connections",
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
    except Exception as e:
        logger.error(f"Error stopping neurofeedback core: {str(e)}")
        return JSONResponse({
            "status": "error",
            "message": f"Failed to stop: {str(e)}",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }, status_code=500)


@router.get("/recording/{filename}")
async def get_recording(filename: str):
    """
    Serve a recorded EEG signal CSV (raw + post notch+bandpass) for download.
    Restricted to files inside the recordings dir; the basename guards against
    path traversal.
    """
    safe_name = os.path.basename(filename)
    path = os.path.join(_eeg_recordings_dir(), safe_name)
    if not safe_name.lower().endswith(".csv") or not os.path.isfile(path):
        return JSONResponse({"error": "Recording not found"}, status_code=404)
    return FileResponse(path, media_type="text/csv", filename=safe_name)
