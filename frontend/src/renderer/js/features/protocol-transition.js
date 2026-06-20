/**
 * Protocol Transition Logic
 * Handles automated protocol switching between blocks (e.g., Block 1 → Block 2),
 * location changes (F3 → Pz), and baseline recapturing for new protocols
 */

class ProtocolTransition {
    constructor() {
        this.currentPatient = null;
        this.treatmentPlan = null;
        this.sessionHistory = [];
        this.currentBlock = null;
        this.nextBlock = null;
        this.transitionInProgress = false;
        this.baselineData = {};
        this.thresholdHistory = {};
        this.transitionCallbacks = [];
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.initializeTransitionRules();
    }

    // ====================================
    // TRANSITION RULES AND CONDITIONS
    // ====================================

    initializeTransitionRules() {
        this.transitionRules = {
            // Block completion triggers
            blockCompletion: {
                minSuccessRate: 60,
                minSessions: 0.8, // 80% of planned sessions
                stabilityWindow: 3, // Last 3 sessions
                stabilityThreshold: 5 // Success rate variance < 5%
            },
            
            // Protocol switching conditions
            protocolSwitch: {
                locationChange: {
                    baselineRequired: true,
                    adaptationPeriod: 2, // 2 sessions
                    thresholdReduction: 0.1 // 10% easier initially
                },
                frequencyChange: {
                    baselineRequired: true,
                    adaptationPeriod: 1,
                    thresholdReduction: 0.05
                },
                protocolTypeChange: {
                    baselineRequired: true,
                    adaptationPeriod: 3,
                    thresholdReduction: 0.15
                }
            },
            
            // Early transition triggers
            earlyTransition: {
                excellentProgress: {
                    successRateThreshold: 85,
                    consistentSessions: 4,
                    patientRequest: false
                },
                plateau: {
                    successRateChange: 2, // Less than 2% change
                    plateauWindow: 5,
                    minSessionsBeforeSwitching: 4
                },
                adverseResponse: {
                    successRateDropThreshold: 15,
                    artifactIncreaseThreshold: 25,
                    consecutivePoorSessions: 3
                }
            }
        };
    }

    // ====================================
    // MAIN TRANSITION LOGIC
    // ====================================

    async checkForTransition(sessionData) {
        try {
            if (this.transitionInProgress) {
                console.log('Transition already in progress, skipping check');
                return null;
            }

            // Load current context
            await this.loadTransitionContext(sessionData.patientId);
            
            // Determine if transition is needed
            const transitionDecision = this.evaluateTransitionNeed(sessionData);
            
            if (transitionDecision.shouldTransition) {
                console.log('Transition recommended:', transitionDecision);
                return await this.executeTransition(transitionDecision);
            }

            return null;
            
        } catch (error) {
            console.error('Error checking for transition:', error);
            return null;
        }
    }

    async loadTransitionContext(patientId) {
        this.currentPatient = await window.api.getPatient(patientId);
        this.treatmentPlan = await window.api.getTreatmentPlanByPatient(patientId);
        this.sessionHistory = await window.api.getSessionsByPatient(patientId);
        this.sessionHistory.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
        
        // Determine current and next blocks
        this.currentBlock = this.getCurrentTreatmentBlock();
        this.nextBlock = this.getNextTreatmentBlock();
        
        // Load baseline and threshold history
        await this.loadBaselineHistory();
        await this.loadThresholdHistory();
    }

    getCurrentTreatmentBlock() {
        if (!this.treatmentPlan?.blocks) return null;
        
        const currentSession = this.sessionHistory.length + 1;
        return this.treatmentPlan.blocks.find(block => 
            currentSession >= block.startSession && currentSession <= block.endSession
        );
    }

    getNextTreatmentBlock() {
        if (!this.treatmentPlan?.blocks || !this.currentBlock) return null;
        
        return this.treatmentPlan.blocks.find(block => 
            block.startSession > this.currentBlock.endSession
        );
    }

    evaluateTransitionNeed(sessionData) {
        const decision = {
            shouldTransition: false,
            reason: '',
            transitionType: '',
            timing: 'immediate',
            confidence: 0,
            recommendations: []
        };

        // Check for block completion
        const blockCompletionCheck = this.checkBlockCompletion();
        if (blockCompletionCheck.complete) {
            decision.shouldTransition = true;
            decision.reason = 'Block completed successfully';
            decision.transitionType = 'block_completion';
            decision.confidence = blockCompletionCheck.confidence;
            return decision;
        }

        // Check for early transition conditions
        const earlyTransitionCheck = this.checkEarlyTransition();
        if (earlyTransitionCheck.shouldTransition) {
            decision.shouldTransition = true;
            decision.reason = earlyTransitionCheck.reason;
            decision.transitionType = 'early_transition';
            decision.confidence = earlyTransitionCheck.confidence;
            decision.timing = earlyTransitionCheck.timing;
            return decision;
        }

        // Check for adaptive transitions based on performance
        const adaptiveCheck = this.checkAdaptiveTransition(sessionData);
        if (adaptiveCheck.shouldTransition) {
            decision.shouldTransition = true;
            decision.reason = adaptiveCheck.reason;
            decision.transitionType = 'adaptive';
            decision.confidence = adaptiveCheck.confidence;
            return decision;
        }

        return decision;
    }

    checkBlockCompletion() {
        if (!this.currentBlock) {
            return { complete: false, confidence: 0 };
        }

        const currentSession = this.sessionHistory.length + 1;
        const blockProgress = (currentSession - this.currentBlock.startSession) / (this.currentBlock.endSession - this.currentBlock.startSession + 1);
        
        // Check if block is nominally complete
        const nominallyComplete = currentSession > this.currentBlock.endSession;
        
        // Check if minimum completion criteria met
        const minSessionsComplete = blockProgress >= this.transitionRules.blockCompletion.minSessions;
        
        // Check recent performance
        const recentPerformance = this.analyzeRecentPerformance();
        const performanceMet = recentPerformance.avgSuccessRate >= this.transitionRules.blockCompletion.minSuccessRate;
        const stable = recentPerformance.stability <= this.transitionRules.blockCompletion.stabilityThreshold;
        
        const complete = nominallyComplete || (minSessionsComplete && performanceMet && stable);
        const confidence = this.calculateCompletionConfidence(blockProgress, recentPerformance);
        
        return { complete, confidence, blockProgress, recentPerformance };
    }

    checkEarlyTransition() {
        const recentPerformance = this.analyzeRecentPerformance();
        const rules = this.transitionRules.earlyTransition;
        
        // Excellent progress check
        if (recentPerformance.avgSuccessRate >= rules.excellentProgress.successRateThreshold &&
            recentPerformance.consistentSessions >= rules.excellentProgress.consistentSessions) {
            return {
                shouldTransition: true,
                reason: 'Excellent progress - patient ready for next phase',
                confidence: 0.9,
                timing: 'next_session'
            };
        }
        
        // Plateau detection
        if (recentPerformance.changeRate <= rules.plateau.successRateChange &&
            recentPerformance.sessionCount >= rules.plateau.plateauWindow &&
            this.getBlockSessionsCompleted() >= rules.plateau.minSessionsBeforeSwitching) {
            return {
                shouldTransition: true,
                reason: 'Performance plateau detected - protocol change may be beneficial',
                confidence: 0.7,
                timing: 'after_checkpoint'
            };
        }
        
        // Adverse response check
        if (recentPerformance.successRateDrop >= rules.adverseResponse.successRateDropThreshold ||
            recentPerformance.artifactIncrease >= rules.adverseResponse.artifactIncreaseThreshold) {
            return {
                shouldTransition: true,
                reason: 'Adverse response to current protocol - intervention needed',
                confidence: 0.8,
                timing: 'immediate'
            };
        }
        
        return { shouldTransition: false };
    }

    checkAdaptiveTransition(sessionData) {
        // This would implement more complex adaptive logic
        // based on real-time session performance
        
        const currentSessionPerformance = this.analyzeCurrentSession(sessionData);
        
        // Check if current session shows signs of protocol mismatch
        if (currentSessionPerformance.earlyTermination && 
            currentSessionPerformance.reason === 'protocol_intolerance') {
            return {
                shouldTransition: true,
                reason: 'Protocol intolerance detected in current session',
                confidence: 0.85,
                timing: 'immediate'
            };
        }
        
        return { shouldTransition: false };
    }

    // ====================================
    // PERFORMANCE ANALYSIS
    // ====================================

    analyzeRecentPerformance() {
        const recentSessions = this.sessionHistory.slice(-this.transitionRules.blockCompletion.stabilityWindow);
        
        if (recentSessions.length === 0) {
            return {
                avgSuccessRate: 0,
                stability: 100,
                changeRate: 0,
                consistentSessions: 0,
                successRateDrop: 0,
                artifactIncrease: 0,
                sessionCount: 0
            };
        }
        
        const successRates = recentSessions.map(s => s.overall_success_rate || 0);
        const avgSuccessRate = successRates.reduce((sum, rate) => sum + rate, 0) / successRates.length;
        
        // Calculate stability (variance in success rates)
        const variance = successRates.reduce((sum, rate) => sum + Math.pow(rate - avgSuccessRate, 2), 0) / successRates.length;
        const stability = Math.sqrt(variance);
        
        // Calculate change rate (slope of recent performance)
        const changeRate = this.calculatePerformanceSlope(successRates);
        
        // Count consistent high-performance sessions
        const consistentSessions = successRates.filter(rate => rate >= 75).length;
        
        // Calculate performance drops
        const recentAvg = successRates.slice(-2).reduce((sum, rate) => sum + rate, 0) / 2;
        const earlierAvg = successRates.slice(0, -2).reduce((sum, rate) => sum + rate, 0) / Math.max(successRates.length - 2, 1);
        const successRateDrop = Math.max(0, earlierAvg - recentAvg);
        
        // Calculate artifact rate increase (simplified)
        const artifactIncrease = this.calculateArtifactIncrease(recentSessions);
        
        return {
            avgSuccessRate,
            stability,
            changeRate,
            consistentSessions,
            successRateDrop,
            artifactIncrease,
            sessionCount: recentSessions.length
        };
    }

    calculatePerformanceSlope(values) {
        if (values.length < 2) return 0;
        
        const n = values.length;
        const sumX = values.reduce((sum, val, i) => sum + i, 0);
        const sumY = values.reduce((sum, val) => sum + val, 0);
        const sumXY = values.reduce((sum, val, i) => sum + (i * val), 0);
        const sumX2 = values.reduce((sum, val, i) => sum + (i * i), 0);
        
        return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    }

    calculateArtifactIncrease(sessions) {
        if (sessions.length < 2) return 0;
        
        const artifactRates = sessions.map(session => {
            const totalTime = session.duration_seconds || 0;
            const artifactTime = session.total_artifact_time_seconds || 0;
            return totalTime > 0 ? (artifactTime / totalTime) * 100 : 0;
        });
        
        const recentAvg = artifactRates.slice(-2).reduce((sum, rate) => sum + rate, 0) / 2;
        const earlierAvg = artifactRates.slice(0, -2).reduce((sum, rate) => sum + rate, 0) / Math.max(artifactRates.length - 2, 1);
        
        return Math.max(0, recentAvg - earlierAvg);
    }

    analyzeCurrentSession(sessionData) {
        // Analyze current session for immediate transition needs
        return {
            earlyTermination: false,
            reason: '',
            successRate: sessionData.currentSuccessRate || 0,
            artifactRate: sessionData.currentArtifactRate || 0
        };
    }

    calculateCompletionConfidence(blockProgress, recentPerformance) {
        let confidence = 0;
        
        // Block progress component (0-0.4)
        confidence += Math.min(blockProgress, 1) * 0.4;
        
        // Performance component (0-0.4)
        confidence += (recentPerformance.avgSuccessRate / 100) * 0.4;
        
        // Stability component (0-0.2)
        const stabilityScore = Math.max(0, 1 - (recentPerformance.stability / 20));
        confidence += stabilityScore * 0.2;
        
        return Math.min(confidence, 1.0);
    }

    getBlockSessionsCompleted() {
        if (!this.currentBlock) return 0;
        
        const currentSession = this.sessionHistory.length + 1;
        return Math.max(0, currentSession - this.currentBlock.startSession);
    }

    // ====================================
    // TRANSITION EXECUTION
    // ====================================

    async executeTransition(transitionDecision) {
        try {
            this.transitionInProgress = true;
            
            console.log('Executing transition:', transitionDecision);
            
            // Prepare transition data
            const transitionPlan = await this.prepareTransitionPlan(transitionDecision);
            
            // Execute pre-transition tasks
            await this.executePreTransitionTasks(transitionPlan);
            
            // Perform the actual transition
            const result = await this.performTransition(transitionPlan);
            
            // Execute post-transition tasks
            await this.executePostTransitionTasks(transitionPlan, result);
            
            // Notify callbacks
            await this.notifyTransitionCallbacks(result);
            
            this.transitionInProgress = false;
            
            return result;
            
        } catch (error) {
            console.error('Error executing transition:', error);
            this.transitionInProgress = false;
            throw error;
        }
    }

    async prepareTransitionPlan(transitionDecision) {
        const plan = {
            decision: transitionDecision,
            fromBlock: this.currentBlock,
            toBlock: this.nextBlock || this.generateNextBlock(),
            protocolChanges: this.analyzeProtocolChanges(),
            baselineRequired: false,
            thresholdAdjustments: {},
            adaptationPeriod: 1,
            notifications: []
        };
        
        // Determine if baseline recapture is needed
        plan.baselineRequired = this.isBaselineRequired(plan.protocolChanges);
        
        // Calculate threshold adjustments
        if (plan.baselineRequired) {
            plan.thresholdAdjustments = this.calculateThresholdAdjustments(plan.protocolChanges);
            plan.adaptationPeriod = this.calculateAdaptationPeriod(plan.protocolChanges);
        }
        
        // Prepare notifications
        plan.notifications = this.prepareTransitionNotifications(plan);
        
        return plan;
    }

    generateNextBlock() {
        // Generate a continuation or maintenance block if no next block is defined
        if (!this.currentBlock) return null;
        
        const nextSessionNumber = this.currentBlock.endSession + 1;
        
        return {
            id: Date.now().toString(),
            name: `Continuation Block`,
            startSession: nextSessionNumber,
            endSession: nextSessionNumber + 4, // 5 session maintenance block
            protocol: this.currentBlock.protocol,
            target: 'Maintain and consolidate gains',
            generated: true
        };
    }

    analyzeProtocolChanges() {
        if (!this.currentBlock || !this.nextBlock) {
            return { hasChanges: false };
        }
        
        const currentProtocol = this.getProtocolDetails(this.currentBlock.protocol);
        const nextProtocol = this.getProtocolDetails(this.nextBlock.protocol);
        
        if (!currentProtocol || !nextProtocol) {
            return { hasChanges: false };
        }
        
        // Check for location changes by comparing channels
        const currentChannels = this.getProtocolChannels(currentProtocol);
        const nextChannels = this.getProtocolChannels(nextProtocol);
        const locationChange = JSON.stringify(currentChannels.sort()) !== JSON.stringify(nextChannels.sort());
        
        // Check for frequency changes by comparing frequency ranges
        const currentFreqRanges = this.getProtocolFrequencyRanges(currentProtocol);
        const nextFreqRanges = this.getProtocolFrequencyRanges(nextProtocol);
        const frequencyChange = JSON.stringify(currentFreqRanges.sort()) !== JSON.stringify(nextFreqRanges.sort());
        
        return {
            hasChanges: true,
            locationChange: locationChange,
            frequencyChange: frequencyChange,
            protocolTypeChange: currentProtocol.id !== nextProtocol.id,
            currentProtocol,
            nextProtocol
        };
    }

    getProtocolChannels(protocol) {
        // Extract all unique channels from protocol's frequency bands
        if (!protocol || !protocol.features || !protocol.features.frequency_bands) {
            return [];
        }
        const channels = new Set();
        protocol.features.frequency_bands.forEach(band => {
            if (band.channels && Array.isArray(band.channels)) {
                band.channels.forEach(ch => channels.add(ch));
            }
        });
        return Array.from(channels);
    }

    getProtocolFrequencyRanges(protocol) {
        // Extract all frequency ranges from protocol's frequency bands
        if (!protocol || !protocol.features || !protocol.features.frequency_bands) {
            return [];
        }
        return protocol.features.frequency_bands.map(band => 
            `${band.frequency_range?.[0]}-${band.frequency_range?.[1]}`
        );
    }

    getProtocolDetails(protocolId) {
        // Get protocol from API
        // This should be async but keeping sync for backwards compatibility
        // In practice, protocols should be loaded via getAllProtocols()
        console.warn('getProtocolDetails() should use async getAllProtocols() from API');
        return {
            id: protocolId,
            features: {
                frequency_bands: [
                    {
                        frequency: 15.0,
                        frequency_range: [15.0, 18.0],
                        channels: ['Cz'],
                        type: 'reward'
                    }
                ]
            }
        };
    }

    isBaselineRequired(protocolChanges) {
        if (!protocolChanges.hasChanges) return false;
        
        const rules = this.transitionRules.protocolSwitch;
        
        return (protocolChanges.locationChange && rules.locationChange.baselineRequired) ||
               (protocolChanges.frequencyChange && rules.frequencyChange.baselineRequired) ||
               (protocolChanges.protocolTypeChange && rules.protocolTypeChange.baselineRequired);
    }

    calculateThresholdAdjustments(protocolChanges) {
        const adjustments = {
            rewardThreshold: 1.0,
            inhibitThreshold: 1.0,
            temporaryReduction: 0
        };
        
        const rules = this.transitionRules.protocolSwitch;
        
        if (protocolChanges.locationChange) {
            adjustments.temporaryReduction = Math.max(adjustments.temporaryReduction, rules.locationChange.thresholdReduction);
        }
        
        if (protocolChanges.frequencyChange) {
            adjustments.temporaryReduction = Math.max(adjustments.temporaryReduction, rules.frequencyChange.thresholdReduction);
        }
        
        if (protocolChanges.protocolTypeChange) {
            adjustments.temporaryReduction = Math.max(adjustments.temporaryReduction, rules.protocolTypeChange.thresholdReduction);
        }
        
        adjustments.rewardThreshold = 1.0 - adjustments.temporaryReduction;
        adjustments.inhibitThreshold = 1.0 + adjustments.temporaryReduction; // Make inhibit easier too
        
        return adjustments;
    }

    calculateAdaptationPeriod(protocolChanges) {
        const rules = this.transitionRules.protocolSwitch;
        let maxPeriod = 1;
        
        if (protocolChanges.locationChange) {
            maxPeriod = Math.max(maxPeriod, rules.locationChange.adaptationPeriod);
        }
        
        if (protocolChanges.frequencyChange) {
            maxPeriod = Math.max(maxPeriod, rules.frequencyChange.adaptationPeriod);
        }
        
        if (protocolChanges.protocolTypeChange) {
            maxPeriod = Math.max(maxPeriod, rules.protocolTypeChange.adaptationPeriod);
        }
        
        return maxPeriod;
    }

    prepareTransitionNotifications(plan) {
        const notifications = [];
        
        notifications.push({
            type: 'info',
            title: 'Protocol Transition',
            message: `Transitioning from ${plan.fromBlock?.name} to ${plan.toBlock?.name}`,
            timing: 'immediate'
        });
        
        if (plan.baselineRequired) {
            notifications.push({
                type: 'action_required',
                title: 'Baseline Required',
                message: 'New baseline recording needed for protocol transition',
                timing: 'next_session'
            });
        }
        
        if (plan.thresholdAdjustments.temporaryReduction > 0) {
            notifications.push({
                type: 'info',
                title: 'Temporary Threshold Adjustment',
                message: `Thresholds temporarily reduced by ${(plan.thresholdAdjustments.temporaryReduction * 100).toFixed(0)}% for easier adaptation`,
                timing: 'next_session'
            });
        }
        
        return notifications;
    }

    // ====================================
    // TRANSITION TASKS
    // ====================================

    async executePreTransitionTasks(plan) {
        const tasks = [];
        
        // Save current protocol performance summary
        tasks.push(this.saveProtocolSummary(plan.fromBlock));
        
        // Prepare baseline capture if needed
        if (plan.baselineRequired) {
            tasks.push(this.prepareBaselineCapture(plan));
        }
        
        // Update treatment plan
        tasks.push(this.updateTreatmentPlan(plan));
        
        await Promise.all(tasks);
    }

    async performTransition(plan) {
        const result = {
            success: false,
            transitionId: Date.now().toString(),
            timestamp: new Date().toISOString(),
            fromBlock: plan.fromBlock,
            toBlock: plan.toBlock,
            protocolChanges: plan.protocolChanges,
            baselineCaptured: false,
            thresholdsAdjusted: false,
            error: null
        };
        
        try {
            // Capture baseline if required
            if (plan.baselineRequired) {
                const baselineResult = await this.captureBaselineForTransition(plan);
                result.baselineCaptured = baselineResult.success;
                result.baselineData = baselineResult.data;
            }
            
            // Apply threshold adjustments
            if (Object.keys(plan.thresholdAdjustments).length > 0) {
                const thresholdResult = await this.applyThresholdAdjustments(plan);
                result.thresholdsAdjusted = thresholdResult.success;
                result.adjustedThresholds = thresholdResult.thresholds;
            }
            
            // Update current block reference
            this.currentBlock = plan.toBlock;
            
            result.success = true;
            
        } catch (error) {
            result.error = error.message;
            console.error('Transition execution error:', error);
        }
        
        return result;
    }

    async executePostTransitionTasks(plan, result) {
        const tasks = [];
        
        // Log transition
        tasks.push(this.logTransition(plan, result));
        
        // Schedule adaptation period monitoring
        if (plan.adaptationPeriod > 1) {
            tasks.push(this.scheduleAdaptationMonitoring(plan, result));
        }
        
        // Update UI components
        tasks.push(this.updateUIForTransition(plan, result));
        
        await Promise.all(tasks);
    }

    // ====================================
    // BASELINE AND THRESHOLD MANAGEMENT
    // ====================================

    async loadBaselineHistory() {
        try {
            this.baselineData = await window.api.getPatientBaselines(this.currentPatient.id);
        } catch (error) {
            console.error('Error loading baseline history:', error);
            this.baselineData = {};
        }
    }

    async loadThresholdHistory() {
        try {
            this.thresholdHistory = await window.api.getPatientThresholds(this.currentPatient.id);
        } catch (error) {
            console.error('Error loading threshold history:', error);
            this.thresholdHistory = {};
        }
    }

    async captureBaselineForTransition(plan) {
        try {
            const baselineConfig = {
                patientId: this.currentPatient.id,
                protocol: plan.toBlock.protocol,
                channels: this.getProtocolChannels(plan.protocolChanges.nextProtocol),
                duration: 120, // 2 minutes
                purpose: 'protocol_transition',
                transitionId: Date.now().toString()
            };
            
            // This would integrate with the session system to capture baseline
            const baselineData = await this.requestBaselineCapture(baselineConfig);
            
            // Store baseline data
            await this.storeBaseline(baselineConfig.transitionId, baselineData);
            
            return {
                success: true,
                data: baselineData,
                config: baselineConfig
            };
            
        } catch (error) {
            console.error('Error capturing baseline:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async requestBaselineCapture(config) {
        // This would interface with the session system to actually capture baseline EEG
        console.log('Baseline capture requested:', config);
        
        // Simulated baseline data for now
        return {
            timestamp: new Date().toISOString(),
            channels: config.channels || this.getProtocolChannels(config),
            duration: config.duration,
            data: {
                theta: Math.random() * 10 + 5,
                alpha: Math.random() * 15 + 8,
                beta: Math.random() * 20 + 10,
                gamma: Math.random() * 5 + 2
            },
            quality: 'good'
        };
    }

    async storeBaseline(transitionId, baselineData) {
        try {
            await window.api.saveBaseline({
                patientId: this.currentPatient.id,
                transitionId: transitionId,
                data: baselineData,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error storing baseline:', error);
        }
    }

    async applyThresholdAdjustments(plan) {
        try {
            const adjustments = plan.thresholdAdjustments;
            const thresholds = {
                rewardThreshold: adjustments.rewardThreshold,
                inhibitThreshold: adjustments.inhibitThreshold,
                adaptationPeriod: plan.adaptationPeriod,
                appliedAt: new Date().toISOString()
            };
            
            // Apply to session system
            if (window.sessionAnalytics) {
                window.sessionAnalytics.updateThresholds(thresholds);
            }
            
            // Store threshold adjustments
            await window.api.saveThresholdAdjustments({
                patientId: this.currentPatient.id,
                adjustments: thresholds,
                reason: 'protocol_transition'
            });
            
            return {
                success: true,
                thresholds: thresholds
            };
            
        } catch (error) {
            console.error('Error applying threshold adjustments:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ====================================
    // LOGGING AND MONITORING
    // ====================================

    async saveProtocolSummary(block) {
        if (!block) return;
        
        const blockSessions = this.sessionHistory.filter(session => {
            const sessionNum = this.sessionHistory.indexOf(session) + 1;
            return sessionNum >= block.startSession && sessionNum <= block.endSession;
        });
        
        const summary = {
            blockId: block.id,
            protocol: block.protocol,
            sessionsCompleted: blockSessions.length,
            avgSuccessRate: blockSessions.reduce((sum, s) => sum + (s.overall_success_rate || 0), 0) / blockSessions.length,
            trend: this.calculatePerformanceSlope(blockSessions.map(s => s.overall_success_rate || 0)),
            completedAt: new Date().toISOString()
        };
        
        try {
            await window.api.saveProtocolSummary(summary);
        } catch (error) {
            console.error('Error saving protocol summary:', error);
        }
    }

    async logTransition(plan, result) {
        const logEntry = {
            transitionId: result.transitionId,
            patientId: this.currentPatient.id,
            timestamp: result.timestamp,
            type: plan.decision.transitionType,
            reason: plan.decision.reason,
            confidence: plan.decision.confidence,
            fromBlock: plan.fromBlock,
            toBlock: plan.toBlock,
            protocolChanges: plan.protocolChanges,
            success: result.success,
            baselineRequired: plan.baselineRequired,
            baselineCaptured: result.baselineCaptured,
            thresholdAdjustments: plan.thresholdAdjustments,
            error: result.error
        };
        
        try {
            await window.api.logTransition(logEntry);
            console.log('Transition logged:', logEntry);
        } catch (error) {
            console.error('Error logging transition:', error);
        }
    }

    async scheduleAdaptationMonitoring(plan, result) {
        // Schedule monitoring during adaptation period
        const monitoringConfig = {
            transitionId: result.transitionId,
            adaptationPeriod: plan.adaptationPeriod,
            startSession: this.sessionHistory.length + 1,
            endSession: this.sessionHistory.length + plan.adaptationPeriod,
            checkpoints: []
        };
        
        // Create monitoring checkpoints
        for (let i = 1; i <= plan.adaptationPeriod; i++) {
            monitoringConfig.checkpoints.push({
                session: monitoringConfig.startSession + i - 1,
                type: 'adaptation_check',
                description: `Monitor adaptation to new protocol (${i}/${plan.adaptationPeriod})`
            });
        }
        
        try {
            await window.api.scheduleAdaptationMonitoring(monitoringConfig);
        } catch (error) {
            console.error('Error scheduling adaptation monitoring:', error);
        }
    }

    async updateUIForTransition(plan, result) {
        // Update treatment plan UI
        if (window.treatmentPlan) {
            await window.treatmentPlan.refreshTreatmentPlan();
        }
        
        // Update progress visualization
        if (window.progressVisualization) {
            await window.progressVisualization.loadPatientProgress(this.currentPatient.id);
        }
        
        // Show transition notifications
        this.showTransitionNotifications(plan.notifications);
    }

    showTransitionNotifications(notifications) {
        notifications.forEach(notification => {
            if (window.ui && window.ui.showNotification) {
                
            } else {
                console.log(`${notification.type.toUpperCase()}: ${notification.message}`);
            }
        });
    }

    async updateTreatmentPlan(plan) {
        if (!this.treatmentPlan) return;
        
        // Update current block status
        if (plan.fromBlock) {
            plan.fromBlock.completed = true;
            plan.fromBlock.completedAt = new Date().toISOString();
        }
        
        // Add generated block if needed
        if (plan.toBlock && plan.toBlock.generated) {
            this.treatmentPlan.blocks.push(plan.toBlock);
        }
        
        // Save updated plan
        try {
            await window.api.saveTreatmentPlan(this.currentPatient.id, this.treatmentPlan);
        } catch (error) {
            console.error('Error updating treatment plan:', error);
        }
    }

    // ====================================
    // CALLBACK MANAGEMENT
    // ====================================

    registerTransitionCallback(callback) {
        this.transitionCallbacks.push(callback);
    }

    removeTransitionCallback(callback) {
        const index = this.transitionCallbacks.indexOf(callback);
        if (index > -1) {
            this.transitionCallbacks.splice(index, 1);
        }
    }

    async notifyTransitionCallbacks(result) {
        for (const callback of this.transitionCallbacks) {
            try {
                await callback(result);
            } catch (error) {
                console.error('Error in transition callback:', error);
            }
        }
    }

    // ====================================
    // PUBLIC API
    // ====================================

    async forceTransition(patientId, reason = 'manual') {
        await this.loadTransitionContext(patientId);
        
        const transitionDecision = {
            shouldTransition: true,
            reason: reason,
            transitionType: 'manual',
            timing: 'immediate',
            confidence: 1.0
        };
        
        return await this.executeTransition(transitionDecision);
    }

    getCurrentTransitionStatus() {
        return {
            inProgress: this.transitionInProgress,
            currentBlock: this.currentBlock,
            nextBlock: this.nextBlock,
            patient: this.currentPatient?.id
        };
    }

    setupEventListeners() {
        // Listen for session completion events
        document.addEventListener('sessionCompleted', async (event) => {
            const sessionData = event.detail;
            await this.checkForTransition(sessionData);
        });
        
        // Listen for manual transition requests
        document.addEventListener('requestTransition', async (event) => {
            const { patientId, reason } = event.detail;
            await this.forceTransition(patientId, reason);
        });
    }
}

// Make it globally available
window.ProtocolTransition = ProtocolTransition;