/**
 * Treatment Plan Module
 * Handles visual timeline, block configuration, protocol library, and checkpoint actions
 */

class TreatmentPlan {
    constructor() {
        this.currentPatientId = null;
        this.currentPatientDisorder = null;
        this.planData = {
            blocks: [],
            protocols: [],
            checkpoints: [],
            totalSessions: 25,
            currentSession: 0
        };
        this.isEditing = false;
        this.editingIndex = -1;
        this.isDirty = false;
        this.availableProtocols = [];
        this.availableScenarios = [];
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.initializeComponents();
    }

    // Method to refresh data after authentication
    async refreshAfterAuth() {
        await this.loadPatientList();
        await this.loadProtocolLibrary();
        await this.loadScenarioLibrary();
    }

    // ====================================
    // INITIALIZATION
    // ====================================

    setupEventListeners() {
        document.addEventListener('DOMContentLoaded', () => {
            this.bindEvents();
        });
    }

    bindEvents() {
        // Patient selection change
        const patientSelect = document.getElementById('treatmentPatientSelect');
        if (patientSelect) {
            patientSelect.addEventListener('change', (e) => {
                this.loadPatientTreatmentPlan(e.target.value);
            });
        }

        // Block management
        const addBlockBtn = document.getElementById('addBlockBtn');
        if (addBlockBtn) {
            addBlockBtn.addEventListener('click', () => this.showBlockModal());
        }

        // Protocol management
        const addProtocolBtn = document.getElementById('addProtocolBtn');
        if (addProtocolBtn) {
            addProtocolBtn.addEventListener('click', () => this.showProtocolModal());
        }

        // Checkpoint management
        const addCheckpointBtn = document.getElementById('addCheckpointBtn');
        if (addCheckpointBtn) {
            addCheckpointBtn.addEventListener('click', () => this.showCheckpointModal());
        }

        // Save treatment plan button
        const saveTreatmentPlanBtn = document.getElementById('saveTreatmentPlanBtn');
        if (saveTreatmentPlanBtn) {
            saveTreatmentPlanBtn.addEventListener('click', () => this.saveTreatmentPlan());
        }

        // Apply Scenario button
        const applyScenarioBtn = document.getElementById('applyScenarioBtn');
        if (applyScenarioBtn) {
            applyScenarioBtn.addEventListener('click', () => this.applySelectedScenario());
        }

        // Update timeline when total sessions change
        const totalSessionsInput = document.getElementById('totalSessionsInput');
        if (totalSessionsInput) {
            totalSessionsInput.addEventListener('change', (e) => {
                this.updateTotalSessions(parseInt(e.target.value));
            });
        }
    }

    initializeComponents() {
        this.createTreatmentPlanView();
        // Don't load data until user is authenticated
        // Data will be loaded via refreshAfterAuth() after login
    }

    // ====================================
    // UI CREATION
    // ====================================

    createTreatmentPlanView() {}
    addToNavigation() {}

    // ====================================
    // DATA MANAGEMENT
    // ====================================

    async loadPatientList() {
        try {
            const patients = await window.api.getAllPatients();
            const select = document.getElementById('treatmentPatientSelect');
            if (!select) return;

            select.innerHTML = '<option value="">Choose a patient...</option>';
            patients.forEach(patient => {
                const option = document.createElement('option');
                option.value = patient.id;
                option.textContent = `${patient.first_name} ${patient.last_name}`;
                select.appendChild(option);
            });
        } catch (error) {
            console.error('Error loading patients:', error);
            
        }
    }

    async loadPatientTreatmentPlan(patientId) {
        if (!patientId) {
            this.currentPatientId = null;
            this.currentPatientDisorder = null;
            this.clearTreatmentPlan();
            return;
        }

        this.currentPatientId = patientId;
        this.currentPatientDisorder = null;

        try {
            // Load the patient's disorder so the protocol filter defaults to it.
            try {
                const disorderData = await window.api.getPatientLatestDisorder(patientId);
                this.currentPatientDisorder = disorderData?.disorder || null;
            } catch (_) { /* non-fatal */ }

            const treatmentPlan = await window.api.getTreatmentPlanByPatient(patientId);
            if (treatmentPlan && (treatmentPlan.blocks?.length > 0 || treatmentPlan.checkpoints?.length > 0)) {
                this.loadTreatmentPlanData(treatmentPlan);
            } else {
                this.clearTreatmentPlan();
                try {
                    // Try to load assessment to suggest a plan
                    const assessments = await window.api.getAssessmentByPatient(patientId);
                    // AssessmentAPI.getAssessmentByPatient returns an array
                    const latestAssessment = Array.isArray(assessments) ? assessments[0] : assessments;
                    
                    if (latestAssessment) {
                        this.suggestTreatmentFromAssessment(latestAssessment);
                    }
                } catch (error) {
                    console.warn('Could not load assessment data:', error);
                }
            }
        } catch (error) {
            console.error('Error loading treatment plan:', error);
            this.clearTreatmentPlan();
        }
    }

    loadTreatmentPlanData(data) {
        // Map DB snake_case to camelCase if needed
        const blocks = (data.blocks || []).map((block, index) => ({
            id: block.id,
            name: block.name || `Block ${index + 1}`,
            startSession: block.start_session || block.startSession,
            endSession: block.end_session || block.endSession,
            protocolId: block.protocol_id || block.protocolId,
            target: block.target || "TBD",
            notes: block.notes || ""
        }));

        const checkpoints = (data.checkpoints || []).map(cp => ({
            id: cp.id,
            session: cp.session_value || cp.session,
            type: cp.checkpoint_type || cp.type,
            description: cp.description || "",
            blockId: cp.block_id || cp.blockId
        }));

        // Sort blocks by start session
        blocks.sort((a, b) => a.startSession - b.startSession);

        // Determine total sessions (max end session or default)
        const maxSession = blocks.length > 0 
            ? Math.max(...blocks.map(b => b.endSession)) 
            : 25;

        this.planData = {
            blocks: blocks,
            protocols: data.protocols || [], // Protocols might not be in the new structure yet, but that's ok
            checkpoints: checkpoints,
            totalSessions: data.totalSessions || Math.max(maxSession, 25),
            currentSession: data.currentSession || 0
        };

        const totalSessionsInput = document.getElementById('totalSessionsInput');
        if (totalSessionsInput) totalSessionsInput.value = this.planData.totalSessions;

        this.renderBlocks();
        this.renderProtocols();
        this.renderCheckpoints();
        this.renderTimeline();
        this.markAsClean();
    }

    clearTreatmentPlan() {
        this.planData = {
            blocks: [],
            protocols: [],
            checkpoints: [],
            totalSessions: 25,
            currentSession: 0
        };

        const totalSessionsInput = document.getElementById('totalSessionsInput');
        if (totalSessionsInput) totalSessionsInput.value = 25;

        this.renderBlocks();
        this.renderProtocols();
        this.renderCheckpoints();
        this.renderTimeline();
        this.markAsClean();
    }

    suggestTreatmentFromAssessment(assessmentData) {
        if (!assessmentData) return;

        const suggestedProtocols = [];
        const qeeg = assessmentData.qeeg_findings || {};
        
        if (qeeg.left_alpha_excess) {
            suggestedProtocols.push({
                id: `P${this.planData.protocols.length + 1}`,
                name: 'Left Alpha Reduction',
                location: 'F3',
                reward_frequency: '15-18 Hz',
                inhibit_frequency: '8-12 Hz',
                target_condition: 'Alpha Reduction',
                description: 'Reduce left alpha excess'
            });
        }
        
        if (qeeg.frontal_beta_low) {
            suggestedProtocols.push({
                id: `P${this.planData.protocols.length + suggestedProtocols.length + 1}`,
                name: 'Frontal Beta Enhancement',
                location: 'Fz',
                reward_frequency: '15-18 Hz',
                inhibit_frequency: '4-7 Hz',
                target_condition: 'Beta Enhancement',
                description: 'Enhance frontal beta for improved attention'
            });
        }
        
        if (qeeg.high_tbr) {
            suggestedProtocols.push({
                id: `P${this.planData.protocols.length + suggestedProtocols.length + 1}`,
                name: 'TBR Reduction',
                location: 'Cz',
                reward_frequency: '15-18 Hz (Beta)',
                inhibit_frequency: '4-7 Hz (Theta)',
                target_condition: 'TBR Reduction',
                description: 'Reduce theta-beta ratio for improved focus'
            });
        }

        if (suggestedProtocols.length === 0 && assessmentData.patient_issues) {
            assessmentData.patient_issues.forEach(issue => {
                const issueText = issue.issue.toLowerCase();
                if (issueText.includes('depress')) {
                    suggestedProtocols.push({
                        id: `P${this.planData.protocols.length + suggestedProtocols.length + 1}`,
                        name: 'Depression Protocol',
                        location: 'F3',
                        reward_frequency: '15-18 Hz',
                        inhibit_frequency: '4-7 Hz',
                        target_condition: 'Depression Relief',
                        description: 'Beta enhancement protocol for depression'
                    });
                } else if (issueText.includes('anxiet') || issueText.includes('stress')) {
                    suggestedProtocols.push({
                        id: `P${this.planData.protocols.length + suggestedProtocols.length + 1}`,
                        name: 'Anxiety Reduction',
                        location: 'Pz',
                        reward_frequency: '8-12 Hz',
                        inhibit_frequency: '15-30 Hz',
                        target_condition: 'Anxiety Relief',
                        description: 'Alpha enhancement protocol for anxiety'
                    });
                } else if (issueText.includes('focus') || issueText.includes('attention') || issueText.includes('adhd')) {
                    suggestedProtocols.push({
                        id: `P${this.planData.protocols.length + suggestedProtocols.length + 1}`,
                        name: 'Focus Enhancement',
                        location: 'Cz',
                        reward_frequency: '12-15 Hz (SMR)',
                        inhibit_frequency: '4-7 Hz',
                        target_condition: 'Attention',
                        description: 'SMR protocol for attention and focus'
                    });
                }
            });
        }
        
        if (suggestedProtocols.length === 0) return;

        const issues = assessmentData.patient_issues || [];
        const severeCounts = issues.filter(i => i.severity === 'Very bad').length;
        const moderateCounts = issues.filter(i => i.severity === 'Moderate').length;
        const totalSessions = severeCounts > 2 ? 30 : (severeCounts > 0 || moderateCounts > 2 ? 25 : 20);
        
        const sessionsPerProtocol = Math.floor(totalSessions / suggestedProtocols.length);
        const suggestedBlocks = [];
        let sessionCounter = 1;
        
        suggestedProtocols.forEach((protocol, index) => {
            const blockEnd = index === suggestedProtocols.length - 1 
                ? totalSessions 
                : sessionCounter + sessionsPerProtocol - 1;
            
            suggestedBlocks.push({
                name: `Block ${index + 1}`,
                startSession: sessionCounter,
                endSession: blockEnd,
                protocolId: protocol.id,
                target: protocol.name,
                notes: 'Automatically suggested from assessment data'
            });
            
            sessionCounter = blockEnd + 1;
        });
        
        const checkpointInterval = Math.round(totalSessions / 3);
        const checkpoints = [1, 2].map(i => ({
            session: i * checkpointInterval,
            type: 'Progress Review',
            description: `Checkpoint ${i}: Review progress and adjust protocol if needed`
        }));
        
        this.planData.protocols.push(...suggestedProtocols);
        this.planData.blocks.push(...suggestedBlocks);
        this.planData.checkpoints.push(...checkpoints);
        this.planData.totalSessions = totalSessions;
        
        const totalSessionsInput = document.getElementById('totalSessionsInput');
        if (totalSessionsInput) totalSessionsInput.value = totalSessions;
        
        this.renderBlocks();
        this.renderProtocols();
        this.renderCheckpoints();
        this.renderTimeline();
        this.markAsDirty();
        
        // 
    }

    // ====================================
    // PROTOCOL LIBRARY
    // ====================================

    async loadProtocolLibrary() {
        try {
            this.availableProtocols = await window.api.getAllProtocols() || [];
            const protocolLibrary = document.getElementById('protocolLibrary');
            if (!protocolLibrary) return;

            if (this.availableProtocols.length === 0) {
                protocolLibrary.innerHTML = '<div class="empty-state-card"><p>No protocols available. Use the Protocol Library to create protocols.</p></div>';
                return;
            }

            this.renderAvailableProtocols();
        } catch (error) {
            console.error('Error loading protocol library:', error);
            this.availableProtocols = [];
        }
    }

    renderAvailableProtocols() {
        const protocolLibrary = document.getElementById('protocolLibrary');
        if (!protocolLibrary) return;

        const disorders = [...new Set(
            this.availableProtocols
                .map(p => this.extractProtocolDisorder(p.name))
                .filter(Boolean)
        )].sort((a, b) => a.localeCompare(b));

        if (this.libraryDisorderFilter === undefined) {
            const patientDisorder = this.currentPatientDisorder || window.sessionPlanningPanel?.disorder || null;
            const matched = patientDisorder
                ? disorders.find(d => d.toLowerCase() === patientDisorder.toLowerCase())
                : null;
            this.libraryDisorderFilter = matched || 'all';
        }
        if (this.libraryDisorderFilter !== 'all' &&
            !disorders.some(d => d === this.libraryDisorderFilter)) {
            this.libraryDisorderFilter = 'all';
        }

        const activeFilter = this.libraryDisorderFilter;
        const filtered = activeFilter === 'all'
            ? this.availableProtocols
            : this.availableProtocols.filter(p => this.extractProtocolDisorder(p.name) === activeFilter);

        const filterHtml = disorders.length > 0 ? `
            <div class="protocol-disorder-filter" style="display: flex; align-items: center; gap: var(--spacing-sm); margin-bottom: var(--spacing-base);">
                <label style="font-size: 0.85em; font-weight: 500; color: var(--text-secondary);">Disorder</label>
                <select class="form-control" style="max-width: 240px;"
                        onchange="treatmentPlan.filterLibraryByDisorder(this.value)">
                    <option value="all" ${activeFilter === 'all' ? 'selected' : ''}>All disorders</option>
                    ${disorders.map(d => `
                        <option value="${d}" ${activeFilter === d ? 'selected' : ''}>${d}</option>
                    `).join('')}
                </select>
            </div>
        ` : '';

        const cardsHtml = filtered.length === 0
            ? '<div class="empty-state-card"><p>No protocols match this filter.</p></div>'
            : filtered.map(protocol => {
                const bands = protocol.features?.frequency_bands || [];
                const rewardBands = bands.filter(b => b.type === 'reward');
                const inhibitBands = bands.filter(b => b.type === 'inhibit');
                const allChannels = [...new Set(bands.flatMap(b => b.channels || []))];
                return `
                    <div class="protocol-card" data-id="${protocol.id}" onclick="treatmentPlan.selectProtocol('${protocol.id}')">
                        <div class="protocol-header">
                            <span class="protocol-id">${protocol.id}</span>
                        </div>
                        <h4 class="protocol-title">${protocol.name}</h4>
                        <div class="protocol-details">
                            <p><strong>Channels:</strong> ${allChannels.join(', ') || 'N/A'}</p>
                            ${rewardBands.length > 0 ? `<p><strong>Reward:</strong> ${rewardBands.map(b => `${b.frequency_range[0]}-${b.frequency_range[1]}Hz`).join(', ')}</p>` : ''}
                            ${inhibitBands.length > 0 ? `<p><strong>Inhibit:</strong> ${inhibitBands.map(b => `${b.frequency_range[0]}-${b.frequency_range[1]}Hz`).join(', ')}</p>` : ''}
                            ${protocol.note ? `<p class="text-secondary">${protocol.note.substring(0, 100)}${protocol.note.length > 100 ? '...' : ''}</p>` : ''}
                        </div>
                    </div>
                `;
            }).join('');

        protocolLibrary.innerHTML = filterHtml + cardsHtml;
    }

    filterLibraryByDisorder(disorder) {
        this.libraryDisorderFilter = disorder || 'all';
        this.renderAvailableProtocols();
    }

    selectProtocol(protocolId) {
        document.querySelectorAll('.protocol-card').forEach(card => {
            card.classList.toggle('selected', card.dataset.id === protocolId);
        });
    }

    async showProtocolLibraryPopup() {
        // Always reload to ensure we have the latest protocols, especially custom ones
        await this.loadProtocolLibrary();

        let modal = document.getElementById('protocolSelectionModal');
        if (!modal) {
            modal = this.createProtocolSelectionModal();
        }

        // Reset so the filter re-defaults to the patient's disorder on each open.
        this.protocolDisorderFilter = undefined;
        this.renderProtocolsInModal();
        modal.classList.add('active');
    }

    createProtocolSelectionModal() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'protocolSelectionModal';

        modal.innerHTML = `
            <div class="modal-content" style="max-width: 900px; max-height: 80vh; overflow-y: auto;">
                <div class="modal-header">
                    <h3>Select Protocol</h3>
                    <button class="modal-close" onclick="treatmentPlan.closeProtocolSelectionModal()">&times;</button>
                </div>
                <div class="modal-body" style="padding: var(--spacing-lg);">
                    <div id="protocolSelectionContainer">
                        <div class="empty-state-card">
                            <p>Loading protocols...</p>
                        </div>
                    </div>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="treatmentPlan.closeProtocolSelectionModal()">Cancel</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        return modal;
    }

    // Extract the disorder from a protocol name. By convention the disorder is the
    // last parenthetical group in the name, e.g. "M1: TBR-Normalize (...) (ADHD)".
    extractProtocolDisorder(name) {
        if (!name) return null;
        const matches = name.match(/\(([^()]+)\)/g);
        if (!matches || matches.length === 0) return null;
        return matches[matches.length - 1].slice(1, -1).trim();
    }

    renderProtocolsInModal() {
        const container = document.getElementById('protocolSelectionContainer');
        if (!container) return;

        // Merge available protocols with plan-specific protocols
        const allProtocols = [
            ...this.planData.protocols,
            ...this.availableProtocols.filter(ap =>
                !this.planData.protocols.some(p => p.id === ap.id)
            )
        ];

        if (allProtocols.length === 0) {
            container.innerHTML = `
                <div class="empty-state-card">
                    <p>No protocols available. Please create protocols first.</p>
                </div>
            `;
            return;
        }

        // Build the list of disorders present across the available protocols.
        const disorders = [...new Set(
            allProtocols
                .map(p => this.extractProtocolDisorder(p.name))
                .filter(Boolean)
        )].sort((a, b) => a.localeCompare(b));

        // Default the filter to the patient's current disorder when it matches one
        // of the available disorders; otherwise keep whatever the user last picked.
        if (this.protocolDisorderFilter === undefined) {
            const patientDisorder = this.currentPatientDisorder || window.sessionPlanningPanel?.disorder || null;
            const matched = patientDisorder
                ? disorders.find(d => d.toLowerCase() === patientDisorder.toLowerCase())
                : null;
            this.protocolDisorderFilter = matched || 'all';
        }
        if (this.protocolDisorderFilter !== 'all' &&
            !disorders.some(d => d === this.protocolDisorderFilter)) {
            this.protocolDisorderFilter = 'all';
        }

        const activeFilter = this.protocolDisorderFilter;
        const filteredProtocols = activeFilter === 'all'
            ? allProtocols
            : allProtocols.filter(p => this.extractProtocolDisorder(p.name) === activeFilter);

        const filterHtml = disorders.length > 0 ? `
            <div class="protocol-disorder-filter" style="display: flex; align-items: center; gap: var(--spacing-sm); margin-bottom: var(--spacing-base);">
                <label for="protocolDisorderFilter" style="font-size: 0.85em; font-weight: 500; color: var(--text-secondary);">Disorder</label>
                <select id="protocolDisorderFilter" class="form-control" style="max-width: 240px;"
                        onchange="treatmentPlan.filterProtocolsByDisorder(this.value)">
                    <option value="all" ${activeFilter === 'all' ? 'selected' : ''}>All disorders</option>
                    ${disorders.map(d => `
                        <option value="${this.escapeHtml(d)}" ${activeFilter === d ? 'selected' : ''}>${this.escapeHtml(d)}</option>
                    `).join('')}
                </select>
            </div>
        ` : '';

        if (filteredProtocols.length === 0) {
            container.innerHTML = `
                ${filterHtml}
                <div class="empty-state-card">
                    <p>No protocols found for "${this.escapeHtml(activeFilter)}".</p>
                </div>
            `;
            return;
        }

        // Reuse the same rendering logic as the main protocol library
        container.innerHTML = `
            ${filterHtml}
            <div class="protocols-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--spacing-base);">
                ${filteredProtocols.map(protocol => {
                    const bands = protocol.features?.frequency_bands || [];
                    const rewardBands = bands.filter(b => b.type === 'reward');
                    const inhibitBands = bands.filter(b => b.type === 'inhibit');
                    const ratioBands = bands.filter(b => b.type === 'ratio');
                    const allChannels = [...new Set(bands.flatMap(b => b.channels || []))];
                    const isDefault = protocol.is_default || false;
                    const isCustom = this.planData.protocols.some(p => p.id === protocol.id);

                    // Handle legacy/manual protocol structure if bands structure is missing
                    let displayChannels = allChannels;
                    let displayReward = rewardBands;
                    let displayInhibit = inhibitBands;
                    let rewardText = '';
                    let inhibitText = '';
                    const formatRatioBand = b => {
                        const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
                        const name = (b.numerator && b.denominator)
                            ? `${cap(b.numerator)}/${cap(b.denominator)} Ratio`
                            : (b.name?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Ratio');
                        const ch = b.channels?.[0] || '';
                        return `${name}${ch ? ' @ ' + ch : ''}`;
                    };

                    if (bands.length === 0 && (protocol.reward_frequency || protocol.inhibit_frequency)) {
                        if (protocol.location) displayChannels = [protocol.location];
                        rewardText = protocol.reward_frequency;
                        inhibitText = protocol.inhibit_frequency;
                    }

                    return `
                        <div class="protocol-card-library ${isDefault ? 'protocol-default' : ''} ${isCustom ? 'custom' : ''}" 
                             style="cursor: pointer;"
                             onclick="treatmentPlan.selectProtocolForBlock('${protocol.id}')">
                            <div class="protocol-card-header">
                                <div class="protocol-title-wrapper">
                                    <h3 class="protocol-card-title">${this.escapeHtml(protocol.name || 'Unnamed Protocol')}</h3>
                                    ${isDefault ? `<span class="protocol-badge-default">Default</span>` : ''}
                                    ${isCustom ? `<span class="protocol-badge-custom" style="background: var(--primary-color); color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.7em; margin-left: 8px;">Custom</span>` : ''}
                                </div>
                            </div>
                            <div class="protocol-card-body">
                                ${displayChannels.length > 0 ? `
                                    <div style="margin-bottom: var(--spacing-xs);">
                                        <div style="font-size: 0.75em; font-weight: 500; color: var(--text-secondary); margin-bottom: 2px;">Channels:</div>
                                        <div style="font-size: 0.75em; color: var(--text-secondary);">${displayChannels.join(', ')}</div>
                                    </div>
                                ` : ''}
                                ${displayReward.length > 0 ? `
                                    <div class="protocol-info-section protocol-reward-section" style="margin-bottom: var(--spacing-xs);">
                                        <div class="protocol-section-label">Reward</div>
                                        <div style="font-size: 0.75em; color: var(--text-secondary);">
                                            ${displayReward.map(b =>
                                                `${b.frequency_range?.[0] || 0}-${b.frequency_range?.[1] || 0}Hz${b.channels?.length ? ' @ ' + b.channels.join(', ') : ''}`
                                            ).join(', ')}
                                        </div>
                                    </div>
                                ` : rewardText ? `
                                    <div class="protocol-info-section protocol-reward-section" style="margin-bottom: var(--spacing-xs);">
                                        <div class="protocol-section-label">Reward</div>
                                        <div style="font-size: 0.75em; color: var(--text-secondary);">${rewardText}</div>
                                    </div>
                                ` : ''}
                                ${displayInhibit.length > 0 ? `
                                    <div class="protocol-info-section protocol-inhibit-section" style="margin-bottom: var(--spacing-xs);">
                                        <div class="protocol-section-label">Inhibit</div>
                                        <div style="font-size: 0.75em; color: var(--text-secondary);">
                                            ${displayInhibit.map(b =>
                                                `${b.frequency_range?.[0] || 0}-${b.frequency_range?.[1] || 0}Hz${b.channels?.length ? ' @ ' + b.channels.join(', ') : ''}`
                                            ).join(', ')}
                                        </div>
                                    </div>
                                ` : inhibitText ? `
                                    <div class="protocol-info-section protocol-inhibit-section" style="margin-bottom: var(--spacing-xs);">
                                        <div class="protocol-section-label">Inhibit</div>
                                        <div style="font-size: 0.75em; color: var(--text-secondary);">${inhibitText}</div>
                                    </div>
                                ` : ''}
                                ${ratioBands.length > 0 ? `
                                    <div class="protocol-info-section" style="margin-bottom: var(--spacing-xs); border-left: 2px solid var(--primary-color); padding-left: 6px;">
                                        <div class="protocol-section-label">Ratio</div>
                                        <div style="font-size: 0.75em; color: var(--text-secondary);">
                                            ${ratioBands.map(formatRatioBand).join(', ')}
                                        </div>
                                    </div>
                                ` : ''}
                                ${protocol.note ? `
                                    <div style="margin-top: var(--spacing-xs); padding-top: var(--spacing-xs); border-top: 1px solid var(--border-color);">
                                        <div style="font-size: 0.75em; font-weight: 500; color: var(--text-secondary); margin-bottom: 2px;">Notes:</div>
                                        <div style="font-size: 0.75em; color: var(--text-secondary); line-height: 1.4;">${this.escapeHtml(protocol.note)}</div>
                                    </div>
                                ` : ''}
                                ${protocol.description ? `
                                    <div style="margin-top: var(--spacing-xs); padding-top: var(--spacing-xs); border-top: 1px solid var(--border-color);">
                                        <div style="font-size: 0.75em; font-weight: 500; color: var(--text-secondary); margin-bottom: 2px;">Description:</div>
                                        <div style="font-size: 0.75em; color: var(--text-secondary); line-height: 1.4;">${this.escapeHtml(protocol.description)}</div>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        // Initialize lucide icons
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            setTimeout(() => lucide.createIcons(), 100);
        }
    }

    filterProtocolsByDisorder(disorder) {
        this.protocolDisorderFilter = disorder || 'all';
        this.renderProtocolsInModal();
    }

    selectProtocolForBlock(protocolId) {
        const allProtocols = [...this.planData.protocols, ...this.availableProtocols];
        const protocol = allProtocols.find(p => p.id == protocolId);
        if (!protocol) return;

        const protocolSelect = document.getElementById('blockProtocolSelect');
        const protocolDisplay = document.getElementById('blockProtocolDisplay');
        if (protocolSelect && protocolDisplay) {
            protocolSelect.value = protocolId;
            protocolDisplay.value = protocol.name || `Protocol ${protocolId}`;
        }

        this.closeProtocolSelectionModal();
        
    }

    closeProtocolSelectionModal() {
        document.getElementById('protocolSelectionModal')?.classList.remove('active');
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showProtocolModal(protocolData = null, index = -1) {
        this.isEditing = protocolData !== null;
        this.editingIndex = index;

        let modal = document.getElementById('protocolModal');
        if (!modal) {
            modal = this.createProtocolModal();
        }

        const fields = {
            protocolId: protocolData?.id || `P${this.planData.protocols.length + 1}`,
            protocolName: protocolData?.name || '',
            protocolLocation: protocolData?.location || '',
            protocolReward: protocolData?.reward_frequency || '',
            protocolInhibit: protocolData?.inhibit_frequency || '',
            protocolTarget: protocolData?.target_condition || '',
            protocolDescription: protocolData?.description || ''
        };

        Object.entries(fields).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) el.value = value;
        });

        const title = document.getElementById('protocolModalTitle');
        if (title) title.textContent = this.isEditing ? 'Edit Protocol' : 'New Protocol';

        modal.classList.add('active');
    }

    createProtocolModal() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'protocolModal';

        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3 id="protocolModalTitle">New Protocol</h3>
                    <button class="modal-close" onclick="treatmentPlan.closeProtocolModal()">&times;</button>
                </div>
                <form id="protocolForm">
                    <div class="form-row">
                        <div class="form-group">
                            <label for="protocolId">Protocol ID *</label>
                            <input type="text" id="protocolId" class="form-control" required 
                                   placeholder="e.g., P1, P2" pattern="P[0-9]+" title="ID must start with P followed by a number">
                        </div>
                        <div class="form-group">
                            <label for="protocolName">Protocol Name *</label>
                            <input type="text" id="protocolName" class="form-control" required 
                                   placeholder="e.g., Frontal Activation">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="protocolLocation">Location *</label>
                            <input type="text" id="protocolLocation" class="form-control" required 
                                   placeholder="e.g., F3, Cz">
                        </div>
                        <div class="form-group">
                            <label for="protocolTarget">Target Condition *</label>
                            <input type="text" id="protocolTarget" class="form-control" required 
                                   placeholder="e.g., Depression, Anxiety">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="protocolReward">Reward Frequency *</label>
                            <input type="text" id="protocolReward" class="form-control" required 
                                   placeholder="e.g., 15-18 Hz">
                        </div>
                        <div class="form-group">
                            <label for="protocolInhibit">Inhibit Frequency *</label>
                            <input type="text" id="protocolInhibit" class="form-control" required 
                                   placeholder="e.g., 4-7 Hz">
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="protocolDescription">Description</label>
                        <textarea id="protocolDescription" class="form-control" rows="3" 
                                  placeholder="Protocol description and purpose..."></textarea>
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" onclick="treatmentPlan.closeProtocolModal()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Save Protocol</button>
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(modal);
        
        // Set up form submission
        const form = modal.querySelector('#protocolForm');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveProtocol();
        });
        
        return modal;
    }

    saveProtocol() {
        const getValue = (id) => document.getElementById(id)?.value.trim() || '';
        const protocol = {
            id: getValue('protocolId'),
            name: getValue('protocolName'),
            location: getValue('protocolLocation'),
            reward_frequency: getValue('protocolReward'),
            inhibit_frequency: getValue('protocolInhibit'),
            target_condition: getValue('protocolTarget'),
            description: getValue('protocolDescription')
        };

        if (!protocol.id || !protocol.name || !protocol.location || !protocol.reward_frequency || !protocol.inhibit_frequency || !protocol.target_condition) {
            
            return;
        }

        if (this.isEditing && this.editingIndex >= 0) {
            this.planData.protocols[this.editingIndex] = protocol;
        } else {
            if (this.planData.protocols.some(p => p.id === protocol.id)) {
                
                return;
            }
            this.planData.protocols.push(protocol);
        }

        this.renderProtocols();
        this.closeProtocolModal();
        this.markAsDirty();
        
    }

    renderProtocols() {
        const protocolLibrary = document.getElementById('protocolLibrary');
        if (!protocolLibrary) return;

        if (this.planData.protocols.length === 0) {
            protocolLibrary.innerHTML = `
                <div class="empty-state-card">
                    <p>No custom protocols defined. Click "New Protocol" to create one, or select from available protocols.</p>
                </div>
            `;
            return;
        }

        // Combine custom protocols with available protocols
        const allProtocols = [
            ...this.planData.protocols,
            ...this.availableProtocols.filter(ap => 
                !this.planData.protocols.some(p => p.id === ap.id)
            )
        ];

        protocolLibrary.innerHTML = allProtocols.map(protocol => {
            const isCustom = this.planData.protocols.some(p => p.id === protocol.id);
            
            // Handle both old local structure and new API structure
            let channels = [];
            let rewardInfo = '';
            let inhibitInfo = '';
            
            if (protocol.features?.frequency_bands) {
                // New structure
                const bands = protocol.features.frequency_bands;
                channels = [...new Set(bands.flatMap(b => b.channels || []))];
                const rewardBands = bands.filter(b => b.type === 'reward');
                const inhibitBands = bands.filter(b => b.type === 'inhibit');
                rewardInfo = rewardBands.map(b => `${b.frequency_range[0]}-${b.frequency_range[1]}Hz`).join(', ');
                inhibitInfo = inhibitBands.map(b => `${b.frequency_range[0]}-${b.frequency_range[1]}Hz`).join(', ');
            } else {
                // Old local structure (for backwards compatibility with local planData.protocols)
                channels = protocol.location ? [protocol.location] : [];
                rewardInfo = protocol.reward_frequency || '';
                inhibitInfo = protocol.inhibit_frequency || '';
            }
            
            return `
                <div class="protocol-card ${isCustom ? 'custom' : ''}" data-id="${protocol.id}" onclick="treatmentPlan.selectProtocol('${protocol.id}')">
                    <div class="protocol-header">
                        <span class="protocol-id">${protocol.id}</span>
                        ${isCustom ? `
                            <div class="protocol-actions">
                                <button class="action-btn" onclick="event.stopPropagation(); treatmentPlan.editProtocol('${protocol.id}')" title="Edit">
                                    <span data-lucide="edit-2"></span>
                                </button>
                                <button class="action-btn delete" onclick="event.stopPropagation(); treatmentPlan.deleteProtocol('${protocol.id}')" title="Delete">
                                    <span data-lucide="trash-2"></span>
                                </button>
                            </div>
                        ` : ''}
                    </div>
                    <h4 class="protocol-title">${protocol.name}</h4>
                    <div class="protocol-details">
                        ${channels.length > 0 ? `<p><strong>Channels:</strong> ${channels.join(', ')}</p>` : ''}
                        ${rewardInfo ? `<p><strong>Reward:</strong> ${rewardInfo}</p>` : ''}
                        ${inhibitInfo ? `<p><strong>Inhibit:</strong> ${inhibitInfo}</p>` : ''}
                        ${protocol.note ? `<p class="text-secondary">${protocol.note.substring(0, 100)}${protocol.note.length > 100 ? '...' : ''}</p>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        // Refresh Lucide icons
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            setTimeout(() => lucide.createIcons(), 100);
        }
    }

    editProtocol(protocolId) {
        const protocolIndex = this.planData.protocols.findIndex(p => p.id === protocolId);
        if (protocolIndex >= 0) {
            this.showProtocolModal(this.planData.protocols[protocolIndex], protocolIndex);
        }
    }

    deleteProtocol(protocolId) {
        if (!confirm('Are you sure you want to delete this protocol?')) return;
        
        if (this.planData.blocks.some(block => block.protocolId === protocolId)) {
            
            return;
        }
        
        const protocolIndex = this.planData.protocols.findIndex(p => p.id === protocolId);
        if (protocolIndex >= 0) {
            this.planData.protocols.splice(protocolIndex, 1);
            this.renderProtocols();
            this.markAsDirty();
        }
    }

    closeProtocolModal() {
        document.getElementById('protocolModal')?.classList.remove('active');
        this.isEditing = false;
        this.editingIndex = -1;
    }

    // ====================================
    // BLOCK CONFIGURATION
    // ====================================

    showBlockModal(blockData = null, index = -1) {
        this.isEditing = blockData !== null;
        this.editingIndex = index;

        // Create or show modal
        let modal = document.getElementById('blockModal');
        if (!modal) {
            modal = this.createBlockModal();
        }

        // Update protocol display if editing
        const protocolDisplay = document.getElementById('blockProtocolDisplay');
        const protocolSelect = document.getElementById('blockProtocolSelect');

        // Populate form if editing
        if (this.isEditing && blockData) {
            document.getElementById('blockName').value = blockData.name || '';
            document.getElementById('blockStartSession').value = blockData.startSession || 1;
            document.getElementById('blockEndSession').value = blockData.endSession || this.planData.totalSessions;
            const protocolId = blockData.protocolId || '';
            protocolSelect.value = protocolId;
            if (protocolId) {
                const protocol = this.availableProtocols.find(p => p.id == protocolId);
                protocolDisplay.value = protocol ? protocol.name : `Protocol ${protocolId}`;
            } else {
                protocolDisplay.value = '';
            }
            document.getElementById('blockTarget').value = blockData.target || '';
            document.getElementById('blockModalTitle').textContent = 'Edit Block';
        } else {
            // Set default values for new block
            let nextStartSession = 1;
            if (this.planData.blocks.length > 0) {
                // Find the highest end session
                const maxEndSession = Math.max(...this.planData.blocks.map(b => b.endSession));
                nextStartSession = maxEndSession + 1;
            }
            
            document.getElementById('blockName').value = `Block ${this.planData.blocks.length + 1}`;
            document.getElementById('blockStartSession').value = nextStartSession;
            document.getElementById('blockEndSession').value = Math.min(nextStartSession + 4, this.planData.totalSessions);
            protocolSelect.value = '';
            protocolDisplay.value = '';
            document.getElementById('blockTarget').value = '';
            document.getElementById('blockModalTitle').textContent = 'Add Block';
        }

        modal.classList.add('active');
    }

    createBlockModal() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'blockModal';

        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3 id="blockModalTitle">Add Block</h3>
                    <button class="modal-close" onclick="treatmentPlan.closeBlockModal()">&times;</button>
                </div>
                <form id="blockForm">
                    <div class="form-row">
                        <div class="form-group">
                            <label for="blockName">Block Name *</label>
                            <input type="text" id="blockName" class="form-control" required 
                                   placeholder="e.g., Block 1">
                        </div>
                        <div class="form-group">
                            <label for="blockProtocolSelect">Protocol *</label>
                            <div style="display: flex; gap: var(--spacing-sm); align-items: center;">
                                <input type="text" id="blockProtocolDisplay" class="form-control" readonly 
                                       placeholder="No protocol selected" style="flex: 1;">
                                <input type="hidden" id="blockProtocolSelect" required>
                                <button type="button" class="btn btn-secondary" id="blockSelectProtocolBtn" 
                                        onclick="treatmentPlan.showProtocolLibraryPopup()">
                                    <span data-lucide="search"></span>
                                    Select Protocol
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="blockStartSession">Start Session *</label>
                            <input type="number" id="blockStartSession" class="form-control" required min="1" 
                                   max="${this.planData.totalSessions}" value="1">
                        </div>
                        <div class="form-group">
                            <label for="blockEndSession">End Session *</label>
                            <input type="number" id="blockEndSession" class="form-control" required min="1" 
                                   max="${this.planData.totalSessions}" value="${this.planData.totalSessions}">
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="blockTarget">Target/Goal *</label>
                        <input type="text" id="blockTarget" class="form-control" required 
                               placeholder="e.g., Reduce anxiety, Improve focus">
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" onclick="treatmentPlan.closeBlockModal()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Save Block</button>
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(modal);
        
        // Initialize lucide icons
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            setTimeout(() => lucide.createIcons(), 100);
        }
        
        // Set up form submission
        const form = modal.querySelector('#blockForm');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveBlock();
        });
        
        // Set up validation for start/end session
        const startInput = modal.querySelector('#blockStartSession');
        const endInput = modal.querySelector('#blockEndSession');
        
        startInput.addEventListener('change', () => {
            if (parseInt(startInput.value) > parseInt(endInput.value)) {
                endInput.value = startInput.value;
            }
        });
        
        endInput.addEventListener('change', () => {
            if (parseInt(endInput.value) < parseInt(startInput.value)) {
                startInput.value = endInput.value;
            }
        });
        
        return modal;
    }

    saveBlock() {
        const getValue = (id) => document.getElementById(id)?.value.trim() || '';
        const name = getValue('blockName');
        const startSession = parseInt(getValue('blockStartSession'));
        const endSession = parseInt(getValue('blockEndSession'));
        const protocolId = document.getElementById('blockProtocolSelect')?.value || '';
        const target = getValue('blockTarget');
        const notes = '';

        if (!name || isNaN(startSession) || isNaN(endSession) || !protocolId || !target) {
            
            return;
        }

        if (startSession > endSession) {
            
            return;
        }

        const hasConflict = this.planData.blocks.some((block, idx) => {
            if (this.isEditing && idx === this.editingIndex) return false;
            return (startSession >= block.startSession && startSession <= block.endSession) ||
                   (endSession >= block.startSession && endSession <= block.endSession) ||
                   (block.startSession >= startSession && block.startSession <= endSession);
        });

        if (hasConflict) {
            
            return;
        }

        const existingBlock = this.isEditing && this.editingIndex >= 0 ? this.planData.blocks[this.editingIndex] : {};
        const block = { ...existingBlock, name, startSession, endSession, protocolId, target, notes };

        if (this.isEditing && this.editingIndex >= 0) {
            this.planData.blocks[this.editingIndex] = block;
        } else {
            this.planData.blocks.push(block);
        }

        this.renderBlocks();
        this.renderTimeline();
        this.closeBlockModal();
        this.markAsDirty();
        
    }

    renderBlocks() {
        const tbody = document.querySelector('#blocksTable tbody');
        if (!tbody) return;

        if (this.planData.blocks.length === 0) {
            tbody.innerHTML = '<tr class="empty-state"><td colspan="6">No blocks defined. Click "Add Block" to get started.</td></tr>';
            return;
        }

        const sortedBlocks = [...this.planData.blocks].sort((a, b) => a.startSession - b.startSession);
        const allProtocols = [...this.planData.protocols, ...this.availableProtocols];

        tbody.innerHTML = sortedBlocks.map((block, sortedIndex) => {
            const protocol = allProtocols.find(p => p.id === block.protocolId);
            const protocolName = protocol ? `${protocol.id}: ${protocol.name}` : 'Unknown';
            
            // Find the actual index in the original unsorted array
            // Use block.id if available, otherwise match by key properties
            let actualIndex = -1;
            if (block.id) {
                actualIndex = this.planData.blocks.findIndex(b => b.id === block.id);
            }
            if (actualIndex < 0) {
                // Fallback: find by matching key properties (startSession, endSession, name, protocolId)
                actualIndex = this.planData.blocks.findIndex(b => 
                    b.startSession === block.startSession && 
                    b.endSession === block.endSession && 
                    b.name === block.name &&
                    (b.protocolId === block.protocolId || (!b.protocolId && !block.protocolId))
                );
            }
            // If still not found, try object reference match
            if (actualIndex < 0) {
                actualIndex = this.planData.blocks.findIndex(b => b === block);
            }
            // Final fallback to sorted index (shouldn't happen, but safety net)
            const blockIndex = actualIndex >= 0 ? actualIndex : sortedIndex;

            return `
                <tr>
                    <td>${block.name}</td>
                    <td>${block.startSession} - ${block.endSession}</td>
                    <td>${protocolName}</td>
                    <td>${block.target}</td>
                    <td>${block.notes || ''}</td>
                    <td>
                        <button class="action-btn" onclick="treatmentPlan.editBlock(${blockIndex})" title="Edit">
                            <span data-lucide="edit-2"></span>
                        </button>
                        <button class="action-btn delete" onclick="treatmentPlan.deleteBlock(${blockIndex})" title="Delete">
                            <span data-lucide="trash-2"></span>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            setTimeout(() => lucide.createIcons(), 100);
        }
    }

    editBlock(index) {
        this.showBlockModal(this.planData.blocks[index], index);
    }

    deleteBlock(index) {
        if (confirm('Are you sure you want to delete this block?')) {
            this.planData.blocks.splice(index, 1);
            this.renderBlocks();
            this.renderTimeline();
            this.markAsDirty();
        }
    }

    closeBlockModal() {
        document.getElementById('blockModal')?.classList.remove('active');
        this.isEditing = false;
        this.editingIndex = -1;
    }

    // ====================================
    // CHECKPOINT MANAGEMENT
    // ====================================

    showCheckpointModal(checkpointData = null, index = -1) {
        this.isEditing = checkpointData !== null;
        this.editingIndex = index;

        let modal = document.getElementById('checkpointModal');
        if (!modal) modal = this.createCheckpointModal();

        if (this.isEditing && checkpointData) {
            document.getElementById('checkpointSession').value = checkpointData.session || 10;
            document.getElementById('checkpointType').value = checkpointData.type || 'Progress Review';
            document.getElementById('checkpointDescription').value = checkpointData.description || '';
            document.getElementById('checkpointModalTitle').textContent = 'Edit Checkpoint';
        } else {
            let suggestedSession = Math.round(this.planData.totalSessions / 3);
            while (this.planData.checkpoints.some(cp => cp.session === suggestedSession)) {
                suggestedSession++;
            }
            document.getElementById('checkpointSession').value = suggestedSession;
            document.getElementById('checkpointType').value = 'Progress Review';
            document.getElementById('checkpointDescription').value = '';
            document.getElementById('checkpointModalTitle').textContent = 'Add Checkpoint';
        }

        modal.classList.add('active');
    }

    createCheckpointModal() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'checkpointModal';

        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3 id="checkpointModalTitle">Add Checkpoint</h3>
                    <button class="modal-close" onclick="treatmentPlan.closeCheckpointModal()">&times;</button>
                </div>
                <form id="checkpointForm">
                    <div class="form-row">
                        <div class="form-group">
                            <label for="checkpointSession">Session Number *</label>
                            <input type="number" id="checkpointSession" class="form-control" required 
                                   min="1" max="${this.planData.totalSessions}" value="10">
                        </div>
                        <div class="form-group">
                            <label for="checkpointType">Checkpoint Type *</label>
                            <select id="checkpointType" class="form-control" required>
                                <option value="Progress Review">Progress Review</option>
                                <option value="QEEG Update">QEEG Update</option>
                                <option value="Protocol Change">Protocol Change</option>
                                <option value="Assessment">Assessment</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="checkpointDescription">Description *</label>
                        <textarea id="checkpointDescription" class="form-control" rows="3" required
                                  placeholder="Describe the purpose and actions for this checkpoint..."></textarea>
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" onclick="treatmentPlan.closeCheckpointModal()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Save Checkpoint</button>
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(modal);
        
        // Set up form submission
        const form = modal.querySelector('#checkpointForm');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveCheckpoint();
        });
        
        return modal;
    }

    saveCheckpoint() {
        const session = parseInt(document.getElementById('checkpointSession').value);
        const type = document.getElementById('checkpointType').value;
        const description = document.getElementById('checkpointDescription').value.trim();

        if (isNaN(session) || !type || !description) {
            
            return;
        }

        if (session < 1 || session > this.planData.totalSessions) {
            
            return;
        }

        const hasDuplicate = this.planData.checkpoints.some((cp, idx) => {
            if (this.isEditing && idx === this.editingIndex) return false;
            return cp.session === session;
        });

        if (hasDuplicate) {
            
            return;
        }

        const checkpoint = { session, type, description };

        if (this.isEditing && this.editingIndex >= 0) {
            this.planData.checkpoints[this.editingIndex] = checkpoint;
        } else {
            this.planData.checkpoints.push(checkpoint);
        }

        this.renderCheckpoints();
        this.renderTimeline();
        this.closeCheckpointModal();
        this.markAsDirty();
        
    }

    renderCheckpoints() {
        const tbody = document.querySelector('#checkpointsTable tbody');
        if (!tbody) return;

        if (this.planData.checkpoints.length === 0) {
            tbody.innerHTML = '<tr class="empty-state"><td colspan="4">No checkpoints defined. Click "Add Checkpoint" to get started.</td></tr>';
            return;
        }

        const sortedCheckpoints = [...this.planData.checkpoints].sort((a, b) => a.session - b.session);

        tbody.innerHTML = sortedCheckpoints.map((checkpoint, index) => `
            <tr>
                <td>${checkpoint.session}</td>
                <td>${checkpoint.type}</td>
                <td>${checkpoint.description}</td>
                <td>
                    <button class="action-btn" onclick="treatmentPlan.editCheckpoint(${index})" title="Edit">
                        <span data-lucide="edit-2"></span>
                    </button>
                    <button class="action-btn delete" onclick="treatmentPlan.deleteCheckpoint(${index})" title="Delete">
                        <span data-lucide="trash-2"></span>
                    </button>
                </td>
            </tr>
        `).join('');

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            setTimeout(() => lucide.createIcons(), 100);
        }
    }

    editCheckpoint(index) {
        this.showCheckpointModal(this.planData.checkpoints[index], index);
    }

    deleteCheckpoint(index) {
        if (confirm('Are you sure you want to delete this checkpoint?')) {
            this.planData.checkpoints.splice(index, 1);
            this.renderCheckpoints();
            this.renderTimeline();
            this.markAsDirty();
        }
    }

    closeCheckpointModal() {
        document.getElementById('checkpointModal')?.classList.remove('active');
        this.isEditing = false;
        this.editingIndex = -1;
    }

    // ====================================
    // TIMELINE RENDERING
    // ====================================

    renderTimeline() {
        const timeline = document.getElementById('treatmentTimeline');
        if (!timeline) return;

        timeline.innerHTML = '';
        const allProtocols = [...this.planData.protocols, ...this.availableProtocols];

        for (let i = 1; i <= this.planData.totalSessions; i++) {
            if (this.planData.totalSessions > 30 && i % 5 !== 0 && i !== 1 && i !== this.planData.totalSessions) {
                continue;
            }
            
            const isCheckpoint = this.planData.checkpoints.some(cp => cp.session === i);
            const sessionBlock = this.planData.blocks.find(block => 
                i >= block.startSession && i <= block.endSession
            );
            
            const sessionDiv = document.createElement('div');
            sessionDiv.className = 'timeline-session';
            
            const marker = document.createElement('div');
            marker.className = isCheckpoint ? 'session-marker checkpoint' : 'session-marker';
            sessionDiv.appendChild(marker);

            const label = document.createElement('div');
            label.className = 'session-label';
            label.textContent = `S${i}`;
            sessionDiv.appendChild(label);
            
            if (sessionBlock) {
                const protocol = allProtocols.find(p => p.id === sessionBlock.protocolId);
                if (protocol) {
                    const protocolBadge = document.createElement('div');
                    protocolBadge.className = 'protocol-badge';
                    protocolBadge.textContent = protocol.id;
                    sessionDiv.appendChild(protocolBadge);
                }
            }
            
            timeline.appendChild(sessionDiv);
        }

        this.planData.blocks.forEach((block, index) => {
            const startPercent = (block.startSession - 1) / this.planData.totalSessions * 100;
            const endPercent = block.endSession / this.planData.totalSessions * 100;
            const width = endPercent - startPercent;
            
            const blockDiv = document.createElement('div');
            blockDiv.className = 'timeline-block';
            blockDiv.style.left = `${startPercent}%`;
            blockDiv.style.width = `${width}%`;
            blockDiv.style.background = `hsla(${(index * 30) % 360}, 70%, 50%, 0.8)`;
            blockDiv.textContent = block.name;
            
            timeline.appendChild(blockDiv);
        });
    }

    // ====================================
    // SCENARIO LIBRARY
    // ====================================

    loadScenarioLibrary() {
        try {
            this.availableScenarios = window.api.getDefaultScenarios() || [];
            const scenarioSelect = document.getElementById('scenarioSelect');
            if (!scenarioSelect) return;
            
            scenarioSelect.innerHTML = '<option value="">Select a scenario...</option>';
            this.availableScenarios.forEach(scenario => {
                const option = document.createElement('option');
                option.value = scenario.id;
                option.textContent = scenario.name;
                scenarioSelect.appendChild(option);
            });
            
            scenarioSelect.addEventListener('change', (e) => {
                this.displayScenarioDetails(e.target.value);
            });
        } catch (error) {
            console.error('Error loading scenario library:', error);
        }
    }

    displayScenarioDetails(scenarioId) {
        const scenarioDetails = document.getElementById('scenarioDetails');
        if (!scenarioDetails) return;
        
        if (!scenarioId) {
            scenarioDetails.innerHTML = '<p>Select a scenario to view details and generate treatment blocks automatically.</p>';
            return;
        }
        
        const scenario = this.availableScenarios.find(s => s.id === scenarioId);
        if (!scenario) return;
        
        scenarioDetails.innerHTML = `
            <div class="scenario-detail-card">
                <h4>${scenario.name}</h4>
                <div class="scenario-symptoms"><strong>Common Symptoms:</strong><ul>${scenario.symptoms.map(s => `<li>${s}</li>`).join('')}</ul></div>
                <div class="scenario-protocols"><strong>Recommended Protocols:</strong> ${scenario.recommendedProtocols.join(', ')}</div>
                <div class="scenario-info">
                    <p><strong>Typical Sessions:</strong> ${scenario.typical_sessions}</p>
                    <p><strong>Frequency:</strong> ${scenario.frequency_per_week} sessions per week</p>
                </div>
                <p class="scenario-help">Click "Apply Scenario" to automatically create treatment blocks based on this scenario.</p>
            </div>
        `;
    }

    applySelectedScenario() {
        const scenarioId = document.getElementById('scenarioSelect')?.value;
        if (!scenarioId) {
            
            return;
        }
        
        const scenario = this.availableScenarios.find(s => s.id === scenarioId);
        if (!scenario) return;
        
        if (this.planData.blocks.length > 0 && !confirm(`This will replace your existing treatment blocks with ones based on the ${scenario.name} scenario. Continue?`)) {
            return;
        }
        
        try {
            if (scenario.typical_sessions > this.planData.totalSessions) {
                this.updateTotalSessions(scenario.typical_sessions);
            }
            
            this.planData.blocks = [];
            const protocolsPerBlock = Math.ceil(scenario.typical_sessions / scenario.recommendedProtocols.length);
            let sessionCounter = 1;
            
            scenario.recommendedProtocols.forEach((protocolId, index) => {
                const protocol = [...this.planData.protocols, ...this.availableProtocols].find(p => p.id === protocolId);
                
                if (protocol) {
                    // Calculate block range
                    const blockEnd = (index === scenario.recommendedProtocols.length - 1)
                        ? this.planData.totalSessions
                        : Math.min(sessionCounter + protocolsPerBlock - 1, this.planData.totalSessions);
                    
                    // Create block
                    this.planData.blocks.push({
                        name: `Block ${index + 1}`,
                        startSession: sessionCounter,
                        endSession: blockEnd,
                        protocolId: protocol.id,
                        target: protocol.name, // Use protocol name as target
                        notes: `Auto-generated from ${scenario.name} scenario`
                    });
                    
                    sessionCounter = blockEnd + 1;
                }
            });
            
            // Add checkpoints if none exist or if replacing
            if (this.planData.checkpoints.length === 0 || hasExistingBlocks) {
                // Clear existing checkpoints if replacing
                if (hasExistingBlocks) {
                    this.planData.checkpoints = [];
                }
                
                // Add checkpoints at approximately 1/3 and 2/3 of the way through
                const checkpointInterval = Math.round(this.planData.totalSessions / 3);
                
                this.planData.checkpoints.push({
                    session: checkpointInterval,
                    type: 'Progress Review',
                    description: `Checkpoint 1: Review progress and adjust protocol if needed for ${scenario.name}`
                });
                
                this.planData.checkpoints.push({
                    session: checkpointInterval * 2,
                    type: 'Protocol Change',
                    description: `Checkpoint 2: Evaluate effectiveness and consider protocol changes for ${scenario.name}`
                });
            }
            
            // Update UI
            this.renderBlocks();
            this.renderCheckpoints();
            this.renderTimeline();
            
            this.markAsDirty();
            
            if (window.ui) {
                
            }
            
        } catch (error) {
            console.error('Error applying scenario:', error);
            if (window.ui) {
                
            }
        }
    }

    // ====================================
    // SAVE/LOAD OPERATIONS
    // ====================================

    async saveTreatmentPlan() {
        if (!this.currentPatientId) {
            
            return;
        }

        try {
            const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
            const planPayload = {
                doctor_id: currentUser.id,
                ...this.planData
            };

            await window.api.saveTreatmentPlan(this.currentPatientId, planPayload);
            
            this.markAsClean();
        } catch (error) {
            console.error('Error saving treatment plan:', error);
            
        }
    }

    // ====================================
    // UTILITY METHODS
    // ====================================

    updateTotalSessions(newTotal) {
        // Update the total sessions value
        if (newTotal < 5) newTotal = 5;
        if (newTotal > 100) newTotal = 100;
        
        this.planData.totalSessions = newTotal;
        
        // Update UI
        const totalSessionsInput = document.getElementById('totalSessionsInput');
        if (totalSessionsInput) {
            totalSessionsInput.value = newTotal;
        }
        
        // Update any blocks that extend beyond the new total
        this.planData.blocks.forEach(block => {
            if (block.endSession > newTotal) {
                block.endSession = newTotal;
            }
        });
        
        // Update any checkpoints that are beyond the new total
        this.planData.checkpoints = this.planData.checkpoints.filter(cp => cp.session <= newTotal);
        
        // Re-render timeline
        this.renderTimeline();
        
        this.markAsDirty();
    }

    markAsDirty() {
        this.isDirty = true;
        const saveBtn = document.getElementById('saveTreatmentPlanBtn');
        if (saveBtn) {
            saveBtn.textContent = 'Save Treatment Plan*';
            saveBtn.classList.add('btn-warning');
        }
    }

    markAsClean() {
        this.isDirty = false;
        const saveBtn = document.getElementById('saveTreatmentPlanBtn');
        if (saveBtn) {
            saveBtn.textContent = 'Save Treatment Plan';
            saveBtn.classList.remove('btn-warning');
        }
    }

    // ====================================
    // PUBLIC API
    // ====================================

    showView() {}

    getTreatmentPlanData() {
        return { ...this.planData };
    }

    setCurrentPatient(patientId) {
        this.loadPatientTreatmentPlan(patientId);
        const select = document.getElementById('treatmentPatientSelect');
        if (select) {
            select.value = patientId;
        }
    }
}

// Create global treatment plan instance
window.treatmentPlan = new TreatmentPlan();
