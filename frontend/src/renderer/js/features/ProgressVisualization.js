/**
 * Progress Visualization Module
 * Creates trend diagrams, session comparison charts, and visual progress tracking
 * for supporting checkpoint decisions and treatment monitoring
 */

class ProgressVisualization {
    constructor() {
        this.charts = {};
        this.progressData = {
            sessions: [],
            assessments: [],
            checkpoints: [],
            treatmentBlocks: []
        };
        this.chartConfigs = {
            successRateTrend: null,
            assessmentComparison: null,
            blockProgress: null,
            checkpointAnalysis: null
        };
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.initializeChartLibrary();
    }

    // ====================================
    // CHART INITIALIZATION
    // ====================================

    initializeChartLibrary() {
        // Ensure Chart.js is available
        if (typeof Chart === 'undefined') {
            console.warn('Chart.js not loaded. Progress visualization charts will not be available.');
            return;
        }

        // Configure Chart.js defaults
        Chart.defaults.font.family = "'Inter', sans-serif";
        Chart.defaults.font.size = 12;
        Chart.defaults.color = '#6b7280';
        Chart.defaults.elements.point.radius = 4;
        Chart.defaults.elements.point.hoverRadius = 6;
    }

    // ====================================
    // DATA MANAGEMENT
    // ====================================

    async loadPatientProgressData(patientId) {
        try {
            // Load all relevant data for progress visualization
            const [sessions, assessments, treatmentPlan] = await Promise.all([
                window.api.getSessionsByPatient(patientId),
                window.api.getAssessmentByPatient(patientId),
                window.api.getTreatmentPlanByPatient(patientId)
            ]);

            this.progressData = {
                sessions: sessions.sort((a, b) => new Date(a.start_time) - new Date(b.start_time)),
                assessments: assessments,
                checkpoints: this.extractCheckpointsFromSessions(sessions, treatmentPlan),
                treatmentBlocks: treatmentPlan?.blocks || []
            };

            this.processProgressData();
            return this.progressData;
        } catch (error) {
            console.error('Error loading patient progress data:', error);
            throw error;
        }
    }

    extractCheckpointsFromSessions(sessions, treatmentPlan) {
        if (!treatmentPlan || !treatmentPlan.checkpoints) return [];

        return treatmentPlan.checkpoints.map(checkpoint => {
            const session = sessions.find(s => s.session_number === checkpoint.session);
            return {
                ...checkpoint,
                sessionData: session,
                completed: !!session
            };
        });
    }

    processProgressData() {
        this.calculateSessionTrends();
        this.calculateAssessmentProgress();
        this.calculateBlockProgress();
        this.calculateCheckpointReadiness();
    }

    calculateSessionTrends() {
        this.progressData.trends = {
            successRates: [],
            sessionDurations: [],
            artifactRates: [],
            improvementSlope: 0,
            overallTrend: 'stable'
        };

        if (this.progressData.sessions.length < 2) return;

        this.progressData.sessions.forEach((session, index) => {
            this.progressData.trends.successRates.push({
                session: index + 1,
                date: new Date(session.start_time),
                value: session.overall_success_rate || 0,
                points: session.total_points || 0,
                protocol: session.protocol_type
            });

            this.progressData.trends.sessionDurations.push({
                session: index + 1,
                date: new Date(session.start_time),
                value: session.duration_seconds || 0
            });

            this.progressData.trends.artifactRates.push({
                session: index + 1,
                date: new Date(session.start_time),
                value: this.calculateArtifactRate(session)
            });
        });

        this.calculateImprovementSlope();
        this.determineOverallTrend();
    }

    calculateArtifactRate(session) {
        const totalTime = session.duration_seconds || 0;
        const artifactTime = session.total_artifact_time_seconds || 0;
        return totalTime > 0 ? (artifactTime / totalTime) * 100 : 0;
    }

    calculateImprovementSlope() {
        const successRates = this.progressData.trends.successRates;
        if (successRates.length < 2) return;

        // Simple linear regression for improvement slope
        const n = successRates.length;
        const sumX = successRates.reduce((sum, point, i) => sum + (i + 1), 0);
        const sumY = successRates.reduce((sum, point) => sum + point.value, 0);
        const sumXY = successRates.reduce((sum, point, i) => sum + ((i + 1) * point.value), 0);
        const sumX2 = successRates.reduce((sum, point, i) => sum + Math.pow(i + 1, 2), 0);

        this.progressData.trends.improvementSlope = (n * sumXY - sumX * sumY) / (n * sumX2 - Math.pow(sumX, 2));
    }

    determineOverallTrend() {
        const slope = this.progressData.trends.improvementSlope;
        
        if (slope > 2) {
            this.progressData.trends.overallTrend = 'strong_improvement';
        } else if (slope > 0.5) {
            this.progressData.trends.overallTrend = 'moderate_improvement';
        } else if (slope > -0.5) {
            this.progressData.trends.overallTrend = 'stable';
        } else if (slope > -2) {
            this.progressData.trends.overallTrend = 'mild_decline';
        } else {
            this.progressData.trends.overallTrend = 'significant_decline';
        }
    }

    calculateAssessmentProgress() {
        if (this.progressData.assessments.length < 2) return;

        const initial = this.progressData.assessments[0];
        const latest = this.progressData.assessments[this.progressData.assessments.length - 1];

        this.progressData.assessmentProgress = {
            initial: this.extractAssessmentScores(initial),
            latest: this.extractAssessmentScores(latest),
            improvements: {},
            significantChanges: []
        };

        // Calculate improvements
        const initialScores = this.progressData.assessmentProgress.initial;
        const latestScores = this.progressData.assessmentProgress.latest;

        Object.keys(initialScores).forEach(test => {
            if (latestScores[test] !== undefined) {
                const change = initialScores[test] - latestScores[test]; // Lower scores are better
                this.progressData.assessmentProgress.improvements[test] = {
                    initial: initialScores[test],
                    latest: latestScores[test],
                    change: change,
                    percentChange: initialScores[test] > 0 ? (change / initialScores[test]) * 100 : 0,
                    significant: Math.abs(change) >= this.getSignificantChangeThreshold(test)
                };

                if (Math.abs(change) >= this.getSignificantChangeThreshold(test)) {
                    this.progressData.assessmentProgress.significantChanges.push({
                        test,
                        change,
                        type: change > 0 ? 'improvement' : 'decline'
                    });
                }
            }
        });
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
            'gad7': 3,      // GAD-7: 3 points is clinically significant
            'phq9': 3,      // PHQ-9: 3 points is clinically significant
            'rumination': 5, // Rumination scale: 5 points
            'trauma': 10,   // Trauma assessment: 10 points
            'inattention': 4 // Inattention scale: 4 points
        };

        return thresholds[test] || 3; // Default threshold
    }

    calculateBlockProgress() {
        if (this.progressData.treatmentBlocks.length === 0) return;

        this.progressData.blockProgress = this.progressData.treatmentBlocks.map(block => {
            const blockSessions = this.progressData.sessions.filter(session => {
                const sessionNum = this.getSessionNumber(session);
                return sessionNum >= block.startSession && sessionNum <= block.endSession;
            });

            const avgSuccessRate = blockSessions.length > 0
                ? blockSessions.reduce((sum, s) => sum + (s.overall_success_rate || 0), 0) / blockSessions.length
                : 0;

            const completion = blockSessions.length / (block.endSession - block.startSession + 1);

            return {
                ...block,
                sessionsCompleted: blockSessions.length,
                avgSuccessRate: avgSuccessRate,
                completion: completion * 100,
                trend: this.calculateBlockTrend(blockSessions),
                readyForNext: completion >= 0.8 && avgSuccessRate >= 60 // 80% completion and 60% success
            };
        });
    }

    getSessionNumber(session) {
        // Extract session number from session data or calculate based on chronological order
        return session.session_number || this.progressData.sessions.indexOf(session) + 1;
    }

    calculateBlockTrend(sessions) {
        if (sessions.length < 3) return 'insufficient_data';

        const firstThird = sessions.slice(0, Math.ceil(sessions.length / 3));
        const lastThird = sessions.slice(-Math.ceil(sessions.length / 3));

        const firstAvg = firstThird.reduce((sum, s) => sum + (s.overall_success_rate || 0), 0) / firstThird.length;
        const lastAvg = lastThird.reduce((sum, s) => sum + (s.overall_success_rate || 0), 0) / lastThird.length;

        const improvement = lastAvg - firstAvg;

        if (improvement > 5) return 'improving';
        if (improvement > -5) return 'stable';
        return 'declining';
    }

    calculateCheckpointReadiness() {
        this.progressData.checkpointReadiness = this.progressData.checkpoints.map(checkpoint => {
            const readiness = this.assessCheckpointReadiness(checkpoint);
            return {
                ...checkpoint,
                ...readiness
            };
        });
    }

    assessCheckpointReadiness(checkpoint) {
        const targetSession = checkpoint.session;
        const completedSessions = this.progressData.sessions.filter(s => 
            this.getSessionNumber(s) <= targetSession
        ).length;

        const isReady = completedSessions >= targetSession;
        const recommendations = [];

        if (isReady) {
            // Analyze recent performance for recommendations
            const recentSessions = this.progressData.sessions
                .filter(s => this.getSessionNumber(s) >= targetSession - 2)
                .slice(-3);

            if (recentSessions.length > 0) {
                const avgSuccess = recentSessions.reduce((sum, s) => sum + (s.overall_success_rate || 0), 0) / recentSessions.length;
                
                if (avgSuccess < 50) {
                    recommendations.push('Consider protocol adjustment - low success rate in recent sessions');
                } else if (avgSuccess > 75) {
                    recommendations.push('Excellent progress - consider advancing to next phase');
                }
            }
        }

        return {
            ready: isReady,
            completedSessions,
            targetSession,
            recommendations
        };
    }

    // ====================================
    // CHART CREATION
    // ====================================

    createProgressView(containerId = 'mainContent') {
        const container = document.getElementById(containerId);
        if (!container) return;

        let progressView = document.getElementById('progress-view');
        if (progressView) {
            container.removeChild(progressView);
        }

        progressView = document.createElement('div');
        progressView.className = 'view';
        progressView.id = 'progress-view';

        progressView.innerHTML = `
            <div class="view-header">
                <h2>Progress Tracking & Analysis</h2>
                <div class="view-actions">
                    <button class="btn btn-secondary" id="exportProgressBtn">Export Report</button>
                    <button class="btn btn-primary" id="refreshProgressBtn">Refresh Data</button>
                </div>
            </div>

            <!-- Patient Selection -->
            <div class="progress-section">
                <div class="section-header">
                    <h3>Patient Selection</h3>
                </div>
                <div class="form-group">
                    <select id="progressPatientSelect" class="form-control">
                        <option value="">Select a patient...</option>
                    </select>
                </div>
            </div>

            <!-- Progress Summary -->
            <div class="progress-section" id="progressSummarySection" style="display: none;">
                <div class="section-header">
                    <h3>Progress Summary</h3>
                </div>
                <div class="progress-summary-grid">
                    <div class="summary-card">
                        <div class="summary-icon" data-lucide="trending-up"></div>
                        <div class="summary-content">
                            <div class="summary-label">Overall Trend</div>
                            <div class="summary-value" id="overallTrend">-</div>
                        </div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-icon" data-lucide="target"></div>
                        <div class="summary-content">
                            <div class="summary-label">Current Success Rate</div>
                            <div class="summary-value" id="currentSuccessRate">-</div>
                        </div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-icon" data-lucide="calendar-check"></div>
                        <div class="summary-content">
                            <div class="summary-label">Sessions Completed</div>
                            <div class="summary-value" id="sessionsCompleted">-</div>
                        </div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-icon" data-lucide="flag"></div>
                        <div class="summary-content">
                            <div class="summary-label">Next Checkpoint</div>
                            <div class="summary-value" id="nextCheckpoint">-</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Session Trend Chart -->
            <div class="progress-section" id="trendChartSection" style="display: none;">
                <div class="section-header">
                    <h3>Session Progress Trend</h3>
                    <div class="chart-controls">
                        <select id="trendMetricSelect" class="form-control">
                            <option value="successRate">Success Rate</option>
                            <option value="points">Points Earned</option>
                            <option value="artifactRate">Artifact Rate</option>
                        </select>
                    </div>
                </div>
                <div class="chart-container">
                    <canvas id="sessionTrendChart" width="800" height="400"></canvas>
                </div>
            </div>

            <!-- Assessment Comparison -->
            <div class="progress-section" id="assessmentSection" style="display: none;">
                <div class="section-header">
                    <h3>Assessment Progress</h3>
                </div>
                <div class="assessment-comparison">
                    <div class="comparison-chart">
                        <canvas id="assessmentComparisonChart" width="600" height="400"></canvas>
                    </div>
                    <div class="assessment-details">
                        <h4>Significant Changes</h4>
                        <div id="significantChanges" class="changes-list">
                            <p class="empty-state">No assessment data available</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Block Progress -->
            <div class="progress-section" id="blockProgressSection" style="display: none;">
                <div class="section-header">
                    <h3>Treatment Block Progress</h3>
                </div>
                <div class="block-progress-container">
                    <canvas id="blockProgressChart" width="800" height="300"></canvas>
                </div>
                <div class="block-details">
                    <table class="data-table" id="blockProgressTable">
                        <thead>
                            <tr>
                                <th>Block</th>
                                <th>Protocol</th>
                                <th>Completion</th>
                                <th>Avg Success</th>
                                <th>Trend</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr class="empty-state">
                                <td colspan="6">No treatment blocks defined</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Checkpoint Analysis -->
            <div class="progress-section" id="checkpointSection" style="display: none;">
                <div class="section-header">
                    <h3>Checkpoint Analysis</h3>
                </div>
                <div class="checkpoint-grid" id="checkpointGrid">
                    <div class="empty-state">No checkpoints defined</div>
                </div>
            </div>
        `;

        container.appendChild(progressView);
        this.bindProgressEvents();

        // Initialize Lucide icons
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            setTimeout(() => lucide.createIcons(), 100);
        }
    }

    async createSessionTrendChart() {
        const canvas = document.getElementById('sessionTrendChart');
        if (!canvas || !this.progressData.trends) return;

        const ctx = canvas.getContext('2d');
        
        // Destroy existing chart if it exists
        if (this.charts.sessionTrend) {
            this.charts.sessionTrend.destroy();
        }

        const metric = document.getElementById('trendMetricSelect')?.value || 'successRate';
        let data, label, color;

        switch (metric) {
            case 'successRate':
                data = this.progressData.trends.successRates;
                label = 'Success Rate (%)';
                color = '#10b981';
                break;
            case 'points':
                data = this.progressData.trends.successRates.map(point => ({
                    ...point,
                    value: point.points
                }));
                label = 'Points Earned';
                color = '#3b82f6';
                break;
            case 'artifactRate':
                data = this.progressData.trends.artifactRates;
                label = 'Artifact Rate (%)';
                color = '#ef4444';
                break;
        }

        this.charts.sessionTrend = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(point => `Session ${point.session}`),
                datasets: [{
                    label: label,
                    data: data.map(point => point.value),
                    borderColor: color,
                    backgroundColor: color + '20',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    title: {
                        display: true,
                        text: `${label} Trend Over Sessions`
                    },
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: label
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Session Number'
                        }
                    }
                }
            }
        });
    }

    async createAssessmentComparisonChart() {
        const canvas = document.getElementById('assessmentComparisonChart');
        if (!canvas || !this.progressData.assessmentProgress) return;

        const ctx = canvas.getContext('2d');
        
        if (this.charts.assessmentComparison) {
            this.charts.assessmentComparison.destroy();
        }

        const improvements = this.progressData.assessmentProgress.improvements;
        const tests = Object.keys(improvements);

        if (tests.length === 0) return;

        this.charts.assessmentComparison = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: tests.map(test => test.toUpperCase().replace('_', '-')),
                datasets: [
                    {
                        label: 'Initial',
                        data: tests.map(test => improvements[test].initial),
                        backgroundColor: '#ef4444',
                    },
                    {
                        label: 'Latest',
                        data: tests.map(test => improvements[test].latest),
                        backgroundColor: '#10b981',
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Assessment Score Comparison (Lower is Better)'
                    },
                    legend: {
                        display: true,
                        position: 'top'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Score'
                        }
                    }
                }
            }
        });
    }

    async createBlockProgressChart() {
        const canvas = document.getElementById('blockProgressChart');
        if (!canvas || !this.progressData.blockProgress) return;

        const ctx = canvas.getContext('2d');
        
        if (this.charts.blockProgress) {
            this.charts.blockProgress.destroy();
        }

        const blocks = this.progressData.blockProgress;

        this.charts.blockProgress = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: blocks.map(block => `${block.name}`),
                datasets: [
                    {
                        label: 'Completion %',
                        data: blocks.map(block => block.completion),
                        backgroundColor: '#3b82f6',
                        yAxisID: 'y'
                    },
                    {
                        label: 'Avg Success Rate %',
                        data: blocks.map(block => block.avgSuccessRate),
                        backgroundColor: '#10b981',
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Treatment Block Progress'
                    }
                },
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        max: 100,
                        title: {
                            display: true,
                            text: 'Completion %'
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        max: 100,
                        title: {
                            display: true,
                            text: 'Success Rate %'
                        },
                        grid: {
                            drawOnChartArea: false,
                        },
                    }
                }
            }
        });
    }

    // ====================================
    // UI UPDATES
    // ====================================

    updateProgressSummary() {
        document.getElementById('overallTrend').textContent = 
            this.formatTrendText(this.progressData.trends?.overallTrend || 'unknown');
        
        const latestSession = this.progressData.sessions[this.progressData.sessions.length - 1];
        document.getElementById('currentSuccessRate').textContent = 
            latestSession ? `${(latestSession.overall_success_rate || 0).toFixed(1)}%` : 'N/A';
        
        document.getElementById('sessionsCompleted').textContent = 
            this.progressData.sessions.length.toString();

        const nextCheckpoint = this.progressData.checkpointReadiness?.find(cp => !cp.completed);
        document.getElementById('nextCheckpoint').textContent = 
            nextCheckpoint ? `Session ${nextCheckpoint.session}` : 'None scheduled';
    }

    updateSignificantChanges() {
        const container = document.getElementById('significantChanges');
        if (!container || !this.progressData.assessmentProgress) return;

        const changes = this.progressData.assessmentProgress.significantChanges;
        
        if (changes.length === 0) {
            container.innerHTML = '<p class="empty-state">No significant changes detected</p>';
            return;
        }

        container.innerHTML = changes.map(change => `
            <div class="change-item ${change.type}">
                <div class="change-test">${change.test.toUpperCase()}</div>
                <div class="change-value">${change.change > 0 ? '+' : ''}${change.change.toFixed(1)} points</div>
                <div class="change-type">${change.type}</div>
            </div>
        `).join('');
    }

    updateBlockProgressTable() {
        const tbody = document.getElementById('blockProgressTable')?.querySelector('tbody');
        if (!tbody || !this.progressData.blockProgress) return;

        if (this.progressData.blockProgress.length === 0) {
            tbody.innerHTML = '<tr class="empty-state"><td colspan="6">No treatment blocks defined</td></tr>';
            return;
        }

        tbody.innerHTML = this.progressData.blockProgress.map(block => `
            <tr>
                <td>${block.name}</td>
                <td>${block.protocol}</td>
                <td>
                    <div class="progress-bar-small">
                        <div class="progress-fill" style="width: ${block.completion}%"></div>
                    </div>
                    ${block.completion.toFixed(1)}%
                </td>
                <td>${block.avgSuccessRate.toFixed(1)}%</td>
                <td>
                    <span class="trend-badge ${block.trend}">${block.trend}</span>
                </td>
                <td>
                    <span class="status-badge ${block.readyForNext ? 'ready' : 'in-progress'}">
                        ${block.readyForNext ? 'Ready for next' : 'In progress'}
                    </span>
                </td>
            </tr>
        `).join('');
    }

    updateCheckpointGrid() {
        const grid = document.getElementById('checkpointGrid');
        if (!grid || !this.progressData.checkpointReadiness) return;

        if (this.progressData.checkpointReadiness.length === 0) {
            grid.innerHTML = '<div class="empty-state">No checkpoints defined</div>';
            return;
        }

        grid.innerHTML = this.progressData.checkpointReadiness.map(checkpoint => `
            <div class="checkpoint-card ${checkpoint.ready ? 'ready' : 'pending'}">
                <div class="checkpoint-header">
                    <h4>Checkpoint ${checkpoint.session}</h4>
                    <span class="checkpoint-status">${checkpoint.ready ? 'Ready' : 'Pending'}</span>
                </div>
                <div class="checkpoint-details">
                    <p><strong>Type:</strong> ${checkpoint.type}</p>
                    <p><strong>Description:</strong> ${checkpoint.description}</p>
                    <p><strong>Progress:</strong> ${checkpoint.completedSessions}/${checkpoint.targetSession} sessions</p>
                </div>
                ${checkpoint.recommendations.length > 0 ? `
                    <div class="checkpoint-recommendations">
                        <h5>Recommendations:</h5>
                        <ul>
                            ${checkpoint.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
                ${checkpoint.ready ? `
                    <div class="checkpoint-actions">
                        <button class="btn btn-primary btn-small" onclick="window.progressVisualization.conductCheckpoint('${checkpoint.id}')">
                            Conduct Checkpoint
                        </button>
                    </div>
                ` : ''}
            </div>
        `).join('');
    }

    formatTrendText(trend) {
        const trendTexts = {
            'strong_improvement': 'Strong Improvement',
            'moderate_improvement': 'Moderate Improvement',
            'stable': 'Stable',
            'mild_decline': 'Mild Decline',
            'significant_decline': 'Significant Decline',
            'unknown': 'Insufficient Data'
        };

        return trendTexts[trend] || trend;
    }

    // ====================================
    // EVENT HANDLING
    // ====================================

    bindProgressEvents() {
        // Patient selection
        const patientSelect = document.getElementById('progressPatientSelect');
        if (patientSelect) {
            patientSelect.addEventListener('change', async (e) => {
                if (e.target.value) {
                    await this.loadPatientProgress(e.target.value);
                }
            });
        }

        // Trend metric selection
        const trendSelect = document.getElementById('trendMetricSelect');
        if (trendSelect) {
            trendSelect.addEventListener('change', () => {
                this.createSessionTrendChart();
            });
        }

        // Export and refresh buttons
        document.getElementById('exportProgressBtn')?.addEventListener('click', () => {
            this.exportProgressReport();
        });

        document.getElementById('refreshProgressBtn')?.addEventListener('click', async () => {
            const patientId = document.getElementById('progressPatientSelect')?.value;
            if (patientId) {
                await this.loadPatientProgress(patientId);
            }
        });
    }

    setupEventListeners() {
        // Global event listeners if needed
    }

    async loadPatientProgress(patientId) {
        try {
            await this.loadPatientProgressData(patientId);
            
            // Show sections and update displays
            document.getElementById('progressSummarySection').style.display = 'block';
            document.getElementById('trendChartSection').style.display = 'block';
            document.getElementById('assessmentSection').style.display = 'block';
            document.getElementById('blockProgressSection').style.display = 'block';
            document.getElementById('checkpointSection').style.display = 'block';

            this.updateProgressSummary();
            this.updateSignificantChanges();
            this.updateBlockProgressTable();
            this.updateCheckpointGrid();

            // Create charts
            await this.createSessionTrendChart();
            await this.createAssessmentComparisonChart();
            await this.createBlockProgressChart();

        } catch (error) {
            console.error('Error loading patient progress:', error);
            alert('Failed to load patient progress data');
        }
    }

    conductCheckpoint(checkpointId) {
        // This would open checkpoint decision interface
        console.log('Conducting checkpoint:', checkpointId);
        // Implementation will be in the checkpoint decision system
    }

    exportProgressReport() {
        if (!this.progressData.sessions.length) {
            alert('No progress data to export');
            return;
        }

        const report = {
            timestamp: new Date().toISOString(),
            patient: this.currentPatientId,
            summary: {
                totalSessions: this.progressData.sessions.length,
                overallTrend: this.progressData.trends?.overallTrend,
                currentSuccessRate: this.progressData.sessions[this.progressData.sessions.length - 1]?.overall_success_rate
            },
            sessions: this.progressData.sessions,
            assessmentProgress: this.progressData.assessmentProgress,
            blockProgress: this.progressData.blockProgress,
            checkpoints: this.progressData.checkpointReadiness
        };

        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `progress-report-${this.currentPatientId}-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    async loadPatientList() {
        try {
            // Check if user is authenticated before loading patients
            const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
            if (!currentUser.id) {
                console.log('User not authenticated, skipping patient list load');
                return;
            }

            const patients = await window.api.getAllPatients();
            const select = document.getElementById('progressPatientSelect');
            if (!select) return;

            select.innerHTML = '<option value="">Select a patient...</option>';

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
}

// Make it globally available
window.ProgressVisualization = ProgressVisualization;
