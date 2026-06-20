/**
 * WebSocket Module - Handles real-time communication with the backend
 * Manages EEG data streaming and live session updates
 */
class WebSocketManager {
    constructor() {
        this.ws = null;
        this.url = 'ws://localhost:8000/sp/nfcore_start';
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.isConnecting = false;
        this.isConnected = false;
        this.isPaused = false;
        this.hasReceivedFeedback = false;
        this.feedbackTimeout = null;
        this.callbacks = {
            onConnect: [],
            onDisconnect: [],
            onError: [],
            onEEGData: [],
            onFeedback: [],
            onSessionUpdate: []
        };
    }

    // ========================================
    // CONNECTION MANAGEMENT
    // ========================================

    async connect(url = null) {
        if (this.isConnecting || this.isConnected) {
            return;
        }

        this.isConnecting = true;
        const wsUrl = url || this.url;

        try {
            this.ws = new WebSocket(wsUrl);
            this.setupEventHandlers();
            
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Connection timeout'));
                }, 10000);

                this.ws.addEventListener('open', () => {
                    clearTimeout(timeout);
                    resolve();
                });

                this.ws.addEventListener('error', (error) => {
                    clearTimeout(timeout);
                    reject(error);
                });
            });

        } catch (error) {
            this.isConnecting = false;
            console.error('WebSocket connection error:', error);
            throw error;
        }
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
    }

    setupEventHandlers() {
        if (!this.ws) return;

        this.ws.addEventListener('open', (event) => {
            this.isConnected = true;
            this.isConnecting = false;
            this.reconnectAttempts = 0;
            this.triggerCallbacks('onConnect', event);
            window.ui?.updateConnectionStatus(true);
        });

        this.ws.addEventListener('close', (event) => {
            this.isConnected = false;
            this.isConnecting = false;
            this.triggerCallbacks('onDisconnect', event);
            window.ui?.updateConnectionStatus(false);
            if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
                this.attemptReconnect();
            }
        });

        this.ws.addEventListener('error', (error) => {
            this.isConnecting = false;
            this.triggerCallbacks('onError', error);
        });

        this.ws.addEventListener('message', (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('[WebSocketManager] Received message type:', data.type, 'Full data:', data);
                
                if (data.type === 'feedback') {
                    console.log('[WebSocketManager] Feedback message received!', {
                        hasEegData: !!data.eeg_data,
                        hasChannels: !!data.eeg_data?.channels,
                        channelsLength: data.eeg_data?.channels?.length,
                        firstChannelLength: data.eeg_data?.channels?.[0]?.length,
                        feedback: data.feedback,
                        trainingPhase: data.training_phase
                    });
                }
                
                if (data.type === 'error') {
                    console.error('[WebSocketManager] Error message from backend:', data);
                }
                
                this.handleMessage(data);
            } catch (error) {
                console.error('[WebSocketManager] Error parsing WebSocket message:', error, 'Raw data:', event.data);
            }
        });
    }

    async attemptReconnect() {
        if (this.isConnecting) return;

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

        setTimeout(async () => {
            try {
                await this.connect();
            } catch (error) {
                if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                    // Connection failed
                } else {
                    this.attemptReconnect();
                }
            }
        }, delay);
    }

    // ========================================
    // MESSAGE HANDLING
    // ========================================

    handleMessage(data) {
        switch (data.type) {
            case 'welcome':
                this.handleWelcome(data);
                break;
                
            case 'echo':
                this.handleEcho(data);
                break;
                
            case 'feedback':
                this.handleFeedback(data);
                break;
                
            case 'session_update':
                this.handleSessionUpdate(data);
                break;
                
            case 'complete':
                this.handleSessionComplete(data);
                break;
                
            case 'config':
                this.handleConfig(data);
                break;
                
            case 'wave_batch':
                this.handleWaveBatch(data);
                break;
                
            case 'eeg_data':
                this.handleEEGData(data);
                break;
                
            case 'status':
                this.handleStatus(data);
                break;
                
            case 'error':
                this.handleError(data);
                break;
                
            case 'round_complete':
                this.handleRoundComplete(data);
                break;
                
            case 'round_start':
                this.handleRoundStart(data);
                break;

            case 'artifact':
                this.handleArtifact(data);
                break;
                
            case 'feedback_interval_updated':
                this.handleFeedbackIntervalUpdated(data);
                break;
                
            default:
                console.warn('Unknown message type:', data.type);
        }
    }

    handleWelcome(data) {
        console.log('[WebSocketManager] Welcome message received:', data);
    }

    handleEcho(data) {
        console.log('[WebSocketManager] Echo message received:', data.message || data);
        // Echo messages don't need processing, but log them to track backend communication
    }

    handleConfig(data) {
        this.serverConfig = {
            fs: data.fs,
            channels: data.channels,
            encoding: data.encoding
        };
        window.ui?.updateServerConfig(this.serverConfig);
    }

    handleWaveBatch(data) {
        // Handle raw wave data batch
        if (window.charts) {
            window.charts.updateRawWaveData(data);
        }
        this.triggerCallbacks('onWaveBatch', data);
    }

    handleEEGData(data) {
        if (this.isPaused) return;

        // Print filtered signal values for debugging
        if (data.eeg_data && Array.isArray(data.eeg_data)) {
            // If data.eeg_data is in [samples, channels] format (last sample for visualization)
            if (data.eeg_data.length > 0 && Array.isArray(data.eeg_data[0]) && data.eeg_data[0].length >= 3) {
                const lastSample = data.eeg_data[data.eeg_data.length - 1];
                if (lastSample && lastSample.length >= 3) {
                    const [c1, c2, c3] = lastSample;
                    console.log(`[FILTERED SIGNALS] C1: ${c1.toFixed(6)}, C2: ${c2.toFixed(6)}, C3: ${c3.toFixed(6)}`);
                }
            }
        } else if (data.eeg_data && Array.isArray(data.eeg_data.channels) && data.eeg_data.channels.length >= 3) {
            // If data.eeg_data has channels property
            const c1 = Array.isArray(data.eeg_data.channels[0]) && data.eeg_data.channels[0].length > 0 ? 
                data.eeg_data.channels[0][data.eeg_data.channels[0].length - 1] : 0;
            const c2 = Array.isArray(data.eeg_data.channels[1]) && data.eeg_data.channels[1].length > 0 ?
                data.eeg_data.channels[1][data.eeg_data.channels[1].length - 1] : 0;
            const c3 = Array.isArray(data.eeg_data.channels[2]) && data.eeg_data.channels[2].length > 0 ?
                data.eeg_data.channels[2][data.eeg_data.channels[2].length - 1] : 0;
            console.log(`[FILTERED SIGNALS] C1: ${c1.toFixed(6)}, C2: ${c2.toFixed(6)}, C3: ${c3.toFixed(6)}`);
        }

        this.triggerCallbacks('onEEGData', data);
        
        // Update simple plots in SessionRecordingPanel if available
        // Try multiple ways to access the panel
        const recordingPanel = window.uiState?.sessionRecordingPanel || window.sessionRecordingPanel;
        
        if (recordingPanel && typeof recordingPanel.updateEEGPlot === 'function') {
            // Process the EEG data to send to simple plot
            let eegPlotData = data.eeg_data;
            
            console.log('[WebSocketManager] Processing EEG data for plots, eeg_data type:', typeof eegPlotData, 'isArray:', Array.isArray(eegPlotData));
            
            // Handle the format where eeg_data is an object with channels property
            // Backend sends: { channels: [[sample1_ch1, sample1_ch2, sample1_ch3], [sample2_ch1, ...], ...] }
            // This is [samples, channels] format - need to convert to [channels, samples]
            if (eegPlotData && typeof eegPlotData === 'object' && !Array.isArray(eegPlotData) && Array.isArray(eegPlotData.channels)) {
                console.log('[WebSocketManager] Found eeg_data.channels format, length:', eegPlotData.channels.length);
                const channelsData = eegPlotData.channels;
                
                // Check if it's [samples, channels] format (2D array where each row is a sample)
                if (channelsData.length > 0 && Array.isArray(channelsData[0])) {
                    // Convert from [samples, channels] to [channels, samples]
                    const numChannels = channelsData[0].length;
                    const numSamples = channelsData.length;
                    const channelArrays = [];
                    
                    console.log(`[WebSocketManager] Converting [${numSamples} samples, ${numChannels} channels] to [${numChannels} channels, ${numSamples} samples]`);
                    
                    for (let ch = 0; ch < numChannels; ch++) {
                        const channelValues = [];
                        for (let s = 0; s < numSamples; s++) {
                            if (channelsData[s] && channelsData[s][ch] !== undefined) {
                                channelValues.push(channelsData[s][ch]);
                            }
                        }
                        channelArrays.push(channelValues);
                    }
                    
                    eegPlotData = channelArrays;
                    console.log('[WebSocketManager] Converted data, channels:', eegPlotData.length, 'samples per channel:', eegPlotData[0]?.length);
                } else {
                    // Already in [channels, samples] format or different structure
                    eegPlotData = channelsData;
                }
            } 
            // If in [samples, channels] format directly (array of arrays)
            else if (eegPlotData && Array.isArray(eegPlotData) && eegPlotData.length > 0 && Array.isArray(eegPlotData[0])) {
                console.log('[WebSocketManager] Found direct array format [samples, channels]');
                // Convert from matrix [samples, channels] to array of channel values [ch1_values, ch2_values, ch3_values]
                const numChannels = eegPlotData[0].length;
                const channelArrays = [];
                
                for (let ch = 0; ch < numChannels; ch++) {
                    const channelValues = [];
                    for (let s = 0; s < eegPlotData.length; s++) {
                        channelValues.push(eegPlotData[s][ch]);
                    }
                    channelArrays.push(channelValues);
                }
                
                eegPlotData = channelArrays;
            } else if (eegPlotData && Array.isArray(eegPlotData.channels)) {
                // Handle the format where eeg_data has channels array with samples property
                const channelArrays = [];
                for (let ch = 0; ch < eegPlotData.channels.length; ch++) {
                    if (eegPlotData.channels[ch] && Array.isArray(eegPlotData.channels[ch].samples)) {
                        channelArrays.push(eegPlotData.channels[ch].samples);
                    } else if (Array.isArray(eegPlotData.channels[ch])) {
                        // If it's just an array of values
                        channelArrays.push(eegPlotData.channels[ch]);
                    }
                }
                eegPlotData = channelArrays;
            } else {
                console.warn('[WebSocketManager] Unknown EEG data format:', eegPlotData);
            }
            
            if (eegPlotData && Array.isArray(eegPlotData) && eegPlotData.length > 0) {
                const firstChannelSamples = eegPlotData[0]?.length || 0;
                const samplePreview = eegPlotData[0]?.slice(0, 3) || [];
                console.log('[WebSocketManager] Calling updateEEGPlot with', eegPlotData.length, 'channels, first channel has', firstChannelSamples, 'samples, preview:', samplePreview.map(v => v.toFixed(3)));
                const activeCount = data.eeg_data?.active_channel_count ?? 1;
                if (typeof recordingPanel.setActiveChannelCount === 'function') {
                    recordingPanel.setActiveChannelCount(activeCount);
                }
                try {
                    recordingPanel.updateEEGPlot(eegPlotData);
                } catch (error) {
                    console.error('[WebSocketManager] Error calling updateEEGPlot:', error);
                    console.error('[WebSocketManager] Error stack:', error.stack);
                }
            } else {
                console.warn('[WebSocketManager] Failed to process EEG data for plots');
                console.warn('[WebSocketManager] eegPlotData type:', typeof eegPlotData, 'isArray:', Array.isArray(eegPlotData), 'length:', eegPlotData?.length);
                console.warn('[WebSocketManager] eegPlotData value:', eegPlotData);
            }
        } else {
            console.warn('[WebSocketManager] SessionRecordingPanel or updateEEGPlot not available. Panel:', !!recordingPanel, 'has updateEEGPlot:', recordingPanel && typeof recordingPanel.updateEEGPlot === 'function');
        }
        
        // Also update any existing charts if available
        if (window.charts) {
            // Convert data format for EEG charts if needed
            let eegChartData = data.eeg_data;
            
            // If eeg_data is in [samples, channels] format (2D array), convert to expected format
            if (eegChartData && Array.isArray(eegChartData) && eegChartData.length > 0 && Array.isArray(eegChartData[0])) {
                // Convert from [samples, channels] to { channels: [{samples: [...]}, {samples: [...]}, ...] } format
                const channels = [];
                const numSamples = eegChartData.length;
                const numChannels = eegChartData[0].length;
                
                for (let ch = 0; ch < numChannels; ch++) {
                    const channelSamples = [];
                    for (let s = 0; s < numSamples; s++) {
                        channelSamples.push(eegChartData[s][ch]);
                    }
                    channels.push({ samples: channelSamples });
                }
                
                eegChartData = { channels: channels };
            } else if (eegChartData && !eegChartData.channels && Array.isArray(eegChartData)) {
                // If it's a raw array that should be converted
                const channels = eegChartData.map(channelData => ({ samples: Array.isArray(channelData) ? channelData : [] }));
                eegChartData = { channels: channels };
            }
            
            window.charts.updateEEGChart(eegChartData, 'eegChart');
            window.charts.updateEEGChart(eegChartData, 'recordingEegChart');
            
            if (data.individual_features) {
                // Format individual_features to match expected structure for bandpower chart
                // Extract the bandpower values per channel from individual_features
                const bands = ['delta', 'theta', 'alpha', 'beta', 'gamma'];
                
                // Create arrays to store bandpower values for each channel
                const channelCount = 3; // Assuming 3 channels: C3, Cz, C4
                const bandpowerChannels = [];
                
                // Initialize channel arrays
                for (let ch = 0; ch < channelCount; ch++) {
                    bandpowerChannels.push([]);
                }
                
                // For each band, extract the per-channel values
                bands.forEach(band => {
                    const bandValues = data.individual_features[band]; 
                    if (Array.isArray(bandValues)) {
                        // Add each channel's value for this band to the corresponding channel array
                        for (let ch = 0; ch < Math.min(channelCount, bandValues.length); ch++) {
                            bandpowerChannels[ch].push(bandValues[ch]);
                        }
                    } else {
                        // If it's not an array (e.g., theta_beta_ratio), add placeholder
                        for (let ch = 0; ch < channelCount; ch++) {
                            bandpowerChannels[ch].push(0);
                        }
                    }
                });
                
                // Create a proper data structure for the bandpower chart
                const formattedBandpowerData = {
                    channels: bandpowerChannels.map(bandpowers => ({ bandpowers }))
                };
                
                window.charts.updateBandpowerChart(formattedBandpowerData, 'bandpowerChart');
                window.charts.updateBandpowerChart(formattedBandpowerData, 'recordingBandpowerChart');
            }
        }
    }

    handleFeedback(data) {
        if (this.isPaused) return;
        
        // Mark that we've received feedback
        this.hasReceivedFeedback = true;
        if (this.feedbackTimeout) {
            clearTimeout(this.feedbackTimeout);
            this.feedbackTimeout = null;
        }
        
        this.triggerCallbacks('onFeedback', data);
        
        // Process EEG data if present in the feedback message
        if (data.eeg_data && data.eeg_data.channels) {
            console.log('[WebSocketManager] handleFeedback: Received eeg_data, channels length:', data.eeg_data.channels.length);
            
            // Print filtered signal values for debugging
            if (data.eeg_data.channels && Array.isArray(data.eeg_data.channels) && data.eeg_data.channels.length > 0) {
                // If channels data is in [samples, channels] format (last 50 samples for visualization)
                if (Array.isArray(data.eeg_data.channels[0])) {
                    const lastSample = data.eeg_data.channels[data.eeg_data.channels.length - 1];
                    if (Array.isArray(lastSample) && lastSample.length >= 3) {
                        const [c1, c2, c3] = lastSample;
                        console.log(`[FILTERED SIGNALS] C1: ${c1.toFixed(6)}, C2: ${c2.toFixed(6)}, C3: ${c3.toFixed(6)}`);
                    }
                }
                // If channels data is in [channel1_samples, channel2_samples, channel3_samples] format
                else if (Array.isArray(data.eeg_data.channels[0]) && Array.isArray(data.eeg_data.channels[0].samples)) {
                    const c1 = data.eeg_data.channels[0].samples[data.eeg_data.channels[0].samples.length - 1];
                    const c2 = data.eeg_data.channels[1]?.samples?.[data.eeg_data.channels[1]?.samples?.length - 1] || 0;
                    const c3 = data.eeg_data.channels[2]?.samples?.[data.eeg_data.channels[2]?.samples?.length - 1] || 0;
                    console.log(`[FILTERED SIGNALS] C1: ${c1.toFixed(6)}, C2: ${c2.toFixed(6)}, C3: ${c3.toFixed(6)}`);
                }
            }

            // Pass the full eeg_data object to handleEEGData so it can process it correctly
            // The backend sends: { eeg_data: { channels: [[samples], [samples], ...], ... } }
            const eegDataWithCount = Object.assign({}, data.eeg_data);
            if (eegDataWithCount.active_channel_count === undefined && data.signal_info?.active_channel_count !== undefined) {
                eegDataWithCount.active_channel_count = data.signal_info.active_channel_count;
            }
            this.handleEEGData({
                eeg_data: eegDataWithCount,
                channel_names: data.eeg_data.channel_names || ['C3', 'Cz', 'C4'],
                sampling_rate: data.eeg_data.sampling_rate || 256,
                timestamp: data.eeg_data.timestamp
            });
        } else {
            console.warn('[WebSocketManager] handleFeedback: No eeg_data in feedback message');
        }
        
        // Determine phase - prioritize training_phase field
        const isBaseline = data.training_phase === 'baseline';
        const phaseMessage = data.training_phase_message || (isBaseline ? 'Taking baseline' : 'Training in progress');
        const feedbackValue = isBaseline ? 0.0 : (data.feedback || 0.0);
        
        // Update all feedback displays with correct phase-aware values
        if (window.charts && typeof window.charts.updateFeedbackValue === 'function') {
            window.charts.updateFeedbackValue(feedbackValue);
        }
        
        if (window.uiState?.sessionRecordingPanel) {
            // Pass overall_success_rate if available
            const overallSuccessRate = data.overall_success_rate !== undefined ? data.overall_success_rate : null;
            window.uiState.sessionRecordingPanel.updateFeedback(feedbackValue, phaseMessage, overallSuccessRate);
        }
        
        if (window.FeedbackWindow) {
            const feedbackWindow = window.uiState?.feedbackWindow || new window.FeedbackWindow();
            feedbackWindow.updateFeedback(feedbackValue, phaseMessage);
        }
        
        // Update timers
        if (window.charts && data.session_time !== undefined && typeof window.charts.updateSessionTimer === 'function') {
            window.charts.updateSessionTimer(data.session_time);
        }
        
        // Update feature amplitude charts with thresholds and band info
        if (window.charts && data.individual_features) {
            // Extract threshold values from feature_thresholds if available
            let thresholds = null;
            if (data.feature_thresholds) {
                thresholds = {};
                Object.keys(data.feature_thresholds).forEach(featureName => {
                    thresholds[featureName] = data.feature_thresholds[featureName].threshold;
                });
            }
            // For fixed and adaptive thresholds
            else if (data.threshold_stats) {
                thresholds = {};
                Object.keys(data.threshold_stats).forEach(featureName => {
                    thresholds[featureName] = data.threshold_stats[featureName].current_threshold;
                });
            }
            
            // Get band info (name, Hz range) from the feedback data
            const bandInfo = data.band_info || null;
            
            // Update both the main and recording panel feature amplitude charts with band info
            window.charts.updateFeatureAmplitudeChart(data.individual_features, thresholds, 'featureAmplitudeChart', bandInfo);
            
            // Update separated charts for recording panel with band info
            window.charts.updateSeparatedFeatureCharts(data.individual_features, thresholds, 'recordingFeatureChartsContainer', bandInfo);
        }

        this.latestFeedbackData = data;
    }

    handleSessionUpdate(data) {
        this.triggerCallbacks('onSessionUpdate', data);
        if (window.charts) {
            if (data.session_time !== undefined) window.charts.updateSessionTimer(data.session_time);
            if (data.session_info) window.charts.updateSessionDetails(data.session_info);
        }
    }

    handleStatus(data) {
        // Status message received
    }

    handleError(data) {
        console.error('WebSocket error message:', data);
        const message = data.message || 'The session could not be started.';
        window.ui?.showNotification?.(message, 'error');
        // The backend aborts after sending an error, so no feedback will ever
        // arrive — stop the session so the UI doesn't hang on "Initializing...".
        const recordingPanel = window.uiState?.sessionRecordingPanel || window.sessionRecordingPanel;
        recordingPanel?.stopSession?.();
    }

    handleRoundComplete(data) {
        this.triggerCallbacks('onRoundComplete', data);
        
        const roundNumber = data.round_number || 0;
        const totalRounds = data.total_rounds || 1;
        const isLastRound = roundNumber >= totalRounds;
        
        const message = data.message || `Round ${roundNumber} completed`;
        console.log(`Round ${roundNumber} completed`);
        
        if (isLastRound) {
            // All rounds done — send resume so backend can finalize, then stop the session.
            this.resumeSession();
            setTimeout(() => {
                const recordingPanel = window.uiState?.sessionRecordingPanel;
                if (recordingPanel) {
                    recordingPanel.stopSession();
                }
            }, 500);
        } else {
            // More rounds remaining — auto-resume after a short pause.
            setTimeout(() => {
                console.log(`Automatically resuming to start round ${roundNumber + 1}`);
                this.resumeSession();
            }, 1500);
        }
    }

    handleRoundStart(data) {
        this.triggerCallbacks('onRoundStart', data);
        
        const roundNumber = data.round_number || 0;
        const totalRounds = data.total_rounds || 1;
        
        const message = data.message || `Round ${roundNumber} of ${totalRounds} started`;
        console.log(`Round ${roundNumber} started`);
        
        // Update session details to show current round
        if (window.charts && window.uiState?.sessionRecordingPanel) {
            const details = document.getElementById("recordingSessionDetails");
            if (details) {
                const preparationPanel = window.uiState?.sessionPreparationPanel;
                const planningPanel = window.uiState?.sessionPlanningPanel;
                const recordingPanel = window.uiState?.sessionRecordingPanel;
                
                if (preparationPanel && planningPanel && recordingPanel) {
                    const protocol = planningPanel.currentSessionInfo?.protocol || null;
                    const patient = recordingPanel.patient;
                    
                    details.innerHTML = `
                        <span class="nf-meta-item"><strong>Patient:</strong> ${patient?.first_name || ''} ${patient?.last_name || ''}</span>
                        <span class="nf-meta-item"><strong>Protocol:</strong> ${protocol?.name || protocol?.protocol_type || "TBR"}</span>
                        <span class="nf-meta-item"><strong>Session:</strong> #${recordingPanel.sessionNumber || 0}</span>
                        <span class="nf-meta-item"><strong>Round:</strong> ${roundNumber}/${totalRounds}</span>
                    `;
                }
            }
        }
        
        // Hide resume button when new round starts
        if (window.uiState?.sessionRecordingPanel) {
            const resumeBtn = document.getElementById("recordingResumeSessionBtn");
            if (resumeBtn) {
                resumeBtn.style.display = "none";
            }
        }
    }

    handleArtifact(data) {
        console.log('[WebSocketManager] Artifact detected:', data.artifact_type, data.message);
        if (window.uiState?.sessionRecordingPanel) {
            window.uiState.sessionRecordingPanel.showArtifactAlert(data.message, data.artifact_type);
        }
    }

    handleFeedbackIntervalUpdated(data) {
        console.log('[WebSocketManager] Feedback interval updated to', data.interval, 'seconds');
        // The UI button state is already updated when the user clicks, so we just log the confirmation
    }

    // ========================================
    // SENDING MESSAGES
    // ========================================

    send(data) {
        if (!this.isConnected || !this.ws) {
            console.warn('[WebSocketManager] WebSocket not connected. Cannot send message:', data);
            return false;
        }
        console.log('[WebSocketManager] Sending message:', data);

        try {
            this.ws.send(JSON.stringify(data));
            return true;
        } catch (error) {
            console.error('Error sending WebSocket message:', error);
            return false;
        }
    }

    startNeurofeedbackSession(sessionConfig) {
        const defaultConfig = {
            features: ['alpha'],
            feature_modes: { alpha: 'enhance' },
            feature_weights: { alpha: 1.0 },
            combination_method: 'weighted_average',
            mapping: 'sigmoid',
            protocol_type: 'alpha',
            session_rounds: 5,
            // TEMPORARY TESTING: Change session duration to 150 seconds (5 rounds × 30 seconds)
            // Revert this change to default behavior after testing
            session_duration: 150 // 150 seconds (5 rounds × 30 seconds for testing)
        };
        return this.send({ ...defaultConfig, ...sessionConfig, start: true });
    }
    
    startSession(sessionConfig) {
        const startCommand = {
            start: true,
            ...sessionConfig
        };
        console.log('[WebSocketManager] Sending start session command:', startCommand);
        return this.send(startCommand);
    }

    stopSession() {
        // Send stop command to neurofeedback WebSocket to trigger backend cleanup
        return this.send({
            type: 'stop'
        });
    }

    pauseSession() {
        this.isPaused = true;
        window.charts?.stopRealtimeSimulation();
        return this.send({ type: 'pause' });
    }

    resumeSession() {
        this.isPaused = false;
        if (window.charts && this.isLiveSessionActive) {
            window.charts.startRealtimeSimulation();
        }
        return this.send({ type: 'resume' });
    }

    updateFeedbackInterval(interval) {
        // interval is in seconds (0.1 to 10.0)
        if (interval < 0.1 || interval > 10.0) {
            console.warn('[WebSocketManager] Feedback interval must be between 0.1 and 10.0 seconds');
            return false;
        }
        return this.send({
            type: 'update_feedback_interval',
            interval: interval
        });
    }

    // Configuration messages
    updateConfig(config) {
        return this.send({
            type: 'update_config',
            config: config
        });
    }

    requestStatus() {
        return this.send({
            type: 'get_status'
        });
    }

    // ========================================
    // EVENT CALLBACKS
    // ========================================

    on(event, callback) {
        if (this.callbacks[event]) {
            this.callbacks[event].push(callback);
        } else {
            console.warn('Unknown event type:', event);
        }
    }

    off(event, callback) {
        if (this.callbacks[event]) {
            const index = this.callbacks[event].indexOf(callback);
            if (index > -1) this.callbacks[event].splice(index, 1);
        }
    }

    triggerCallbacks(event, data) {
        if (this.callbacks[event]) {
            this.callbacks[event].forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in ${event} callback:`, error);
                }
            });
        }
    }

    // ========================================
    // UTILITY METHODS
    // ========================================

    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            isConnecting: this.isConnecting,
            reconnectAttempts: this.reconnectAttempts,
            url: this.url
        };
    }

    setUrl(url) {
        this.url = url;
    }

    ping() {
        return this.send({
            type: 'ping',
            timestamp: Date.now()
        });
    }

    // ========================================
    // SESSION MANAGEMENT INTEGRATION
    // ========================================

    setupLiveSessionIntegration() {
        this.on('onEEGData', (data) => {
            if (this.isLiveSessionActive) {
                this.processLiveEEGData(data);
            }
        });

        this.on('onSessionUpdate', (data) => {
            if (data.session_status === 'completed') {
                this.handleSessionComplete(data);
            }
        });
    }

    processLiveEEGData(data) {
        if (window.charts && !window.charts.simulationInterval) {
            window.charts.startRealtimeSimulation();
        }
    }

    handleSessionComplete(data) {
        this.stopClientTimer();
        window.charts?.stopRealtimeSimulation();
        
        // Complete session in database if session ID is tracked
        const recordingPanel = window.uiState?.sessionRecordingPanel;
        if (recordingPanel && recordingPanel.sessionId) {
            window.api.completeSession(recordingPanel.sessionId).catch(err => {
                console.error('Error completing session:', err);
            });
        }
        
        window.ui?.stopLiveSession();
        this.isLiveSessionActive = false;
    }

    startLiveSession(sessionConfig) {
        this.isLiveSessionActive = true;
        this.sessionStartTime = Date.now();
        this.startClientTimer();
        window.charts?.startRealtimeSimulation();
        
        // Set a timeout to warn if no feedback messages are received after 15 seconds
        this.feedbackTimeout = setTimeout(() => {
            if (this.isLiveSessionActive && !this.hasReceivedFeedback) {
                console.warn('[WebSocketManager] No feedback messages received after 15 seconds. Check backend logs.');
            }
        }, 15000);
        
        this.hasReceivedFeedback = false;
        return this.startSession(sessionConfig);
    }

    stopLiveSession() {
        this.isLiveSessionActive = false;
        this.stopClientTimer();
        window.charts?.stopRealtimeSimulation();
        
        // Send stop command to neurofeedback WebSocket
        this.stopSession();
        
        // Disconnect WebSocket to trigger backend cleanup (finally block)
        this.disconnect();
        return true;
    }

    // ========================================
    // CLIENT-SIDE TIMER (FALLBACK)
    // ========================================

    startClientTimer() {
        // Client-side timer is intentionally disabled.
        // The recording panel timer is driven exclusively by backend session_time
        // from WebSocket messages via charts.updateSessionTimer(). Running a
        // second interval that writes to the same element causes the glitch.
        this.stopClientTimer();
    }

    stopClientTimer() {
        if (this.clientTimer) {
            clearInterval(this.clientTimer);
            this.clientTimer = null;
        }
    }
    
    // ========================================
    // DATA ACCESS METHODS
    // ========================================
    
    getLatestFeedbackData() {
        return this.latestFeedbackData || null;
    }
    
    getCurrentSuccessRates() {
        if (!this.latestFeedbackData || !this.latestFeedbackData.threshold_stats) {
            return {};
        }
        
        const successRates = {};
        Object.keys(this.latestFeedbackData.threshold_stats).forEach(feature => {
            const stats = this.latestFeedbackData.threshold_stats[feature];
            successRates[feature] = {
                current: stats.success_rate,
                target: stats.target_success_rate,
                threshold: stats.current_threshold,
                samples: stats.samples_count
            };
        });
        
        return successRates;
    }
    
    getCurrentFeedbackScore() {
        return this.latestFeedbackData ? this.latestFeedbackData.feedback : null;
    }
    
    getSessionPerformanceSummary() {
        if (!this.latestFeedbackData) {
            return null;
        }
        
        const data = this.latestFeedbackData;
        return {
            currentScore: data.feedback,
            combinedValue: data.combined_value,
            sessionTime: data.session_time,
            successRates: this.getCurrentSuccessRates(),
            individualFeatures: data.individual_features || {},
            baselineStatus: data.baseline_overall || {}
        };
    }
}

// Create global WebSocket manager instance
window.websocket = new WebSocketManager();

// Set up live session integration
window.websocket.setupLiveSessionIntegration();

// Auto-connect when the app starts (optional)
document.addEventListener('DOMContentLoaded', () => {
    // Uncomment to auto-connect on startup
    // window.websocket.connect().catch(console.error);
});