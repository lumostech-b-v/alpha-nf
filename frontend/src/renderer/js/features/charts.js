/**
 * Charts Module - Handles all data visualization using Chart.js
 * Manages EEG charts, session statistics, and real-time displays
 */
class ChartsManager {
    constructor() {
        this.charts = {};
        this.featureCharts = {};
        this.featureAxisMax = {}; // Stable y-axis max per band, locked after baseline
        this.isBaselinePhase = true; // Set by WebSocketManager; stays true until training starts
        this.defaultColors = {
            primary: '#000000',
            secondary: '#666666',
            accent: '#333333',
            background: '#ffffff',
            grid: '#e0e0e0'
        };
        
        this.initializeChartDefaults();
        console.log('Charts Manager initialized');
    }

    initializeChartDefaults() {
        if (typeof Chart !== 'undefined') {
            Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            Chart.defaults.font.size = 12;
            Chart.defaults.color = this.defaultColors.secondary;
            Chart.defaults.borderColor = this.defaultColors.grid;
            Chart.defaults.backgroundColor = this.defaultColors.background;
        }
    }

    // ========================================
    // REAL-TIME EEG CHARTS
    // ========================================

    initializeEEGChart(canvasId = 'eegChart') {
        const canvas = document.getElementById(canvasId);
        if (!canvas || this.charts[canvasId]) return;

        const ctx = canvas.getContext('2d');
        
        // Generate sample EEG data structure
        const channels = ['Fp1', 'Fp2', 'F3', 'F4', 'C3', 'C4', 'Cz', 'Pz'];
        const datasets = channels.map((channel, index) => ({
            label: channel,
            data: this.generateSampleEEGData(250), // 250 samples for 1 second at 250Hz
            borderColor: this.getChannelColor(index),
            backgroundColor: 'transparent',
            borderWidth: 1,
            tension: 0.1,
            pointRadius: 0,
            pointHoverRadius: 0
        }));

        this.charts[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: Array.from({length: 250}, (_, i) => i * 4), // 4ms intervals
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Time (ms)',
                            color: this.defaultColors.primary
                        },
                        grid: {
                            color: this.defaultColors.grid
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Amplitude (μV)',
                            color: this.defaultColors.primary
                        },
                        min: -100,
                        max: 100,
                        grid: {
                            color: this.defaultColors.grid
                        }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Real-time EEG Signal',
                        color: this.defaultColors.primary
                    },
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: this.defaultColors.primary,
                            usePointStyle: true
                        }
                    }
                },
                elements: {
                    line: {
                        tension: 0
                    }
                }
            }
        });
    }

    initializeBandpowerChart(canvasId = 'bandpowerChart') {
        const canvas = document.getElementById(canvasId);
        if (!canvas || this.charts[canvasId]) return;

        const ctx = canvas.getContext('2d');
        
        const bands = ['Delta', 'Theta', 'Alpha', 'Beta', 'Gamma'];
        const channels = ['C3', 'C4', 'Cz'];
        
        const datasets = channels.map((channel, index) => ({
            label: channel,
            data: this.generateSampleBandpowerData(bands.length),
            backgroundColor: this.getChannelColor(index),
            borderColor: this.getChannelColor(index),
            borderWidth: 1
        }));

        this.charts[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: bands,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 300
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Frequency Bands',
                            color: this.defaultColors.primary
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Power (dB)',
                            color: this.defaultColors.primary
                        },
                        beginAtZero: true
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Frequency Band Power',
                        color: this.defaultColors.primary
                    },
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: this.defaultColors.primary
                        }
                    }
                }
            }
        });
    }

    // ========================================
    // STATISTICS CHARTS
    // ========================================

    initializeSessionStatsChart() {
        const canvas = document.getElementById('sessionStatsChart');
        if (!canvas || this.charts.sessionStats) return;

        const ctx = canvas.getContext('2d');

        this.charts.sessionStats = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Completed', 'Active', 'Cancelled'],
                datasets: [{
                    data: [65, 25, 10],
                    backgroundColor: [
                        this.defaultColors.primary,
                        this.defaultColors.secondary,
                        this.defaultColors.accent
                    ],
                    borderColor: this.defaultColors.background,
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Session Status Distribution',
                        color: this.defaultColors.primary
                    },
                    legend: {
                        display: true,
                        position: 'bottom',
                        labels: {
                            color: this.defaultColors.primary,
                            usePointStyle: true
                        }
                    }
                }
            }
        });
    }

    initializePatientProgressChart() {
        const canvas = document.getElementById('patientProgressChart');
        if (!canvas || this.charts.patientProgress) return;

        const ctx = canvas.getContext('2d');

        this.charts.patientProgress = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5', 'Week 6'],
                datasets: [{
                    label: 'Average Success Rate',
                    data: [45, 52, 58, 65, 72, 78],
                    borderColor: this.defaultColors.primary,
                    backgroundColor: this.hexToRgba(this.defaultColors.primary, 0.1),
                    borderWidth: 2,
                    tension: 0.1,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Time Period',
                            color: this.defaultColors.primary
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Success Rate (%)',
                            color: this.defaultColors.primary
                        },
                        min: 0,
                        max: 100
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Patient Progress Over Time',
                        color: this.defaultColors.primary
                    },
                    legend: {
                        display: true,
                        labels: {
                            color: this.defaultColors.primary
                        }
                    }
                }
            }
        });
    }

    // ========================================
    // DATA UPDATE METHODS
    // ========================================

    updateEEGChart(eegData, chartId = 'eegChart') {
        const chart = this.charts[chartId] || this.charts.eeg;
        if (!chart || !eegData) return;
        
        // Update datasets with new EEG data
        eegData.channels.forEach((channelData, index) => {
            if (chart.data.datasets[index]) {
                chart.data.datasets[index].data = channelData.samples;
            }
        });

        chart.update('none'); // No animation for real-time updates
    }

    updateBandpowerChart(bandpowerData, chartId = 'bandpowerChart') {
        const chart = this.charts[chartId] || this.charts.bandpower;
        if (!chart || !bandpowerData) return;
        
        // Update datasets with new bandpower data
        bandpowerData.channels.forEach((channelData, index) => {
            if (chart.data.datasets[index]) {
                chart.data.datasets[index].data = channelData.bandpowers;
            }
        });

        chart.update('active');
    }

    updateFeedbackValue(feedbackValue, elementId = 'feedbackValue') {
        // Only update main feedback value, not recording panel (handled by SessionRecordingPanel)
        const feedbackElement = document.getElementById(elementId);
        if (feedbackElement) {
            feedbackElement.textContent = feedbackValue.toFixed(2);
            feedbackElement.style.color = this.getFeedbackColor(feedbackValue);
        }
    }

    updateSessionTimer(seconds) {
        // Sync the recording panel's local interval to the authoritative backend value.
        // The local interval keeps ticking between messages so the timer never freezes
        // (e.g. when the backend pauses between rounds waiting for resume).
        const panel = window.uiState?.sessionRecordingPanel;
        if (panel?.syncTimerFromBackend) {
            panel.syncTimerFromBackend(seconds);
        }

        // Also update the legacy #sessionTimer element if present elsewhere.
        const timerElement = document.getElementById('sessionTimer');
        if (timerElement) {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
        }
    }

    updateSessionDetails(sessionInfo) {
        const detailsElement = document.getElementById('sessionDetails');

        if (sessionInfo && detailsElement) {
            detailsElement.innerHTML = `
                <div>Patient: ${sessionInfo.patientName}</div>
                <div>Protocol: ${sessionInfo.protocolType}</div>
                <div>Round: ${sessionInfo.currentRound}/${sessionInfo.totalRounds}</div>
            `;
        }
    }

    // ========================================
    // FEATURE AMPLITUDE CHARTS WITH THRESHOLDS
    // ========================================
    
    initializeFeatureAmplitudeChart(canvasId = 'featureAmplitudeChart') {
        const canvas = document.getElementById(canvasId);
        if (!canvas || this.charts[canvasId]) return;

        const ctx = canvas.getContext('2d');
        
        // Create simple data structure for feature amplitudes
        const featureData = [0.5, 0.5, 0.5]; // default for 3 features
        const backgroundColors = ['rgba(50, 150, 255, 0.6)', 'rgba(50, 200, 50, 0.6)', 'rgba(200, 100, 50, 0.6)'];
        const borderColors = ['rgb(50, 100, 200)', 'rgb(0, 150, 0)', 'rgb(180, 70, 20)'];

        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Alpha', 'Beta', 'Theta'], // Default feature names
                datasets: [
                    {
                        label: 'Amplitude',
                        data: featureData,
                        backgroundColor: backgroundColors,
                        borderColor: borderColors,
                        borderWidth: 1,
                        borderRadius: 2,
                        order: 2
                    },
                    {
                        label: 'Threshold',
                        data: [0, 0, 0],
                        type: 'line',
                        borderColor: 'rgba(50, 50, 50, 0.8)',
                        borderWidth: 2,
                        pointRadius: 0, // Hide points, just show steps
                        borderDash: [5, 5],
                        fill: false,
                        stepped: 'middle', // Show as steps
                        order: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Amplitude (µV)',  // Changed from μV² to µV
                            color: this.defaultColors.primary
                        },
                        grid: {
                            display: true,
                            color: 'rgba(0, 0, 0, 0.05)'
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            maxRotation: 0,
                            minRotation: 0
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false, // Hide legend for simplicity
                    },
                    tooltip: {
                        enabled: true,
                        callbacks: {
                            label: function(context) {
                                return `Amplitude: ${context.parsed.y.toFixed(2)} µV`;
                            }
                        }
                    }
                },
                animation: {
                    duration: 100, // Faster animation
                },
                elements: {
                    bar: {
                        borderSkipped: false
                    }
                },
                layout: {
                    padding: {
                        top: 5,
                        bottom: 10,
                        left: 5,
                        right: 5
                    }
                }
            }
        });

        this.charts[canvasId] = chart;
        this.featureThresholds = {}; // Store threshold values per feature
        this.bandInfo = {}; // Store band info (name, Hz range) per feature
        console.log(`Feature Amplitude Chart initialized: ${canvasId}`);
    }

    updateFeatureAmplitudeChart(features, thresholds, chartId = 'featureAmplitudeChart', bandInfo = null) {
        const chart = this.charts[chartId];
        if (!chart || !features) return;

        // Update chart data with current feature amplitudes
        const featureNames = Object.keys(features);
        const featureValues = Object.values(features);

        // Update chart labels with band info (name + Hz range) if available
        chart.data.labels = featureNames.map(name => {
            if (bandInfo && bandInfo[name]) {
                const info = bandInfo[name];
                // Display as "Band Name\n(Hz range)" - e.g., "SMR\n(12–15 Hz)"
                return `${info.name}\n${info.hz_label}`;
            }
            // Fallback to capitalized name
            return name.charAt(0).toUpperCase() + name.slice(1);
        });
        chart.data.datasets[0].data = featureValues;
        
        // Update threshold dataset
        if (thresholds) {
            const thresholdValues = featureNames.map(name => thresholds[name] !== undefined ? thresholds[name] : null);
            // Ensure we have a second dataset for thresholds
            if (!chart.data.datasets[1]) {
                chart.data.datasets.push({
                    label: 'Threshold',
                    data: thresholdValues,
                    type: 'line',
                    borderColor: 'rgba(50, 50, 50, 0.8)',
                    borderWidth: 2,
                    pointRadius: 0,
                    borderDash: [5, 5],
                    fill: false,
                    stepped: 'middle',
                    order: 1
                });
            } else {
                chart.data.datasets[1].data = thresholdValues;
            }
        }
        
        // Set colors based on feature values and mode - dark theme colors
        chart.data.datasets[0].backgroundColor = featureValues.map((value, index) => {
            const featureName = featureNames[index];
            const mode = bandInfo && bandInfo[featureName] ? bandInfo[featureName].mode : 'enhance';
            
            if (thresholds && thresholds[featureName] !== undefined) {
                const threshold = thresholds[featureName];
                // For enhance: success when value >= threshold
                // For inhibit: success when value <= threshold
                const isSuccess = mode === 'inhibit' 
                    ? value <= threshold 
                    : value >= threshold;
                
                if (isSuccess) {
                    return 'rgba(34, 197, 94, 0.7)'; // Green for success
                } else {
                    return 'rgba(239, 68, 68, 0.7)'; // Red for not meeting threshold
                }
            } else {
                // Default colors if no thresholds - blue tones
                const colors = ['rgba(96, 165, 250, 0.7)', 'rgba(129, 140, 248, 0.7)', 'rgba(167, 139, 250, 0.7)'];
                return colors[index % colors.length];
            }
        });

        chart.data.datasets[0].borderColor = featureValues.map((value, index) => {
            const featureName = featureNames[index];
            const mode = bandInfo && bandInfo[featureName] ? bandInfo[featureName].mode : 'enhance';
            
            if (thresholds && thresholds[featureName] !== undefined) {
                const threshold = thresholds[featureName];
                const isSuccess = mode === 'inhibit' 
                    ? value <= threshold 
                    : value >= threshold;
                    
                if (isSuccess) {
                    return 'rgb(34, 197, 94)';  // Green border
                } else {
                    return 'rgb(239, 68, 68)';  // Red border
                }
            } else {
                const colors = ['rgb(96, 165, 250)', 'rgb(129, 140, 248)', 'rgb(167, 139, 250)'];
                return colors[index % colors.length];
            }
        });

        // Update the chart
        chart.update();
        
        // Store current thresholds and band info for reference
        if (thresholds) {
            this.featureThresholds = { ...thresholds };
        }
        if (bandInfo) {
            this.bandInfo = { ...bandInfo };
        }
    }

    updateSeparatedFeatureCharts(features, thresholds, containerId = 'recordingFeatureChartsContainer', bandInfo = null) {
        const container = document.getElementById(containerId);
        if (!container || !features) return;

        const featureNames = Object.keys(features);

        // Destroy any lingering Chart.js instances from old implementation
        Object.values(this.featureCharts).forEach(c => { try { c.destroy(); } catch(e) {} });
        this.featureCharts = {};

        // Remove cards for features that no longer exist
        Array.from(container.querySelectorAll('.band-meter-card')).forEach(card => {
            if (!featureNames.includes(card.dataset.feature)) card.remove();
        });

        featureNames.forEach(featureName => {
            const value = Number.isFinite(features[featureName]) ? features[featureName] : 0;
            const threshold = thresholds ? thresholds[featureName] : undefined;
            const info = bandInfo ? bandInfo[featureName] : null;
            const mode = info ? info.mode : 'enhance';
            const bandName = info ? info.name : (featureName.charAt(0).toUpperCase() + featureName.slice(1));
            const hzLabel = info ? info.hz_label : '';

            const hasThreshold = threshold !== undefined && threshold !== null && Number.isFinite(threshold);
            const isSuccess = hasThreshold ? (mode === 'inhibit' ? value <= threshold : value >= threshold) : null;
            const axisMax = this._stableAxisMax(featureName, value, threshold);

            const fillPct   = Math.min(100, Math.max(0, (value / axisMax) * 100));
            const threshPct = hasThreshold ? Math.min(100, Math.max(0, (threshold / axisMax) * 100)) : null;

            let card = container.querySelector(`.band-meter-card[data-feature="${featureName}"]`);

            if (!card) {
                card = document.createElement('div');
                card.dataset.feature = featureName;
                card.innerHTML = `
                    <div class="bm-header">
                        <div class="bm-name"></div>
                        <div class="bm-hz"></div>
                        <div class="bm-badge"></div>
                    </div>
                    <div class="bm-chart">
                        <div class="bm-scale">
                            <span class="bm-tick"></span>
                            <span class="bm-tick"></span>
                            <span class="bm-tick"></span>
                            <span class="bm-tick"></span>
                            <span class="bm-tick"></span>
                        </div>
                        <div class="bm-track">
                            <div class="bm-fill"></div>
                            <div class="bm-threshold-line" style="display:none">
                                <span class="bm-threshold-label"></span>
                            </div>
                        </div>
                    </div>
                    <div class="bm-footer">
                        <div class="bm-value"></div>
                        <div class="bm-status"></div>
                    </div>
                `;
                container.appendChild(card);
            }

            card.className = `band-meter-card ${mode}`;

            card.querySelector('.bm-name').textContent = bandName;
            card.querySelector('.bm-hz').textContent = hzLabel;
            const badge = card.querySelector('.bm-badge');
            badge.textContent = mode === 'inhibit' ? 'INHIBIT' : 'REWARD';
            badge.className = `bm-badge ${mode}`;

            const fill = card.querySelector('.bm-fill');
            fill.style.height = `${fillPct}%`;
            fill.className = `bm-fill ${isSuccess === true ? 'success' : isSuccess === false ? 'fail' : 'neutral'}`;

            const threshLine = card.querySelector('.bm-threshold-line');
            if (hasThreshold && threshPct !== null) {
                threshLine.style.display = '';
                threshLine.style.bottom = `${threshPct}%`;
                threshLine.querySelector('.bm-threshold-label').textContent = `${threshold.toFixed(1)}`;
            } else {
                threshLine.style.display = 'none';
            }

            card.querySelector('.bm-value').textContent = `${value.toFixed(1)} µV`;
            const statusEl = card.querySelector('.bm-status');
            if (isSuccess === true) {
                statusEl.textContent = '✓';
                statusEl.className = 'bm-status success';
            } else if (isSuccess === false) {
                statusEl.textContent = '✗';
                statusEl.className = 'bm-status fail';
            } else {
                statusEl.textContent = '—';
                statusEl.className = 'bm-status';
            }

            // Scale: 5 ticks from top (axisMax) to bottom (0)
            const ticks = card.querySelectorAll('.bm-tick');
            ticks.forEach((tick, i) => {
                const frac = 1 - (i / (ticks.length - 1));
                const v = frac * axisMax;
                tick.textContent = v >= 10 ? v.toFixed(0) : v.toFixed(1);
            });
        });
    }

    // Round a value up to the nearest clean axis bound.
    // Finer steps (1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10 × 10^n) prevent
    // values like 50.57 from jumping all the way to 100.
    _niceMax(v) {
        if (!Number.isFinite(v) || v <= 0) return 1;
        const pow = Math.pow(10, Math.floor(Math.log10(v)));
        const n = v / pow;
        let nice;
        if (n <= 1)        nice = 1;
        else if (n <= 1.5) nice = 1.5;
        else if (n <= 2)   nice = 2;
        else if (n <= 2.5) nice = 2.5;
        else if (n <= 3)   nice = 3;
        else if (n <= 4)   nice = 4;
        else if (n <= 5)   nice = 5;
        else if (n <= 6)   nice = 6;
        else if (n <= 8)   nice = 8;
        else               nice = 10;
        return nice * pow;
    }

    // Fixed scale: lock after baseline using the higher of (threshold / 0.7) and (peak value seen / 0.8).
    // This keeps the threshold line at a fixed position while ensuring the bars actually
    // fill a meaningful portion of the chart even when threshold >> typical signal.
    // During baseline we track the running peak but don't lock yet.
    _stableAxisMax(featureName, value, threshold) {
        const t = (threshold !== undefined && threshold !== null && Number.isFinite(threshold) && threshold > 0)
            ? threshold
            : null;

        let state = this.featureAxisMax[featureName] || { nice: 10, locked: false, peak: 0 };

        if (state.locked) return state.nice;

        // Track the largest value seen so far across all frames (including baseline)
        const peak = Math.max(state.peak || 0, Number.isFinite(value) ? value : 0);

        if (!this.isBaselinePhase && t !== null) {
            // Baseline just ended — lock now.
            // Use whichever bound is larger: threshold at 70% height, or peak at 80% height.
            const fromThreshold = t / 0.7;
            const fromPeak     = peak > 0 ? peak / 0.8 : 0;
            const nice = this._niceMax(Math.max(fromThreshold, fromPeak));
            state = { nice, locked: true, peak };
        } else {
            // Still in baseline: keep updating peak but don't lock
            state = { nice: state.nice, locked: false, peak };
        }

        this.featureAxisMax[featureName] = state;
        return state.nice;
    }

    // Simple way to indicate thresholds - just update based on value comparison
    // Threshold lines would require annotation plugin which adds complexity
    // Instead, we use color coding to indicate threshold status

    // ========================================
    // CHART LIFECYCLE
    // ========================================

    initializeAllCharts() {
        // Initialize all charts when the app starts
        setTimeout(() => {
            this.initializeEEGChart();
            this.initializeBandpowerChart();
            this.initializeSessionStatsChart();
            this.initializePatientProgressChart();
            this.initializeFeatureAmplitudeChart();
        }, 100); // Small delay to ensure DOM is ready
    }

    destroyChart(chartName) {
        if (this.charts[chartName]) {
            this.charts[chartName].destroy();
            delete this.charts[chartName];
        }
    }

    destroyAllCharts() {
        Object.keys(this.charts).forEach(chartName => {
            this.destroyChart(chartName);
        });
        
        // Also destroy feature charts
        if (this.featureCharts) {
            Object.keys(this.featureCharts).forEach(featureName => {
                if (this.featureCharts[featureName]) {
                    this.featureCharts[featureName].destroy();
                }
            });
            this.featureCharts = {};
        }
        this.featureAxisMax = {};
        this.isBaselinePhase = true; // reset so new session starts unlocked
    }

    resizeCharts() {
        Object.values(this.charts).forEach(chart => {
            if (chart && typeof chart.resize === 'function') {
                chart.resize();
            }
        });
        
        // Also resize feature charts
        if (this.featureCharts) {
            Object.values(this.featureCharts).forEach(chart => {
                if (chart && typeof chart.resize === 'function') {
                    chart.resize();
                }
            });
        }
    }

    // ========================================
    // UTILITY METHODS
    // ========================================

    getChannelColor(index) {
        const colors = [
            '#000000', // Black
            '#666666', // Dark Gray
            '#333333', // Medium Gray
            '#999999', // Light Gray
            '#1a1a1a'  // Very Dark Gray
        ];
        return colors[index % colors.length];
    }

    getFeedbackColor(value) {
        // Return color based on feedback value (0-1 scale)
        if (value < 0.3) return '#666666'; // Low - gray
        if (value < 0.7) return '#333333'; // Medium - dark gray
        return '#000000'; // High - black
    }

    hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    generateSampleEEGData(samples) {
        // Generate realistic EEG-like data
        const data = [];
        let phase = Math.random() * Math.PI * 2;
        
        for (let i = 0; i < samples; i++) {
            // Combine multiple frequencies for realistic EEG signal
            const alpha = 20 * Math.sin(2 * Math.PI * 10 * i / samples + phase); // 10Hz alpha
            const beta = 10 * Math.sin(2 * Math.PI * 20 * i / samples + phase * 1.5); // 20Hz beta
            const noise = (Math.random() - 0.5) * 5; // Small noise component
            
            data.push(alpha + beta + noise);
        }
        
        return data;
    }

    generateSampleBandpowerData(bands) {
        // Generate sample bandpower values
        return Array.from({length: bands}, () => Math.random() * 40 + 10);
    }

    // ========================================
    // EXPORT FUNCTIONALITY
    // ========================================

    exportChartAsImage(chartName, filename) {
        const chart = this.charts[chartName];
        if (!chart) return;

        const url = chart.toBase64Image('image/png', 1.0);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || `${chartName}-chart.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    exportAllCharts() {
        Object.keys(this.charts).forEach(chartName => {
            this.exportChartAsImage(chartName, `${chartName}-${new Date().toISOString().split('T')[0]}.png`);
        });
    }

    // ========================================
    // REAL-TIME DATA SIMULATION
    // ========================================

    startRealtimeSimulation() {
        if (this.simulationInterval) {
            clearInterval(this.simulationInterval);
        }

        this.simulationInterval = setInterval(() => {
            // Update EEG chart with new data
            const eegData = {
                channels: [
                    { samples: this.generateSampleEEGData(250) },
                    { samples: this.generateSampleEEGData(250) },
                    { samples: this.generateSampleEEGData(250) }
                ]
            };
            this.updateEEGChart(eegData);

            // Update bandpower chart
            const bandpowerData = {
                channels: [
                    { bandpowers: this.generateSampleBandpowerData(5) },
                    { bandpowers: this.generateSampleBandpowerData(5) },
                    { bandpowers: this.generateSampleBandpowerData(5) }
                ]
            };
            this.updateBandpowerChart(bandpowerData);

            // Update feedback value
            const feedbackValue = Math.random() * 0.8 + 0.1; // 0.1 to 0.9
            this.updateFeedbackValue(feedbackValue);

        }, 250); // Update every 250ms (4 Hz)
    }

    stopRealtimeSimulation() {
        if (this.simulationInterval) {
            clearInterval(this.simulationInterval);
            this.simulationInterval = null;
        }
    }
}

// Create global charts manager instance
window.charts = new ChartsManager();

// Initialize charts when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.charts.initializeAllCharts();
});

// Handle window resize
window.addEventListener('resize', () => {
    if (window.charts) {
        window.charts.resizeCharts();
    }
});