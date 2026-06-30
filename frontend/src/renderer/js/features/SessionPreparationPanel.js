/**
 * Session Preparation Panel Component
 * Preparation window that appears after planning window
 * Shows protocol overview, alerts, settings, notes, and timeline
 */

class SessionPreparationPanel {
  constructor() {
    this.patient = null;
    this.currentSessionInfo = {
      sessionNumber: 0,
      block: null,
      protocol: null,
      sessionsInBlock: 0
    };
    this.planData = {
      blocks: [],
      checkpoints: [],
      totalSessions: 25,
    };
    this.sessionSettings = {
      session_rounds: 5,        // Default to 5 rounds
      session_duration: 1500,   // Default to 25 minutes (1500 seconds) for 5 rounds = 5 minutes per round
      sample_rate: 250,
      channels: [],
      mapping: 'sigmoid',
      success_rate: 0.7,
      feedback_type: 'Image',
      reward_threshold_percentage: 20.0,  // Default to 20%
      inhibit_threshold_percentage: 20.0  // Default to 20%
    };
    this.clinicalObservation = 3; // Default moderate score sent to backend
    this.containerId = "currentSessionStep";
    this.availableProtocols = [];
    this.sessionHistory = [];
    this.thresholdSettings = {
      previous: null,
      fallback: null,
      defaultThreshold: 0.5
    };
  }

  // ====================================
  // UI CREATION
  // ====================================

  createPreparationPanelHTML() {
    return `
      <div id="sessionPreparationPanel" class="session-preparation-panel">
        <div class="preparation-grid">
          <!-- Left Column: Protocol Overview and Timeline -->
          <div class="preparation-left">
            <!-- Protocol Overview Section -->
            <div class="preparation-section protocol-overview-section">
              <div class="section-header">
                <h3>Protocol Overview</h3>
              </div>
              <div id="preparationProtocolContent" class="protocol-content">
                <div style="text-align: center; padding: var(--spacing-lg); color: var(--text-secondary);">
                  <p>Loading protocol information...</p>
                </div>
              </div>
            </div>

            <!-- Timeline Overview -->
            <div class="preparation-section timeline-section">
              <div class="section-header">
                <h3>Treatment Timeline Overview</h3>
              </div>
              <div class="timeline-overview-container">
                <div id="preparationTimeline" class="timeline-overview">
                  <!-- Timeline will be populated here -->
                </div>
              </div>
              <!-- Upcoming Checkpoints -->
              <div id="preparationTimelineAlerts" class="timeline-alerts">
                <!-- Alerts will be populated here -->
              </div>
            </div>
          </div>

          <!-- Right Column: Session Info and Settings -->
          <div class="preparation-right">
            <!-- Clinical Observation and Session Notes -->
            <!-- Session Settings Toggle -->
            <div class="preparation-section settings-section">
              <div class="section-header">
                <h3>Session Settings</h3>
                <label class="toggle-switch">
                  <input type="checkbox" id="sessionSettingsToggle" checked>
                  <span class="toggle-slider"></span>
                </label>
              </div>
              <div id="sessionSettingsMenu" class="settings-menu">
                <!-- Settings menu will be populated here -->
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  async show(patient) {
    if (!patient) {
      console.error("No patient provided to SessionPreparationPanel");
      return;
    }

    const isNewPatient = !this.patient || this.patient.id !== patient.id;
    this.patient = patient;
    if (isNewPatient) {
      this.thresholdSettings.userEdited = false;
      this.thresholdSettings.previous = null;
      this.thresholdSettings.fallback = null;
    }

    const container = document.getElementById(this.containerId);
    if (!container) {
      console.error("Container not found:", this.containerId);
      return;
    }

    const stepContent = container.querySelector(".session-step-content");
    if (stepContent) {
      const title = stepContent.querySelector("h2");
      const description = stepContent.querySelector("p");
      if (title) title.style.display = "none";
      if (description) description.style.display = "none";
    }

    let panel = document.getElementById("sessionPreparationPanel");
    if (!panel) {
      const panelHTML = this.createPreparationPanelHTML();
      if (stepContent) {
        stepContent.insertAdjacentHTML("beforeend", panelHTML);
      } else {
        container.innerHTML = panelHTML;
      }
      panel = document.getElementById("sessionPreparationPanel");

      if (typeof lucide !== "undefined" && lucide.createIcons) {
        setTimeout(() => lucide.createIcons(), 100);
      }

      this.setupEventListeners();
    } else {
      panel.style.display = "block";
    }

    // Load data
    await this.loadProtocolsIfNeeded();
    await this.loadTreatmentPlan();
    await this.loadCurrentSessionInfo();
    await this.loadSessionSettings();
    
    // Render all components
    await this.renderProtocolOverview();
    this.renderSessionSettings();
    this.renderTimeline();
    await this.renderTimelineAlerts();
  }

  hide() {
    const panel = document.getElementById("sessionPreparationPanel");
    if (panel) {
      panel.style.display = "none";
    }
  }

  // ====================================
  // DATA LOADING
  // ====================================

  async loadProtocolsIfNeeded() {
    try {
      if (this.availableProtocols && this.availableProtocols.length > 0) return;
      if (window.api && window.api.getAllProtocols) {
        const protocols = await window.api.getAllProtocols();
        this.availableProtocols = Array.isArray(protocols) && protocols.length > 0 ? protocols : [];
      }
    } catch (e) {
      console.warn('Error loading protocols:', e);
      this.availableProtocols = [];
    }
  }

  async loadTreatmentPlan() {
    try {
      if (!this.patient?.id) return;

      // Clear existing data completely to prevent duplicates
      this.planData = {
        blocks: [],
        checkpoints: [],
        totalSessions: 25,
      };

      const treatmentPlan = await window.api.getTreatmentPlanByPatient(this.patient.id);
      
      // STRICT: Only use blocks returned by backend API - no inference, no generation
      if (treatmentPlan?.blocks && Array.isArray(treatmentPlan.blocks)) {
        // Filter out any blocks without required fields and sort by start_session
        const validBlocks = treatmentPlan.blocks
          .filter(block => block && block.id && block.start_session && block.end_session)
          .sort((a, b) => (a.start_session || 0) - (b.start_session || 0));

        // Clear blocks array and ONLY add blocks from backend
        this.planData.blocks = [];
        validBlocks.forEach((block, index) => {
          this.planData.blocks.push({
            name: `Block ${index + 1}`,
            startSession: block.start_session,
            endSession: block.end_session,
            protocolId: block.protocol_id,
            target: "TBD",
            id: block.id,
          });
        });

        // Load checkpoints (separate from blocks - do not infer blocks from checkpoints)
        try {
          // Clear checkpoints array before adding new ones
          this.planData.checkpoints = [];
          // Use window.api if available, otherwise use axios
          if (window.api && window.api.getCheckpointsByPatient) {
            const checkpoints = await window.api.getCheckpointsByPatient(this.patient.id);
            if (Array.isArray(checkpoints)) {
              checkpoints.forEach(cp => {
                this.planData.checkpoints.push({
                  session: cp.session_value,
                  type: cp.checkpoint_type || "Progress Review",
                  description: cp.description || "",
                  blockId: cp.block_id || null,
                  id: cp.id,
                });
              });
            }
          } else if (typeof axios !== 'undefined') {
            const checkpointsResponse = await axios.get(`/planning/checkpoints/patient/${this.patient.id}`);
            if (Array.isArray(checkpointsResponse.data)) {
              checkpointsResponse.data.forEach(cp => {
                this.planData.checkpoints.push({
                  session: cp.session_value,
                  type: cp.checkpoint_type || "Progress Review",
                  description: cp.description || "",
                  blockId: cp.block_id || null,
                  id: cp.id,
                });
              });
            }
          }
        } catch (cpError) {
          console.warn("Could not load checkpoints:", cpError);
        }
      } else {
        // No blocks from backend - ensure blocks array is empty
        this.planData.blocks = [];
      }
    } catch (error) {
      console.error("Error loading treatment plan:", error);
      // On error, ensure blocks array is empty to prevent stale data
      this.planData.blocks = [];
    }
  }

  async loadCurrentSessionInfo() {
    try {
      if (!this.patient?.id) {
        await this.renderProtocolOverview();
        return;
      }

      await this.loadProtocolsIfNeeded();

      let currentSessionNumber = 1;
      let sessionHistory = [];
      try {
        const sessions = await window.api.getSessionsByPatient(this.patient.id);
        if (Array.isArray(sessions)) {
          sessionHistory = [...sessions].sort((a, b) => {
            const timeA = a?.start_time ? new Date(a.start_time).getTime() : 0;
            const timeB = b?.start_time ? new Date(b.start_time).getTime() : 0;
            if (timeA === timeB) {
              return (a?.id || 0) - (b?.id || 0);
            }
            return timeA - timeB;
          }).map((session, index) => ({
            ...session,
            __sessionNumber: index + 1
          }));
        }
        currentSessionNumber = sessionHistory.length > 0 ? sessionHistory.length + 1 : 1;
      } catch (e) {
        if (e.response?.status === 404 || e.message?.includes('No sessions found')) {
          currentSessionNumber = 1;
        } else {
          console.warn('Error getting sessions:', e);
        }
      }
      this.sessionHistory = sessionHistory;
      this.updateThresholdHistory(sessionHistory);

      let currentBlock = null;
      if (this.planData.blocks && this.planData.blocks.length > 0) {
        currentBlock = this.planData.blocks.find(block => 
          currentSessionNumber >= block.startSession && 
          currentSessionNumber <= block.endSession
        );
      }

      let protocol = null;
      if (currentBlock && currentBlock.protocolId) {
        protocol = this.availableProtocols.find(p => p.id === currentBlock.protocolId);
        
        if (!protocol && window.api && window.api.getProtocol) {
          try {
            protocol = await window.api.getProtocol(currentBlock.protocolId);
            if (protocol && !this.availableProtocols.find(p => p.id === protocol.id)) {
              this.availableProtocols.push(protocol);
            }
          } catch (e) {
            console.warn('Error fetching protocol:', e);
          }
        }
      }

      const sessionsInBlock = currentBlock 
        ? (currentSessionNumber - currentBlock.startSession + 1)
        : 0;

      this.currentSessionInfo = {
        sessionNumber: currentSessionNumber,
        block: currentBlock ? { ...currentBlock } : null,
        protocol: protocol,
        sessionsInBlock: sessionsInBlock
      };
    } catch (error) {
      console.error('Error loading current session info:', error);
    }
  }

  async loadSessionSettings() {
    // Load default settings: 5 rounds × 5 minutes = 25 minutes total
    this.sessionSettings = {
      session_rounds: 5,
      session_duration: 1500, // 25 minutes (5 rounds × 5 min)
      sample_rate: 250,
      channels: [],
      mapping: 'sigmoid',
      success_rate: 0.7,
      feedback_type: 'Image',
      reward_threshold_percentage: 20.0,  // Default to 20%
      inhibit_threshold_percentage: 20.0  // Default to 20%
    };
  }

  // ====================================
  // RENDERING
  // ====================================

  async renderProtocolOverview() {
    const content = document.getElementById('preparationProtocolContent');
    if (!content) return;

    const info = this.currentSessionInfo;
    
    if (!info.sessionNumber || !info.block) {
      content.innerHTML = `
        <div style="text-align: center; padding: var(--spacing-lg); color: var(--text-secondary);">
          <p>No active session block found</p>
        </div>
      `;
      return;
    }

    await this.loadProtocolsIfNeeded();

    let protocol = info.protocol;
    if (!protocol && info.block.protocolId) {
      protocol = this.availableProtocols.find(p => p.id === info.block.protocolId);
      
      if (!protocol && window.api && window.api.getProtocol) {
        try {
          protocol = await window.api.getProtocol(info.block.protocolId);
          if (protocol && !this.availableProtocols.find(p => p.id === protocol.id)) {
            this.availableProtocols.push(protocol);
          }
        } catch (e) {
          console.warn('Error fetching protocol:', e);
        }
      }
    }

    let protocolDetailsHTML = '';
    if (protocol) {
      const bands = protocol.features?.frequency_bands || [];
      const allChannels = [...new Set(bands.flatMap(b => b.channels || []))];
      
      protocolDetailsHTML = `
        <div class="protocol-details">
          <div class="protocol-name">${protocol.name || 'Unnamed Protocol'}</div>
        </div>
      `;
    } else if (info.block.protocolId) {
      protocolDetailsHTML = `
        <div style="text-align: center; padding: var(--spacing-base); color: var(--text-secondary);">
          <div>Protocol ID: ${info.block.protocolId}</div>
          <div style="font-size: 0.85em; margin-top: 4px; opacity: 0.8;">Loading protocol details...</div>
        </div>
      `;
    } else {
      protocolDetailsHTML = `
        <div style="text-align: center; padding: var(--spacing-base); color: var(--text-secondary);">
          <div>No protocol assigned</div>
        </div>
      `;
    }

    content.innerHTML = protocolDetailsHTML;
  }

  async renderTimelineAlerts() {
    const alertsContainer = document.getElementById('preparationTimelineAlerts');
    if (!alertsContainer) return;

    const currentSession = this.currentSessionInfo.sessionNumber;
    const alerts = [];

    // Check for upcoming checkpoints (within 3 sessions)
    const upcomingCheckpoints = this.planData.checkpoints
      .filter(cp => cp.session > currentSession && cp.session <= currentSession + 3)
      .sort((a, b) => a.session - b.session);

    upcomingCheckpoints.forEach(cp => {
      const sessionsAway = cp.session - currentSession;
      alerts.push({
        type: 'checkpoint',
        message: `Session ${cp.session} (${sessionsAway} session${sessionsAway > 1 ? 's' : ''} away)`,
        detail: `${cp.type}${cp.description ? ': ' + cp.description : ''}`,
        session: cp.session,
        priority: sessionsAway === 1 ? 'high' : 'medium'
      });
    });

    // Check for block end (which is also a checkpoint)
    const currentBlock = this.currentSessionInfo.block;
    if (currentBlock) {
      const sessionsUntilBlockEnd = currentBlock.endSession - currentSession;
      if (sessionsUntilBlockEnd > 0 && sessionsUntilBlockEnd <= 3) {
        // Check if there's already a checkpoint at block end
        const hasCheckpointAtBlockEnd = this.planData.checkpoints.some(
          cp => cp.session === currentBlock.endSession
        );
        
        if (!hasCheckpointAtBlockEnd) {
          alerts.push({
            type: 'block_transition',
            message: `Session ${currentBlock.endSession} (${sessionsUntilBlockEnd} session${sessionsUntilBlockEnd > 1 ? 's' : ''} away)`,
            detail: 'Block transition - consider assessment before protocol change',
            session: currentBlock.endSession,
            priority: sessionsUntilBlockEnd === 1 ? 'high' : 'medium'
          });
        }
      }
    }

    if (alerts.length === 0) {
      alertsContainer.innerHTML = '';
      return;
    }

    alertsContainer.innerHTML = `
      <div class="timeline-alerts-header">Upcoming:</div>
      <div class="timeline-alerts-list">
        ${alerts.map(alert => `
          <div class="timeline-alert-item priority-${alert.priority}">
            <div class="timeline-alert-message">${alert.message}</div>
            <div class="timeline-alert-detail">${alert.detail}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  renderSessionSettings() {
    const settingsMenu = document.getElementById('sessionSettingsMenu');
    if (!settingsMenu) return;

    // Get channels from protocol
    let channels = [];
    if (this.currentSessionInfo.protocol) {
      const protocol = this.currentSessionInfo.protocol;
      if (protocol.channels) {
        channels = Array.isArray(protocol.channels)
          ? protocol.channels
          : JSON.parse(protocol.channels || "[]");
      } else if (protocol.features && protocol.features.frequency_bands) {
        const channelSet = new Set();
        protocol.features.frequency_bands.forEach(band => {
          if (band.channels && Array.isArray(band.channels)) {
            band.channels.forEach(ch => channelSet.add(ch));
          }
        });
        channels = Array.from(channelSet).sort();
      }
    }

    // Update sessionSettings with channels
    if (channels.length > 0) {
      this.sessionSettings.channels = channels;
    }

    const protocol = this.currentSessionInfo.protocol;
    const bands = protocol?.features?.frequency_bands || [];

    // A band counts as "reward" if type === 'reward', or a ratio band with mode 'enhance'
    const noRewardBand = !protocol || !bands.some(b =>
      b.type === 'reward' || (b.type === 'ratio' && (!b.mode || b.mode === 'enhance'))
    );
    // A band counts as "inhibit" if type === 'inhibit', or a ratio band with mode 'inhibit'
    const noInhibitBand = !protocol || !bands.some(b =>
      b.type === 'inhibit' || (b.type === 'ratio' && b.mode === 'inhibit')
    );

    if (noRewardBand)  this.sessionSettings.reward_threshold_percentage  = 0;
    if (noInhibitBand) this.sessionSettings.inhibit_threshold_percentage = 0;

    const channelsHTML = channels.length > 0 ? `
      <div class="form-group">
        <div class="multi-select" id="settingsChannelsSelect"></div>
      </div>
    ` : '';

    settingsMenu.innerHTML = `
      <div class="settings-form">
        ${channelsHTML}
        <div class="form-group">
          <label>Session Rounds</label>
          <div class="rounds-toggle" id="settingsSessionRounds">
            ${[1, 3, 5].map((value) => `
              <label class="round-option">
                <input
                  type="radio"
                  name="sessionRounds"
                  value="${value}"
                  ${this.sessionSettings.session_rounds === value ? 'checked' : ''}
                >
                <span>${value} Round${value > 1 ? 's' : ''}</span>
              </label>
            `).join('')}
          </div>
        </div>
        <div class="settings-grid">
          <div class="form-group">
            <label for="sessionDurationInput">Session Duration</label>
            <div class="number-field">
              <input
                type="number"
                id="sessionDurationInput"
                class="form-control"
                step="5"
                min="5"
                max="120"
                value="${Math.round(this.sessionSettings.session_duration / 60 / 5) * 5}"
              >
              <div class="number-steppers">
                <button type="button" id="sessionDurationUp" class="num-step" aria-label="Increase"><span data-lucide="chevron-up"></span></button>
                <button type="button" id="sessionDurationDown" class="num-step" aria-label="Decrease"><span data-lucide="chevron-down"></span></button>
              </div>
              <span class="number-unit">min</span>
            </div>
          </div>
          <div class="form-group">
            <label>Round Duration</label>
            <div class="number-field" style="pointer-events:none;opacity:0.7;">
              <span id="roundDurationDisplay" class="form-control" style="display:flex;align-items:center;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:6px;padding:0 10px;min-height:38px;font-variant-numeric:tabular-nums;">
                ${Math.round(this.sessionSettings.session_duration / this.sessionSettings.session_rounds / 60)}
              </span>
              <span class="number-unit">min/round</span>
            </div>
          </div>
          <div class="form-group">
            <label for="rewardThresholdInput">Reward threshold${noRewardBand ? ' <span style="font-size:0.8em;color:var(--text-secondary);font-weight:normal;">(no reward band)</span>' : ''}</label>
            <div class="number-field" ${noRewardBand ? 'style="opacity:0.5;pointer-events:none;"' : ''}>
              <input
                type="number"
                id="rewardThresholdInput"
                class="form-control"
                step="5"
                min="0"
                max="100"
                value="${this.sessionSettings.reward_threshold_percentage.toFixed(0)}"
                ${noRewardBand ? 'disabled' : ''}
              >
              <div class="number-steppers">
                <button type="button" id="rewardThresholdUp" class="num-step" aria-label="Increase" ${noRewardBand ? 'disabled' : ''}><span data-lucide="chevron-up"></span></button>
                <button type="button" id="rewardThresholdDown" class="num-step" aria-label="Decrease" ${noRewardBand ? 'disabled' : ''}><span data-lucide="chevron-down"></span></button>
              </div>
              <span class="number-unit">%</span>
            </div>
          </div>
          <div class="form-group">
            <label for="inhibitThresholdInput">Inhibit threshold${noInhibitBand ? ' <span style="font-size:0.8em;color:var(--text-secondary);font-weight:normal;">(no inhibit band)</span>' : ''}</label>
            <div class="number-field" ${noInhibitBand ? 'style="opacity:0.5;pointer-events:none;"' : ''}>
              <input
                type="number"
                id="inhibitThresholdInput"
                class="form-control"
                step="5"
                min="0"
                max="100"
                value="${this.sessionSettings.inhibit_threshold_percentage.toFixed(0)}"
                ${noInhibitBand ? 'disabled' : ''}
              >
              <div class="number-steppers">
                <button type="button" id="inhibitThresholdUp" class="num-step" aria-label="Increase" ${noInhibitBand ? 'disabled' : ''}><span data-lucide="chevron-up"></span></button>
                <button type="button" id="inhibitThresholdDown" class="num-step" aria-label="Decrease" ${noInhibitBand ? 'disabled' : ''}><span data-lucide="chevron-down"></span></button>
              </div>
              <span class="number-unit">%</span>
            </div>
          </div>
        </div>
        <div class="form-group">
          <label for="settingsFeedbackType">Feedback Type</label>
          <select id="settingsFeedbackType" class="form-control">
            <option value="Image" ${this.sessionSettings.feedback_type === 'Image' ? 'selected' : ''}>Image</option>
            <!-- <option value="Puzzle" ${this.sessionSettings.feedback_type === 'Puzzle' ? 'selected' : ''}>Puzzle</option> -->
            <option value="Lamp" ${this.sessionSettings.feedback_type === 'Lamp' ? 'selected' : ''}>Lamp</option>
            <option value="BlueDot" ${this.sessionSettings.feedback_type === 'BlueDot' ? 'selected' : ''}>Blue Dot</option>
            <option value="Video" ${this.sessionSettings.feedback_type === 'Video' ? 'selected' : ''}>Video</option>
          </select>
        </div>
      </div>
    `;

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // Initialize channels selector
    if (channels.length > 0) {
      setTimeout(() => {
        const channelsSelect = document.getElementById('settingsChannelsSelect');
        if (channelsSelect && window.ui && window.ui.renderSessionChannelSelector) {
          window.ui.renderSessionChannelSelector('settingsChannelsSelect', channels);
        } else if (channelsSelect) {
          channelsSelect.innerHTML = channels.map(ch => 
            `<span class="channel-chip">${ch}</span>`
          ).join("");
        }
      }, 100);
    }

    // Add event listeners for settings changes
    const roundsContainer = document.getElementById('settingsSessionRounds');
    if (roundsContainer) {
      const roundInputs = roundsContainer.querySelectorAll('input[name="sessionRounds"]');
      const updateRoundOptions = () => {
        roundInputs.forEach(input => {
          const option = input.closest('.round-option');
          if (option) {
            option.classList.toggle('active', input.checked);
          }
        });
      };
      roundInputs.forEach(input => {
        input.addEventListener('change', (e) => {
          const value = parseInt(e.target.value);
          this.sessionSettings.session_rounds = value;

          // Read the displayed session duration input (already snapped to ×5)
          // and sync session_duration so round duration is always consistent.
          const sessionDurationInput = document.getElementById('sessionDurationInput');
          if (sessionDurationInput) {
            const displayedMinutes = parseFloat(sessionDurationInput.value);
            if (!Number.isNaN(displayedMinutes)) {
              this.sessionSettings.session_duration = Math.max(5, Math.round(displayedMinutes / 5) * 5) * 60;
            }
          }

          const roundDurationDisplay = document.getElementById('roundDurationDisplay');
          if (roundDurationDisplay) {
            roundDurationDisplay.textContent = Math.round(this.sessionSettings.session_duration / value / 60);
          }

          updateRoundOptions();
        });
      });
      updateRoundOptions();
    }

    // Session Duration is the user-editable field; Round Duration is derived.
    const sessionDurationInput = document.getElementById('sessionDurationInput');
    const sessionDurationUpButton = document.getElementById('sessionDurationUp');
    const sessionDurationDownButton = document.getElementById('sessionDurationDown');
    const durationStep = 5;

    const updateSessionDuration = (value, { writeBackSource = true } = {}) => {
      if (value === undefined || value === null || Number.isNaN(value)) return;
      const snapped = Math.max(5, Math.min(120, Math.round(value / 5) * 5));
      this.sessionSettings.session_duration = snapped * 60;

      if (writeBackSource && sessionDurationInput) sessionDurationInput.value = snapped;

      const roundDurationDisplay = document.getElementById('roundDurationDisplay');
      if (roundDurationDisplay) {
        roundDurationDisplay.textContent = Math.round(this.sessionSettings.session_duration / this.sessionSettings.session_rounds / 60);
      }
    };

    sessionDurationInput?.addEventListener('input', (e) => {
      updateSessionDuration(parseFloat(e.target.value), { writeBackSource: false });
    });

    sessionDurationInput?.addEventListener('blur', () => {
      let value = parseFloat(sessionDurationInput.value);
      if (Number.isNaN(value)) value = this.sessionSettings.session_duration / 60;
      updateSessionDuration(value, { writeBackSource: true });
    });

    sessionDurationUpButton?.addEventListener('click', () => {
      updateSessionDuration(parseFloat(sessionDurationInput.value) + durationStep, { writeBackSource: true });
    });

    sessionDurationDownButton?.addEventListener('click', () => {
      updateSessionDuration(parseFloat(sessionDurationInput.value) - durationStep, { writeBackSource: true });
    });

    // Add reward threshold event listeners
    const rewardThresholdInput = document.getElementById('rewardThresholdInput');
    const rewardThresholdDisplay = document.getElementById('rewardThresholdDisplay');
    const rewardThresholdUpButton = document.getElementById('rewardThresholdUp');
    const rewardThresholdDownButton = document.getElementById('rewardThresholdDown');
    const percentageStep = 5;

    const updateRewardThreshold = (value, { writeBackSource = true } = {}) => {
      if (noRewardBand) return;
      if (value === undefined || value === null || Number.isNaN(value)) return;
      const sanitized = Math.max(0, Math.min(100, Math.round(value)));
      this.sessionSettings.reward_threshold_percentage = sanitized;
      if (writeBackSource && rewardThresholdInput) rewardThresholdInput.value = sanitized;
      if (rewardThresholdDisplay) rewardThresholdDisplay.textContent = sanitized + '%';
    };

    rewardThresholdInput?.addEventListener('input', (e) => {
      updateRewardThreshold(parseFloat(e.target.value), { writeBackSource: false });
    });

    rewardThresholdInput?.addEventListener('blur', () => {
      let value = parseFloat(rewardThresholdInput.value);
      if (Number.isNaN(value)) value = this.sessionSettings.reward_threshold_percentage;
      updateRewardThreshold(value, { writeBackSource: true });
    });

    rewardThresholdUpButton?.addEventListener('click', () => {
        const currentValue = parseFloat(rewardThresholdInput.value);
        updateRewardThreshold(currentValue + percentageStep, { writeBackSource: true });
    });

    rewardThresholdDownButton?.addEventListener('click', () => {
        const currentValue = parseFloat(rewardThresholdInput.value);
        updateRewardThreshold(currentValue - percentageStep, { writeBackSource: true });
    });

    // Add inhibit threshold event listeners
    const inhibitThresholdInput = document.getElementById('inhibitThresholdInput');
    const inhibitThresholdDisplay = document.getElementById('inhibitThresholdDisplay');
    const inhibitThresholdUpButton = document.getElementById('inhibitThresholdUp');
    const inhibitThresholdDownButton = document.getElementById('inhibitThresholdDown');

    const updateInhibitThreshold = (value, { writeBackSource = true } = {}) => {
      if (value === undefined || value === null || Number.isNaN(value)) return;
      const sanitized = Math.max(0, Math.min(100, Math.round(value)));
      this.sessionSettings.inhibit_threshold_percentage = sanitized;
      if (writeBackSource && inhibitThresholdInput) inhibitThresholdInput.value = sanitized;
      if (inhibitThresholdDisplay) inhibitThresholdDisplay.textContent = sanitized + '%';
    };

    inhibitThresholdInput?.addEventListener('input', (e) => {
      updateInhibitThreshold(parseFloat(e.target.value), { writeBackSource: false });
    });

    inhibitThresholdInput?.addEventListener('blur', () => {
      let value = parseFloat(inhibitThresholdInput.value);
      if (Number.isNaN(value)) value = this.sessionSettings.inhibit_threshold_percentage;
      updateInhibitThreshold(value, { writeBackSource: true });
    });

    inhibitThresholdUpButton?.addEventListener('click', () => {
        const currentValue = parseFloat(inhibitThresholdInput.value);
        updateInhibitThreshold(currentValue + percentageStep, { writeBackSource: true });
    });

    inhibitThresholdDownButton?.addEventListener('click', () => {
        const currentValue = parseFloat(inhibitThresholdInput.value);
        updateInhibitThreshold(currentValue - percentageStep, { writeBackSource: true });
    });

    document.getElementById('settingsFeedbackType')?.addEventListener('change', (e) => {
      const newFeedbackType = e.target.value;
      this.sessionSettings.feedback_type = newFeedbackType;

      // Immediately update feedback type in recording panel if session is active
      if (window.uiState?.sessionRecordingPanel) {
        window.uiState.sessionRecordingPanel.updateFeedbackType(newFeedbackType);
      }
    });
  }

  getSessionSettings() {
    // Get current values from UI
    const selectedRoundsInput = document.querySelector('input[name="sessionRounds"]:checked');
    const parsedRounds = selectedRoundsInput ? parseInt(selectedRoundsInput.value) : NaN;
    const allowedRounds = [1, 3, 5];
    const rounds = allowedRounds.includes(parsedRounds)
      ? parsedRounds
      : this.sessionSettings.session_rounds;
    const feedbackType = document.getElementById('settingsFeedbackType')?.value || this.sessionSettings.feedback_type;

    // Use default values for sample_rate, mapping, and success_rate (not shown in UI)
    const sampleRate = this.sessionSettings.sample_rate;
    const mapping = this.sessionSettings.mapping;
    const successRate = this.sessionSettings.success_rate;

    // Get channels from UI state or settings
    let channels = window.uiState?.selectedChannels || this.sessionSettings.channels || [];
    if (channels.length === 0 && this.currentSessionInfo.protocol) {
      const protocol = this.currentSessionInfo.protocol;
      if (protocol.channels) {
        channels = Array.isArray(protocol.channels)
          ? protocol.channels
          : JSON.parse(protocol.channels || "[]");
      } else if (protocol.features && protocol.features.frequency_bands) {
        const channelSet = new Set();
        protocol.features.frequency_bands.forEach(band => {
          if (band.channels && Array.isArray(band.channels)) {
            band.channels.forEach(ch => channelSet.add(ch));
          }
        });
        channels = Array.from(channelSet).sort();
      }
    }

    return {
      session_rounds: rounds,
      session_duration: this.sessionSettings.session_duration, // Return the duration in seconds
      sample_rate: sampleRate,
      channels: channels,
      mapping: mapping,
      success_rate: successRate,
      feedback_type: feedbackType,
      reward_threshold_percentage: this.sessionSettings.reward_threshold_percentage,
      inhibit_threshold_percentage: this.sessionSettings.inhibit_threshold_percentage
    };
  }

  renderTimeline() {
    const timeline = document.getElementById('preparationTimeline');
    if (!timeline) return;

    const currentSession = this.currentSessionInfo.sessionNumber;

    // STRICT: Only render blocks that exist in this.planData.blocks (from backend)
    // Do NOT generate, infer, or create blocks from sessions or checkpoints
    if (!this.planData.blocks || this.planData.blocks.length === 0) {
      timeline.innerHTML = `
        <div class="timeline-empty">No treatment blocks configured</div>
      `;
      return;
    }

    // Get all sessions that belong to blocks (ONLY from persisted blocks)
    const sessionsInBlocks = new Set();
    this.planData.blocks.forEach(block => {
      // Only process blocks that have valid start and end sessions
      if (block && block.startSession && block.endSession) {
        for (let i = block.startSession; i <= block.endSession; i++) {
          sessionsInBlocks.add(i);
        }
      }
    });

    // Get checkpoint sessions (for display only - do NOT create blocks from checkpoints)
    const checkpointSessions = new Set(
      (this.planData.checkpoints || []).map(cp => cp.session).filter(s => s != null)
    );

    // Calculate positions based on sessions in blocks only
    const sessionsArray = Array.from(sessionsInBlocks).sort((a, b) => a - b);
    if (sessionsArray.length === 0) {
      timeline.innerHTML = `
        <div class="timeline-empty">No sessions in treatment blocks</div>
      `;
      return;
    }
    const minSession = Math.min(...sessionsArray);
    const maxSession = Math.max(...sessionsArray);
    const range = Math.max(maxSession - minSession, 1);

    const timelineHTML = document.createElement('div');
    timelineHTML.className = 'timeline-simplified enhanced';

    // Summary row
    const summary = document.createElement('div');
    summary.className = 'timeline-summary';
    const blockIndex = this.planData.blocks.findIndex(
      b => this.currentSessionInfo.block && b.id === this.currentSessionInfo.block.id
    );
    const blockLabel = blockIndex >= 0 ? `Block ${blockIndex + 1}` : '—';
    const sessionsInBlock = this.currentSessionInfo.sessionsInBlock || 0;
    const blockLength = this.currentSessionInfo.block
      ? this.currentSessionInfo.block.endSession - this.currentSessionInfo.block.startSession + 1
      : 0;
    const blockProgress = blockLength > 0 ? Math.min(100, Math.max(0, (sessionsInBlock / blockLength) * 100)) : 0;
    const nextCheckpoint = [...this.planData.checkpoints]
      .filter(cp => cp.session >= currentSession)
      .sort((a, b) => a.session - b.session)[0];

    summary.innerHTML = `
      <div class="timeline-summary-item">
        <span>Current Session</span>
        <strong>Session ${currentSession}</strong>
      </div>
      <div class="timeline-summary-item">
        <span>Active Block</span>
        <strong>${blockLabel}${blockLength ? ` · ${sessionsInBlock}/${blockLength}` : ''}</strong>
        ${blockLength ? `<div class="summary-progress"><div style="width:${blockProgress}%;"></div></div>` : ''}
      </div>
      <div class="timeline-summary-item">
        <span>Next Checkpoint</span>
        <strong>${nextCheckpoint ? `Session ${nextCheckpoint.session}` : 'None'}</strong>
        ${nextCheckpoint ? `<small>${nextCheckpoint.type}${nextCheckpoint.description ? ` · ${nextCheckpoint.description}` : ''}</small>` : ''}
      </div>
    `;
    timelineHTML.appendChild(summary);

    // Timeline line with dots and labels
    const lineContainer = document.createElement('div');
    lineContainer.className = 'timeline-line-container';
    
    const line = document.createElement('div');
    line.className = 'timeline-line';

    const progress = document.createElement('div');
    progress.className = 'timeline-progress';
    const progressPercent = Math.min(100, Math.max(0, ((currentSession - minSession) / range) * 100));
    progress.style.width = `${progressPercent}%`;
    line.appendChild(progress);
    
    // Block segments - STRICT: Only render blocks from this.planData.blocks (persisted blocks)
    // Do NOT create additional blocks for sessions outside existing blocks
    this.planData.blocks.forEach((block, index) => {
      // Only render if block has valid start and end sessions
      if (!block || !block.startSession || !block.endSession) return;
      
      const blockStartPosition = ((block.startSession - minSession) / range) * 100;
      const blockWidth = ((block.endSession - block.startSession) / range) * 100;
      const blockSegment = document.createElement('div');
      blockSegment.className = `timeline-block-segment block-color-${index % 6}`;
      blockSegment.style.left = `${blockStartPosition}%`;
      blockSegment.style.width = `${Math.max(blockWidth, 4)}%`;
      blockSegment.innerHTML = `<span>${block.name || `Block ${index + 1}`}</span>`;
      line.appendChild(blockSegment);
    });
    
    // Add dots and session numbers only for sessions in blocks
    sessionsArray.forEach(sessionNum => {
      const block = this.planData.blocks.find(
        b => sessionNum >= b.startSession && sessionNum <= b.endSession
      );
      const isCurrent = sessionNum === currentSession;
      const isCheckpoint = checkpointSessions.has(sessionNum);
      
      // Calculate position relative to the range of sessions in blocks
      const position = ((sessionNum - minSession) / range) * 100;
      
      // Session number above dot
      const sessionLabel = document.createElement('div');
      sessionLabel.className = 'timeline-session-label';
      sessionLabel.textContent = sessionNum;
      sessionLabel.style.left = `${position}%`;
      line.appendChild(sessionLabel);
      
      // Dot
      const dot = document.createElement('div');
      dot.className = 'timeline-dot';
      if (block) {
        const blockIdx = this.planData.blocks.indexOf(block);
        dot.classList.add(`block-color-${blockIdx % 6}`);
      }
      if (isCurrent) {
        dot.classList.add('current-session');
      }
      dot.style.left = `${position}%`;
      dot.title = `Session ${sessionNum}${isCurrent ? ' (Current)' : ''}`;
      line.appendChild(dot);

      // Checkpoint flag
      if (isCheckpoint) {
        const checkpointFlag = document.createElement('div');
        checkpointFlag.className = 'timeline-checkpoint-flag';
        checkpointFlag.style.left = `${position}%`;
        const checkpoint = this.planData.checkpoints.find(cp => cp.session === sessionNum);
        checkpointFlag.title = checkpoint ? `${checkpoint.type}: ${checkpoint.description || 'No description'}` : 'Checkpoint';
        line.appendChild(checkpointFlag);
      }
    });
    
    lineContainer.appendChild(line);
    timelineHTML.appendChild(lineContainer);

    // Legend - STRICT: Only show blocks from this.planData.blocks (persisted blocks)
    const legend = document.createElement('div');
    legend.className = 'timeline-legend enhanced';
    this.planData.blocks.forEach((block, index) => {
      // Only render legend items for valid blocks
      if (!block || !block.startSession || !block.endSession) return;
      
      const legendItem = document.createElement('div');
      legendItem.className = 'timeline-legend-item';
      legendItem.innerHTML = `
        <span class="legend-dot block-color-${index % 6}"></span>
        <div>
          <strong>${block.name || `Block ${index + 1}`}</strong>
          <small>Sessions ${block.startSession} - ${block.endSession}</small>
        </div>
      `;
      legend.appendChild(legendItem);
    });
    timelineHTML.appendChild(legend);

    timeline.innerHTML = '';
    timeline.appendChild(timelineHTML);
  }

  // ====================================
  // EVENT HANDLERS
  // ====================================

  setupEventListeners() {
    // Session settings toggle
    const toggle = document.getElementById('sessionSettingsToggle');
    const settingsMenu = document.getElementById('sessionSettingsMenu');
    
    if (toggle && settingsMenu) {
      // Set initial state - open by default
      if (toggle.checked) {
        settingsMenu.style.display = 'block';
      }
      
      toggle.addEventListener('change', (e) => {
        if (e.target.checked) {
          settingsMenu.style.display = 'block';
        } else {
          settingsMenu.style.display = 'none';
        }
      });
    }

    
  }

  navigateToPlanning() {
    // Navigate back to planning step (step 2) using the previousStep function
    // This ensures proper state management
    const currentStep = document.querySelector('.session-step.active');
    if (currentStep) {
      const currentStepNumber = parseInt(currentStep.dataset.step);
      
      // If we're on step 3, go back to step 2
      if (currentStepNumber === 3) {
        if (window.ui && window.ui.previousStep) {
          window.ui.previousStep();
        } else {
          // Fallback: manual navigation
          const planningStep = document.querySelector('.session-step[data-step="2"]');
          if (planningStep) {
            currentStep.classList.remove('active');
            planningStep.classList.remove('completed');
            planningStep.classList.add('active');
            
            if (window.ui) {
              window.ui.updateCurrentStepDetails(2);
              window.ui.updateNavigationButtons(2);
            }
          }
        }
      }
    }
  }

  // ====================================
  // DATA GETTERS
  // ====================================

  getClinicalObservation() {
    return this.clinicalObservation;
  }

  getCurrentSessionInfo() {
    return { ...this.currentSessionInfo };
  }

  updateThresholdHistory(sessions = []) {
    if (!Array.isArray(sessions) || sessions.length === 0) {
      this.thresholdSettings.previous = null;
      this.thresholdSettings.fallback = null;
      return;
    }

    const entries = sessions.map((session, index) => {
      const info = this.extractThresholdInfo(session);
      return {
        session,
        sessionNumber: session.__sessionNumber || (index + 1),
        info
      };
    });

    const lastEntryWithThreshold = [...entries].reverse().find(entry => entry.info);
    const firstEntryWithThreshold = entries.find(entry => entry.info);

    this.thresholdSettings.previous = lastEntryWithThreshold || null;
    this.thresholdSettings.fallback = firstEntryWithThreshold || null;
  }

  extractThresholdInfo(session) {
    if (!session || !session.thresholds) return null;
    let thresholdsData = session.thresholds;
    try {
      if (typeof thresholdsData === 'string') {
        thresholdsData = JSON.parse(thresholdsData);
      }
    } catch (e) {
      console.warn('Unable to parse thresholds data for session', session.id, e);
      return null;
    }

    return this.findThresholdValue(thresholdsData);
  }

  findThresholdValue(data, contextKey = null) {
    if (data === null || data === undefined) return null;
    if (typeof data === 'number' && !Number.isNaN(data)) {
      return { value: data, feature: contextKey || 'Threshold' };
    }

    if (typeof data === 'object') {
      if (typeof data.threshold === 'number') {
        return { value: data.threshold, feature: contextKey || 'Threshold' };
      }
      if (typeof data.current_threshold === 'number') {
        return { value: data.current_threshold, feature: contextKey || 'Threshold' };
      }
      for (const [key, value] of Object.entries(data)) {
        const result = this.findThresholdValue(value, key);
        if (result) return result;
      }
    }

    return null;
  }

  sanitizeThresholdValue(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return this.sessionSettings.default_threshold ?? this.thresholdSettings.defaultThreshold;
    }
    const clamped = Math.max(-2, Math.min(2, value));
    return parseFloat(clamped.toFixed(2));
  }

  formatThresholdValue(value, digits = 2) {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return parseFloat(value).toFixed(digits);
  }
}

// Make available globally
window.SessionPreparationPanel = SessionPreparationPanel;
