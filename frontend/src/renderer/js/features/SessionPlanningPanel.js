/**
 * Session Planning Panel Component
 * Compact planning interface for session progress window
 * Uses patient and disorder from previous PatientProfile step
 */

class SessionPlanningPanel {
  constructor() {
    this.patient = null;
    this.disorder = null;
    this.previousDisorder = null; // Track previous disorder to detect changes
    this.disorderData = null;
    this.assessmentData = null;
    this.availableProtocols = [];
    this.availableScenarios = [];
    this.protocolChangeDisorderFilter = undefined;
    this.currentSessionInfo = {
      sessionNumber: 0,
      block: null,
      protocol: null,
      sessionsInBlock: 0
    };
    this.planData = {
      blocks: [],
      protocols: [],
      checkpoints: [],
      totalSessions: 25,
    };
    this.containerId = "currentSessionStep";
    this.persistedBlockIds = new Set();
    this.persistedCheckpointIds = new Set();
    this.blocksMarkedForDeletion = new Set();
    this.checkpointsMarkedForDeletion = new Set();
  }

  initializePlanData() {
    if (!this.planData) {
      this.planData = { blocks: [], protocols: [], checkpoints: [], totalSessions: 25 };
    }
  }

  // ====================================
  // UI CREATION
  // ====================================

  createPlanningPanelHTML() {
    return `
            <div id="sessionPlanningPanel" class="session-planning-panel">
                <div class="session-planning-grid">
                    <!-- Patient Information Section -->
                    <aside class="planning-grid-header">
                        <!-- Left Column: Two stacked cards -->
                        <div class="planning-left-column">
                            <!-- Top Left Card: Disorder & Observations -->
                            <div class="planning-info-card planning-card-top">
                                <div class="planning-card-section">
                                    <h4 class="planning-card-title"><span class="planning-card-title-icon" data-lucide="brain"></span>Disorder</h4>
                                    <ul id="planningDisorderList" class="planning-info-list"></ul>
                                </div>
                                <div class="planning-card-section">
                                    <h4 class="planning-card-title"><span class="planning-card-title-icon" data-lucide="eye"></span>Observations</h4>
                                    <ul id="planningObservations" class="planning-info-list"></ul>
                                </div>
                            </div>

                            <!-- Bottom Left Card: QEEG Findings & Disorder Tests -->
                            <div class="planning-info-card planning-card-bottom">
                                <div class="planning-card-section">
                                    <h4 class="planning-card-title"><span class="planning-card-title-icon" data-lucide="activity"></span>QEEG Findings</h4>
                                    <ul id="planningQeegList" class="planning-info-list"></ul>
                                </div>
                                <div class="planning-card-section">
                                    <h4 class="planning-card-title"><span class="planning-card-title-icon" data-lucide="clipboard-list"></span>Disorder Tests</h4>
                                    <ul id="planningTestsList" class="planning-info-list"></ul>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Right Column: Current Session Info -->
                        <div class="planning-info-card planning-card-session" id="currentSessionInfoSection">
                            <div id="currentSessionInfoContent">
                                <div class="planning-session-empty">
                                    <p>Loading session information...</p>
                                </div>
                            </div>
                        </div>
                    </aside>

                    <!-- Treatment Planning Section -->
                    <main class="planning-single">
                        <div class="treatment-section">
                            <div class="section-header">
                                <h3>Treatment Timeline</h3>
                            </div>
                            <div class="timeline-container planning-carousel">
                                <div id="planningTimeline">
                                </div>
                            </div>
                        </div>

                        <div class="treatment-section blocks-checkpoints-section">
                            <div class="blocks-checkpoints-grid">
                                <div class="blocks-section">
                                    <div class="section-header">
                                        <h3>Treatment Blocks</h3>
                                        <button class="btn btn-primary" id="planningAddBlockBtn">
                                            <span data-lucide="plus"></span>
                                            Add Block
                                        </button>
                                    </div>
                                    <div class="table-container">
                                        <table class="data-table" id="planningBlocksTable">
                                            <thead>
                                                <tr>
                                                    <th>Block</th>
                                                    <th>Sessions</th>
                                                    <th>Protocol</th>
                                                    <th>Target</th>
                                                    <th>Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr class="empty-state">
                                                    <td colspan="5">No blocks defined. Click "Add Block" to get started.</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <div class="checkpoints-section">
                                    <div class="section-header">
                                        <h3>Checkpoints</h3>
                                        <button class="btn btn-primary" id="planningAddCheckpointBtn">
                                            <span data-lucide="plus"></span>
                                            Add
                                        </button>
                                    </div>
                                    <div class="table-container">
                                        <table class="data-table" id="planningCheckpointsTable">
                                            <thead>
                                                <tr>
                                                    <th>Session</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr class="empty-state">
                                                    <td colspan="4">No checkpoints defined. Click "Add" to get started.</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </main>
                </div>
            </div>
        `;
  }

  async show(patient, disorder) {
    if (!patient) return;

    if (this.patient && this.patient.id !== patient.id) {
      this.planData = { blocks: [], protocols: [], checkpoints: [], totalSessions: 25 };
      this.disorder = null;
      this.previousDisorder = null;
      this.disorderData = null;
      this.assessmentData = null;
      this.previousPatientId = this.patient.id;
      this.persistedBlockIds.clear();
      this.persistedCheckpointIds.clear();
      this.blocksMarkedForDeletion.clear();
      this.checkpointsMarkedForDeletion.clear();
    }

    this.patient = patient;

    const container = document.getElementById(this.containerId);
    if (!container) return;

    const stepContent = container.querySelector(".session-step-content");
    stepContent?.querySelectorAll("h2, p").forEach(el => el.style.display = "none");

    let panel = document.getElementById("sessionPlanningPanel");
    if (!panel) {
      const panelHTML = this.createPlanningPanelHTML();
      (stepContent || container).insertAdjacentHTML(stepContent ? "beforeend" : "afterbegin", panelHTML);
      panel = document.getElementById("sessionPlanningPanel");
      if (typeof lucide !== "undefined" && lucide.createIcons) {
        setTimeout(() => lucide.createIcons(), 100);
      }
      this.setupEventListeners();
    } else {
      panel.style.display = "block";
    }

    this.initializePlanData();
    this.populatePatientInfo();
    await this.loadPatientDisorderFromBackend();

    const currentDisorder = this.disorderData?.disorder || null;
    const disorderChanged = this.previousDisorder !== null && 
                            this.previousDisorder !== currentDisorder &&
                            this.patient?.id === (this.previousPatientId || this.patient?.id);
    
    if (this.disorderData?.disorder) {
      this.disorder = this.disorderData.disorder;
      this.populatePatientInfo();
    }

    if (disorderChanged) {
      this.planData.blocks = [];
      this.planData.checkpoints = [];
    }

    this.previousDisorder = currentDisorder;
    this.previousPatientId = this.patient?.id;

    await this.loadLatestAssessment();
    this.populateLeftSummary();
    await this.loadProtocolsIfNeeded();

    if (this.disorder) {
      await this.loadScenariosByDisorder(this.disorder);
      if (this.availableScenarios.length > 0 && this.planData.blocks.length === 0) {
        this.applySelectedScenario(this.availableScenarios[0].id);
      }
    }

    await this.loadTreatmentPlan();
    await this.loadCurrentSessionInfo();
  }

  hide() {
    document.getElementById("sessionPlanningPanel")?.style.setProperty('display', 'none');
  }

  // ====================================
  // DATA MANAGEMENT
  // ====================================

  populatePatientInfo() {
    const disorderNameInput = document.getElementById("planningDisorderName");
    if (disorderNameInput) {
      if (this.disorder) {
        disorderNameInput.value = this.disorder;
      } else if (this.disorderData && this.disorderData.disorder) {
        disorderNameInput.value = this.disorderData.disorder;
      } else {
        disorderNameInput.value = "Not specified";
      }
    }
  }

  async loadPatientDisorderFromBackend() {
    try {
      if (!this.patient?.id) {
        this.disorderData = null;
        this.disorder = null;
        return;
      }

      this.disorderData = await window.api.getPatientLatestDisorder(this.patient.id);

      if (this.disorderData?.disorder) {
        this.disorder = this.disorderData.disorder;
      } else {
        this.disorderData = null;
        this.disorder = null;
      }
    } catch (error) {
      console.error("Error loading patient disorder:", error);
      this.disorderData = null;
      this.disorder = null;
    }
  }

  async loadLatestAssessment() {
    try {
      if (!this.patient?.id) return;
      const assessments = await window.api.getAssessmentByPatient(this.patient.id);
      if (assessments?.length > 0) {
        this.assessmentData = assessments[0];
        if (this.assessmentData?.doctor_notes) {
          try {
            const parsed = typeof this.assessmentData.doctor_notes === "string"
              ? JSON.parse(this.assessmentData.doctor_notes)
              : this.assessmentData.doctor_notes;
            this.assessmentData = { ...this.assessmentData, ...parsed };
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  async loadProtocolsIfNeeded(force = false) {
    if (!force && this.availableProtocols?.length > 0) return;
    try {
      const protocols = await window.api?.getAllProtocols();
      this.availableProtocols = Array.isArray(protocols) && protocols.length > 0 ? protocols : [];
    } catch (e) {
      console.warn('Error loading protocols:', e);
      // Keep existing protocols if refresh fails
      if (!this.availableProtocols) this.availableProtocols = [];
    }
  }

  async loadCurrentSessionInfo() {
    try {
      if (!this.patient?.id) {
        await this.renderCurrentSessionInfo();
        return;
      }

      await this.loadProtocolsIfNeeded();

      let currentSessionNumber = 1;
      try {
        const sessions = await window.api.getSessionsByPatient(this.patient.id);
        currentSessionNumber = sessions?.length > 0 ? sessions.length + 1 : 1;
      } catch (e) {
        if (e.response?.status !== 404 && !e.message?.includes('No sessions found')) {
          console.warn('Error getting sessions:', e);
        }
      }

      const currentBlock = this.planData.blocks?.find(block => 
        currentSessionNumber >= block.startSession && 
        currentSessionNumber <= block.endSession
      ) || null;

      let protocol = null;
      if (currentBlock?.protocolId) {
        protocol = this.availableProtocols.find(p => p.id == currentBlock.protocolId);
        
        if (!protocol && window.api?.getProtocol) {
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

      this.currentSessionInfo = {
        sessionNumber: currentSessionNumber,
        block: currentBlock ? { ...currentBlock, protocolId: currentBlock.protocolId } : null,
        protocol: protocol,
        sessionsInBlock: currentBlock ? (currentSessionNumber - currentBlock.startSession + 1) : 0
      };

      await this.renderCurrentSessionInfo();
    } catch (error) {
      console.error('Error loading current session info:', error);
      await this.renderCurrentSessionInfo();
    }
  }

  async renderCurrentSessionInfo() {
    const content = document.getElementById('currentSessionInfoContent');
    if (!content) return;

    const info = this.currentSessionInfo;
    if (!info.sessionNumber) {
      content.innerHTML = '<div class="planning-session-empty"><p>No active session block found</p></div>';
      return;
    }

    const blockInfo = this.planData.blocks?.find(block => 
      info.sessionNumber >= block.startSession && info.sessionNumber <= block.endSession
    );
    
    if (!blockInfo) {
      content.innerHTML = '<div class="planning-session-empty"><p>No active session block found</p></div>';
      return;
    }
    
    await this.loadProtocolsIfNeeded();

    let protocol = blockInfo.protocolId ? this.availableProtocols.find(p => p.id == blockInfo.protocolId) : null;
    
    if (!protocol && blockInfo.protocolId && window.api?.getProtocol) {
      try {
        protocol = await window.api.getProtocol(blockInfo.protocolId);
        if (protocol && !this.availableProtocols.find(p => p.id === protocol.id)) {
          this.availableProtocols.push(protocol);
        }
      } catch (e) {
        console.warn('Error fetching protocol:', e);
      }
    }

    const bands = protocol?.features?.frequency_bands || [];
    const rewardBands = bands.filter(b => b.type === 'reward');
    const inhibitBands = bands.filter(b => b.type === 'inhibit');
    const ratioBands = bands.filter(b => b.type === 'ratio');
    const allChannels = [...new Set(bands.flatMap(b => b.channels || []))];
    
    const formatBand = (b) => {
      if (b.type === 'ratio') {
        const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
        const displayName = (b.numerator && b.denominator)
          ? `${cap(b.numerator)}/${cap(b.denominator)} Ratio`
          : (b.name?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Ratio');
        const ch = b.channels?.[0] || '';
        return `${displayName}${ch ? ' @ ' + ch : ''}`;
      }
      return `${b.frequency_range?.[0] || 0}-${b.frequency_range?.[1] || 0}Hz${b.channels?.length ? ' @ ' + b.channels.join(', ') : ''}`;
    };
    
    let protocolDetailsHTML = '';
    if (protocol) {
      protocolDetailsHTML = `
        <div class="planning-protocol-details">
          <div class="planning-protocol-name">${protocol.name || 'Unnamed Protocol'}</div>
          ${allChannels.length > 0 ? `<div class="planning-protocol-info"><span class="planning-protocol-info-icon" data-lucide="target"></span><div class="planning-protocol-info-label">Channels</div><div class="planning-protocol-info-value">${allChannels.join(', ')}</div></div>` : ''}
          ${rewardBands.length > 0 ? `<div class="planning-protocol-info is-reward"><span class="planning-protocol-info-icon" data-lucide="trending-up"></span><div class="planning-protocol-info-label">Reward</div><div class="planning-protocol-info-value">${rewardBands.map(formatBand).join(', ')}</div></div>` : ''}
          ${inhibitBands.length > 0 ? `<div class="planning-protocol-info is-inhibit"><span class="planning-protocol-info-icon" data-lucide="trending-down"></span><div class="planning-protocol-info-label">Inhibit</div><div class="planning-protocol-info-value">${inhibitBands.map(formatBand).join(', ')}</div></div>` : ''}
          ${ratioBands.length > 0 ? `<div class="planning-protocol-info is-ratio"><span class="planning-protocol-info-icon" data-lucide="divide"></span><div class="planning-protocol-info-label">Ratio</div><div class="planning-protocol-info-value">${ratioBands.map(formatBand).join(', ')}</div></div>` : ''}
        </div>
      `;
    } else if (blockInfo.protocolId) {
      protocolDetailsHTML = `<div class="planning-protocol-details"><div class="planning-protocol-loading">Protocol ID: ${blockInfo.protocolId}</div><div class="planning-protocol-loading-sub">Loading protocol details...</div></div>`;
    } else {
      protocolDetailsHTML = `<div class="planning-protocol-details"><div class="planning-protocol-empty">No protocol assigned</div></div>`;
    }

    content.innerHTML = `
      <div class="planning-session-content">
        <div class="planning-session-header">
          <div class="planning-session-number">Session ${info.sessionNumber}</div>
        </div>
        <div class="planning-session-protocol">
          <div class="planning-protocol-header">
            <div class="planning-protocol-label">Protocol</div>
            <button class="btn btn-sm btn-secondary planning-protocol-change-btn" id="changeProtocolBtn" onclick="window.sessionPlanningPanel.showProtocolChangeModal()">Change</button>
          </div>
          ${protocolDetailsHTML}
        </div>
      </div>
    `;

    // Render the Lucide icons just injected into the protocol rows.
    if (typeof lucide !== "undefined" && lucide.createIcons) {
      lucide.createIcons();
    }
  }

  _extractProtocolAcronym(name) {
    if (!name) return null;
    const colon = name.indexOf(':');
    if (colon > 0) return name.slice(0, colon).trim();
    // fallback: first word
    return name.split(/\s+/)[0] || null;
  }

  _extractProtocolDisorder(name) {
    if (!name) return null;
    const matches = name.match(/\(([^()]+)\)/g);
    if (!matches || matches.length === 0) return null;
    return matches[matches.length - 1].slice(1, -1).trim();
  }

  async showProtocolChangeModal() {
    if (!this.currentSessionInfo.block) {
      return;
    }

    const block = this.currentSessionInfo.block;
    await this.loadProtocolsIfNeeded(true);

    // Reset filter so it re-defaults to the patient disorder each time the modal opens.
    this.protocolChangeDisorderFilter = undefined;

    let modal = document.getElementById('planningProtocolChangeModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'modal';
      modal.id = 'planningProtocolChangeModal';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="modal-content" style="max-width:600px">
        <div class="modal-header">
          <h3>Change Protocol — Session ${this.currentSessionInfo.sessionNumber}</h3>
          <button class="modal-close" onclick="window.sessionPlanningPanel.closeProtocolChangeModal()">&times;</button>
        </div>
        <div style="padding:16px 20px 4px;color:var(--text-secondary);font-size:13px;">
          Select a protocol for this block (Sessions ${block.startSession}–${block.endSession}).
        </div>
        <div id="protocolChangeListWrapper" style="padding:12px 20px 8px;">
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="window.sessionPlanningPanel.closeProtocolChangeModal()">Cancel</button>
        </div>
      </div>`;

    modal.classList.add('active');
    this._renderProtocolChangeList();
  }

  _renderProtocolChangeList() {
    const wrapper = document.getElementById('protocolChangeListWrapper');
    if (!wrapper) return;

    const block = this.currentSessionInfo.block;
    const currentProtocolId = block?.protocolId;
    const allProtocols = this.availableProtocols;

    const disorders = [...new Set(
      allProtocols.map(p => this._extractProtocolDisorder(p.name)).filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));

    if (this.protocolChangeDisorderFilter === undefined) {
      const patientDisorder = this.disorder || null;
      const matched = patientDisorder
        ? disorders.find(d => d.toLowerCase() === patientDisorder.toLowerCase())
        : null;
      this.protocolChangeDisorderFilter = matched || 'all';
    }
    if (this.protocolChangeDisorderFilter !== 'all' &&
        !disorders.some(d => d === this.protocolChangeDisorderFilter)) {
      this.protocolChangeDisorderFilter = 'all';
    }

    const activeFilter = this.protocolChangeDisorderFilter;
    const filtered = activeFilter === 'all'
      ? allProtocols
      : allProtocols.filter(p => this._extractProtocolDisorder(p.name) === activeFilter);

    const filterHtml = disorders.length > 0 ? `
      <div class="protocol-disorder-filter" style="display:flex;align-items:center;gap:var(--spacing-sm);margin-bottom:var(--spacing-base);">
        <label style="font-size:0.85em;font-weight:500;color:var(--text-secondary);">Disorder</label>
        <select class="form-control" style="max-width:240px;"
                onchange="window.sessionPlanningPanel._onProtocolChangeFilterChange(this.value)">
          <option value="all" ${activeFilter === 'all' ? 'selected' : ''}>All disorders</option>
          ${disorders.map(d => `<option value="${d}" ${activeFilter === d ? 'selected' : ''}>${d}</option>`).join('')}
        </select>
      </div>` : '';

    const cardsHtml = filtered.length === 0
      ? `<p style="color:var(--text-secondary);text-align:center;padding:24px 0;">No protocols found for "${activeFilter}".</p>`
      : filtered.map(p => {
          const bands = p.features?.frequency_bands || [];
          const rewardBands = bands.filter(b => b.type === 'reward');
          const inhibitBands = bands.filter(b => b.type === 'inhibit');
          const ratioBands = bands.filter(b => b.type === 'ratio');
          const channels = [...new Set(bands.flatMap(b => b.channels || []))].join(', ');
          const rewardText = rewardBands.map(b => `${b.frequency_range?.[0] || 0}-${b.frequency_range?.[1] || 0}Hz${b.channels?.length ? ' @ ' + b.channels.join(',') : ''}`).join(', ')
            || p.reward_frequency || '';
          const inhibitText = inhibitBands.map(b => `${b.frequency_range?.[0] || 0}-${b.frequency_range?.[1] || 0}Hz${b.channels?.length ? ' @ ' + b.channels.join(',') : ''}`).join(', ')
            || p.inhibit_frequency || '';
          const ratioText = ratioBands.map(b => {
            const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
            const name = (b.numerator && b.denominator)
              ? `${cap(b.numerator)}/${cap(b.denominator)} Ratio`
              : (b.name?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Ratio');
            const ch = b.channels?.[0] || '';
            return `${name}${ch ? ' @ ' + ch : ''}`;
          }).join(', ');
          const displayChannels = channels || (p.location ? p.location : '');
          const isSelected = p.id === currentProtocolId;
          const isDefault = p.is_default || false;
          return `
            <div class="protocol-change-item ${isSelected ? 'is-selected' : ''}"
                 onclick="window.sessionPlanningPanel._selectProtocolFromModal(${p.id})">
              <div class="protocol-change-item-name">
                ${p.name || `Protocol ${p.id}`}
                ${isDefault ? '<span style="font-size:11px;background:var(--text-secondary);color:#fff;border-radius:4px;padding:1px 6px;margin-left:6px;">Default</span>' : ''}
              </div>
              ${displayChannels ? `<div class="protocol-change-item-meta">Channels: ${displayChannels}</div>` : ''}
              ${rewardText ? `<div class="protocol-change-item-meta is-reward">↑ Reward: ${rewardText}</div>` : ''}
              ${inhibitText ? `<div class="protocol-change-item-meta is-inhibit">↓ Inhibit: ${inhibitText}</div>` : ''}
              ${ratioText ? `<div class="protocol-change-item-meta" style="color:var(--primary-color);">⇅ Ratio: ${ratioText}</div>` : ''}
              ${isSelected ? '<div class="protocol-change-item-badge">Current</div>' : ''}
            </div>`;
        }).join('');

    wrapper.innerHTML = `
      ${filterHtml}
      <div style="display:flex;flex-direction:column;gap:8px;max-height:380px;overflow-y:auto;">
        ${cardsHtml}
      </div>`;
  }

  _onProtocolChangeFilterChange(value) {
    this.protocolChangeDisorderFilter = value;
    this._renderProtocolChangeList();
  }

  async _selectProtocolFromModal(protocolId) {
    const block = this.currentSessionInfo.block;
    if (!block) return;
    this.closeProtocolChangeModal();
    await this.updateBlockProtocol(block, protocolId);
  }

  closeProtocolChangeModal() {
    const modal = document.getElementById('planningProtocolChangeModal');
    if (modal) modal.classList.remove('active');
  }

  async updateBlockProtocol(block, protocolId) {
    const currentSession = this.currentSessionInfo.sessionNumber;

    if (!block.id) {
      block.protocolId = protocolId;
      await this.renderCurrentSessionInfo();
      this.renderTimeline();
      return;
    }

    try {
      // If we're mid-block (completed sessions exist before the current one),
      // split: shrink the existing block to end just before currentSession,
      // then create a new block from currentSession onward with the new protocol.
      if (currentSession > block.startSession) {
        const oldEnd = block.endSession;

        // Shrink current block to cover only completed sessions
        await axios.put(`/planning/blocks/${block.id}`, {
          end_session: currentSession - 1
        });

        // Create new block for remaining sessions with new protocol,
        // inheriting the original block's target so it doesn't show N/A.
        const resp = await axios.post(`/planning/blocks/`, {
          patient_id: this.patient.id,
          start_session: currentSession,
          end_session: oldEnd,
          protocol_id: protocolId,
          target: block.target || null
        });

        // Sync local planData
        const blockInPlan = this.planData.blocks.find(b => b.id === block.id);
        if (blockInPlan) blockInPlan.endSession = currentSession - 1;

        const newBlock = resp.data;
        this.planData.blocks.push({
          id: newBlock.id,
          startSession: newBlock.start_session,
          endSession: newBlock.end_session,
          protocolId: newBlock.protocol_id,
          target: newBlock.target,
          name: newBlock.name
        });
        this.planData.blocks.sort((a, b) => a.startSession - b.startSession);
      } else {
        // No completed sessions in this block — just update the protocol in place
        await axios.put(`/planning/blocks/${block.id}`, { protocol_id: protocolId });
        const blockInPlan = this.planData.blocks.find(b => b.id === block.id);
        if (blockInPlan) blockInPlan.protocolId = protocolId;
      }

      await this.loadCurrentSessionInfo();
      this.renderBlocks();
      this.renderTimeline();
    } catch (error) {
      console.error('Error updating protocol:', error);
    }
  }

  populateLeftSummary() {
    const rawAssessmentData = Array.isArray(this.assessmentData)
      ? this.assessmentData[this.assessmentData.length - 1]
      : this.assessmentData;
    const assessment = rawAssessmentData || null;
    const disorder = this.disorderData || {};

    const populateList = (listId, items, emptyText) => {
      const list = document.getElementById(listId);
      if (!list) return;
      list.innerHTML = "";
      items.forEach(item => {
        if (!item) return;
        const li = document.createElement("li");
        li.textContent = item;
        list.appendChild(li);
      });
      if (!list.children.length) {
        const li = document.createElement("li");
        li.className = "text-secondary";
        li.textContent = emptyText;
        list.appendChild(li);
      }
    };

    // The assessment payload and the legacy flattened disorder object carry the SAME
    // clinical concept under several keys: a human-readable label ("TBR ↑"), a snake_case
    // column ("high_tbr"), and sometimes a free-text "other" dump. We collapse each concept
    // to a single row — preferring the clinical label and attaching any recorded score — so
    // nothing is listed twice (the cause of the "Sleep (ISI)" + "ISI" duplicate rows).
    const isTrue = (v) => v === true || v === "true" || v === 1;
    const cleanText = (v) => {
      if (v === null || v === undefined) return "";
      const t = String(v).trim();
      const lower = t.toLowerCase();
      return lower === "true" || lower === "false" ? "" : t;
    };
    // Merge candidate source objects into one lookup; earlier sources win (assessment
    // dicts carry the human labels and scores, so they take priority over the disorder columns).
    const mergeSources = (sources) => {
      const merged = {};
      sources.forEach((src) => {
        if (!src || typeof src !== "object" || Array.isArray(src)) return;
        Object.entries(src).forEach(([k, v]) => {
          if (v === undefined || v === null) return;
          if (merged[k] === undefined || merged[k] === false || merged[k] === "") merged[k] = v;
        });
      });
      return merged;
    };

    const QEEG_CONCEPTS = [
      { label: "TBR ↑", keys: ["TBR ↑", "High TBR", "high_tbr"] },
      { label: "SMR ↓", keys: ["SMR ↓", "smr_low"] },
      { label: "High-Beta ↑", keys: ["High-Beta ↑", "High Beta ↑", "high_beta_high"] },
      { label: "Frontal Alpha Asymmetry", keys: ["Frontal Alpha Asymmetry", "left_alpha_excess"] },
      { label: "Frontal Beta ↓", keys: ["Frontal Beta ↓", "frontal_beta_low"] },
      { label: "Slow Peak Alpha", keys: ["Slow Peak Alpha", "paf_slow"] },
      { label: "Alpha ↓", keys: ["Alpha ↓", "alpha_low"] },
      { label: "Alpha/Theta ↑", keys: ["Alpha/Theta ↑", "alpha_theta_high"] },
      { label: "Theta ↑", keys: ["Theta ↑", "theta_high"] },
      { label: "Frontal Theta ↑", keys: ["Frontal Theta ↑", "frontal_theta_high"] },
      { label: "Coherence", keys: ["coherence", "Coherence"] }
    ];

    const TEST_CONCEPTS = [
      { label: "RS/Conners", keys: ["RS/Conners", "rs_conners"], scoreKeys: ["RS/Conners_score", "rs_conners_score"] },
      { label: "Sleep (ISI)", keys: ["Sleep (ISI)", "isi"], scoreKeys: ["Sleep (ISI)_score", "isi_score"] },
      { label: "Anxiety (GAD-7)", keys: ["Anxiety (GAD-7)", "gad7"], scoreKeys: ["Anxiety (GAD-7)_score", "gad7_score"] },
      { label: "Depression (PHQ-9)", keys: ["Depression (PHQ-9)", "phq", "phq9"], scoreKeys: ["Depression (PHQ-9)_score", "phq_score", "phq9_score"] },
      { label: "WM Score", keys: ["WM Score", "wm"], scoreKeys: ["WM Score_score", "wm_score"] },
      { label: "Y-BOCS", keys: ["Y-BOCS", "ybocs"], scoreKeys: ["Y-BOCS_score", "ybocs_score"] },
      { label: "CAPS-5", keys: ["CAPS-5", "caps5"], scoreKeys: ["CAPS-5_score", "caps5_score"] },
      { label: "Executive Control", keys: ["Executive Control", "executive_c"], scoreKeys: ["executive_c_score"] },
      { label: "Sustained Attention", keys: ["Sustained Attention", "sustained_a"], scoreKeys: ["sustained_a_score"] }
    ];

    const OBS_CONCEPTS = [
      { label: "Processing Speed Problem", keys: ["Processing Speed Problem", "processing_speed"] },
      { label: "Inattention", keys: ["Inattention", "inattention"] },
      { label: "Rumination", keys: ["Rumination", "rumination"] },
      { label: "Trauma Intrusion", keys: ["Trauma Intrusion", "Trauma", "trauma"] },
      { label: "Psychomotor Restlessness", keys: ["Psychomotor Restlessness", "psychomotor_restlessness"] },
      { label: "Executive Control Problem", keys: ["Executive Control Problem", "executive_control_problem"] },
      { label: "Tension", keys: ["Tension", "tension"] },
      { label: "Fatigue Problem", keys: ["Fatigue Problem", "fatigue"] },
      { label: "Sleep-Onset Latency", keys: ["Sleep-Onset Latency", "sleep_onset_latency"] },
      { label: "Hyper Arousal", keys: ["Hyper Arousal", "anxiety"] },
      { label: "Over Focus", keys: ["Over Focus", "over_focus"] },
      { label: "Intrusive Chatter", keys: ["Intrusive Chatter", "intrusive_chatter"] },
      { label: "Executive Inflexibility", keys: ["Executive Inflexibility", "executive_inflexibility"] },
      { label: "Compulsive Tension", keys: ["Compulsive Tension", "compulsive_tension"] },
      { label: "Emotional Dysregulation", keys: ["Emotional Dysregulation", "emotional_dysregulation"] }
    ];

    // collapse a label to a comparison token so free-text "other" doesn't repeat a concept row
    const norm = (s) => String(s || "").toLowerCase().replace(/[↑↓\s/-]/g, "");

    const buildQeegItems = (merged) => {
      const items = [];
      const used = new Set();
      QEEG_CONCEPTS.forEach((c) => {
        if (c.keys.some((k) => isTrue(merged[k]))) {
          items.push(c.label);
          used.add(norm(c.label));
        }
      });
      cleanText(merged.other_text || merged.qeeg_other)
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((part) => {
          if (used.has(norm(part))) return; // already listed as a checkbox finding
          items.push(`Other: ${part}`);
          used.add(norm(part));
        });
      return items;
    };

    const buildTestItems = (merged) => {
      const items = [];
      TEST_CONCEPTS.forEach((c) => {
        const present = c.keys.some((k) => isTrue(merged[k]));
        let score = "";
        for (const sk of c.scoreKeys) {
          score = cleanText(merged[sk]);
          if (score) break;
        }
        if (present || score) items.push(score ? `${c.label}: ${score}` : c.label);
      });
      const otherName = cleanText(merged.other_name) || cleanText(merged.cognitive_other) ||
        (isTrue(merged.other) ? "Other Test" : "");
      const otherScore = cleanText(merged.other_score);
      if (otherName) items.push(otherScore ? `${otherName}: ${otherScore}` : otherName);
      else if (otherScore) items.push(`Other Test: ${otherScore}`);
      return items;
    };

    const buildObsItems = (merged) => {
      const items = [];
      OBS_CONCEPTS.forEach((c) => {
        if (c.keys.some((k) => isTrue(merged[k]))) items.push(c.label);
      });
      const note = cleanText(merged.observation_note) || cleanText(merged.clinical_observation);
      if (note) items.push(`Note: ${note}`);
      return items;
    };

    const disorderName =
      this.disorder ||
      disorder.disorder ||
      (assessment?.patient_issues?.[0]
        ? typeof assessment.patient_issues[0] === "string"
          ? assessment.patient_issues[0]
          : assessment.patient_issues[0]?.issue
        : null);
    populateList("planningDisorderList", disorderName ? [disorderName] : [], "Not specified");

    const qeegMerged = mergeSources([assessment?.qeeg_findings, assessment?.qeegFindings, disorder]);
    const testMerged = mergeSources([assessment?.disorder_tests, assessment?.disorderTests, disorder]);
    const obsMerged = mergeSources([
      assessment?.observations,
      disorder,
      assessment?.clinical_observation ? { clinical_observation: assessment.clinical_observation } : null
    ]);

    populateList("planningQeegList", buildQeegItems(qeegMerged), "No findings recorded");
    populateList("planningTestsList", buildTestItems(testMerged), "No tests recorded");
    populateList("planningObservations", buildObsItems(obsMerged), "No observations recorded");
  }

  async loadScenariosByDisorder(disorderName) {
    try {
      this.availableScenarios = await window.api.getScenariosByDisorder(disorderName);
    } catch (error) {
      this.availableScenarios = [];
    }
  }

  async generatePlanFromDisorder(disorderName) {
    try {
      if (!this.patient?.id) throw new Error("No patient selected");

      await this.loadProtocolsIfNeeded();

      if (this.availableProtocols.length === 0) {
        try {
          await window.api.initializeDefaultProtocols();
          await this.loadProtocolsIfNeeded();
          if (this.availableProtocols.length === 0) {
            throw new Error("No protocols available after initialization");
          }
        } catch (initError) {
          
        }
      }

      // Show notification asking user to create their first block instead of auto-generating
      // 
      // Automatically prompt to create the first block
      setTimeout(() => {
        this.showBlockModal();
      }, 1000);
    } catch (genError) {
      const errorMessage = genError.response?.data?.detail || genError.message || 'Unknown error';

    }
  }

  async loadTreatmentPlan() {
    try {
      if (!this.patient?.id) return;

      if (!this.planData) {
        this.planData = { blocks: [], protocols: [], checkpoints: [], totalSessions: 25 };
      } else {
        this.planData.blocks = [];
        this.planData.checkpoints = [];
      }
      this.blocksMarkedForDeletion.clear();
      this.checkpointsMarkedForDeletion.clear();
      this.persistedBlockIds = new Set();
      this.persistedCheckpointIds = new Set();

      const treatmentPlan = await window.api.getTreatmentPlanByPatient(this.patient.id);
      const currentDisorder = treatmentPlan?.disorder?.disorder;
      const disorderChanged = this.previousDisorder !== null &&
                            this.previousDisorder !== currentDisorder &&
                            currentDisorder !== null;

      if (disorderChanged && treatmentPlan?.blocks?.length > 0) {
        // When disorder changes and there are existing blocks, ask user to create new blocks for the new disorder
        // 
        this.previousDisorder = currentDisorder;
        // Don't automatically generate plans anymore - let user decide
      } else if (disorderChanged && treatmentPlan?.blocks?.length === 0) {
        // If there are no existing blocks and disorder changed, prompt to create first block
        // 
        // Automatically prompt to create the first block
        setTimeout(() => {
          this.showBlockModal();
        }, 1000);
      }
      
      if (currentDisorder) {
        this.previousDisorder = currentDisorder;
      }
      
      if (treatmentPlan?.blocks?.length > 0) {
        const sortedBlocks = [...treatmentPlan.blocks].sort((a, b) => 
          (a.start_session || 0) - (b.start_session || 0)
        );

        sortedBlocks.forEach((block, index) => {
          this.planData.blocks.push({
            name: `Block ${index + 1}`,
            startSession: block.start_session,
            endSession: block.end_session,
            protocolId: block.protocol_id,
            target: "TBD",
            id: block.id,
          });
        });

        try {
          const checkpointsResponse = await axios.get(`/planning/checkpoints/patient/${this.patient.id}`);
          if (Array.isArray(checkpointsResponse.data)) {
            checkpointsResponse.data.forEach(cp => {
              if (!this.planData.checkpoints.some(existing => existing.session === cp.session_value)) {
                this.planData.checkpoints.push({
                  session: cp.session_value,
                  type: cp.checkpoint_type || "Progress Review",
                  description: cp.description || "",
                  blockId: cp.block_id || null,
                  id: cp.id,
                });
              }
            });
          }
        } catch (cpError) {
          console.warn("Could not load checkpoints:", cpError);
        }
      } else if (treatmentPlan?.disorder?.disorder) {
        // Show notification that the user needs to create their first block
        // 
        // Automatically prompt to create the first block
        setTimeout(() => {
          this.showBlockModal();
        }, 1000);
      }

      this.persistedBlockIds = new Set(this.planData.blocks.filter(block => block.id).map(block => block.id));
      this.persistedCheckpointIds = new Set(this.planData.checkpoints.filter(cp => cp.id).map(cp => cp.id));
      this.renderTimeline();
      this.renderCheckpoints();
      await this.loadCurrentSessionInfo(); // sets currentSessionInfo.sessionNumber before blocks render
      this.renderBlocks(); // must come after loadCurrentSessionInfo so Done status is correct
    } catch (error) {
      console.error("Error loading treatment plan:", error);
      if (!this.planData) {
        this.planData = { blocks: [], protocols: [], checkpoints: [], totalSessions: 25 };
      }
      this.renderTimeline();
      this.renderBlocks();
      this.renderCheckpoints();
    }
  }

  async applyExternalDisorderUpdate({ patientId, disorderData, assessmentData }) {
    if (!patientId || !this.patient || this.patient.id !== patientId) {
      return;
    }

    if (disorderData) {
      this.disorderData = disorderData;
      this.disorder = disorderData.disorder || null;
      this.previousDisorder = this.disorder;
    }

    if (assessmentData) {
      this.assessmentData = {
        patient_issues: Array.isArray(assessmentData.patient_issues)
          ? assessmentData.patient_issues.map(issue => ({ ...issue }))
          : [],
        qeeg_findings: { ...(assessmentData.qeeg_findings || {}) },
        disorder_tests: { ...(assessmentData.disorder_tests || {}) },
        observations: { ...(assessmentData.observations || {}) },
      };
    } else {
      await this.loadLatestAssessment();
    }

    this.populatePatientInfo();
    this.populateLeftSummary();
  }

  async reloadPlanData() {
    await this.loadTreatmentPlan();
  }

  // ====================================
  // RENDERING
  // ====================================

  renderTimeline() {
    const timeline = document.getElementById("planningTimeline");
    if (!timeline) return;

    timeline.innerHTML = "";
    const totalSessions = this.planData.totalSessions || 25;
    
    if (totalSessions === 0) {
      const empty = document.createElement("div");
      empty.className = "timeline-block-view empty-state";
      empty.textContent = "No sessions configured. Set total sessions to view the timeline.";
      timeline.appendChild(empty);
      return;
    }

    const view = document.createElement("div");
    const strip = document.createElement("div");
    strip.className = "timeline-strip";

    const getBlockForSession = (sessionNum) => 
      this.planData.blocks.find(block => block.startSession <= sessionNum && sessionNum <= block.endSession);

    for (let i = 1; i <= totalSessions; i++) {
      const sessionDiv = document.createElement("div");
      const block = getBlockForSession(i);
      
      sessionDiv.className = block ? "timeline-session" : "timeline-session empty-session";
      if (block) {
        sessionDiv.classList.add(`block-color-${this.planData.blocks.indexOf(block) % 6}`);
      }

      const label = document.createElement("div");
      label.className = "session-label";
      label.textContent = `S${i}`;
      sessionDiv.appendChild(label);

      if (block?.protocolId) {
        const badge = document.createElement("div");
        badge.className = "protocol-badge";
        const proto = this.availableProtocols.find(p => p.id == block.protocolId);
        const acronym = this._extractProtocolAcronym(proto?.name) || `P${block.protocolId}`;
        badge.textContent = acronym;
        if (proto?.name) badge.title = proto.name;
        sessionDiv.appendChild(badge);
      } else if (!block) {
        const unassignedBadge = document.createElement("div");
        unassignedBadge.className = "protocol-badge unassigned";
        unassignedBadge.textContent = "—";
        unassignedBadge.title = "Unassigned session";
        sessionDiv.appendChild(unassignedBadge);
      }

      if (block) {
        sessionDiv.title = `${block.name || `Block ${this.planData.blocks.indexOf(block) + 1}`}${block.target ? ` - ${block.target}` : ""}`;
      }

      strip.appendChild(sessionDiv);
    }

    view.appendChild(strip);

    requestAnimationFrame(() => {
      const gap = 8;
      const minSessionWidth = 80;
      const totalWidth = (totalSessions * minSessionWidth) + ((totalSessions - 1) * gap);
      
      strip.style.gridTemplateColumns = `repeat(${totalSessions}, ${minSessionWidth}px)`;
      strip.style.width = `${totalWidth}px`;
      strip.style.minWidth = `${totalWidth}px`;
      
      const timelineContainer = timeline.closest('.timeline-container');
      if (timelineContainer) {
        timelineContainer.style.overflowX = 'auto';
        timelineContainer.style.overflowY = 'hidden';
      }
    });
    
    timeline.appendChild(view);
  }

  renderBlocks() {
    const tbody = document.querySelector("#planningBlocksTable tbody");
    if (!tbody) return;

    if (this.planData.blocks.length === 0) {
      tbody.innerHTML = '<tr class="empty-state"><td colspan="5">No blocks defined. Click "Add Block" to get started.</td></tr>';
      return;
    }

    const currentSession = this.currentSessionInfo?.sessionNumber || 1;

    tbody.innerHTML = this.planData.blocks.map((block, index) => {
      const protocol = this.availableProtocols.find(p => p.id === block.protocolId);
      const protocolDisplay = block.protocolId
        ? (protocol?.name || `Protocol ID: ${block.protocolId}`)
        : "Not assigned";
      const isDone = block.endSession != null && block.endSession < currentSession;

      return `
        <tr${isDone ? ' class="row-done"' : ''}>
          <td>${block.name || `Block ${index + 1}`}</td>
          <td>${block.startSession || ""}-${block.endSession || ""}</td>
          <td>${protocolDisplay}</td>
          <td>${block.target || "N/A"}</td>
          <td>
            ${isDone
              ? '<span class="done-badge">Done</span>'
              : `<button class="action-btn" onclick="window.sessionPlanningPanel.editBlock(${index})" title="Edit">
              <span data-lucide="edit"></span>
            </button>
            <button class="action-btn delete" onclick="window.sessionPlanningPanel.deleteBlock(${index})" title="Delete">
              <span data-lucide="trash-2"></span>
            </button>`
            }
          </td>
        </tr>
      `;
    }).join("");

    if (typeof lucide !== "undefined" && lucide.createIcons) {
      lucide.createIcons();
    }
  }

  // ====================================
  // DATA SYNC
  // ====================================

  syncToTreatmentPlan() {
    if (!window.treatmentPlan?.planData) return;
    window.treatmentPlan.planData.blocks = (this.planData.blocks || []).map(block => ({
      name: block.name,
      startSession: block.startSession,
      endSession: block.endSession,
      protocolId: block.protocolId,
      target: block.target || "TBD",
      notes: block.notes || "",
      id: block.id,
    }));
    if (this.planData.totalSessions) {
      window.treatmentPlan.planData.totalSessions = this.planData.totalSessions;
    }
  }

  async syncFromTreatmentPlan() {
    if (!window.treatmentPlan?.planData) return;

    const existingBlocks = [...(this.planData.blocks || [])];
    const treatmentPlanBlocks = window.treatmentPlan.planData.blocks || [];
    const existingBlocksMap = new Map();
    existingBlocks.forEach(block => {
      if (block.id) existingBlocksMap.set(`id_${block.id}`, block);
      existingBlocksMap.set(`range_${block.startSession}_${block.endSession}`, block);
    });
    
    this.planData.blocks = treatmentPlanBlocks.map((block, index) => {
      const existingBlock = existingBlocksMap.get(`id_${block.id}`) || 
                           existingBlocksMap.get(`range_${block.startSession}_${block.endSession}`) ||
                           existingBlocks[index];

      return {
        name: block.name || `Block ${index + 1}`,
        startSession: block.startSession,
        endSession: block.endSession,
        protocolId: block.protocolId || null,
        target: block.target || existingBlock?.target || "TBD",
        notes: block.notes || existingBlock?.notes || "",
        id: existingBlock?.id || block.id || null,
      };
    });

    this.renderTimeline();
    this.renderCheckpoints();
    await this.loadCurrentSessionInfo(); // must resolve before blocks render so Done flags are correct
    this.renderBlocks();
  }

  // ====================================
  // EVENT HANDLERS
  // ====================================

  setupEventListeners() {
    document.getElementById("planningAddBlockBtn")?.addEventListener("click", () => {
      this.showBlockModal();
    });

    document.getElementById("planningAddCheckpointBtn")?.addEventListener("click", () => {
      this.showCheckpointModal();
    });
  }

  applySelectedScenario(scenarioId) {
    const scenario = this.availableScenarios.find((s) => s.id === scenarioId);
    if (!scenario) return;

    this.planData.totalSessions = scenario.sessions;
    this.planData.blocks = scenario.blocks.map((block, index) => {
      const [start, end] = block.sessions.split("-").map(Number);
      return {
        name: `Block ${index + 1}`,
        startSession: start,
        endSession: end,
        protocolId: null,
        target: block.target,
        notes: `From ${scenario.name}`,
      };
    });

    this.renderTimeline();
    this.renderBlocks();
    this.renderCheckpoints();
    
  }

  showBlockModal(blockData = null, index = -1) {
    if (window.treatmentPlan?.showBlockModal) {
      this.syncToTreatmentPlan();
      
      if (blockData && index >= 0 && this.planData.blocks[index]) {
        blockData = { ...this.planData.blocks[index] };
        const treatmentPlanIndex = window.treatmentPlan.planData.blocks.findIndex(
          b => (b.id && b.id === blockData.id) || 
               (b.startSession === blockData.startSession && b.endSession === blockData.endSession)
        );
        if (treatmentPlanIndex >= 0) index = treatmentPlanIndex;
      }
      
      const originalSaveBlock = window.treatmentPlan.saveBlock.bind(window.treatmentPlan);
      window.treatmentPlan.saveBlock = async () => {
        originalSaveBlock();
        setTimeout(async () => {
          this.syncFromTreatmentPlan();
          await this.savePlan();
        }, 100);
      };
      
      window.treatmentPlan.showBlockModal(blockData, index >= 0 ? index : -1);
      
      const modal = document.getElementById('blockModal');
      if (modal) {
        const cleanup = () => {
          clearInterval(interval);
          observer.disconnect();
        };
        const checkModal = () => {
          if (!modal.classList.contains('active')) {
            cleanup();
            setTimeout(() => this.syncFromTreatmentPlan(), 100);
            if (window.treatmentPlan && originalSaveBlock) {
              window.treatmentPlan.saveBlock = originalSaveBlock;
            }
          }
        };
        const interval = setInterval(checkModal, 200);
        const observer = new MutationObserver(checkModal);
        observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
      }
    } else {
      const name = prompt("Block name:", blockData?.name || "");
      if (!name) return;
      const start = parseInt(prompt("Start session:", blockData?.startSession || ""));
      const end = parseInt(prompt("End session:", blockData?.endSession || ""));
      if (!start || !end) return;
      const target = prompt("Target/Goal:", blockData?.target || "");
      if (!target) return;

      if (blockData && index >= 0) {
        this.planData.blocks[index] = { ...blockData, name, startSession: start, endSession: end, target: target };
      } else {
        this.planData.blocks.push({ name, startSession: start, endSession: end, protocolId: null, target: target, notes: "" });
      }
      this.renderTimeline();
      this.renderBlocks();
      this.renderCheckpoints();
      this.savePlan();
    }
  }

  showProtocolModal() {
    if (window.ui?.showProtocolModal) {
      window.ui.showProtocolModal();
    } else {
      
    }
  }

  editBlock(index) {
    const block = this.planData.blocks[index];
    if (!block) return;
    this.showBlockModal(block, index);
  }

  async deleteBlock(index) {
    const block = this.planData.blocks[index];
    if (!block) return;
    if (confirm("Are you sure you want to delete this block?")) {
      if (block.id) {
        this.blocksMarkedForDeletion.add(block.id);
      }
      this.planData.blocks.splice(index, 1);
      this.renderTimeline();
      this.renderBlocks();
      await this.savePlan();
    }
  }

  // ====================================
  // CHECKPOINT METHODS
  // ====================================

  showCheckpointModal(checkpointData = null, index = -1) {
    this.isEditingCheckpoint = checkpointData !== null;
    this.editingCheckpointIndex = index;

    let modal = document.getElementById("planningCheckpointModal");
    if (!modal) {
      modal = this.createCheckpointModal();
    }

    if (this.isEditingCheckpoint && checkpointData) {
      document.getElementById("planningCheckpointSession").value = checkpointData.session || 10;
      document.getElementById("planningCheckpointType").value = checkpointData.type || "Progress Review";
      document.getElementById("planningCheckpointDescription").value = checkpointData.description || "";
      document.getElementById("planningCheckpointModalTitle").textContent = "Edit Checkpoint";
    } else {
      let suggestedSession = Math.round((this.planData.totalSessions || 25) / 3);
      while (this.planData.checkpoints.some(cp => cp.session === suggestedSession)) {
        suggestedSession++;
      }

      document.getElementById("planningCheckpointSession").value = suggestedSession;
      document.getElementById("planningCheckpointType").value = "Progress Review";
      document.getElementById("planningCheckpointDescription").value = "";
      document.getElementById("planningCheckpointModalTitle").textContent = "Add Checkpoint";
    }

    modal.classList.add("active");
  }

  createCheckpointModal() {
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.id = "planningCheckpointModal";

    modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3 id="planningCheckpointModalTitle">Add Checkpoint</h3>
                    <button class="modal-close" onclick="window.sessionPlanningPanel.closeCheckpointModal()">&times;</button>
                </div>
                <form id="planningCheckpointForm">
                    <div class="form-row">
                        <div class="form-group">
                            <label for="planningCheckpointSession">Session Number *</label>
                            <input type="number" id="planningCheckpointSession" class="form-control" required 
                                   min="1" max="${this.planData.totalSessions || 25}" value="10">
                        </div>
                        <div class="form-group">
                            <label for="planningCheckpointType">Checkpoint Type *</label>
                            <select id="planningCheckpointType" class="form-control" required>
                                <option value="Progress Review">Progress Review</option>
                                <option value="QEEG Update">QEEG Update</option>
                                <option value="Protocol Change">Protocol Change</option>
                                <option value="Assessment">Assessment</option>
                                <option value="Block Completion">Block Completion</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="planningCheckpointDescription">Description *</label>
                        <textarea id="planningCheckpointDescription" class="form-control" rows="3" required
                                  placeholder="Describe the purpose and actions for this checkpoint..."></textarea>
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" onclick="window.sessionPlanningPanel.closeCheckpointModal()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Save Checkpoint</button>
                    </div>
                </form>
            </div>
        `;

    document.body.appendChild(modal);

    modal.querySelector("#planningCheckpointForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      this.saveCheckpoint();
    });

    return modal;
  }

  async saveCheckpoint() {
    const session = parseInt(document.getElementById("planningCheckpointSession").value);
    const type = document.getElementById("planningCheckpointType").value;
    const description = document.getElementById("planningCheckpointDescription").value.trim();

    if (isNaN(session) || !type || !description) {
      
      return;
    }

    const maxSessions = this.planData.totalSessions || 25;
    if (session < 1 || session > maxSessions) {
      
      return;
    }

    const hasDuplicate = this.planData.checkpoints.some((cp, idx) => {
      if (this.isEditingCheckpoint && idx === this.editingCheckpointIndex) return false;
      return cp.session === session;
    });

    if (hasDuplicate) {
      
      return;
    }

    const checkpointData = { session, type, description, blockId: null };

    if (this.isEditingCheckpoint && this.editingCheckpointIndex >= 0) {
      this.planData.checkpoints[this.editingCheckpointIndex] = checkpointData;
    } else {
      this.planData.checkpoints.push(checkpointData);
    }

    this.closeCheckpointModal();
    this.renderCheckpoints();
    await this.savePlan();
    
  }

  renderCheckpoints() {
    const tbody = document.querySelector("#planningCheckpointsTable tbody");
    if (!tbody) return;

    if (!this.planData.checkpoints?.length) {
      tbody.innerHTML = '<tr class="empty-state"><td colspan="4">No checkpoints defined.</td></tr>';
      return;
    }

    const sortedCheckpoints = [...this.planData.checkpoints].sort((a, b) => a.session - b.session);

    const currentSession = this.currentSessionInfo?.sessionNumber || 1;

    tbody.innerHTML = sortedCheckpoints.map(checkpoint => {
      const originalIndex = this.planData.checkpoints.indexOf(checkpoint);
      const isDone = checkpoint.session != null && checkpoint.session < currentSession;
      return `
        <tr${isDone ? ' class="row-done"' : ''}>
          <td>${checkpoint.session}</td>
          <td>${checkpoint.type}</td>
          <td>${checkpoint.description}</td>
          <td>
            ${isDone
              ? '<span class="done-badge">Done</span>'
              : `<button class="action-btn" onclick="window.sessionPlanningPanel.editCheckpoint(${originalIndex})" title="Edit">
              <span data-lucide="edit"></span>
            </button>
            <button class="action-btn delete" onclick="window.sessionPlanningPanel.deleteCheckpoint(${originalIndex})" title="Delete">
              <span data-lucide="trash-2"></span>
            </button>`
            }
          </td>
        </tr>
      `;
    }).join("");

    if (typeof lucide !== "undefined" && lucide.createIcons) {
      setTimeout(() => lucide.createIcons(), 100);
    }
  }

  editCheckpoint(index) {
    const checkpoint = this.planData.checkpoints[index];
    if (!checkpoint) return;
    this.showCheckpointModal(checkpoint, index);
  }

  async deleteCheckpoint(index) {
    const checkpoint = this.planData.checkpoints[index];
    if (!checkpoint) return;
    if (confirm("Are you sure you want to delete this checkpoint?")) {
      if (checkpoint.id) {
        this.checkpointsMarkedForDeletion.add(checkpoint.id);
      }
      this.planData.checkpoints.splice(index, 1);
      this.renderCheckpoints();
      await this.savePlan();
      if (window.ui) {
        
      }
    }
  }

  closeCheckpointModal() {
    const modal = document.getElementById("planningCheckpointModal");
    if (modal) {
      modal.classList.remove("active");
    }
    this.isEditingCheckpoint = false;
    this.editingCheckpointIndex = -1;
  }

  // ====================================
  // SAVE PLAN
  // ====================================

  async savePlan() {
    try {
      if (!this.patient?.id) throw new Error("No patient selected");
      const currentBlockIds = new Set(
        this.planData.blocks.filter(block => block.id).map(block => block.id)
      );
      const currentCheckpointIds = new Set(
        this.planData.checkpoints.filter(cp => cp.id).map(cp => cp.id)
      );

      for (const persistedId of this.persistedBlockIds) {
        if (!currentBlockIds.has(persistedId)) {
          this.blocksMarkedForDeletion.add(persistedId);
        }
      }
      for (const persistedId of this.persistedCheckpointIds) {
        if (!currentCheckpointIds.has(persistedId)) {
          this.checkpointsMarkedForDeletion.add(persistedId);
        }
      }

      for (const block of this.planData.blocks) {
        if (block.startSession > block.endSession) {
          
          continue;
        }

        try {
          if (block.id) {
            await axios.put(`/planning/blocks/${block.id}`, {
              start_session: block.startSession,
              end_session: block.endSession,
              protocol_id: block.protocolId || null,
            });
          } else {
            const response = await axios.post("/planning/blocks/", {
              patient_id: this.patient.id,
              start_session: block.startSession,
              end_session: block.endSession,
              protocol_id: block.protocolId || null,
            });
            block.id = response.data.id;
          }
          if (block.id) {
            currentBlockIds.add(block.id);
          }
        } catch (blockError) {
          console.error(`Error saving block:`, blockError);
          throw new Error(`Failed to save block "${block.name}": ${blockError.response?.data?.detail || blockError.message}`);
        }
      }

      const currentUserId = window.authManager?.currentUser?.id || 
        JSON.parse(localStorage.getItem('currentUser') || '{}')?.id || null;

      for (const checkpoint of this.planData.checkpoints) {
        if (!checkpoint.session || !checkpoint.type || !currentUserId) continue;

        try {
          if (checkpoint.id) {
            await axios.put(`/planning/checkpoints/${checkpoint.id}`, {
              session_value: checkpoint.session,
              checkpoint_type: checkpoint.type,
            });
          } else {
            const response = await axios.post("/planning/checkpoints/", {
              patient_id: this.patient.id,
              user_id: currentUserId,
              session_value: checkpoint.session,
              checkpoint_type: checkpoint.type,
            });
            checkpoint.id = response.data.id;
          }
          if (checkpoint.id) {
            currentCheckpointIds.add(checkpoint.id);
          }
        } catch (cpError) {
          console.error(`Error saving checkpoint:`, cpError);
        }
      }

      const blocksToDelete = Array.from(this.blocksMarkedForDeletion);
      for (const blockId of blocksToDelete) {
        try {
          await axios.delete(`/planning/blocks/${blockId}`);
          this.blocksMarkedForDeletion.delete(blockId);
          currentBlockIds.delete(blockId);
        } catch (deleteError) {
          console.error(`Error deleting block ${blockId}:`, deleteError);
        }
      }

      const checkpointsToDelete = Array.from(this.checkpointsMarkedForDeletion);
      for (const checkpointId of checkpointsToDelete) {
        try {
          await axios.delete(`/planning/checkpoints/${checkpointId}`);
          this.checkpointsMarkedForDeletion.delete(checkpointId);
          currentCheckpointIds.delete(checkpointId);
        } catch (deleteError) {
          console.error(`Error deleting checkpoint ${checkpointId}:`, deleteError);
        }
      }

      this.persistedBlockIds = new Set(currentBlockIds);
      this.persistedCheckpointIds = new Set(currentCheckpointIds);
      
    } catch (error) {
      
    }
  }
}

// Make available globally
window.SessionPlanningPanel = SessionPlanningPanel;
