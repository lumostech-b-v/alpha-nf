/**
 * Session Recording Panel Component
 * Live session recording interface for the session window
 * Uses patient, protocol, and session number from planning
 */

class SessionRecordingPanel {
  constructor() {
    this.patient = null;
    this.protocol = null;
    this.sessionNumber = 0;
    this.containerId = "currentSessionStep";
    this.isPaused = false;
    this.timerPausedTime = null;
    this.feedbackWindow = null;
    this.sessionId = null; // Track the database session ID
    this.sessionStartTime = null;
    this.plotData = {}; // Initialize plot data object
    this.pendingPlotData = []; // Queue for data that arrives before plots are ready
    this.plotsInitialized = false;
    this.timerStarted = false; // Track if timer has started (only start when data streams)
    this.feedbackType = 'Image'; // Default feedback type
    this.sampleRate = 250; // Default sample rate (I8 hardware), will be updated from settings
    this.latestSuccessRate = null; // Track the latest overall success rate from feedback
    this.artifactState = { active: false }; // Artifact overlay state for EEG plots
    this.csvRows = []; // Accumulated per-epoch rows for CSV export
    this._csvFeedbackCallback = null; // Reference kept so we can deregister it
    this._csvCurrentRound = 1; // Tracked round number for CSV rows
    this.rawDataFile = null; // Backend path of the filtered-EEG CSV (post notch+bandpass)
    this._rawFileCallback = null; // Reference kept so we can deregister it

    // Y-axis scaling configuration
    // Default EEG display is a stable fixed range in microvolts.
    // Backend sends display EEG in uV only; clinical calculations remain in volts.
    this.yAxisConfig = {
      adaptive: false,
      fixedMin: -150,
      fixedMax: 150,
      paddingPercent: 8
    };
  }

  // ====================================
  // UI CREATION
  // ====================================

  createRecordingPanelHTML() {
    return `
      <div id="sessionRecordingPanel" class="nf-live-session">
        <!-- Header Bar -->
        <div class="nf-header">
          <div class="nf-header-left">
            <div class="nf-status-badge" id="nfStatusBadge">
              <span class="nf-status-dot" id="recordingStatusIndicator"></span>
              <span class="nf-status-text" id="recordingStatusText">Initializing...</span>
            </div>
            <div class="nf-timer-display">
              <svg class="nf-timer-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12,6 12,12 16,14"></polyline>
              </svg>
              <span class="nf-timer" id="recordingSessionTimer">00:00</span>
            </div>
          </div>
          <div class="nf-header-center">
            <h1 class="nf-title">Live Neurofeedback Session</h1>
            <div class="nf-session-meta" id="recordingSessionDetails">
              <span class="nf-meta-item">Loading...</span>
            </div>
          </div>
          <div class="nf-header-right">
            <div class="nf-feedback-speed-control" id="feedbackSpeedControl" style="display: none;">
              <label class="nf-speed-label" title="Feedback Update Speed">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px; margin-right: 4px;">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12,6 12,12 16,14"></polyline>
                </svg>
                Speed:
              </label>
              <div class="nf-speed-buttons">
                <button class="nf-speed-btn" id="feedbackSpeedSlow" title="Slower (2.0s)" data-interval="2.0">0.5x</button>
                <button class="nf-speed-btn nf-speed-btn-active" id="feedbackSpeedNormal" title="Normal (1.0s)" data-interval="1.0">1x</button>
                <button class="nf-speed-btn" id="feedbackSpeedFast" title="Faster (0.5s)" data-interval="0.5">2x</button>
                <button class="nf-speed-btn" id="feedbackSpeedVeryFast" title="Very Fast (0.25s)" data-interval="0.25">4x</button>
              </div>
            </div>
            <button class="nf-btn nf-btn-ghost" id="recordingPauseSessionBtn" title="Pause Session" style="display: none;">
              <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
              <span>Pause</span>
            </button>
            <button class="nf-btn nf-btn-ghost" id="recordingResumeSessionBtn" title="Resume Session" style="display: none;">
              <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"></polygon></svg>
              <span>Resume</span>
            </button>
            <button class="nf-btn nf-btn-danger" id="recordingStopSessionBtn" title="Stop Session">
              <svg viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"></rect></svg>
              <span>End Session</span>
            </button>
          </div>
        </div>
        
        <!-- Main Content Grid -->
        <div class="nf-content" id="recordingSessionActive">
          
          <!-- Left Panel: Feedback Gauge & Score -->
          <div class="nf-panel nf-feedback-panel">
            <div class="nf-gauge-container">
              <svg class="nf-gauge" viewBox="0 0 200 200">
                <defs>
                  <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#ef4444"/>
                    <stop offset="50%" style="stop-color:#f59e0b"/>
                    <stop offset="100%" style="stop-color:#22c55e"/>
                  </linearGradient>
                </defs>
                <circle class="nf-gauge-bg" cx="100" cy="100" r="85" fill="none" stroke-width="12"/>
                <circle class="nf-gauge-fill" id="nfGaugeFill" cx="100" cy="100" r="85" fill="none" stroke-width="12" 
                        stroke-dasharray="534" stroke-dashoffset="534"/>
              </svg>
              <div class="nf-gauge-center">
                <div class="nf-gauge-title">Feedback Rate</div>
                <div class="nf-score" id="recordingFeedbackValue">0</div>
              </div>
            </div>
            
          </div>
          
          <!-- Center Panel: Visual Feedback -->
          <div class="nf-panel nf-visual-panel">
            <div class="nf-panel-header">
              <h3>Visual Feedback</h3>
              <div class="nf-feedback-value-badge" id="recordingFeedbackImageValue">0.00</div>
            </div>
            <div class="nf-visual-container" id="recordingFeedbackVisualContainer">
              <img id="recordingFeedbackImage" src="assets/images/feedback-placeholder.jpg" alt="Feedback">
              <div id="recordingFeedbackLamp" style="display: none; width: 100%; height: 100%;"></div>
              <div id="recordingFeedbackBlueDot" style="display: none; width: 100%; height: 100%;"></div>
              <video id="recordingFeedbackVideo" style="display: none; width: 100%; height: 100%; object-fit: cover;" loop muted autoplay>
                <source src="../../assets/131403-750559764_medium.mp4" type="video/mp4">
              </video>
            </div>
          </div>
          
          <!-- Right Panel: Band Amplitudes -->
          <div class="nf-panel nf-bands-panel">
            <div class="nf-panel-header">
              <h3>Frequency Bands</h3>
              <span class="nf-unit-label">Amplitude (µV)</span>
            </div>
            <div class="nf-bands-container" id="recordingFeatureChartsContainer">
              <!-- Band charts will be dynamically injected -->
            </div>
          </div>
          
          <!-- Bottom Panel: EEG Channels -->
          <div class="nf-panel nf-eeg-panel">
            <div class="nf-panel-header">
              <h3>EEG Signal</h3>
              <div class="nf-channel-indicators">
                <span class="nf-channel-badge ch1" id="channel1Status">CH1</span>
              </div>
            </div>
            <div class="nf-eeg-grid" style="grid-template-columns: repeat(1, 1fr)">
              <div class="nf-eeg-channel">
                <div class="nf-eeg-plot" id="plotChannel1">
                  <div class="nf-eeg-label">CH1</div>
                </div>
              </div>
            </div>
          </div>
          
        </div>
      </div>
    `;
  }

  async show(patient) {
    if (!patient) return;
    this.patient = patient;

    const container = document.getElementById(this.containerId);
    if (!container) return;

    const stepContent = container.querySelector(".session-step-content");
    stepContent?.querySelectorAll("h2, p").forEach(el => el.style.display = "none");

    let panel = document.getElementById("sessionRecordingPanel");
    const isPanelExisting = !!panel;
    
    if (!panel) {
      const panelHTML = this.createRecordingPanelHTML();
      stepContent ? stepContent.insertAdjacentHTML("beforeend", panelHTML) : container.innerHTML = panelHTML;
      panel = document.getElementById("sessionRecordingPanel");
      if (typeof lucide !== "undefined" && lucide.createIcons) lucide.createIcons();
      this.initializeEventListeners();
    } else {
      // Panel already exists, make sure it's visible
      panel.style.display = "block";
    }

    // Always initialize charts, even if panel exists (in case it was hidden)
    // Use setTimeout to ensure DOM is ready, but check multiple times in case DOM isn't ready yet
    let initAttempts = 0;
    const maxAttempts = 10;
    const initInterval = setInterval(() => {
      initAttempts++;
      const container1 = document.getElementById('plotChannel1');
      if (container1 || initAttempts >= maxAttempts) {
        clearInterval(initInterval);
        if (container1) {
          this.initializeCharts();
        } else {
          console.warn('[SessionRecordingPanel] Could not find plot containers after', initAttempts, 'attempts');
        }
      }
    }, 50);
    
    // Only start recording if no session is already active
    // Check if session is active by checking sessionId and WebSocket connection
    const isSessionActive = this.sessionId !== null && 
                           window.websocket?.isConnected && 
                           window.websocket?.isLiveSessionActive;
    
    if (!isSessionActive) {
      await this.startRecording();
    } else {
      // Session is already active, just restore the display
      // Update session details if needed
      const preparationPanel = window.uiState?.sessionPreparationPanel;
      const planningPanel = window.uiState?.sessionPlanningPanel;
      
      if (preparationPanel && planningPanel) {
        this.sessionNumber = planningPanel.currentSessionInfo?.sessionNumber || 0;
        this.protocol = planningPanel.currentSessionInfo?.protocol || null;
        const settings = preparationPanel.getSessionSettings();
        
        const details = document.getElementById("recordingSessionDetails");
        if (details) {
          // Round number will be updated when round_start message is received
          details.innerHTML = `
            <span class="nf-meta-item"><strong>Patient:</strong> ${this.patient.first_name} ${this.patient.last_name}</span>
            <span class="nf-meta-item"><strong>Protocol:</strong> ${this.protocol?.name || this.protocol?.protocol_type || "TBR"}</span>
            <span class="nf-meta-item"><strong>Session:</strong> #${this.sessionNumber}</span>
            <span class="nf-meta-item"><strong>Round:</strong> - / ${settings.session_rounds}</span>
          `;
        }
      }
      
      // Restore timer display if timer is running
      if (this.timerInterval) {
        // Timer is already running, just make sure display is updated
        const timerDisplay = document.getElementById("recordingSessionTimer");
        if (timerDisplay && this.accumulatedTime !== undefined) {
          const currentIntervalTime = Math.floor((Date.now() - this.intervalStartTime) / 1000);
          const totalTime = this.accumulatedTime + currentIntervalTime;
          const minutes = Math.floor(totalTime / 60);
          const seconds = totalTime % 60;
          timerDisplay.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
        }
      }
      
      // Restore button states
      if (this.isPaused) {
        document.getElementById("recordingPauseSessionBtn")?.style.setProperty('display', 'none');
        document.getElementById("recordingResumeSessionBtn")?.style.setProperty('display', 'block');
      } else {
        document.getElementById("recordingPauseSessionBtn")?.style.setProperty('display', 'block');
        document.getElementById("recordingResumeSessionBtn")?.style.setProperty('display', 'none');
      }
    }
  }

  initializeCharts() {
    // Initialize simple canvas-based plots for EEG data
    this.createSimpleEEGPlots();
  }
  
  /**
   * Configure y-axis limits for EEG plots
   * @param {Object} config - Configuration object
   * @param {boolean} config.adaptive - If true, auto-scale based on data (default: true)
   * @param {number} config.fixedMin - Fixed minimum y-axis value (only used if adaptive: false)
   * @param {number} config.fixedMax - Fixed maximum y-axis value (only used if adaptive: false)
   * @param {number} config.paddingPercent - Padding percentage for adaptive scaling (default: 20)
   * 
   * Examples:
   *   // Use adaptive scaling with 30% padding
   *   panel.setYAxisLimits({ adaptive: true, paddingPercent: 30 });
   * 
   *   // Use fixed limits from -100 to 100
   *   panel.setYAxisLimits({ adaptive: false, fixedMin: -100, fixedMax: 100 });
   */
  setYAxisLimits(config) {
    if (config.adaptive !== undefined) {
      this.yAxisConfig.adaptive = config.adaptive;
    }
    if (config.fixedMin !== undefined) {
      this.yAxisConfig.fixedMin = config.fixedMin;
    }
    if (config.fixedMax !== undefined) {
      this.yAxisConfig.fixedMax = config.fixedMax;
    }
    if (config.paddingPercent !== undefined) {
      this.yAxisConfig.paddingPercent = config.paddingPercent;
    }
  }
  
  createSimpleEEGPlots() {
    const channels = ['Channel1'];
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const channelColors = isDark ? ['#60a5fa'] : ['#2563eb'];

    if (!this.plotData) this.plotData = {};
    if (!this._resizeObservers) this._resizeObservers = {};

    let plotsCreated = 0;
    channels.forEach((channel, chIndex) => {
      const containerId = `plot${channel}`;
      const container = document.getElementById(containerId);
      if (!container) return;

      // Preserve the overlay label if present
      const existingLabel = container.querySelector('.nf-eeg-label');
      container.innerHTML = '';
      if (existingLabel) container.appendChild(existingLabel);

      const canvas = document.createElement('canvas');
      canvas.id = `simplePlot${channel}`;
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      container.appendChild(canvas);

      const dpr = window.devicePixelRatio || 1;
      const w = container.clientWidth  || 300;
      const h = container.clientHeight || 180;
      canvas.width  = w * dpr;
      canvas.height = h * dpr;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);

      this.plotData[channel] = {
        canvas, ctx,
        values: [],
        color: channelColors[chIndex],
        dpr,
        lastUpdate: Date.now()
      };

      // Disconnect any previous observer for this channel
      if (this._resizeObservers[channel]) {
        this._resizeObservers[channel].disconnect();
      }

      // Resize + redraw whenever the container grows/shrinks (e.g. when CH1 fills full width)
      const ro = new ResizeObserver(() => {
        const info = this.plotData[channel];
        if (!info) return;
        const dpr = window.devicePixelRatio || 1;
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (!w || !h) return;
        const c = info.canvas;
        c.width  = w * dpr;
        c.height = h * dpr;
        const ctx2 = c.getContext('2d');
        ctx2.scale(dpr, dpr);
        info.ctx = ctx2;
        info.dpr = dpr;
        // Redraw with current values if we have any
        if (info.values.length > 0) {
          const sampleRate = this.sampleRate || 250;
          const vals = info.values;
          let minVal = vals[0], maxVal = vals[0];
          for (const v of vals) { if (v < minVal) minVal = v; if (v > maxVal) maxVal = v; }
          const range = maxVal - minVal;
          if (range > 0.001) {
            const pad = range * (this.yAxisConfig?.paddingPercent ?? 20) / 100;
            minVal -= pad; maxVal += pad;
          } else {
            const mid = (minVal + maxVal) / 2;
            minVal = mid - Math.max(1, Math.abs(mid) * 0.1);
            maxVal = mid + Math.max(1, Math.abs(mid) * 0.1);
          }
          this.drawEEGPlot(ctx2, vals, w * dpr, h * dpr, minVal, maxVal, info.color, sampleRate);
        }
      });
      ro.observe(container);
      this._resizeObservers[channel] = ro;

      plotsCreated++;
    });

    this.plotsInitialized = plotsCreated > 0;

    if (this.pendingPlotData.length > 0 && this.plotsInitialized) {
      this.pendingPlotData.forEach(data => this.updateEEGPlot(data));
      this.pendingPlotData = [];
    }
  }
  
  updateEEGPlot(channelData) {
    if (!channelData) {
      console.warn('[SessionRecordingPanel] No channel data provided to updateEEGPlot');
      return;
    }
    
    if (!Array.isArray(channelData)) {
      console.warn('[SessionRecordingPanel] Channel data is not an array:', typeof channelData);
      return;
    }
    
    // Start timer on first EEG data (when data starts streaming)
    if (!this.timerStarted && !this.isPaused && channelData.length > 0 && channelData[0]?.length > 0) {
      this.timerStarted = true;
      this.startTimer();
      const statusText = document.getElementById('recordingStatusText');
      if (statusText) {
        statusText.textContent = 'Data Streaming';
      }
    }
    
    // If plots aren't initialized yet, queue the data
    if (!this.plotsInitialized || !this.plotData || Object.keys(this.plotData).length === 0) {
      console.log('[SessionRecordingPanel] Plots not ready, queuing data. Queue length:', this.pendingPlotData.length);
      this.pendingPlotData.push(channelData);
      // Try to initialize plots if containers exist
      if (document.getElementById('plotChannel1')) {
        this.createSimpleEEGPlots();
      }
      return;
    }
    
    // Show the latest 5 seconds of flowing EEG data.
    // The new backend sends a full display window, not only a tiny incremental chunk.
    // Therefore we replace the stored values with the latest backend window instead
    // of appending the full window again and duplicating samples.
    const sampleRate = this.sampleRate || 250;
    const displayWindowSeconds = 5;
    const samplesToShow = sampleRate * displayWindowSeconds;
    
    // channelData should be an array where each element is an array of values for one channel
    // Format: [[ch1_val1, ch1_val2, ...]] — always a single channel (CH1)
    const channels = ['Channel1'];

    console.log('[SessionRecordingPanel] Updating EEG plots, channelData length:', channelData.length, 'first channel samples:', channelData[0]?.length);

    for (let chIdx = 0; chIdx < Math.min(channelData.length, channels.length); chIdx++) {
      const channelName = channels[chIdx];
      const channelValues = channelData[chIdx];
      
      if (!channelValues || !Array.isArray(channelValues)) {
        console.warn(`[SessionRecordingPanel] Channel ${chIdx} data invalid:`, typeof channelValues, channelValues);
        continue;
      }
      
      if (channelValues.length === 0) {
        console.warn(`[SessionRecordingPanel] Channel ${chIdx} has no data`);
        continue;
      }
      
      if (!this.plotData || !this.plotData[channelName]) {
        console.warn(`[SessionRecordingPanel] Plot data for ${channelName} not found, available plots:`, Object.keys(this.plotData || {}));
        continue;
      }
      
      // Update the plot data for this channel
      const plotInfo = this.plotData[channelName];
      const { canvas, ctx, values, color } = plotInfo;
      
      if (!ctx) continue;
      
      // Replace with the latest backend display window. The backend already maintains
      // a 5-second rolling display buffer, so appending this full window would duplicate
      // samples and create the old jumpy/non-flowing plot behavior.
      values.length = 0;
      const latestValues = channelValues.slice(-samplesToShow);
      for (let i = 0; i < latestValues.length; i++) {
        values.push(latestValues[i]);
      }
      
      // Calculate y-axis limits based on configuration
      if (values.length > 0) {
        let minVal, maxVal;
        
        if (!this.yAxisConfig.adaptive && this.yAxisConfig.fixedMin !== null && this.yAxisConfig.fixedMax !== null) {
          // Use fixed y-axis limits
          minVal = this.yAxisConfig.fixedMin;
          maxVal = this.yAxisConfig.fixedMax;
        } else {
          // Adaptive scaling: find min and max in the current data
          minVal = values[0];
          maxVal = values[0];
          for (let i = 0; i < values.length; i++) {
            if (values[i] < minVal) minVal = values[i];
            if (values[i] > maxVal) maxVal = values[i];
          }
          
          // Calculate range and add padding
          const range = maxVal - minVal;
          
          // If range is very small or zero, use a default scale around the mean
          // Check for very small ranges (microvolts scale) and amplify them for visibility
          if (range < 0.001 || maxVal === minVal) {
            const mean = (maxVal + minVal) / 2;
            const absMean = Math.abs(mean);
            
            // For microvolts-scale data (very small values), use a larger default range
            if (absMean < 0.01) {
              // Data is in microvolts scale, use a range that makes it visible
              const defaultRange = Math.max(0.05, absMean * 10 || 0.05);
              minVal = mean - defaultRange;
              maxVal = mean + defaultRange;
            } else {
              // For larger values, use percentage-based range
              const defaultRange = Math.max(0.1, absMean * 0.5 || 0.1);
              minVal = mean - defaultRange;
              maxVal = mean + defaultRange;
            }
          } else {
            // Add configurable padding on each side for better visibility of waveforms
            const padding = range * (this.yAxisConfig.paddingPercent / 100);
            minVal -= padding;
            maxVal += padding;
          }
        }
        
        // Draw the EEG data with calculated limits
        const sampleRate = this.sampleRate || 250;
        const dpr = plotInfo.dpr || window.devicePixelRatio || 1;
        this.drawEEGPlot(ctx, values, canvas.width / dpr, canvas.height / dpr, minVal, maxVal, color, sampleRate);
      }
    }
  }
  
  drawEEGPlot(ctx, values, width, height, minValue, maxValue, color = '#60a5fa', sampleRate = 250) {
    if (!ctx || values.length === 0) return;

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    // When an artifact is active, render the signal in red instead of its normal colour.
    const artifactActive = !!(this.artifactState && this.artifactState.active);
    if (artifactActive) color = '#ef4444';

    // Layout: small left margin for y-axis labels, minimal elsewhere
    const marginLeft   = 36;
    const marginRight  = 4;
    const marginTop    = 4;
    const marginBottom = 4;
    const plotX      = marginLeft;
    const plotY      = marginTop;
    const plotWidth  = width  - marginLeft - marginRight;
    const plotHeight = height - marginTop  - marginBottom;

    // Background (red-tinted while an artifact is detected)
    ctx.clearRect(0, 0, width, height);
    if (artifactActive) {
      ctx.fillStyle = isDark ? '#2a0e12' : '#fee2e2';
    } else {
      ctx.fillStyle = isDark ? '#0d1424' : '#f8fafc';
    }
    ctx.fillRect(0, 0, width, height);

    const valueRange = maxValue - minValue;
    if (valueRange < 0.001) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(plotX, plotY + plotHeight / 2);
      ctx.lineTo(plotX + plotWidth, plotY + plotHeight / 2);
      ctx.stroke();
      return;
    }

    const yScale  = plotHeight / valueRange;
    const yOffset = -minValue * yScale;
    const xScale  = plotWidth / Math.max(1, values.length - 1);

    // Grid lines at 0%, 25%, 50%, 75%, 100% (horizontal reference lines)
    const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)';
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    [0, 0.25, 0.5, 0.75, 1].forEach(frac => {
      const gy = plotY + plotHeight * frac;
      ctx.beginPath();
      ctx.moveTo(plotX, gy);
      ctx.lineTo(plotX + plotWidth, gy);
      ctx.stroke();
    });

    // Zero reference line — only if zero is within the visible range
    if (minValue < 0 && maxValue > 0) {
      const zeroY = plotY + plotHeight - (0 * yScale + yOffset);
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 0.75;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(plotX, zeroY);
      ctx.lineTo(plotX + plotWidth, zeroY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Y-axis labels: max at top, min at bottom, mid in center
    const labelColor = isDark ? 'rgba(148,163,184,0.9)' : 'rgba(71,85,105,0.9)';
    ctx.font = '9px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillStyle = labelColor;
    ctx.textAlign = 'right';

    const formatVal = v => {
      const abs = Math.abs(v);
      if (abs >= 1000) return (v / 1000).toFixed(1) + 'k';
      if (abs >= 10)   return v.toFixed(0);
      if (abs >= 1)    return v.toFixed(1);
      return v.toFixed(2);
    };

    // Top label (max)
    ctx.textBaseline = 'top';
    ctx.fillText(formatVal(maxValue), marginLeft - 4, plotY + 1);
    // Bottom label (min)
    ctx.textBaseline = 'bottom';
    ctx.fillText(formatVal(minValue), marginLeft - 4, plotY + plotHeight - 1);
    // Mid label
    ctx.textBaseline = 'middle';
    ctx.fillText(formatVal((maxValue + minValue) / 2), marginLeft - 4, plotY + plotHeight / 2);

    // Y-axis tick marks
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 0.5;
    [0, 0.5, 1].forEach(frac => {
      const gy = plotY + plotHeight * frac;
      ctx.beginPath();
      ctx.moveTo(plotX - 3, gy);
      ctx.lineTo(plotX, gy);
      ctx.stroke();
    });

    // Y-axis border line
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(plotX, plotY);
    ctx.lineTo(plotX, plotY + plotHeight);
    ctx.stroke();

    // Build waveform points
    const pts = [];
    for (let i = 0; i < values.length; i++) {
      pts.push({
        x: plotX + i * xScale,
        y: plotY + plotHeight - (values[i] * yScale + yOffset)
      });
    }

    // Waveform line — clean, no glow
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();

    // Artifact label overlay — a red pill near the top of the plot
    if (artifactActive) {
      const label = (this.artifactState.message || 'Artifact detected').toUpperCase();
      ctx.save();
      ctx.font = '700 10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(label).width;
      const padX = 8;
      const bandH = 18;
      const bandW = Math.min(plotWidth - 4, tw + padX * 2);
      const cx = plotX + plotWidth / 2;
      const cy = plotY + bandH / 2 + 2;
      ctx.fillStyle = 'rgba(239, 68, 68, 0.95)';
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(cx - bandW / 2, cy - bandH / 2, bandW, bandH, 5);
        ctx.fill();
      } else {
        ctx.fillRect(cx - bandW / 2, cy - bandH / 2, bandW, bandH);
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, cx, cy);
      ctx.restore();
    }
  }

  redrawAllPlots() {
    if (!this.plotData) return;
    const sampleRate = this.sampleRate || 250;
    Object.values(this.plotData).forEach(info => {
      if (!info || !info.ctx) return;
      const { canvas, ctx, values, color } = info;
      if (!values || values.length === 0) return;

      let minVal = values[0], maxVal = values[0];
      for (const v of values) { if (v < minVal) minVal = v; if (v > maxVal) maxVal = v; }
      const range = maxVal - minVal;
      if (range < 0.001) {
        const mean = (maxVal + minVal) / 2;
        const dr = Math.max(0.05, Math.abs(mean) * 0.5 || 0.05);
        minVal = mean - dr; maxVal = mean + dr;
      } else {
        const padding = range * (this.yAxisConfig.paddingPercent / 100);
        minVal -= padding; maxVal += padding;
      }
      const dpr = info.dpr || window.devicePixelRatio || 1;
      this.drawEEGPlot(ctx, values, canvas.width / dpr, canvas.height / dpr, minVal, maxVal, color, sampleRate);
    });
  }

  drawAxisLabels() {
    // Axis labels removed — clean oscilloscope view
  }

  async startRecording() {
    const preparationPanel = window.uiState?.sessionPreparationPanel;
    const planningPanel = window.uiState?.sessionPlanningPanel;
    
    if (!preparationPanel || !planningPanel) {
      return;
    }

    this.sessionNumber = planningPanel.currentSessionInfo?.sessionNumber || 0;
    this.protocol = planningPanel.currentSessionInfo?.protocol || null;
    const settings = preparationPanel.getSessionSettings();
    this.feedbackType = settings.feedback_type || 'Image';
    this.sampleRate = settings.sample_rate || 250; // Store sample rate for plot window calculation
    
    try {
      const userId = window.neuroFeedbackApp?.getCurrentUserId?.() || localStorage.getItem('currentUserId');

      // Create session in database first
      const startTime = new Date().toISOString();
      this.sessionStartTime = startTime;
      
      const sessionData = {
        patient_id: this.patient.id,
        doctor_id: parseInt(userId),
        session_type: "training", // Explicitly set session type
        protocol_type: this.protocol?.protocol_type || this.protocol?.name || "TBR",
        start_time: startTime,
        channels: JSON.stringify(settings.channels),
        sample_rate: settings.sample_rate,
        session_rounds: settings.session_rounds,
        feedback_type: this.feedbackType, // Include feedback type
        thresholds: JSON.stringify({
           threshold_percentage: settings.threshold_percentage
        })
      };

      // Create session in database
      try {
        const createdSession = await window.api.createSession(sessionData);
        if (!createdSession || !createdSession.id) {
          throw new Error('Session creation failed: No session ID returned');
        }
        this.sessionId = createdSession.id;
        console.log('Session created successfully with ID:', this.sessionId);
      } catch (error) {
        console.error('Error creating session in database:', error);
        window.ui?.showNotification?.('Failed to create session in database. Please try again.', 'error');
        throw error; // Re-throw to prevent continuing with invalid session
      }

      const sessionConfig = {
        start: true,
        patientId: this.patient.id,
        user_id: userId,
        protocol_type: this.protocol?.protocol_type || this.protocol?.name || "TBR",
        protocol_id: this.protocol?.id || null,
        channels: settings.channels,
        session_rounds: settings.session_rounds,
        session_duration: settings.session_duration,
        sample_rate: settings.sample_rate,
        default_threshold: settings.default_threshold,
        previous_threshold: settings.previous_threshold,
        threshold_feature: settings.threshold_feature,
        reward_threshold_percentage: settings.reward_threshold_percentage,
        inhibit_threshold_percentage: settings.inhibit_threshold_percentage,
        mapping: settings.mapping,
        startTime: startTime,
        sessionNumber: this.sessionNumber
      };

      setTimeout(() => {
        window.charts?.initializeEEGChart('recordingEegChart');
        window.charts?.initializeBandpowerChart('recordingBandpowerChart');
        // window.charts?.initializeFeatureAmplitudeChart('recordingFeatureAmplitudeChart');
      }, 200);

      if (window.websocket) {
        if (!window.websocket.isConnected) await window.websocket.connect();
        window.websocket.startLiveSession?.(sessionConfig);
      }

      const details = document.getElementById("recordingSessionDetails");
      if (details) {
        details.innerHTML = `
          <span class="nf-meta-item"><strong>Patient:</strong> ${this.patient.first_name} ${this.patient.last_name}</span>
          <span class="nf-meta-item"><strong>Protocol:</strong> ${this.protocol?.name || sessionConfig.protocol_type}</span>
          <span class="nf-meta-item"><strong>Session:</strong> #${this.sessionNumber}</span>
          <span class="nf-meta-item"><strong>Round:</strong> 1/${settings.session_rounds}</span>
        `;
      }

      // Reset CSV buffer and register callbacks to accumulate data rows
      this.csvRows = [];
      this._csvCurrentRound = 1;
      this.rawDataFile = null;
      const ws = window.websocket;
      if (ws) {
        // Remove any stale callbacks
        if (this._csvFeedbackCallback && ws.callbacks?.onFeedback) {
          const idx = ws.callbacks.onFeedback.indexOf(this._csvFeedbackCallback);
          if (idx > -1) ws.callbacks.onFeedback.splice(idx, 1);
        }
        if (this._csvRoundCallback && ws.callbacks?.onRoundStart) {
          const idx = ws.callbacks.onRoundStart.indexOf(this._csvRoundCallback);
          if (idx > -1) ws.callbacks.onRoundStart.splice(idx, 1);
        }
        if (this._rawFileCallback && ws.callbacks?.onRoundComplete) {
          const idx = ws.callbacks.onRoundComplete.indexOf(this._rawFileCallback);
          if (idx > -1) ws.callbacks.onRoundComplete.splice(idx, 1);
        }
        this._csvFeedbackCallback = (data) => this.recordCsvRow(data);
        this._csvRoundCallback = (data) => { this._csvCurrentRound = data.round_number ?? this._csvCurrentRound; };
        // Backend reports the filtered-EEG CSV path on each round_complete
        this._rawFileCallback = (data) => { if (data?.raw_data_file) this.rawDataFile = data.raw_data_file; };
        if (ws.callbacks?.onFeedback) ws.callbacks.onFeedback.push(this._csvFeedbackCallback);
        if (ws.callbacks?.onRoundStart) ws.callbacks.onRoundStart.push(this._csvRoundCallback);
        if (ws.callbacks?.onRoundComplete) ws.callbacks.onRoundComplete.push(this._rawFileCallback);
      }

      // Don't start timer yet - wait for data to start streaming
      // Timer will be started when first feedback message with data is received
      this.timerStarted = false;
      document.getElementById("recordingPauseSessionBtn")?.style.setProperty('display', 'block');
      document.getElementById("recordingResumeSessionBtn")?.style.setProperty('display', 'none');
      this.isPaused = false;
      await this.openFeedbackWindow(this.feedbackType);
    } catch (error) {
      console.error("Error starting session:", error);
    }
  }

  async openFeedbackWindow(feedbackType = 'Image') {
    try {
      if (!this.feedbackWindow) this.feedbackWindow = new FeedbackWindow();
      await this.feedbackWindow.open(feedbackType);
    } catch (error) {
      console.error('Error opening feedback window:', error);
    }
  }

  closeFeedbackWindow() {
    this.feedbackWindow?.close();
  }

  updateFeedbackType(newType) {
    // Update feedback type immediately
    this.feedbackType = newType || 'Image';
    
    // Update feedback window type immediately
    if (this.feedbackWindow?.isOpen && window.electronAPI?.setFeedbackType) {
      window.electronAPI.setFeedbackType(this.feedbackType);
    }
    
    // Immediately update the display with current feedback value if available
    const feedbackValueEl = document.getElementById('recordingFeedbackValue');
    const currentValue = feedbackValueEl ? parseFloat(feedbackValueEl.textContent) || 0 : 0;
    this.updateFeedbackDisplay(this.feedbackType, currentValue);
  }

  updateFeedbackDisplay(feedbackType, displayValue) {
    // Get feedback elements
    const imageEl = document.getElementById('recordingFeedbackImage');
    const lampEl = document.getElementById('recordingFeedbackLamp');
    const blueDotEl = document.getElementById('recordingFeedbackBlueDot');
    const videoEl = document.getElementById('recordingFeedbackVideo');
    
    // Hide all feedback types first
    if (imageEl) imageEl.style.display = 'none';
    if (lampEl) lampEl.style.display = 'none';
    if (blueDotEl) blueDotEl.style.display = 'none';
    if (videoEl) {
      videoEl.style.display = 'none';
      videoEl.pause();
    }
    
    // Show and update selected feedback type
    if (feedbackType === 'Lamp') {
      if (lampEl) {
        lampEl.style.display = 'block';
        this.updateLampFeedback(lampEl, displayValue);
      }
    } else if (feedbackType === 'BlueDot') {
      if (blueDotEl) {
        blueDotEl.style.display = 'flex';
        this.updateBlueDotFeedback(blueDotEl, displayValue);
      }
    } else if (feedbackType === 'Video') {
      if (videoEl) {
        videoEl.style.display = 'block';
        this.updateVideoFeedback(videoEl, displayValue);
        // Play video
        videoEl.play().catch(err => console.warn('Video play failed:', err));
      }
    } else {
      // Default: Image with blur
      if (imageEl) {
        imageEl.style.display = 'block';
        const blur = 20 * (1 - displayValue);
        imageEl.style.filter = `blur(${blur}px)`;
      }
    }
  }

  updateFeedback(value, phaseMessage = null, overallSuccessRate = null) {
    // Store the latest success rate if provided
    if (overallSuccessRate !== null && overallSuccessRate !== undefined) {
      this.latestSuccessRate = overallSuccessRate;
    }
    
    const isBaseline = phaseMessage && phaseMessage.toLowerCase().includes('baseline');
    const displayValue = isBaseline ? 0.0 : Math.max(0, Math.min(1, value));
    const percentage = Math.round(displayValue * 100);
    
    // Start timer on first feedback message (when data starts streaming)
    if (!this.timerStarted && !this.isPaused) {
      this.timerStarted = true;
      this.startTimer();
      const statusText = document.getElementById('recordingStatusText');
      if (statusText) {
        statusText.textContent = isBaseline ? 'Baseline' : 'Training';
      }
      // Show feedback speed control when session starts
      const speedControl = document.getElementById('feedbackSpeedControl');
      if (speedControl) {
        speedControl.style.display = 'flex';
      }
    }
    
    // Update visual feedback display based on current type
    this.updateFeedbackDisplay(this.feedbackType, displayValue);
    
    // Update feedback value displays
    const imageValueEl = document.getElementById('recordingFeedbackImageValue');
    const feedbackValueEl = document.getElementById('recordingFeedbackValue');
    if (imageValueEl) imageValueEl.textContent = displayValue.toFixed(2);
    if (feedbackValueEl) feedbackValueEl.textContent = percentage;
    
    // Update circular gauge
    const gaugeFill = document.getElementById('nfGaugeFill');
    if (gaugeFill) {
      // Circle circumference = 2 * PI * radius = 2 * 3.14159 * 85 ≈ 534
      const circumference = 534;
      const offset = circumference - (displayValue * circumference);
      gaugeFill.style.strokeDashoffset = offset;
      
      // Update gauge color based on performance
      if (displayValue >= 0.7) {
        gaugeFill.style.stroke = '#22c55e'; // Green
      } else if (displayValue >= 0.4) {
        gaugeFill.style.stroke = '#f59e0b'; // Orange
      } else {
        gaugeFill.style.stroke = '#ef4444'; // Red
      }
    }
    
    // Update success rate bar
    const progressFill = document.getElementById('recordingFeedbackProgress');
    const successPercent = document.getElementById('nfSuccessPercent');
    if (progressFill) {
      progressFill.style.width = `${percentage}%`;
    }
    if (successPercent) {
      successPercent.textContent = `${percentage}%`;
    }
    
    // Update status badge and phase indicator
    const statusBadge = document.getElementById('nfStatusBadge');
    const statusIndicator = document.getElementById('recordingStatusIndicator');
    const statusText = document.getElementById('recordingStatusText');
    const phaseIndicator = document.getElementById('nfPhaseIndicator');
    
    if (statusBadge && statusIndicator && statusText) {
      if (isBaseline) {
        statusBadge.className = 'nf-status-badge baseline';
        statusIndicator.className = 'nf-status-dot baseline';
        statusText.textContent = 'Baseline';
      } else {
        statusBadge.className = 'nf-status-badge training';
        statusIndicator.className = 'nf-status-dot active';
        statusText.textContent = 'Training';
      }
    }
    
    if (phaseIndicator) {
      const phaseText = phaseIndicator.querySelector('.nf-phase-text');
      const phaseDot = phaseIndicator.querySelector('.nf-phase-dot');
      if (phaseText) {
        phaseText.textContent = isBaseline ? 'Collecting Baseline...' : '';
      }
      if (phaseDot) {
        phaseDot.className = isBaseline ? 'nf-phase-dot baseline' : 'nf-phase-dot training';
      }
    }
    
    if (this.feedbackWindow?.isOpen) {
      this.feedbackWindow.updateFeedback(displayValue, phaseMessage, this.feedbackType);
    }
  }

  // updatePuzzleFeedback(puzzleContainer, value) {
  //   const imageUrl = 'assets/images/feedback-placeholder.jpg';
  //   
  //   // Create 3x3 puzzle grid if it doesn't exist
  //   if (!puzzleContainer.querySelector('.puzzle-grid')) {
  //     puzzleContainer.innerHTML = '';
  //     const grid = document.createElement('div');
  //     grid.className = 'puzzle-grid';
  //     grid.style.display = 'grid';
  //     grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
  //     grid.style.width = '100%';
  //     grid.style.height = '100%';
  //     grid.style.padding = '20px';
  //     grid.style.backgroundColor = 'transparent';
  //     
  //     // Create 9 puzzle pieces with image slices
  //     for (let row = 0; row < 3; row++) {
  //       for (let col = 0; col < 3; col++) {
  //         const piece = document.createElement('div');
  //         piece.className = 'puzzle-piece';
  //         piece.dataset.index = row * 3 + col;
  //         piece.style.backgroundImage = `url(${imageUrl})`;
  //         piece.style.backgroundSize = '300% 300%'; // Image is 3x larger to show 3x3 grid
  //         // Calculate position: each column/row is 33.33% of the 300% image
  //         // So we need to shift by col * 33.33% and row * 33.33%
  //         const xPos = (col / 2) * 100; // 0%, 50%, 100% for cols 0, 1, 2
  //         const yPos = (row / 2) * 100; // 0%, 50%, 100% for rows 0, 1, 2
  //         piece.style.backgroundPosition = `${xPos}% ${yPos}%`;
  //         piece.style.backgroundRepeat = 'no-repeat';
  //         piece.style.aspectRatio = '1';
  //         piece.style.transition = 'all 0.3s ease';
  //         piece.style.border = '2px solid rgba(255, 255, 255, 0.3)';
  //         piece.style.borderRadius = '8px';
  //         piece.style.overflow = 'hidden';
  //         piece.style.backgroundColor = 'transparent';
  //         grid.appendChild(piece);
  //       }
  //     }
  //     
  //     puzzleContainer.appendChild(grid);
  //   }
  //   
  //   const grid = puzzleContainer.querySelector('.puzzle-grid');
  //   const pieces = puzzleContainer.querySelectorAll('.puzzle-piece');
  //   
  //   // Adjust gap based on feedback value
  //   // High feedback (close to 1) = small gap (connected)
  //   // Low feedback (close to 0) = large gap (separated)
  //   const minGap = 2; // Connected pieces
  //   const maxGap = 20; // Separated pieces
  //   const gap = maxGap - (value * (maxGap - minGap));
  //   
  //   if (grid) {
  //     grid.style.gap = `${gap}px`;
  //   }
  //   
  //   // Add shadow/blur effect when separated
  //   pieces.forEach((piece) => {
  //     if (value < 0.5) {
  //       // Separate pieces - add shadow and slight blur
  //       piece.style.filter = `blur(${(1 - value) * 3}px)`;
  //       piece.style.boxShadow = `0 0 ${(1 - value) * 15}px rgba(0, 0, 0, 0.5)`;
  //       piece.style.opacity = 0.7 + (value * 0.3);
  //     } else {
  //       // Connect pieces - clear and bright
  //       piece.style.filter = 'none';
  //       piece.style.boxShadow = 'none';
  //       piece.style.opacity = '1';
  //     }
  //   });
  // }

  updateLampFeedback(lampContainer, value) {
    // Create lamp if it doesn't exist
    if (!lampContainer.querySelector('.lamp-container')) {
      lampContainer.innerHTML = '';
      lampContainer.style.backgroundColor = '#0a0a0a'; // Very dark background
      lampContainer.style.position = 'relative';
      lampContainer.style.overflow = 'hidden';
      
      // Ambient light background
      const ambientLight = document.createElement('div');
      ambientLight.className = 'lamp-ambient-light';
      ambientLight.style.position = 'absolute';
      ambientLight.style.top = '0';
      ambientLight.style.left = '0';
      ambientLight.style.width = '100%';
      ambientLight.style.height = '100%';
      ambientLight.style.background = 'radial-gradient(circle at center, rgba(255, 200, 100, 0) 0%, rgba(0, 0, 0, 0.8) 70%)';
      ambientLight.style.transition = 'opacity 0.4s ease';
      ambientLight.style.pointerEvents = 'none';
      
      const lampDiv = document.createElement('div');
      lampDiv.className = 'lamp-container';
      lampDiv.style.display = 'flex';
      lampDiv.style.flexDirection = 'column';
      lampDiv.style.alignItems = 'center';
      lampDiv.style.justifyContent = 'center';
      lampDiv.style.width = '100%';
      lampDiv.style.height = '100%';
      lampDiv.style.padding = '40px';
      lampDiv.style.position = 'relative';
      lampDiv.style.zIndex = '1';
      
      // Lamp base
      const lampBase = document.createElement('div');
      lampBase.className = 'lamp-base';
      lampBase.style.width = '100px';
      lampBase.style.height = '30px';
      lampBase.style.backgroundColor = '#1a1a1a';
      lampBase.style.borderRadius = '8px';
      lampBase.style.marginBottom = '0';
      lampBase.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.5)';
      lampBase.style.position = 'relative';
      lampBase.style.zIndex = '3';
      
      // Lamp stand
      const lampStand = document.createElement('div');
      lampStand.className = 'lamp-stand';
      lampStand.style.width = '8px';
      lampStand.style.height = '120px';
      lampStand.style.backgroundColor = '#2a2a2a';
      lampStand.style.marginBottom = '0';
      lampStand.style.position = 'relative';
      lampStand.style.zIndex = '2';
      lampStand.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.5)';
      
      // Socket
      const socket = document.createElement('div');
      socket.className = 'lamp-socket';
      socket.style.width = '50px';
      socket.style.height = '25px';
      socket.style.backgroundColor = '#1a1a1a';
      socket.style.borderRadius = '12px 12px 4px 4px';
      socket.style.marginBottom = '0';
      socket.style.position = 'relative';
      socket.style.zIndex = '2';
      socket.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.5)';
      
      // Bulb container with glow
      const bulbContainer = document.createElement('div');
      bulbContainer.className = 'lamp-bulb-container';
      bulbContainer.style.position = 'relative';
      bulbContainer.style.width = '140px';
      bulbContainer.style.height = '140px';
      bulbContainer.style.display = 'flex';
      bulbContainer.style.alignItems = 'center';
      bulbContainer.style.justifyContent = 'center';
      bulbContainer.style.marginBottom = '0';
      bulbContainer.style.zIndex = '2';
      
      // Bulb glow (outer)
      const bulbGlow = document.createElement('div');
      bulbGlow.className = 'lamp-bulb-glow';
      bulbGlow.style.position = 'absolute';
      bulbGlow.style.width = '140px';
      bulbGlow.style.height = '140px';
      bulbGlow.style.borderRadius = '50%';
      bulbGlow.style.transition = 'all 0.4s ease';
      bulbGlow.style.pointerEvents = 'none';
      
      // Bulb
      const lampBulb = document.createElement('div');
      lampBulb.className = 'lamp-bulb';
      lampBulb.style.width = '120px';
      lampBulb.style.height = '120px';
      lampBulb.style.borderRadius = '50%';
      lampBulb.style.backgroundColor = '#1a1a1a';
      lampBulb.style.transition = 'all 0.4s ease';
      lampBulb.style.position = 'relative';
      lampBulb.style.overflow = 'hidden';
      lampBulb.style.border = '2px solid rgba(100, 100, 100, 0.3)';
      
      // Filament
      const filament = document.createElement('div');
      filament.className = 'lamp-filament';
      filament.style.position = 'absolute';
      filament.style.top = '50%';
      filament.style.left = '50%';
      filament.style.transform = 'translate(-50%, -50%)';
      filament.style.width = '4px';
      filament.style.height = '30px';
      filament.style.backgroundColor = '#ffaa00';
      filament.style.borderRadius = '2px';
      filament.style.transition = 'all 0.4s ease';
      filament.style.opacity = '0';
      filament.style.boxShadow = '0 0 8px rgba(255, 200, 100, 0)';
      
      // Lampshade
      const lampshade = document.createElement('div');
      lampshade.className = 'lamp-shade';
      lampshade.style.width = '180px';
      lampshade.style.height = '80px';
      lampshade.style.backgroundColor = '#2a2a2a';
      lampshade.style.borderRadius = '90px 90px 20px 20px';
      lampshade.style.marginTop = '-20px';
      lampshade.style.position = 'relative';
      lampshade.style.zIndex = '1';
      lampshade.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.6)';
      lampshade.style.border = '1px solid rgba(100, 100, 100, 0.2)';
      
      // Shade inner glow
      const shadeGlow = document.createElement('div');
      shadeGlow.className = 'lamp-shade-glow';
      shadeGlow.style.position = 'absolute';
      shadeGlow.style.top = '0';
      shadeGlow.style.left = '50%';
      shadeGlow.style.transform = 'translateX(-50%)';
      shadeGlow.style.width = '100%';
      shadeGlow.style.height = '40px';
      shadeGlow.style.borderRadius = '90px 90px 0 0';
      shadeGlow.style.transition = 'all 0.4s ease';
      shadeGlow.style.pointerEvents = 'none';
      
      bulbContainer.appendChild(bulbGlow);
      bulbContainer.appendChild(lampBulb);
      lampBulb.appendChild(filament);
      lampshade.appendChild(shadeGlow);
      
      lampDiv.appendChild(lampBase);
      lampDiv.appendChild(lampStand);
      lampDiv.appendChild(socket);
      lampDiv.appendChild(bulbContainer);
      lampDiv.appendChild(lampshade);
      
      lampContainer.appendChild(ambientLight);
      lampContainer.appendChild(lampDiv);
    }
    
    const brightness = Math.max(0, Math.min(1, value));
    
    // Update ambient light
    const ambientLight = lampContainer.querySelector('.lamp-ambient-light');
    if (ambientLight) {
      const ambientIntensity = brightness * 0.3;
      const ambientColor = brightness < 0.3 
        ? `rgba(255, 150, 50, ${ambientIntensity})` 
        : brightness < 0.7 
        ? `rgba(255, 200, 120, ${ambientIntensity})` 
        : `rgba(255, 240, 200, ${ambientIntensity})`;
      ambientLight.style.background = `radial-gradient(circle at center, ${ambientColor} 0%, rgba(0, 0, 0, ${0.8 - brightness * 0.3}) 70%)`;
    }
    
    // Update bulb glow
    const bulbGlow = lampContainer.querySelector('.lamp-bulb-glow');
    if (bulbGlow) {
      const glowSize = 80 + (brightness * 120);
      const glowIntensity = brightness * 0.6;
      // Color temperature: warm orange when dim, bright white when bright
      const glowColor = brightness < 0.3 
        ? `rgba(255, 150, 50, ${glowIntensity})` 
        : brightness < 0.7 
        ? `rgba(255, 200, 120, ${glowIntensity})` 
        : `rgba(255, 240, 200, ${glowIntensity})`;
      bulbGlow.style.boxShadow = `0 0 ${glowSize}px ${glowColor}, 0 0 ${glowSize * 1.5}px ${glowColor}`;
      bulbGlow.style.opacity = brightness > 0.1 ? '1' : '0';
    }
    
    // Update bulb
    const bulb = lampContainer.querySelector('.lamp-bulb');
    if (bulb) {
      const bulbBrightness = brightness;
      // Color temperature gradient
      const bulbColor = brightness < 0.3 
        ? `rgba(255, 150, 50, ${bulbBrightness * 0.7})` 
        : brightness < 0.7 
        ? `rgba(255, 200, 120, ${bulbBrightness * 0.8})` 
        : `rgba(255, 240, 220, ${bulbBrightness * 0.9})`;
      
      bulb.style.backgroundColor = bulbColor;
      bulb.style.boxShadow = `inset 0 0 ${30 + brightness * 40}px rgba(255, 200, 100, ${brightness * 0.5}), 0 0 ${20 + brightness * 30}px rgba(255, 200, 100, ${brightness * 0.3})`;
      bulb.style.borderColor = brightness > 0.1 ? `rgba(200, 150, 100, ${brightness * 0.5})` : 'rgba(100, 100, 100, 0.3)';
    }
    
    // Update filament
    const filament = lampContainer.querySelector('.lamp-filament');
    if (filament) {
      const filamentBrightness = brightness;
      filament.style.opacity = filamentBrightness > 0.05 ? String(filamentBrightness) : '0';
      const filamentColor = brightness < 0.5 
        ? `rgba(255, 150, 50, ${filamentBrightness})` 
        : `rgba(255, 220, 150, ${filamentBrightness})`;
      filament.style.backgroundColor = filamentColor;
      filament.style.boxShadow = `0 0 ${8 + brightness * 12}px ${filamentColor}, 0 0 ${4 + brightness * 6}px rgba(255, 200, 100, ${filamentBrightness * 0.8})`;
    }
    
    // Update lampshade glow
    const shadeGlow = lampContainer.querySelector('.lamp-shade-glow');
    if (shadeGlow) {
      const shadeIntensity = brightness * 0.4;
      const shadeColor = brightness < 0.3 
        ? `rgba(255, 150, 50, ${shadeIntensity})` 
        : brightness < 0.7 
        ? `rgba(255, 200, 120, ${shadeIntensity})` 
        : `rgba(255, 240, 200, ${shadeIntensity})`;
      shadeGlow.style.background = `radial-gradient(ellipse at center, ${shadeColor} 0%, transparent 100%)`;
      shadeGlow.style.opacity = brightness > 0.1 ? '1' : '0';
    }
    
    // Update lampshade itself (subtle glow from inside)
    const lampshade = lampContainer.querySelector('.lamp-shade');
    if (lampshade && brightness > 0.1) {
      const shadeGlowColor = brightness < 0.5 
        ? `rgba(255, 150, 50, ${brightness * 0.15})` 
        : `rgba(255, 220, 150, ${brightness * 0.2})`;
      lampshade.style.boxShadow = `0 8px 16px rgba(0, 0, 0, 0.6), inset 0 -20px 40px ${shadeGlowColor}`;
    } else if (lampshade) {
      lampshade.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.6)';
    }
  }

  updateBlueDotFeedback(blueDotContainer, value) {
    // Bigger dot = better performance (reversed from before)
    // Value ranges from 0 (poor) to 1 (best)
    // Size ranges from minSize (poor) to maxSize (best)
    const minSize = 40; // Small dot when performance is poor
    const maxSize = 250; // Big dot when performance is excellent
    const size = minSize + value * (maxSize - minSize);
    
    // Create blue dot if it doesn't exist
    let blueDot = blueDotContainer.querySelector('.blue-dot');
    let particlesContainer = blueDotContainer.querySelector('.blue-dot-particles');
    
    if (!blueDot) {
      blueDotContainer.innerHTML = '';
      blueDotContainer.style.display = 'flex';
      blueDotContainer.style.justifyContent = 'center';
      blueDotContainer.style.alignItems = 'center';
      blueDotContainer.style.backgroundColor = 'transparent';
      blueDotContainer.style.position = 'relative';
      blueDotContainer.style.overflow = 'hidden';
      
      // Create particles container
      particlesContainer = document.createElement('div');
      particlesContainer.className = 'blue-dot-particles';
      particlesContainer.style.position = 'absolute';
      particlesContainer.style.width = '100%';
      particlesContainer.style.height = '100%';
      particlesContainer.style.pointerEvents = 'none';
      blueDotContainer.appendChild(particlesContainer);
      
      // Create blue dot
      blueDot = document.createElement('div');
      blueDot.className = 'blue-dot';
      blueDot.style.width = `${size}px`;
      blueDot.style.height = `${size}px`;
      blueDot.style.borderRadius = '50%';
      blueDot.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
      blueDot.style.position = 'relative';
      blueDot.style.animation = 'pulse 2s ease-in-out infinite';
      
      // Add pulse animation if not already in stylesheet
      if (!document.getElementById('blue-dot-pulse-style')) {
        const style = document.createElement('style');
        style.id = 'blue-dot-pulse-style';
        style.textContent = `
          @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
          }
          @keyframes ripple {
            0% { transform: scale(1); opacity: 1; }
            100% { transform: scale(2); opacity: 0; }
          }
          .blue-dot-ring {
            position: absolute;
            border-radius: 50%;
            border: 2px solid rgba(59, 130, 246, 0.5);
            pointer-events: none;
            animation: ripple 2s ease-out infinite;
          }
          .blue-dot-particle {
            position: absolute;
            width: 4px;
            height: 4px;
            border-radius: 50%;
            background-color: rgba(59, 130, 246, 0.8);
            pointer-events: none;
          }
        `;
        document.head.appendChild(style);
      }
      
      blueDotContainer.appendChild(blueDot);
    }
    
    // Update size
    blueDot.style.width = `${size}px`;
    blueDot.style.height = `${size}px`;
    
    // Color gradient changes - brighter/more cyan when better
    const brightness = 0.5 + value * 0.5;
    const hueShift = value * 30; // Shift towards cyan when better
    const baseColor = `hsl(${210 + hueShift}, 70%, ${50 + brightness * 20}%)`;
    const highlightColor = `rgba(255, 255, 255, ${0.3 + value * 0.5})`;
    blueDot.style.background = `radial-gradient(circle at 30% 30%, ${highlightColor}, ${baseColor})`;
    
    // Dynamic glow intensity - stronger when better
    const glowIntensity = 0.4 + value * 0.6;
    const glowSize = size * (0.4 + value * 0.3);
    blueDot.style.boxShadow = `
      0 0 ${glowSize}px rgba(59, 130, 246, ${glowIntensity}),
      0 0 ${glowSize * 1.5}px rgba(59, 130, 246, ${glowIntensity * 0.7}),
      0 0 ${glowSize * 2.5}px rgba(100, 200, 255, ${glowIntensity * 0.4})
    `;
    
    // Pulsing animation speed - faster when better
    const pulseSpeed = 2 - (value * 1.5); // Faster pulse when better
    blueDot.style.animationDuration = `${pulseSpeed}s`;
    
    // Add ripple rings when performance is good
    if (value > 0.6) {
      this.createRippleRing(blueDotContainer, blueDot, size, value);
    }
    
    // Create particles when performance is excellent
    if (value > 0.8 && particlesContainer) {
      this.createParticles(particlesContainer, size, value);
    }
  }

  updateVideoFeedback(videoElement, value) {
    // Scale video from 0% (small) to 100% (full) based on feedback value
    // Value ranges from 0 (poor) to 1 (best)
    // Scale ranges from 0.1 (10% - small) to 1.0 (100% - full)
    const minScale = 0.1; // 10% when feedback is 0
    const maxScale = 1.0; // 100% when feedback is 1
    const scale = minScale + value * (maxScale - minScale);
    
    // Apply transform scale
    videoElement.style.transform = `scale(${scale})`;
    videoElement.style.transformOrigin = 'center center';
    videoElement.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
    videoElement.style.opacity = 0.5 + value * 0.5; // Fade in as value increases
  }

  createRippleRing(container, dotElement, size, intensity) {
    // Check existing rings
    const existingRings = container.querySelectorAll('.blue-dot-ring');
    
    // Limit number of rings - don't create if too many exist
    if (existingRings.length >= 2) return;
    
    // Remove old rings to keep it fresh
    existingRings.forEach(ring => ring.remove());
    
    // Create new ring
    const ring = document.createElement('div');
    ring.className = 'blue-dot-ring';
    ring.style.width = `${size}px`;
    ring.style.height = `${size}px`;
    ring.style.left = '50%';
    ring.style.top = '50%';
    ring.style.transform = 'translate(-50%, -50%)';
    ring.style.borderWidth = `${2 + intensity * 3}px`;
    ring.style.borderColor = `rgba(59, 130, 246, ${0.3 + intensity * 0.4})`;
    ring.style.animationDuration = `${2 - intensity * 1}s`;
    
    container.appendChild(ring);
    
    // Remove ring after animation
    setTimeout(() => {
      if (ring.parentElement) ring.remove();
    }, 2000);
  }

  createParticles(container, size, intensity) {
    // Limit number of particles
    const existingParticles = container.querySelectorAll('.blue-dot-particle');
    if (existingParticles.length > 20) return;
    
    const particleCount = Math.floor(intensity * 8);
    const containerRect = container.getBoundingClientRect();
    const centerX = containerRect.width / 2;
    const centerY = containerRect.height / 2;
    
    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div');
      particle.className = 'blue-dot-particle';
      
      const angle = (Math.PI * 2 * i) / particleCount;
      const distance = size * 0.6;
      const x = centerX + Math.cos(angle) * distance;
      const y = centerY + Math.sin(angle) * distance;
      
      particle.style.left = `${x}px`;
      particle.style.top = `${y}px`;
      particle.style.opacity = '0';
      particle.style.transform = 'scale(0)';
      
      container.appendChild(particle);
      
      // Animate particle
      setTimeout(() => {
        particle.style.transition = 'all 1s ease-out';
        particle.style.opacity = '1';
        particle.style.transform = 'scale(1)';
        
        const finalX = centerX + Math.cos(angle) * distance * 1.5;
        const finalY = centerY + Math.sin(angle) * distance * 1.5;
        
        setTimeout(() => {
          particle.style.left = `${finalX}px`;
          particle.style.top = `${finalY}px`;
          particle.style.opacity = '0';
          
          setTimeout(() => {
            if (particle.parentElement) particle.remove();
          }, 1000);
        }, 100);
      }, i * 50);
    }
  }

  pauseSession() {
    try {
      window.charts?.stopRealtimeSimulation();
      window.websocket?.pauseSession?.();
      document.getElementById("recordingPauseSessionBtn")?.style.setProperty('display', 'none');
      document.getElementById("recordingResumeSessionBtn")?.style.setProperty('display', 'block');
      
      // Update status indicator
      const statusIndicator = document.getElementById('recordingStatusIndicator');
      const statusText = document.getElementById('recordingStatusText');
      if (statusIndicator) statusIndicator.className = 'status-indicator status-paused';
      if (statusText) statusText.textContent = 'Paused';
      
      // Pause the timer
      this.pauseTimer();
      this.isPaused = true;
    } catch (error) {
      console.error("Error pausing session:", error);
    }
  }

  resumeSession() {
    try {
      // Resume via WebSocket
      if (window.websocket && window.websocket.resumeSession) {
        window.websocket.resumeSession();
      }

      // Resume chart simulation
      if (window.charts) {
        window.charts.startRealtimeSimulation();
      }

      // Update button visibility
      const pauseBtn = document.getElementById("recordingPauseSessionBtn");
      const resumeBtn = document.getElementById("recordingResumeSessionBtn");
      if (pauseBtn) pauseBtn.style.display = "block";
      if (resumeBtn) resumeBtn.style.display = "none";

      // Update status indicator
      const statusIndicator = document.getElementById('recordingStatusIndicator');
      const statusText = document.getElementById('recordingStatusText');
      if (statusIndicator) statusIndicator.className = 'status-indicator status-active';
      if (statusText) statusText.textContent = 'Active';

      // Resume timer (only if it was already started)
      this.isPaused = false;
      if (this.timerStarted) {
        this.startTimer();  // Restart the timer from the accumulated time
      }
    } catch (error) {
      console.error("Error resuming session:", error);
    }
  }

  initializeEventListeners() {
    // Feedback speed controls
    const speedButtons = [
      document.getElementById("feedbackSpeedSlow"),
      document.getElementById("feedbackSpeedNormal"),
      document.getElementById("feedbackSpeedFast"),
      document.getElementById("feedbackSpeedVeryFast")
    ];
    
    speedButtons.forEach(btn => {
      if (btn) {
        btn.addEventListener("click", () => {
          const interval = parseFloat(btn.getAttribute("data-interval"));
          if (window.websocket && typeof window.websocket.updateFeedbackInterval === 'function') {
            window.websocket.updateFeedbackInterval(interval);
            // Update active button state
            speedButtons.forEach(b => {
              if (b) b.classList.remove("nf-speed-btn-active");
            });
            btn.classList.add("nf-speed-btn-active");
            console.log(`[SessionRecordingPanel] Feedback speed updated to ${interval}s (${1.0/interval}x)`);
          }
        });
      }
    });

    // Pause session button
    const pauseBtn = document.getElementById("recordingPauseSessionBtn");
    if (pauseBtn) {
      pauseBtn.addEventListener("click", () => this.pauseSession());
    }

    // Resume session button
    const resumeBtn = document.getElementById("recordingResumeSessionBtn");
    if (resumeBtn) {
      resumeBtn.addEventListener("click", () => this.resumeSession());
    }

    // Stop session button
    const stopBtn = document.getElementById("recordingStopSessionBtn");
    if (stopBtn) {
      stopBtn.addEventListener("click", () => this.stopSession());
    }
  }

  async abortSessionDueToRuntimeError(message = 'Neurofeedback runtime error', errorData = null) {
    // Backend/device failure path. This intentionally does NOT mark the session
    // as completed and does NOT show the normal session-complete modal.
    try {
      console.error('[SessionRecordingPanel] Aborting runtime session:', message, errorData);

      this.sessionId = null;

      // Deregister CSV/round callbacks so no more rows are accumulated after abort.
      const wsCallbacks = window.websocket?.callbacks;
      if (this._csvFeedbackCallback && wsCallbacks?.onFeedback) {
        const idx = wsCallbacks.onFeedback.indexOf(this._csvFeedbackCallback);
        if (idx > -1) wsCallbacks.onFeedback.splice(idx, 1);
        this._csvFeedbackCallback = null;
      }
      if (this._csvRoundCallback && wsCallbacks?.onRoundStart) {
        const idx = wsCallbacks.onRoundStart.indexOf(this._csvRoundCallback);
        if (idx > -1) wsCallbacks.onRoundStart.splice(idx, 1);
        this._csvRoundCallback = null;
      }
      if (this._rawFileCallback && wsCallbacks?.onRoundComplete) {
        const idx = wsCallbacks.onRoundComplete.indexOf(this._rawFileCallback);
        if (idx > -1) wsCallbacks.onRoundComplete.splice(idx, 1);
        this._rawFileCallback = null;
      }

      window.charts?.stopRealtimeSimulation?.();
      this.stopTimer?.();
      this.closeFeedbackWindow?.();
      window.websocket?.disconnect?.();
      window.ui?.updateConnectionStatus?.(false);

      const statusText = document.getElementById('recordingStatusText');
      if (statusText) statusText.textContent = 'Hardware/Data Error';
      const statusIndicator = document.getElementById('recordingStatusIndicator');
      if (statusIndicator) {
        statusIndicator.classList.remove('recording', 'active');
        statusIndicator.classList.add('error');
      }
      document.getElementById('recordingPauseSessionBtn')?.style.setProperty('display', 'none');
      document.getElementById('recordingResumeSessionBtn')?.style.setProperty('display', 'none');
      document.getElementById('recordingStopSessionBtn')?.style.setProperty('display', 'none');
      this.isPaused = false;

      // Ensure backend/device cleanup is requested, but do not treat failure as
      // a normal completed session.
      try {
        await window.api?.stopNeurofeedbackCore?.();
      } catch (stopError) {
        console.warn('Error requesting neurofeedback stop after runtime abort:', stopError);
      }
    } catch (abortError) {
      console.error('Error while aborting runtime session:', abortError);
    }
  }

  async stopSession() {
    if (this.sessionId === null) return; // already stopped (e.g. auto-completed by last round)
    try {
      const sessionIdToComplete = this.sessionId;
      this.sessionId = null; // Clear immediately so show() guard never re-triggers startRecording()

      // Deregister CSV accumulation callbacks
      const wsCallbacks = window.websocket?.callbacks;
      if (this._csvFeedbackCallback && wsCallbacks?.onFeedback) {
        const idx = wsCallbacks.onFeedback.indexOf(this._csvFeedbackCallback);
        if (idx > -1) wsCallbacks.onFeedback.splice(idx, 1);
        this._csvFeedbackCallback = null;
      }
      if (this._csvRoundCallback && wsCallbacks?.onRoundStart) {
        const idx = wsCallbacks.onRoundStart.indexOf(this._csvRoundCallback);
        if (idx > -1) wsCallbacks.onRoundStart.splice(idx, 1);
        this._csvRoundCallback = null;
      }
      if (this._rawFileCallback && wsCallbacks?.onRoundComplete) {
        const idx = wsCallbacks.onRoundComplete.indexOf(this._rawFileCallback);
        if (idx > -1) wsCallbacks.onRoundComplete.splice(idx, 1);
        this._rawFileCallback = null;
      }

      // Stop WebSocket session (this will disconnect and trigger device stop command)
      window.websocket?.stopLiveSession?.() || window.ui?.stopLiveSession?.();
      window.charts?.stopRealtimeSimulation();
      this.stopTimer();
      this.closeFeedbackWindow();
      document.getElementById("recordingPauseSessionBtn")?.style.setProperty('display', 'none');
      document.getElementById("recordingResumeSessionBtn")?.style.setProperty('display', 'none');
      this.isPaused = false;

      // Complete session in database
      if (sessionIdToComplete) {
        try {
          // Update session with overall_success_rate and the filtered-EEG file path
          const updatePayload = {};
          if (this.latestSuccessRate !== null && this.latestSuccessRate !== undefined) {
            updatePayload.overall_success_rate = this.latestSuccessRate;
          }
          if (this.rawDataFile) {
            updatePayload.raw_data_file = this.rawDataFile;
          }
          if (Object.keys(updatePayload).length > 0) {
            try {
              await window.api.updateSession(sessionIdToComplete, updatePayload);
              console.log('Session updated on complete:', updatePayload);
            } catch (updateError) {
              console.warn('Error updating session on complete:', updateError);
            }
          }

          const completedSession = await window.api.completeSession(sessionIdToComplete);
          if (completedSession) {
            console.log('Session completed successfully in database:', completedSession.id);
            window.ui?.showNotification?.('Session saved successfully', 'success');
          } else {
            console.warn('Session completion returned no data');
          }
        } catch (error) {
          console.error('Error completing session:', error);
          window.ui?.showNotification?.('Warning: Session may not have been saved properly', 'warning');
        }
      } else {
        console.warn('Cannot complete session: No session ID available');
        window.ui?.showNotification?.('Warning: Session was not properly initialized', 'warning');
      }
      
      // Additionally, ensure neurofeedback is stopped via API in case WebSocket didn't fully close
      try {
        await window.api.stopNeurofeedbackCore();
        console.log('Neurofeedback core stopped via API');
      } catch (error) {
        console.warn('Error stopping neurofeedback core via API:', error);
      }

      // Show session-complete summary modal
      this.showSessionCompleteModal();
    } catch (error) {
      console.error("Error stopping session:", error);
    }
  }

  showSessionCompleteModal() {
    const existing = document.getElementById('sessionCompleteModal');
    if (existing) existing.remove();

    const protocolName = this.protocol?.name || this.protocol?.protocol_type || 'TBR';

    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'sessionCompleteModal';
    modal.innerHTML = `
      <div class="modal-content" style="max-width:380px;">
        <div style="padding:28px 24px 8px;text-align:center;">
          <div style="width:48px;height:48px;border-radius:50%;background:var(--color-success,#22c55e);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h3 style="font-size:1.15rem;font-weight:700;margin:0 0 4px;">Session Complete</h3>
          <p style="color:var(--text-secondary);font-size:0.85rem;margin:0;">Session #${this.sessionNumber}</p>
        </div>
        <div style="padding:16px 24px 8px;">
          <div style="background:var(--bg-secondary);border-radius:10px;padding:14px 16px;">
            <p style="color:var(--text-secondary);font-size:0.75rem;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 6px;">Protocol</p>
            <p style="font-weight:600;font-size:0.95rem;margin:0;line-height:1.4;word-break:break-word;">${protocolName}</p>
          </div>
        </div>
        <div class="modal-actions" style="padding:12px 24px 8px;display:flex;gap:10px;">
          <button class="btn btn-secondary" style="flex:1;" id="sessionCompleteStayBtn">Stay Here</button>
          <button class="btn btn-primary" style="flex:1;" id="sessionCompleteAnalyticsBtn">View Analytics</button>
        </div>
        <div style="padding:0 24px 20px;display:flex;flex-direction:column;gap:8px;">
          <button class="btn btn-secondary" style="width:100%;display:flex;align-items:center;justify-content:center;gap:6px;" id="sessionCompleteCsvBtn">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download Session CSV
          </button>
          <button class="btn btn-secondary" style="width:100%;display:flex;align-items:center;justify-content:center;gap:6px;${this.rawDataFile ? '' : 'opacity:0.5;'}" id="sessionCompleteEegBtn">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download EEG Signal (raw + filtered)
          </button>
        </div>
      </div>`;

    document.body.appendChild(modal);

    document.getElementById('sessionCompleteAnalyticsBtn').addEventListener('click', () => {
      modal.remove();
      const activeStep = document.querySelector('.session-step.active');
      if (activeStep && parseInt(activeStep.dataset.step) === 4) {
        activeStep.classList.remove('active');
        activeStep.classList.add('completed');
        const analyticsStep = document.querySelector('.session-step[data-step="5"]');
        if (analyticsStep) {
          analyticsStep.classList.add('active');
          window.ui?.updateCurrentStepDetails?.(5);
          window.ui?.updateNavigationButtons?.(5);
        }
      }
    });

    document.getElementById('sessionCompleteStayBtn').addEventListener('click', () => {
      modal.remove();
    });

    document.getElementById('sessionCompleteCsvBtn').addEventListener('click', () => {
      this.downloadSessionCsv();
    });

    document.getElementById('sessionCompleteEegBtn').addEventListener('click', () => {
      this.downloadEegSignalCsv();
    });
  }

  // Download the backend-recorded EEG signal file (raw + post notch+bandpass, 250 Hz).
  downloadEegSignalCsv() {
    if (!this.rawDataFile) {
      window.ui?.showNotification?.('No EEG signal recording is available for this session', 'warning');
      return;
    }
    const filename = String(this.rawDataFile).split(/[\\/]/).pop();
    const base = (window.api?.baseURL || 'http://localhost:8000').replace(/\/$/, '');
    const a = document.createElement('a');
    a.href = `${base}/sp/recording/${encodeURIComponent(filename)}`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // ====================================
  // CSV EXPORT
  // ====================================

  recordCsvRow(data) {
    if (!data || data.type !== 'feedback') return;

    // Capture the backend EEG-recording path (arrives on every feedback tick),
    // so the "Download EEG Signal" button works even for early-stopped sessions.
    if (data.raw_data_file) this.rawDataFile = data.raw_data_file;

    const row = {
      timestamp: data.timestamp || new Date().toISOString(),
      session_time_s: data.session_time ?? '',
      round: this._csvCurrentRound,
      phase: data.training_phase ?? '',
      feedback_rate: typeof data.feedback === 'number' ? data.feedback.toFixed(4) : '',
      overall_success_rate: typeof data.overall_success_rate === 'number' ? data.overall_success_rate.toFixed(4) : '',
    };

    // Per-feature amplitude (µV) and threshold
    const features = data.individual_features || {};
    const thresholds = data.feature_thresholds || {};
    for (const [name, value] of Object.entries(features)) {
      row[`${name}_amplitude_uv`] = typeof value === 'number' ? value.toFixed(4) : value;
      const tInfo = thresholds[name];
      row[`${name}_threshold_uv`] = tInfo?.threshold != null ? Number(tInfo.threshold).toFixed(4) : '';
      row[`${name}_success`] = tInfo?.success != null ? (tInfo.success ? 1 : 0) : '';
    }

    this.csvRows.push(row);
  }

  downloadSessionCsv() {
    if (this.csvRows.length === 0) {
      window.ui?.showNotification?.('No session data to export', 'warning');
      return;
    }

    const allKeys = [...new Set(this.csvRows.flatMap(r => Object.keys(r)))];
    const lines = [
      allKeys.join(','),
      ...this.csvRows.map(row =>
        allKeys.map(k => {
          const v = row[k] ?? '';
          const s = String(v);
          return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
        }).join(',')
      )
    ];

    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const patientName = (this.patient ? `${this.patient.first_name}_${this.patient.last_name}` : 'patient').replace(/\s+/g, '_');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `session_${patientName}_${dateStr}_#${this.sessionNumber}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  showArtifactAlert(message, artifactType) {
    // Render the artifact directly on the EEG signal: turn the waveform red and
    // overlay an "artifact detected" label, instead of a corner notification.
    this.artifactState = {
      active: true,
      type: artifactType,
      message: message || 'Artifact detected',
    };
    this.redrawAllPlots();

    // The backend stops streaming EEG data during an artifact epoch, so keep the
    // red state visible briefly, then clear it and redraw clean.
    if (this.artifactTimeout) clearTimeout(this.artifactTimeout);
    this.artifactTimeout = setTimeout(() => {
      this.artifactState = { active: false };
      this.redrawAllPlots();
    }, 1200);
  }

  startTimer() {
    if (this.accumulatedTime === undefined) this.accumulatedTime = 0;
    this._timerBase = 0;          // last known backend seconds
    this._timerBaseWall = Date.now(); // wall-clock at that moment

    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this._timerBaseWall) / 1000);
      const total = this._timerBase + elapsed;
      const timerDisplay = document.getElementById("recordingSessionTimer");
      if (timerDisplay) {
        timerDisplay.textContent =
          `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
      }
    }, 500);
  }

  // Called by charts.updateSessionTimer() with the authoritative backend value.
  syncTimerFromBackend(seconds) {
    this._timerBase = seconds;
    this._timerBaseWall = Date.now();
    this.accumulatedTime = seconds; // keep in sync for end-of-session modal
  }

  pauseTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  resumeTimer() {
    // Re-anchor wall clock so the interval continues from the paused value.
    this._timerBaseWall = Date.now();
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this._timerBaseWall) / 1000);
      const total = this._timerBase + elapsed;
      const timerDisplay = document.getElementById("recordingSessionTimer");
      if (timerDisplay) {
        timerDisplay.textContent =
          `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
      }
    }, 500);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    const timerDisplay = document.getElementById("recordingSessionTimer");
    if (timerDisplay) timerDisplay.textContent = "00:00";
  }

  hide() {
    const panel = document.getElementById("sessionRecordingPanel");
    if (panel) {
      // Only hide the panel, don't remove it, so data persists when re-entering
      panel.style.display = "none";
    }
    // Don't stop the timer or session when hiding - let user explicitly stop via stop button
    // This allows data to persist when navigating between steps
  }

  destroyPlots() {
    if (this._resizeObservers) {
      Object.values(this._resizeObservers).forEach(ro => ro.disconnect());
      this._resizeObservers = {};
    }
    this.plotData = {};
    this.plotsInitialized = false;
  }
}

// Make available globally
window.SessionRecordingPanel = SessionRecordingPanel;

