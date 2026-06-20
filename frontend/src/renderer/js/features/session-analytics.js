/**
 * Session Analytics Module
 * Handles detailed session performance tracking, round-by-round analytics, success rates, 
 * points system, and artifact detection/logging
 */

class SessionAnalytics {
    constructor() {
        this.currentSession = null;
        this.currentRound = 0;
        this.roundData = [];
        this.artifactLog = [];
        this.performanceMetrics = {
            totalPoints: 0,
            averageSuccessRate: 0,
            totalRewardTime: 0,
            totalArtifactTime: 0,
            roundMetrics: []
        };
        this.thresholds = {
            reward: { min: 15, max: 18 }, // Hz
            inhibit: { min: 8, max: 12 }, // Hz
            rewardLevel: 60, // % above baseline
            inhibitLevel: 50  // % below baseline
        };
        this.artifactThresholds = {
            muscle: 100, // µV
            blink: 150,  // µV
            movement: 80 // µV
        };
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.createAnalyticsView();
    }

    // ====================================
    // SESSION MANAGEMENT
    // ====================================

    startSession(sessionConfig) {
        this.currentSession = {
            id: sessionConfig.id,
            patientId: sessionConfig.patientId,
            protocol: sessionConfig.protocol,
            location: sessionConfig.location,
            startTime: new Date(),
            rounds: sessionConfig.rounds || 10,
        };

        this.currentRound = 0;
        this.roundData = [];
        this.artifactLog = [];
        this.performanceMetrics = {
            totalPoints: 0,
            averageSuccessRate: 0,
            totalRewardTime: 0,
            totalArtifactTime: 0,
            roundMetrics: []
        };

        this.updateSessionDisplay();
        console.log('Session analytics started for session:', this.currentSession.id);
    }

    startRound() {
        if (!this.currentSession) return;

        this.currentRound++;
        const roundStart = {
            roundNumber: this.currentRound,
            startTime: new Date(),
            endTime: null,
            duration: 0,
            successRate: 0,
            points: 0,
            rewardTime: 0,
            artifactTime: 0,
            artifacts: [],
            thresholdCrossings: {
                reward: 0,
                inhibit: 0
            },
            performanceData: []
        };

        this.roundData.push(roundStart);
        this.updateRoundDisplay();
        
        console.log(`Round ${this.currentRound} started`);
    }

    endRound() {
        if (!this.currentSession || this.roundData.length === 0) return;

        const currentRoundData = this.roundData[this.roundData.length - 1];
        currentRoundData.endTime = new Date();
        currentRoundData.duration = (currentRoundData.endTime - currentRoundData.startTime) / 1000;

        // Calculate round metrics
        this.calculateRoundMetrics(currentRoundData);
        this.updatePerformanceMetrics();
        this.updateRoundDisplay();

        console.log(`Round ${this.currentRound} completed:`, currentRoundData);
    }

    endSession() {
        if (!this.currentSession) return;

        this.currentSession.endTime = new Date();
        this.currentSession.totalDuration = (this.currentSession.endTime - this.currentSession.startTime) / 1000;

        // Final calculations
        this.calculateSessionMetrics();
        this.generateSessionReport();
        
        console.log('Session completed:', this.currentSession);
    }

    // ====================================
    // REAL-TIME ANALYTICS
    // ====================================

    processEEGData(eegData) {
        if (!this.currentSession || this.roundData.length === 0) return;

        const currentRoundData = this.roundData[this.roundData.length - 1];
        const timestamp = new Date();

        // Check for artifacts
        const artifacts = this.detectArtifacts(eegData, timestamp);
        if (artifacts.length > 0) {
            currentRoundData.artifacts.push(...artifacts);
            this.logArtifacts(artifacts);
        }

        // Calculate band powers
        const bandPowers = this.calculateBandPowers(eegData);
        
        // Check threshold crossings
        const rewardMet = this.checkRewardThreshold(bandPowers);
        const inhibitMet = this.checkInhibitThreshold(bandPowers);

        if (rewardMet && !inhibitMet) {
            currentRoundData.thresholdCrossings.reward++;
            currentRoundData.rewardTime += 0.1; // Assuming 100ms intervals
            currentRoundData.points += 1;
        }

        if (inhibitMet) {
            currentRoundData.thresholdCrossings.inhibit++;
        }

        // Store performance data point
        currentRoundData.performanceData.push({
            timestamp,
            bandPowers,
            rewardMet,
            inhibitMet,
            artifacts: artifacts.length > 0
        });

        // Update real-time display
        this.updateRealtimeDisplay(bandPowers, rewardMet, inhibitMet);
    }

    detectArtifacts(eegData, timestamp) {
        const artifacts = [];
        
        // Muscle artifact detection (high frequency content)
        const musclePower = this.calculateHighFrequencyPower(eegData);
        if (musclePower > this.artifactThresholds.muscle) {
            artifacts.push({
                type: 'muscle',
                timestamp,
                severity: musclePower,
                duration: 0.1
            });
        }

        // Blink artifact detection (large amplitude changes)
        const blinkAmplitude = this.detectBlinkAmplitude(eegData);
        if (blinkAmplitude > this.artifactThresholds.blink) {
            artifacts.push({
                type: 'blink',
                timestamp,
                severity: blinkAmplitude,
                duration: 0.1
            });
        }

        // Movement artifact detection (broadband increase)
        const movementPower = this.calculateMovementArtifact(eegData);
        if (movementPower > this.artifactThresholds.movement) {
            artifacts.push({
                type: 'movement',
                timestamp,
                severity: movementPower,
                duration: 0.1
            });
        }

        return artifacts;
    }

    calculateBandPowers(eegData) {
        // Simplified band power calculation
        // In real implementation, use FFT
        const sampleRate = 250;
        const windowSize = sampleRate; // 1 second window
        
        if (eegData.length < windowSize) {
            return { theta: 0, alpha: 0, beta: 0, gamma: 0 };
        }

        // Simulate band power calculation
        const theta = this.calculatePowerInBand(eegData, 4, 8, sampleRate);
        const alpha = this.calculatePowerInBand(eegData, 8, 12, sampleRate);
        const beta = this.calculatePowerInBand(eegData, 12, 30, sampleRate);
        const gamma = this.calculatePowerInBand(eegData, 30, 100, sampleRate);

        return { theta, alpha, beta, gamma };
    }

    calculatePowerInBand(data, lowFreq, highFreq, sampleRate) {
        // Simplified power calculation
        // Real implementation would use FFT
        const power = data.reduce((sum, sample) => sum + Math.pow(sample, 2), 0) / data.length;
        return power * Math.random() * (highFreq - lowFreq); // Simulate band-specific power
    }

    checkRewardThreshold(bandPowers) {
        const { protocol } = this.currentSession;
        
        switch (protocol.type) {
            case 'TBR':
                const tbr = bandPowers.theta / bandPowers.beta;
                return tbr < protocol.targetTBR;
            case 'Alpha':
                return bandPowers.alpha > protocol.targetAlpha;
            case 'Beta':
                return bandPowers.beta > protocol.targetBeta;
            default:
                return bandPowers.beta > 10; // Default threshold
        }
    }

    checkInhibitThreshold(bandPowers) {
        const { protocol } = this.currentSession;
        
        switch (protocol.type) {
            case 'TBR':
                return bandPowers.theta > protocol.inhibitTheta;
            case 'Alpha':
                return bandPowers.theta > protocol.inhibitTheta;
            case 'Beta':
                return bandPowers.alpha > protocol.inhibitAlpha;
            default:
                return bandPowers.alpha > 15; // Default threshold
        }
    }

    // ====================================
    // CALCULATIONS
    // ====================================

    calculateRoundMetrics(roundData) {
        const totalDataPoints = roundData.performanceData.length;
        if (totalDataPoints === 0) return;

        const rewardHits = roundData.performanceData.filter(d => d.rewardMet && !d.inhibitMet).length;
        const artifactPoints = roundData.performanceData.filter(d => d.artifacts).length;

        roundData.successRate = (rewardHits / totalDataPoints) * 100;
        roundData.artifactTime = (artifactPoints / totalDataPoints) * roundData.duration;
        roundData.points = Math.floor(roundData.successRate * 10); // Points based on success rate

        this.performanceMetrics.roundMetrics.push({
            round: roundData.roundNumber,
            successRate: roundData.successRate,
            points: roundData.points,
            duration: roundData.duration,
            artifacts: roundData.artifacts.length
        });
    }

    updatePerformanceMetrics() {
        if (this.roundData.length === 0) return;

        this.performanceMetrics.totalPoints = this.roundData.reduce((sum, round) => sum + round.points, 0);
        this.performanceMetrics.averageSuccessRate = this.roundData.reduce((sum, round) => sum + round.successRate, 0) / this.roundData.length;
        this.performanceMetrics.totalRewardTime = this.roundData.reduce((sum, round) => sum + round.rewardTime, 0);
        this.performanceMetrics.totalArtifactTime = this.roundData.reduce((sum, round) => sum + round.artifactTime, 0);
    }

    calculateSessionMetrics() {
        this.updatePerformanceMetrics();
        
        this.currentSession.metrics = {
            totalRounds: this.currentRound,
            completedRounds: this.roundData.filter(r => r.endTime).length,
            averageSuccessRate: this.performanceMetrics.averageSuccessRate,
            totalPoints: this.performanceMetrics.totalPoints,
            totalRewardTime: this.performanceMetrics.totalRewardTime,
            totalArtifactTime: this.performanceMetrics.totalArtifactTime,
            improvementTrend: this.calculateImprovementTrend(),
            artifactSummary: this.summarizeArtifacts()
        };
    }

    calculateImprovementTrend() {
        if (this.roundData.length < 3) return 'insufficient_data';

        const firstHalf = this.roundData.slice(0, Math.floor(this.roundData.length / 2));
        const secondHalf = this.roundData.slice(Math.floor(this.roundData.length / 2));

        const firstHalfAvg = firstHalf.reduce((sum, r) => sum + r.successRate, 0) / firstHalf.length;
        const secondHalfAvg = secondHalf.reduce((sum, r) => sum + r.successRate, 0) / secondHalf.length;

        const improvement = secondHalfAvg - firstHalfAvg;

        if (improvement > 5) return 'strong_improvement';
        if (improvement > 2) return 'moderate_improvement';
        if (improvement > -2) return 'stable';
        if (improvement > -5) return 'mild_decline';
        return 'significant_decline';
    }

    summarizeArtifacts() {
        const artifactCounts = {
            muscle: 0,
            blink: 0,
            movement: 0,
            total: 0
        };

        this.roundData.forEach(round => {
            round.artifacts.forEach(artifact => {
                artifactCounts[artifact.type]++;
                artifactCounts.total++;
            });
        });

        return artifactCounts;
    }

    // ====================================
    // ARTIFACT DETECTION HELPERS
    // ====================================

    calculateHighFrequencyPower(data) {
        // Simplified high frequency power calculation
        let highFreqPower = 0;
        for (let i = 1; i < data.length; i++) {
            highFreqPower += Math.abs(data[i] - data[i-1]);
        }
        return highFreqPower / data.length;
    }

    detectBlinkAmplitude(data) {
        const max = Math.max(...data);
        const min = Math.min(...data);
        return max - min;
    }

    calculateMovementArtifact(data) {
        // Calculate variance as a proxy for movement artifact
        const mean = data.reduce((sum, val) => sum + val, 0) / data.length;
        const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;
        return Math.sqrt(variance);
    }

    logArtifacts(artifacts) {
        artifacts.forEach(artifact => {
            this.artifactLog.push({
                ...artifact,
                sessionId: this.currentSession?.id,
                round: this.currentRound
            });
        });
    }

    // ====================================
    // UI MANAGEMENT
    // ====================================

    createAnalyticsView() {
        // Analytics view is embedded in session management
        // This creates the analytics-specific components
        this.createAnalyticsPanel();
    }

    createAnalyticsPanel() {
        const existingPanel = document.getElementById('sessionAnalyticsPanel');
        if (existingPanel) return;

        const panel = document.createElement('div');
        panel.id = 'sessionAnalyticsPanel';
        panel.className = 'analytics-panel';
        panel.innerHTML = `
            <div class="analytics-header">
                <h4>Session Analytics</h4>
                <div class="analytics-controls">
                    <button id="pauseAnalytics" class="btn btn-small">Pause</button>
                    <button id="exportRoundData" class="btn btn-small">Export</button>
                </div>
            </div>
            
            <div class="analytics-content">
                <div class="realtime-metrics">
                    <div class="metric-card">
                        <div class="metric-label">Current Round</div>
                        <div class="metric-value" id="currentRoundNumber">-</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">Success Rate</div>
                        <div class="metric-value" id="currentSuccessRate">0%</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">Points</div>
                        <div class="metric-value" id="currentPoints">0</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">Artifacts</div>
                        <div class="metric-value" id="currentArtifacts">0</div>
                    </div>
                </div>

                <div class="round-progress">
                    <div class="progress-header">
                        <span>Round Progress</span>
                        <span id="roundTimer">0:00</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" id="roundProgressFill"></div>
                    </div>
                </div>

                <div class="performance-chart">
                    <canvas id="performanceChart" width="400" height="200"></canvas>
                </div>

                <div class="round-history">
                    <h5>Round History</h5>
                    <div class="round-history-table">
                        <table id="roundHistoryTable">
                            <thead>
                                <tr>
                                    <th>Round</th>
                                    <th>Success %</th>
                                    <th>Points</th>
                                    <th>Artifacts</th>
                                    <th>Duration</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr class="empty-state">
                                    <td colspan="5">No rounds completed</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        // Insert into session view
        const sessionView = document.getElementById('live-session-view');
        if (sessionView) {
            sessionView.appendChild(panel);
        }
    }

    updateSessionDisplay() {
        // Update session-level display elements
    }

    updateRoundDisplay() {
        const roundNumberEl = document.getElementById('currentRoundNumber');
        const roundHistoryTable = document.getElementById('roundHistoryTable')?.querySelector('tbody');
        
        if (roundNumberEl) {
            roundNumberEl.textContent = this.currentRound;
        }

        if (roundHistoryTable && this.roundData.length > 0) {
            this.updateRoundHistoryTable();
        }
    }

    updateRoundHistoryTable() {
        const tbody = document.getElementById('roundHistoryTable')?.querySelector('tbody');
        if (!tbody) return;

        tbody.innerHTML = '';

        this.roundData.forEach(round => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${round.roundNumber}</td>
                <td>${round.successRate.toFixed(1)}%</td>
                <td>${round.points}</td>
                <td>${round.artifacts.length}</td>
                <td>${round.duration ? round.duration.toFixed(1) + 's' : 'In progress'}</td>
            `;
            tbody.appendChild(row);
        });
    }

    updateRealtimeDisplay(bandPowers, rewardMet, inhibitMet) {
        const successRateEl = document.getElementById('currentSuccessRate');
        const pointsEl = document.getElementById('currentPoints');
        const artifactsEl = document.getElementById('currentArtifacts');

        if (this.roundData.length > 0) {
            const currentRound = this.roundData[this.roundData.length - 1];
            
            if (successRateEl) {
                const totalPoints = currentRound.performanceData.length;
                const rewardHits = currentRound.performanceData.filter(d => d.rewardMet && !d.inhibitMet).length;
                const rate = totalPoints > 0 ? (rewardHits / totalPoints) * 100 : 0;
                successRateEl.textContent = rate.toFixed(1) + '%';
            }

            if (pointsEl) {
                pointsEl.textContent = currentRound.points;
            }

            if (artifactsEl) {
                artifactsEl.textContent = currentRound.artifacts.length;
            }
        }
    }

    setupEventListeners() {
        document.addEventListener('click', (e) => {
            if (e.target.id === 'pauseAnalytics') {
                this.toggleAnalytics();
            }
            if (e.target.id === 'exportRoundData') {
                this.exportRoundData();
            }
        });
    }

    toggleAnalytics() {
        // Implementation for pausing/resuming analytics
        console.log('Analytics toggled');
    }

    exportRoundData() {
        if (!this.currentSession || this.roundData.length === 0) {
            alert('No session data to export');
            return;
        }

        const data = {
            session: this.currentSession,
            rounds: this.roundData,
            metrics: this.performanceMetrics,
            artifacts: this.artifactLog
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `session-${this.currentSession.id}-analytics.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    generateSessionReport() {
        return {
            sessionId: this.currentSession.id,
            patientId: this.currentSession.patientId,
            protocol: this.currentSession.protocol,
            startTime: this.currentSession.startTime,
            endTime: this.currentSession.endTime,
            totalDuration: this.currentSession.totalDuration,
            rounds: this.roundData,
            metrics: this.performanceMetrics,
            improvementTrend: this.calculateImprovementTrend(),
            artifactSummary: this.summarizeArtifacts(),
            recommendations: this.generateRecommendations()
        };
    }

    generateRecommendations() {
        const avgSuccessRate = this.performanceMetrics.averageSuccessRate;
        const artifactRate = (this.performanceMetrics.totalArtifactTime / this.currentSession.totalDuration) * 100;
        
        const recommendations = [];

        if (avgSuccessRate < 50) {
            recommendations.push('Consider adjusting reward thresholds - success rate is below optimal range');
        }

        if (artifactRate > 20) {
            recommendations.push('High artifact rate detected - check electrode placement and patient comfort');
        }

        if (this.calculateImprovementTrend() === 'significant_decline') {
            recommendations.push('Performance declining - consider session break or protocol adjustment');
        }

        return recommendations;
    }
}

// Make it globally available
window.SessionAnalytics = SessionAnalytics;