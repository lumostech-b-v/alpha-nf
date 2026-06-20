/**
 * Checkpoint Decision System
 * Automated checkpoint evaluation interface with branching options (continue/modify/new protocol)
 * and clinical decision support for treatment plan adjustments
 */

class CheckpointDecision {
    constructor() {
        this.currentCheckpoint = null;
        this.patientData = null;
        this.sessionHistory = [];
        this.assessmentData = null;
        this.treatmentPlan = null;
        this.recommendations = [];
        this.decisionOptions = [];
        this.isModalOpen = false;
        this.init();
    }

    init() {
        this.createCheckpointModal();
        this.setupEventListeners();
    }

    // ====================================
    // MODAL CREATION
    // ====================================

    createCheckpointModal() {
        let modal = document.getElementById('checkpointDecisionModal');
        if (modal) return;

        modal = document.createElement('div');
        modal.id = 'checkpointDecisionModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content checkpoint-modal">
                <div class="modal-header">
                    <h2>Checkpoint Decision</h2>
                    <button class="modal-close" id="closeCheckpointModal">&times;</button>
                </div>
                
                <div class="modal-body">
                    <!-- Checkpoint Overview -->
                    <div class="checkpoint-overview">
                        <div class="overview-header">
                            <h3 id="checkpointTitle">Checkpoint Session #</h3>
                            <div class="checkpoint-meta">
                                <span id="checkpointDate">-</span>
                                <span class="separator">•</span>
                                <span id="checkpointType">Assessment</span>
                            </div>
                        </div>
                        <p id="checkpointDescription">-</p>
                    </div>

                    <!-- Current Progress Analysis -->
                    <div class="progress-analysis">
                        <h4>Current Progress Analysis</h4>
                        <div class="analysis-grid">
                            <div class="analysis-card">
                                <div class="analysis-label">Recent Success Rate</div>
                                <div class="analysis-value success-rate" id="recentSuccessRate">-</div>
                                <div class="analysis-trend" id="successTrend">-</div>
                            </div>
                            <div class="analysis-card">
                                <div class="analysis-label">Sessions Completed</div>
                                <div class="analysis-value" id="sessionsCompleted">-</div>
                                <div class="analysis-detail" id="sessionDetails">-</div>
                            </div>
                            <div class="analysis-card">
                                <div class="analysis-label">Current Block Progress</div>
                                <div class="analysis-value" id="blockProgress">-</div>
                                <div class="analysis-detail" id="blockDetails">-</div>
                            </div>
                            <div class="analysis-card">
                                <div class="analysis-label">Assessment Changes</div>
                                <div class="analysis-value" id="assessmentChanges">-</div>
                                <div class="analysis-detail" id="assessmentDetails">-</div>
                            </div>
                        </div>
                    </div>

                    <!-- Quick Assessment -->
                    <div class="quick-assessment">
                        <h4>Quick Assessment</h4>
                        <div class="assessment-questions">
                            <div class="question-group">
                                <label>Patient Self-Report (1-10 scale):</label>
                                <div class="question-row">
                                    <span>Symptoms:</span>
                                    <select id="symptomImprovement" class="form-control inline">
                                        <option value="">Select...</option>
                                        <option value="1">1 - Much worse</option>
                                        <option value="2">2 - Worse</option>
                                        <option value="3">3 - Slightly worse</option>
                                        <option value="4">4 - No change</option>
                                        <option value="5">5 - Slight improvement</option>
                                        <option value="6">6 - Mild improvement</option>
                                        <option value="7">7 - Moderate improvement</option>
                                        <option value="8">8 - Good improvement</option>
                                        <option value="9">9 - Major improvement</option>
                                        <option value="10">10 - Complete resolution</option>
                                    </select>
                                </div>
                                <div class="question-row">
                                    <span>Sleep Quality:</span>
                                    <select id="sleepImprovement" class="form-control inline">
                                        <option value="">Select...</option>
                                        <option value="1">1 - Much worse</option>
                                        <option value="2">2 - Worse</option>
                                        <option value="3">3 - Slightly worse</option>
                                        <option value="4">4 - No change</option>
                                        <option value="5">5 - Slight improvement</option>
                                        <option value="6">6 - Mild improvement</option>
                                        <option value="7">7 - Moderate improvement</option>
                                        <option value="8">8 - Good improvement</option>
                                        <option value="9">9 - Major improvement</option>
                                        <option value="10">10 - Perfect sleep</option>
                                    </select>
                                </div>
                                <div class="question-row">
                                    <span>Daily Function:</span>
                                    <select id="functionImprovement" class="form-control inline">
                                        <option value="">Select...</option>
                                        <option value="1">1 - Much worse</option>
                                        <option value="2">2 - Worse</option>
                                        <option value="3">3 - Slightly worse</option>
                                        <option value="4">4 - No change</option>
                                        <option value="5">5 - Slight improvement</option>
                                        <option value="6">6 - Mild improvement</option>
                                        <option value="7">7 - Moderate improvement</option>
                                        <option value="8">8 - Good improvement</option>
                                        <option value="9">9 - Major improvement</option>
                                        <option value="10">10 - Excellent function</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div class="question-group">
                                <label>Clinical Observation:</label>
                                <div class="checkbox-group">
                                    <label class="checkbox-label">
                                        <input type="checkbox" id="improvementVisible">
                                        <span>Visible improvement in sessions</span>
                                    </label>
                                    <label class="checkbox-label">
                                        <input type="checkbox" id="engagementGood">
                                        <span>Good patient engagement</span>
                                    </label>
                                    <label class="checkbox-label">
                                        <input type="checkbox" id="artifactsReduced">
                                        <span>Artifacts reduced over time</span>
                                    </label>
                                    <label class="checkbox-label">
                                        <input type="checkbox" id="protocolTolerance">
                                        <span>Good protocol tolerance</span>
                                    </label>
                                </div>
                            </div>

                            <div class="question-group">
                                <label for="clinicalNotes">Additional Clinical Notes:</label>
                                <textarea id="clinicalNotes" class="form-control" rows="3" 
                                          placeholder="Enter any additional observations, patient feedback, or clinical notes..."></textarea>
                            </div>
                        </div>
                    </div>

                    <!-- AI Recommendations -->
                    <div class="ai-recommendations">
                        <h4>System Recommendations</h4>
                        <div id="recommendationsList" class="recommendations-list">
                            <div class="loading">Analyzing progress data...</div>
                        </div>
                    </div>

                    <!-- Decision Options -->
                    <div class="decision-options">
                        <h4>Treatment Decision</h4>
                        <div class="options-grid" id="decisionOptionsGrid">
                            <!-- Options will be dynamically generated -->
                        </div>
                    </div>

                    <!-- Protocol Adjustment Panel -->
                    <div class="protocol-adjustment" id="protocolAdjustmentPanel" style="display: none;">
                        <h4>Protocol Adjustment</h4>
                        <div class="adjustment-form">
                            <div class="form-row">
                                <div class="form-group">
                                    <label for="newProtocolType">New Protocol Type:</label>
                                    <select id="newProtocolType" class="form-control">
                                        <option value="">Select protocol...</option>
                                        <option value="TBR">TBR (Theta/Beta Ratio)</option>
                                        <option value="Alpha">Alpha Enhancement</option>
                                        <option value="Beta">Beta Training</option>
                                        <option value="SMR">SMR (Sensorimotor Rhythm)</option>
                                        <option value="Gamma">Gamma Enhancement</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label for="newLocation">New Location:</label>
                                    <select id="newLocation" class="form-control">
                                        <option value="">Select location...</option>
                                        <option value="F3">F3 (Left Frontal)</option>
                                        <option value="F4">F4 (Right Frontal)</option>
                                        <option value="Fz">Fz (Frontal Midline)</option>
                                        <option value="C3">C3 (Left Central)</option>
                                        <option value="C4">C4 (Right Central)</option>
                                        <option value="Cz">Cz (Central Midline)</option>
                                        <option value="Pz">Pz (Parietal Midline)</option>
                                        <option value="P3">P3 (Left Parietal)</option>
                                        <option value="P4">P4 (Right Parietal)</option>
                                    </select>
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label for="rewardFreq">Reward Frequency (Hz):</label>
                                    <input type="text" id="rewardFreq" class="form-control" placeholder="e.g., 15-18">
                                </div>
                                <div class="form-group">
                                    <label for="inhibitFreq">Inhibit Frequency (Hz):</label>
                                    <input type="text" id="inhibitFreq" class="form-control" placeholder="e.g., 8-12">
                                </div>
                            </div>
                            <div class="form-group">
                                <label for="adjustmentReason">Reason for Adjustment:</label>
                                <textarea id="adjustmentReason" class="form-control" rows="2" 
                                          placeholder="Explain why this protocol change is recommended..."></textarea>
                            </div>
                        </div>
                    </div>

                    <!-- New Block Definition -->
                    <div class="new-block-definition" id="newBlockPanel" style="display: none;">
                        <h4>Define New Block</h4>
                        <div class="block-form">
                            <div class="form-row">
                                <div class="form-group">
                                    <label for="blockName">Block Name:</label>
                                    <input type="text" id="blockName" class="form-control" placeholder="e.g., Block 3: Maintenance">
                                </div>
                                <div class="form-group">
                                    <label for="blockSessions">Number of Sessions:</label>
                                    <input type="number" id="blockSessions" class="form-control" min="1" max="20" value="5">
                                </div>
                            </div>
                            <div class="form-group">
                                <label for="blockTarget">Treatment Target:</label>
                                <input type="text" id="blockTarget" class="form-control" 
                                       placeholder="e.g., Maintain improvements, prevent relapse">
                            </div>
                            <div class="form-group">
                                <label for="blockNotes">Block Notes:</label>
                                <textarea id="blockNotes" class="form-control" rows="2" 
                                          placeholder="Additional notes about this treatment block..."></textarea>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="modal-footer">
                    <div class="footer-actions">
                        <button class="btn btn-secondary" id="saveCheckpointDraft">Save Draft</button>
                        <button class="btn btn-secondary" id="cancelCheckpoint">Cancel</button>
                        <button class="btn btn-primary" id="finalizeCheckpoint">Finalize Decision</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        this.bindModalEvents();
    }

    // ====================================
    // EVENT HANDLING
    // ====================================

    setupEventListeners() {
        // Global checkpoint triggers
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('conduct-checkpoint-btn')) {
                const checkpointId = e.target.getAttribute('data-checkpoint-id');
                const patientId = e.target.getAttribute('data-patient-id');
                this.openCheckpoint(checkpointId, patientId);
            }
        });
    }

    bindModalEvents() {
        // Modal close
        document.getElementById('closeCheckpointModal')?.addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('cancelCheckpoint')?.addEventListener('click', () => {
            this.closeModal();
        });

        // Decision option selection
        document.addEventListener('change', (e) => {
            if (e.target.name === 'decisionOption') {
                this.handleDecisionSelection(e.target.value);
            }
        });

        // Assessment inputs
        document.getElementById('symptomImprovement')?.addEventListener('change', () => {
            this.updateRecommendations();
        });
        document.getElementById('sleepImprovement')?.addEventListener('change', () => {
            this.updateRecommendations();
        });
        document.getElementById('functionImprovement')?.addEventListener('change', () => {
            this.updateRecommendations();
        });

        // Clinical observation checkboxes
        document.querySelectorAll('#checkpointDecisionModal input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.updateRecommendations();
            });
        });

        // Action buttons
        document.getElementById('saveCheckpointDraft')?.addEventListener('click', () => {
            this.saveCheckpointDraft();
        });

        document.getElementById('finalizeCheckpoint')?.addEventListener('click', () => {
            this.finalizeCheckpointDecision();
        });

        // Modal background click
        document.getElementById('checkpointDecisionModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'checkpointDecisionModal') {
                this.closeModal();
            }
        });
    }

    // ====================================
    // MAIN FUNCTIONALITY
    // ====================================

    async openCheckpoint(checkpointId, patientId) {
        try {
            this.isModalOpen = true;
            
            // Load all necessary data
            await this.loadCheckpointData(checkpointId, patientId);
            
            // Populate the modal with data
            this.populateCheckpointModal();
            
            // Analyze progress and generate recommendations
            await this.analyzeProgressAndGenerateRecommendations();
            
            // Show the modal
            document.getElementById('checkpointDecisionModal').style.display = 'block';
            document.body.style.overflow = 'hidden';
            
        } catch (error) {
            console.error('Error opening checkpoint:', error);
            alert('Failed to open checkpoint decision interface');
        }
    }

    async loadCheckpointData(checkpointId, patientId) {
        // Load patient data
        this.patientData = await window.api.getPatient(patientId);
        
        // Load session history
        this.sessionHistory = await window.api.getSessionsByPatient(patientId);
        this.sessionHistory.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
        
        // Load assessment data
        this.assessmentData = await window.api.getAssessmentByPatient(patientId);
        
        // Load treatment plan
        this.treatmentPlan = await window.api.getTreatmentPlanByPatient(patientId);
        
        // Find the specific checkpoint
        this.currentCheckpoint = this.treatmentPlan?.checkpoints?.find(cp => cp.id === checkpointId);
        
        if (!this.currentCheckpoint) {
            throw new Error('Checkpoint not found');
        }
    }

    populateCheckpointModal() {
        // Checkpoint basic info
        document.getElementById('checkpointTitle').textContent = 
            `Checkpoint Session ${this.currentCheckpoint.session}`;
        document.getElementById('checkpointDate').textContent = 
            new Date().toLocaleDateString();
        document.getElementById('checkpointType').textContent = 
            this.currentCheckpoint.type || 'Progress Review';
        document.getElementById('checkpointDescription').textContent = 
            this.currentCheckpoint.description || 'Regular checkpoint to assess progress and adjust treatment plan';

        // Progress analysis
        this.populateProgressAnalysis();
    }

    populateProgressAnalysis() {
        const recentSessions = this.sessionHistory.slice(-5); // Last 5 sessions
        
        if (recentSessions.length > 0) {
            const avgSuccessRate = recentSessions.reduce((sum, s) => sum + (s.overall_success_rate || 0), 0) / recentSessions.length;
            document.getElementById('recentSuccessRate').textContent = `${avgSuccessRate.toFixed(1)}%`;
            
            // Determine trend
            if (recentSessions.length >= 3) {
                const early = recentSessions.slice(0, 2).reduce((sum, s) => sum + (s.overall_success_rate || 0), 0) / 2;
                const recent = recentSessions.slice(-2).reduce((sum, s) => sum + (s.overall_success_rate || 0), 0) / 2;
                const trend = recent - early;
                
                let trendText, trendClass;
                if (trend > 5) {
                    trendText = '↗ Improving';
                    trendClass = 'trend-up';
                } else if (trend < -5) {
                    trendText = '↘ Declining';
                    trendClass = 'trend-down';
                } else {
                    trendText = '→ Stable';
                    trendClass = 'trend-stable';
                }
                
                const trendEl = document.getElementById('successTrend');
                trendEl.textContent = trendText;
                trendEl.className = `analysis-trend ${trendClass}`;
            }
        }

        // Sessions completed
        document.getElementById('sessionsCompleted').textContent = this.sessionHistory.length;
        document.getElementById('sessionDetails').textContent = 
            `Target: ${this.currentCheckpoint.session} sessions`;

        // Current block progress
        const currentBlock = this.getCurrentBlock();
        if (currentBlock) {
            const blockSessions = this.getBlockSessions(currentBlock);
            const completion = (blockSessions.length / (currentBlock.endSession - currentBlock.startSession + 1)) * 100;
            document.getElementById('blockProgress').textContent = `${completion.toFixed(0)}%`;
            document.getElementById('blockDetails').textContent = 
                `${currentBlock.name}: ${blockSessions.length}/${currentBlock.endSession - currentBlock.startSession + 1} sessions`;
        }

        // Assessment changes
        if (this.assessmentData.length >= 2) {
            const changes = this.calculateAssessmentChanges();
            document.getElementById('assessmentChanges').textContent = 
                changes.significantChanges > 0 ? `${changes.significantChanges} significant` : 'No significant changes';
            document.getElementById('assessmentDetails').textContent = 
                changes.overallImprovement ? 'Overall improvement trend' : 'Stable or declining';
        }
    }

    getCurrentBlock() {
        if (!this.treatmentPlan?.blocks) return null;
        
        const currentSession = this.sessionHistory.length + 1;
        return this.treatmentPlan.blocks.find(block => 
            currentSession >= block.startSession && currentSession <= block.endSession
        );
    }

    getBlockSessions(block) {
        return this.sessionHistory.filter(session => {
            const sessionNum = this.sessionHistory.indexOf(session) + 1;
            return sessionNum >= block.startSession && sessionNum <= block.endSession;
        });
    }

    calculateAssessmentChanges() {
        if (this.assessmentData.length < 2) {
            return { significantChanges: 0, overallImprovement: false };
        }

        const initial = this.extractAssessmentScores(this.assessmentData[0]);
        const latest = this.extractAssessmentScores(this.assessmentData[this.assessmentData.length - 1]);

        let significantChanges = 0;
        let totalImprovement = 0;
        let testsCompared = 0;

        Object.keys(initial).forEach(test => {
            if (latest[test] !== undefined) {
                const change = initial[test] - latest[test]; // Lower is better
                const threshold = this.getSignificantChangeThreshold(test);
                
                if (Math.abs(change) >= threshold) {
                    significantChanges++;
                }
                
                totalImprovement += change;
                testsCompared++;
            }
        });

        return {
            significantChanges,
            overallImprovement: testsCompared > 0 && (totalImprovement / testsCompared) > 1
        };
    }

    extractAssessmentScores(assessment) {
        if (!assessment.doctor_notes) return {};

        try {
            const notes = typeof assessment.doctor_notes === 'string' 
                ? JSON.parse(assessment.doctor_notes) 
                : assessment.doctor_notes;

            const scores = {};
            if (notes.disorder_tests) {
                Object.keys(notes.disorder_tests).forEach(test => {
                    const testData = notes.disorder_tests[test];
                    if (testData.administered && testData.score !== undefined) {
                        scores[test] = parseFloat(testData.score);
                    }
                });
            }

            return scores;
        } catch (error) {
            console.error('Error extracting assessment scores:', error);
            return {};
        }
    }

    getSignificantChangeThreshold(test) {
        const thresholds = {
            'gad7': 3,
            'phq9': 3,
            'rumination': 5,
            'trauma': 10,
            'inattention': 4
        };
        return thresholds[test] || 3;
    }

    // ====================================
    // RECOMMENDATION ENGINE
    // ====================================

    async analyzeProgressAndGenerateRecommendations() {
        this.recommendations = [];
        
        // Analyze session performance
        this.analyzeSessionPerformance();
        
        // Analyze assessment changes
        this.analyzeAssessmentProgress();
        
        // Analyze protocol effectiveness
        this.analyzeProtocolEffectiveness();
        
        // Generate decision options
        this.generateDecisionOptions();
        
        // Update the UI
        this.updateRecommendationsDisplay();
        this.updateDecisionOptions();
    }

    analyzeSessionPerformance() {
        const recentSessions = this.sessionHistory.slice(-5);
        
        if (recentSessions.length === 0) {
            this.recommendations.push({
                type: 'warning',
                category: 'session_performance',
                message: 'No session data available for analysis',
                priority: 'high'
            });
            return;
        }

        const avgSuccessRate = recentSessions.reduce((sum, s) => sum + (s.overall_success_rate || 0), 0) / recentSessions.length;
        const trendSlope = this.calculateTrendSlope(recentSessions.map(s => s.overall_success_rate || 0));

        if (avgSuccessRate < 40) {
            this.recommendations.push({
                type: 'warning',
                category: 'session_performance',
                message: 'Low success rate detected. Consider protocol adjustment or threshold modification.',
                priority: 'high',
                data: { avgSuccessRate, trendSlope }
            });
        } else if (avgSuccessRate > 75 && trendSlope > 0) {
            this.recommendations.push({
                type: 'success',
                category: 'session_performance',
                message: 'Excellent progress with improving trend. Consider advancing to next phase.',
                priority: 'medium',
                data: { avgSuccessRate, trendSlope }
            });
        }

        // Analyze artifact rates
        const avgArtifactRate = recentSessions.reduce((sum, s) => {
            const total = s.duration_seconds || 0;
            const artifacts = s.total_artifact_time_seconds || 0;
            return sum + (total > 0 ? (artifacts / total) * 100 : 0);
        }, 0) / recentSessions.length;

        if (avgArtifactRate > 20) {
            this.recommendations.push({
                type: 'warning',
                category: 'artifacts',
                message: 'High artifact rate detected. Review electrode placement and patient comfort.',
                priority: 'medium',
                data: { avgArtifactRate }
            });
        }
    }

    analyzeAssessmentProgress() {
        if (this.assessmentData.length < 2) {
            this.recommendations.push({
                type: 'info',
                category: 'assessment',
                message: 'Re-administer assessment tests to track clinical progress.',
                priority: 'medium'
            });
            return;
        }

        const changes = this.calculateAssessmentChanges();
        
        if (changes.significantChanges > 0 && changes.overallImprovement) {
            this.recommendations.push({
                type: 'success',
                category: 'assessment',
                message: `Significant clinical improvements detected in ${changes.significantChanges} test(s).`,
                priority: 'high'
            });
        } else if (changes.significantChanges > 0 && !changes.overallImprovement) {
            this.recommendations.push({
                type: 'warning',
                category: 'assessment',
                message: 'Mixed or declining assessment results. Consider treatment modification.',
                priority: 'high'
            });
        }
    }

    analyzeProtocolEffectiveness() {
        const currentBlock = this.getCurrentBlock();
        if (!currentBlock) return;

        const blockSessions = this.getBlockSessions(currentBlock);
        
        if (blockSessions.length >= 3) {
            const earlyAvg = blockSessions.slice(0, Math.ceil(blockSessions.length / 2))
                .reduce((sum, s) => sum + (s.overall_success_rate || 0), 0) / Math.ceil(blockSessions.length / 2);
            const lateAvg = blockSessions.slice(-Math.ceil(blockSessions.length / 2))
                .reduce((sum, s) => sum + (s.overall_success_rate || 0), 0) / Math.ceil(blockSessions.length / 2);

            const blockImprovement = lateAvg - earlyAvg;

            if (blockImprovement > 10) {
                this.recommendations.push({
                    type: 'success',
                    category: 'protocol',
                    message: `Current protocol (${currentBlock.protocol}) showing strong effectiveness.`,
                    priority: 'medium'
                });
            } else if (blockImprovement < -5) {
                this.recommendations.push({
                    type: 'warning',
                    category: 'protocol',
                    message: `Current protocol may not be optimal. Consider protocol change.`,
                    priority: 'high'
                });
            }
        }
    }

    calculateTrendSlope(values) {
        if (values.length < 2) return 0;
        
        const n = values.length;
        const sumX = values.reduce((sum, val, i) => sum + i, 0);
        const sumY = values.reduce((sum, val) => sum + val, 0);
        const sumXY = values.reduce((sum, val, i) => sum + (i * val), 0);
        const sumX2 = values.reduce((sum, val, i) => sum + (i * i), 0);
        
        return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    }

    generateDecisionOptions() {
        this.decisionOptions = [];
        
        // Always include continue option
        this.decisionOptions.push({
            id: 'continue',
            label: 'Continue Current Treatment',
            description: 'Proceed with current protocol and treatment plan as scheduled',
            recommended: this.isCurrentTreatmentRecommended(),
            icon: 'arrow-right'
        });

        // Protocol adjustment option
        this.decisionOptions.push({
            id: 'adjust_protocol',
            label: 'Adjust Current Protocol',
            description: 'Modify protocol parameters (thresholds, frequencies, location)',
            recommended: this.isProtocolAdjustmentRecommended(),
            icon: 'settings'
        });

        // New protocol option
        this.decisionOptions.push({
            id: 'change_protocol',
            label: 'Change to New Protocol',
            description: 'Switch to a different protocol type for better outcomes',
            recommended: this.isProtocolChangeRecommended(),
            icon: 'repeat'
        });

        // New block option
        this.decisionOptions.push({
            id: 'new_block',
            label: 'Define New Treatment Block',
            description: 'Create additional treatment block to address specific needs',
            recommended: this.isNewBlockRecommended(),
            icon: 'plus'
        });

        // Early completion option
        if (this.isEarlyCompletionAppropriate()) {
            this.decisionOptions.push({
                id: 'early_completion',
                label: 'Consider Treatment Completion',
                description: 'Patient shows excellent progress, consider ending treatment',
                recommended: true,
                icon: 'check-circle'
            });
        }

        // Extended treatment option
        if (this.isExtendedTreatmentNeeded()) {
            this.decisionOptions.push({
                id: 'extend_treatment',
                label: 'Extend Current Block',
                description: 'Add more sessions to current block for better consolidation',
                recommended: true,
                icon: 'clock'
            });
        }
    }

    isCurrentTreatmentRecommended() {
        const recentSessions = this.sessionHistory.slice(-3);
        if (recentSessions.length === 0) return true;

        const avgSuccess = recentSessions.reduce((sum, s) => sum + (s.overall_success_rate || 0), 0) / recentSessions.length;
        const hasNegativeRecommendations = this.recommendations.some(r => 
            r.type === 'warning' && ['session_performance', 'protocol'].includes(r.category)
        );

        return avgSuccess >= 50 && !hasNegativeRecommendations;
    }

    isProtocolAdjustmentRecommended() {
        return this.recommendations.some(r => 
            r.type === 'warning' && r.message.toLowerCase().includes('threshold')
        );
    }

    isProtocolChangeRecommended() {
        return this.recommendations.some(r => 
            r.type === 'warning' && r.message.toLowerCase().includes('protocol')
        );
    }

    isNewBlockRecommended() {
        const currentBlock = this.getCurrentBlock();
        if (!currentBlock) return false;

        const blockSessions = this.getBlockSessions(currentBlock);
        const blockCompletion = blockSessions.length / (currentBlock.endSession - currentBlock.startSession + 1);
        
        return blockCompletion > 0.8 && this.recommendations.some(r => r.type === 'success');
    }

    isEarlyCompletionAppropriate() {
        const changes = this.calculateAssessmentChanges();
        const recentSuccess = this.sessionHistory.slice(-5).reduce((sum, s) => sum + (s.overall_success_rate || 0), 0) / 5;
        
        return changes.overallImprovement && changes.significantChanges >= 2 && recentSuccess > 75;
    }

    isExtendedTreatmentNeeded() {
        const recentSessions = this.sessionHistory.slice(-3);
        if (recentSessions.length === 0) return false;

        const avgSuccess = recentSessions.reduce((sum, s) => sum + (s.overall_success_rate || 0), 0) / recentSessions.length;
        return avgSuccess < 50 || this.recommendations.some(r => r.type === 'warning');
    }

    // ====================================
    // UI UPDATES
    // ====================================

    updateRecommendationsDisplay() {
        const container = document.getElementById('recommendationsList');
        
        if (this.recommendations.length === 0) {
            container.innerHTML = '<div class="no-recommendations">No specific recommendations at this time.</div>';
            return;
        }

        container.innerHTML = this.recommendations.map(rec => `
            <div class="recommendation-item ${rec.type}" data-priority="${rec.priority}">
                <div class="recommendation-icon">
                    ${rec.type === 'success' ? '✓' : rec.type === 'warning' ? '⚠' : 'ℹ'}
                </div>
                <div class="recommendation-content">
                    <div class="recommendation-message">${rec.message}</div>
                    <div class="recommendation-category">${rec.category.replace('_', ' ').toUpperCase()}</div>
                </div>
            </div>
        `).join('');
    }

    updateDecisionOptions() {
        const container = document.getElementById('decisionOptionsGrid');
        
        container.innerHTML = this.decisionOptions.map(option => `
            <div class="decision-option ${option.recommended ? 'recommended' : ''}">
                <label class="option-label">
                    <input type="radio" name="decisionOption" value="${option.id}" ${option.recommended ? 'checked' : ''}>
                    <div class="option-content">
                        <div class="option-header">
                            <span class="option-icon" data-lucide="${option.icon}"></span>
                            <span class="option-title">${option.label}</span>
                            ${option.recommended ? '<span class="recommended-badge">Recommended</span>' : ''}
                        </div>
                        <div class="option-description">${option.description}</div>
                    </div>
                </label>
            </div>
        `).join('');

        // Refresh Lucide icons
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            setTimeout(() => lucide.createIcons(), 100);
        }
    }

    updateRecommendations() {
        // This would be called when assessment inputs change
        // Re-analyze based on new input and update recommendations
        
        const symptomScore = parseInt(document.getElementById('symptomImprovement')?.value || '0');
        const sleepScore = parseInt(document.getElementById('sleepImprovement')?.value || '0');
        const functionScore = parseInt(document.getElementById('functionImprovement')?.value || '0');
        
        // Add patient-reported outcomes to recommendations
        if (symptomScore >= 7 && sleepScore >= 7 && functionScore >= 7) {
            // Add positive recommendation
            if (!this.recommendations.some(r => r.category === 'patient_report')) {
                this.recommendations.push({
                    type: 'success',
                    category: 'patient_report',
                    message: 'Patient reports significant improvements across all domains.',
                    priority: 'high'
                });
            }
        } else if (symptomScore <= 3 || sleepScore <= 3 || functionScore <= 3) {
            // Add concerning recommendation
            if (!this.recommendations.some(r => r.category === 'patient_report')) {
                this.recommendations.push({
                    type: 'warning',
                    category: 'patient_report',
                    message: 'Patient reports concerning symptoms or functional decline.',
                    priority: 'high'
                });
            }
        }
        
        this.updateRecommendationsDisplay();
        this.generateDecisionOptions();
        this.updateDecisionOptions();
    }

    handleDecisionSelection(optionId) {
        // Hide all adjustment panels first
        document.getElementById('protocolAdjustmentPanel').style.display = 'none';
        document.getElementById('newBlockPanel').style.display = 'none';
        
        // Show relevant panels based on selection
        switch (optionId) {
            case 'adjust_protocol':
            case 'change_protocol':
                document.getElementById('protocolAdjustmentPanel').style.display = 'block';
                break;
            case 'new_block':
                document.getElementById('newBlockPanel').style.display = 'block';
                break;
        }
    }

    // ====================================
    // SAVE AND FINALIZE
    // ====================================

    async saveCheckpointDraft() {
        try {
            const checkpointData = this.collectCheckpointData();
            checkpointData.status = 'draft';
            
            await window.api.saveCheckpointDecision(this.currentCheckpoint.id, checkpointData);
            
            alert('Checkpoint draft saved successfully');
        } catch (error) {
            console.error('Error saving checkpoint draft:', error);
            alert('Failed to save checkpoint draft');
        }
    }

    async finalizeCheckpointDecision() {
        try {
            const checkpointData = this.collectCheckpointData();
            
            if (!checkpointData.decision) {
                alert('Please select a treatment decision');
                return;
            }
            
            checkpointData.status = 'completed';
            checkpointData.completedAt = new Date().toISOString();
            checkpointData.completedBy = 'current_user'; // Replace with actual user ID
            
            await window.api.saveCheckpointDecision(this.currentCheckpoint.id, checkpointData);
            
            // Apply the decision to treatment plan
            await this.applyCheckpointDecision(checkpointData);
            
            alert('Checkpoint decision finalized successfully');
            this.closeModal();
            
            // Refresh any progress views
            if (window.progressVisualization) {
                await window.progressVisualization.loadPatientProgress(this.patientData.id);
            }
            
        } catch (error) {
            console.error('Error finalizing checkpoint decision:', error);
            alert('Failed to finalize checkpoint decision');
        }
    }

    collectCheckpointData() {
        const selectedOption = document.querySelector('input[name="decisionOption"]:checked')?.value;
        
        return {
            checkpointId: this.currentCheckpoint.id,
            patientId: this.patientData.id,
            sessionNumber: this.currentCheckpoint.session,
            decision: selectedOption,
            patientReports: {
                symptoms: parseInt(document.getElementById('symptomImprovement')?.value || '0'),
                sleep: parseInt(document.getElementById('sleepImprovement')?.value || '0'),
                function: parseInt(document.getElementById('functionImprovement')?.value || '0')
            },
            clinicalObservations: {
                improvementVisible: document.getElementById('improvementVisible')?.checked,
                engagementGood: document.getElementById('engagementGood')?.checked,
                artifactsReduced: document.getElementById('artifactsReduced')?.checked,
                protocolTolerance: document.getElementById('protocolTolerance')?.checked
            },
            clinicalNotes: document.getElementById('clinicalNotes')?.value,
            protocolAdjustment: selectedOption === 'adjust_protocol' || selectedOption === 'change_protocol' ? {
                newProtocolType: document.getElementById('newProtocolType')?.value,
                newLocation: document.getElementById('newLocation')?.value,
                rewardFreq: document.getElementById('rewardFreq')?.value,
                inhibitFreq: document.getElementById('inhibitFreq')?.value,
                reason: document.getElementById('adjustmentReason')?.value
            } : null,
            newBlock: selectedOption === 'new_block' ? {
                name: document.getElementById('blockName')?.value,
                sessions: parseInt(document.getElementById('blockSessions')?.value || '0'),
                target: document.getElementById('blockTarget')?.value,
                notes: document.getElementById('blockNotes')?.value
            } : null,
            recommendations: this.recommendations,
            timestamp: new Date().toISOString()
        };
    }

    async applyCheckpointDecision(checkpointData) {
        switch (checkpointData.decision) {
            case 'continue':
                // No changes needed
                break;
                
            case 'adjust_protocol':
            case 'change_protocol':
                if (checkpointData.protocolAdjustment) {
                    await this.updateCurrentProtocol(checkpointData.protocolAdjustment);
                }
                break;
                
            case 'new_block':
                if (checkpointData.newBlock) {
                    await this.addNewTreatmentBlock(checkpointData.newBlock);
                }
                break;
                
            case 'early_completion':
                await this.markTreatmentCompleted();
                break;
                
            case 'extend_treatment':
                await this.extendCurrentBlock();
                break;
        }
    }

    async updateCurrentProtocol(protocolAdjustment) {
        // Update the treatment plan with new protocol settings
        if (this.treatmentPlan) {
            const currentBlock = this.getCurrentBlock();
            if (currentBlock) {
                Object.assign(currentBlock, {
                    protocolType: protocolAdjustment.newProtocolType,
                    location: protocolAdjustment.newLocation,
                    rewardFreq: protocolAdjustment.rewardFreq,
                    inhibitFreq: protocolAdjustment.inhibitFreq,
                    lastModified: new Date().toISOString(),
                    modificationReason: protocolAdjustment.reason
                });
                
                await window.api.saveTreatmentPlan(this.patientData.id, this.treatmentPlan);
            }
        }
    }

    async addNewTreatmentBlock(blockData) {
        // Add new block to treatment plan
        if (this.treatmentPlan) {
            const lastSession = Math.max(...this.treatmentPlan.blocks.map(b => b.endSession));
            const newBlock = {
                id: Date.now().toString(),
                name: blockData.name,
                startSession: lastSession + 1,
                endSession: lastSession + blockData.sessions,
                target: blockData.target,
                notes: blockData.notes,
                createdAt: new Date().toISOString()
            };
            
            this.treatmentPlan.blocks.push(newBlock);
            await window.api.saveTreatmentPlan(this.patientData.id, this.treatmentPlan);
        }
    }

    async markTreatmentCompleted() {
        // Mark treatment plan as completed
        if (this.treatmentPlan) {
            this.treatmentPlan.status = 'completed';
            this.treatmentPlan.completedAt = new Date().toISOString();
            await window.api.saveTreatmentPlan(this.patientData.id, this.treatmentPlan);
        }
    }

    async extendCurrentBlock() {
        // Extend current block by 3-5 sessions
        const currentBlock = this.getCurrentBlock();
        if (currentBlock) {
            currentBlock.endSession += 3;
            currentBlock.extended = true;
            currentBlock.extendedAt = new Date().toISOString();
            await window.api.saveTreatmentPlan(this.patientData.id, this.treatmentPlan);
        }
    }

    closeModal() {
        document.getElementById('checkpointDecisionModal').style.display = 'none';
        document.body.style.overflow = 'auto';
        this.isModalOpen = false;
        
        // Clear data
        this.currentCheckpoint = null;
        this.patientData = null;
        this.sessionHistory = [];
        this.assessmentData = null;
        this.treatmentPlan = null;
        this.recommendations = [];
    }
}

// Make it globally available
window.CheckpointDecision = CheckpointDecision;