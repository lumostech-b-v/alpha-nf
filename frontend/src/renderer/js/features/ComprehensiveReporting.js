/**
 * Comprehensive Reporting System
 * Builds discharge planning reports with all session data, trend charts, 
 * before/after scores, clinical notes, and treatment summaries matching Sarah's final report structure
 */

class ComprehensiveReporting {
    constructor() {
        this.reportTypes = {
            'discharge_summary': 'Discharge Summary Report',
            'progress_report': 'Progress Report',
            'session_summary': 'Session Summary Report',
            'clinical_outcomes': 'Clinical Outcomes Report',
            'protocol_effectiveness': 'Protocol Effectiveness Report'
        };
        
        this.chartLibrary = null;
        this.reportTemplates = {};
        this.exportFormats = ['pdf', 'html', 'json', 'csv'];
        this.currentReport = null;
        
        this.init();
    }

    init() {
        this.initializeChartLibrary();
        this.loadReportTemplates();
        this.setupEventListeners();
        this.createReportingInterface();
    }

    // ====================================
    // INITIALIZATION
    // ====================================

    initializeChartLibrary() {
        // Check if Chart.js is available
        if (typeof Chart !== 'undefined') {
            this.chartLibrary = Chart;
            // Configure defaults for reports
            Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
            Chart.defaults.font.size = 10;
            Chart.defaults.color = '#374151';
            Chart.defaults.plugins.legend.position = 'bottom';
            Chart.defaults.plugins.legend.labels.padding = 15;
        } else {
            console.warn('Chart.js not available - charts will not be included in reports');
        }
    }

    loadReportTemplates() {
        this.reportTemplates = {
            discharge_summary: {
                title: 'Neurofeedback Treatment Discharge Summary',
                sections: [
                    'patient_information',
                    'treatment_overview',
                    'initial_assessment',
                    'treatment_history',
                    'protocol_progression',
                    'session_analytics',
                    'clinical_outcomes',
                    'progress_trends',
                    'final_assessment',
                    'treatment_recommendations',
                    'follow_up_plan'
                ]
            },
            progress_report: {
                title: 'Neurofeedback Progress Report',
                sections: [
                    'patient_information',
                    'reporting_period',
                    'recent_sessions',
                    'progress_trends',
                    'clinical_changes',
                    'protocol_adjustments',
                    'next_steps'
                ]
            },
            session_summary: {
                title: 'Session Summary Report',
                sections: [
                    'session_overview',
                    'performance_metrics',
                    'protocol_details',
                    'artifacts_analysis',
                    'recommendations'
                ]
            },
            clinical_outcomes: {
                title: 'Clinical Outcomes Analysis',
                sections: [
                    'patient_information',
                    'assessment_comparison',
                    'symptom_changes',
                    'functional_improvements',
                    'treatment_response',
                    'statistical_analysis'
                ]
            }
        };
    }

    // ====================================
    // MAIN REPORT GENERATION
    // ====================================

    async generateReport(reportType, patientId, options = {}) {
        try {
            console.log(`Generating ${reportType} report for patient ${patientId}`);
            
            // Load all necessary data
            const reportData = await this.loadReportData(patientId, options);
            
            // Generate report based on type
            let report;
            switch (reportType) {
                case 'discharge_summary':
                    report = await this.generateDischargeSummary(reportData, options);
                    break;
                case 'progress_report':
                    report = await this.generateProgressReport(reportData, options);
                    break;
                case 'session_summary':
                    report = await this.generateSessionSummary(reportData, options);
                    break;
                case 'clinical_outcomes':
                    report = await this.generateClinicalOutcomes(reportData, options);
                    break;
                default:
                    throw new Error(`Unknown report type: ${reportType}`);
            }
            
            this.currentReport = report;
            return report;
            
        } catch (error) {
            console.error('Error generating report:', error);
            throw error;
        }
    }

    async loadReportData(patientId, options) {
        const data = {
            patient: await window.api.getPatient(patientId),
            sessions: await window.api.getSessionsByPatient(patientId),
            assessments: await window.api.getAssessmentByPatient(patientId),
            treatmentPlan: await window.api.getTreatmentPlanByPatient(patientId),
            progressData: null,
            checkpoints: [],
            protocolSummaries: [],
            transitions: []
        };

        // Sort sessions chronologically
        data.sessions.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

        // Load progress visualization data if available
        if (window.progressVisualization) {
            try {
                data.progressData = await window.progressVisualization.loadPatientProgressData(patientId);
            } catch (error) {
                console.warn('Could not load progress visualization data:', error);
            }
        }

        // Extract checkpoints from treatment plan
        if (data.treatmentPlan?.checkpoints) {
            data.checkpoints = data.treatmentPlan.checkpoints.map(cp => ({
                ...cp,
                completed: data.sessions.some(s => s.session_number === cp.session)
            }));
        }

        // Load additional data based on options
        if (options.includeProtocolSummaries) {
            try {
                data.protocolSummaries = await window.api.getProtocolSummaries(patientId);
            } catch (error) {
                console.warn('Could not load protocol summaries:', error);
                data.protocolSummaries = [];
            }
        }

        if (options.includeTransitions) {
            try {
                data.transitions = await window.api.getTransitionHistory(patientId);
            } catch (error) {
                console.warn('Could not load transition history:', error);
                data.transitions = [];
            }
        }

        return data;
    }

    // ====================================
    // DISCHARGE SUMMARY REPORT
    // ====================================

    async generateDischargeSummary(data, options) {
        const report = {
            type: 'discharge_summary',
            title: 'Neurofeedback Treatment Discharge Summary',
            generatedAt: new Date().toISOString(),
            generatedBy: options.clinicianName || 'System',
            patient: data.patient,
            sections: {},
            charts: {},
            attachments: []
        };

        // Generate each section
        report.sections.patient_information = this.generatePatientInformation(data);
        report.sections.treatment_overview = this.generateTreatmentOverview(data);
        report.sections.initial_assessment = this.generateInitialAssessment(data);
        report.sections.treatment_history = this.generateTreatmentHistory(data);
        report.sections.protocol_progression = this.generateProtocolProgression(data);
        report.sections.session_analytics = this.generateSessionAnalytics(data);
        report.sections.clinical_outcomes = this.generateClinicalOutcomesSection(data);
        report.sections.progress_trends = this.generateProgressTrends(data);
        report.sections.final_assessment = this.generateFinalAssessment(data);
        report.sections.treatment_recommendations = this.generateTreatmentRecommendations(data);
        report.sections.follow_up_plan = this.generateFollowUpPlan(data);

        // Generate charts
        report.charts = await this.generateReportCharts(data, 'discharge_summary');

        return report;
    }

    generatePatientInformation(data) {
        const patient = data.patient;
        return {
            title: 'Patient Information',
            content: {
                name: `${patient.first_name} ${patient.last_name}`,
                dateOfBirth: patient.date_of_birth,
                age: this.calculateAge(patient.date_of_birth),
                patientId: patient.id,
                treatmentStartDate: data.sessions[0]?.start_time ? 
                    new Date(data.sessions[0].start_time).toLocaleDateString() : 'N/A',
                treatmentEndDate: data.sessions[data.sessions.length - 1]?.end_time ? 
                    new Date(data.sessions[data.sessions.length - 1].end_time).toLocaleDateString() : 
                    new Date().toLocaleDateString(),
                totalSessions: data.sessions.length,
                treatmentDuration: this.calculateTreatmentDuration(data.sessions)
            }
        };
    }

    generateTreatmentOverview(data) {
        const overview = {
            title: 'Treatment Overview',
            content: {
                treatmentApproach: data.treatmentPlan?.approach || 'Custom Protocol',
                totalSessions: data.sessions.length,
                completedBlocks: this.getCompletedBlocks(data),
                protocolsUsed: this.getProtocolsUsed(data),
                averageSuccessRate: this.calculateOverallSuccessRate(data.sessions),
                treatmentOutcome: this.determineTreatmentOutcome(data),
                clinicalGoalsAchieved: this.assessGoalsAchievement(data)
            }
        };

        return overview;
    }

    generateInitialAssessment(data) {
        const initialAssessment = data.assessments[0];
        if (!initialAssessment) {
            return { title: 'Initial Assessment', content: { note: 'No initial assessment data available' } };
        }

        let assessmentData;
        try {
            assessmentData = typeof initialAssessment.doctor_notes === 'string' 
                ? JSON.parse(initialAssessment.doctor_notes) 
                : initialAssessment.doctor_notes;
        } catch (error) {
            return { title: 'Initial Assessment', content: { note: 'Assessment data could not be parsed' } };
        }

        return {
            title: 'Initial Assessment',
            content: {
                assessmentDate: new Date(initialAssessment.created_at).toLocaleDateString(),
                patientIssues: assessmentData.patient_issues || [],
                qeegFindings: this.formatQEEGFindings(assessmentData.qeeg_findings),
                disorderTests: this.formatDisorderTests(assessmentData.disorder_tests),
                clinicalObservation: assessmentData.clinical_observation || '',
                initialSeverity: this.calculateInitialSeverity(assessmentData)
            }
        };
    }

    generateTreatmentHistory(data) {
        const blocks = data.treatmentPlan?.blocks || [];
        const history = blocks.map(block => {
            const blockSessions = this.getBlockSessions(data.sessions, block);
            return {
                blockName: block.name,
                protocol: block.protocol,
                sessionRange: `${block.startSession}-${block.endSession}`,
                sessionsCompleted: blockSessions.length,
                avgSuccessRate: this.calculateAvgSuccessRate(blockSessions),
                duration: this.calculateBlockDuration(blockSessions),
                target: block.target,
                outcome: this.assessBlockOutcome(blockSessions, block)
            };
        });

        return {
            title: 'Treatment History',
            content: {
                blocks: history,
                checkpoints: this.formatCheckpoints(data.checkpoints),
                protocolTransitions: this.formatTransitions(data.transitions)
            }
        };
    }

    generateProtocolProgression(data) {
        const progression = [];
        const blocks = data.treatmentPlan?.blocks || [];
        
        blocks.forEach(block => {
            const blockSessions = this.getBlockSessions(data.sessions, block);
            if (blockSessions.length > 0) {
                progression.push({
                    phase: block.name,
                    protocol: block.protocol,
                    sessions: blockSessions.length,
                    avgSuccess: this.calculateAvgSuccessRate(blockSessions),
                    improvement: this.calculateBlockImprovement(blockSessions),
                    notes: block.notes || ''
                });
            }
        });

        return {
            title: 'Protocol Progression',
            content: {
                progression: progression,
                overallTrend: this.calculateOverallTrend(data.sessions),
                protocolEffectiveness: this.analyzeProtocolEffectiveness(data)
            }
        };
    }

    generateSessionAnalytics(data) {
        const sessions = data.sessions;
        
        return {
            title: 'Session Analytics',
            content: {
                totalSessions: sessions.length,
                averageSessionDuration: this.calculateAverageSessionDuration(sessions),
                overallSuccessRate: this.calculateOverallSuccessRate(sessions),
                averagePoints: this.calculateAveragePoints(sessions),
                artifactAnalysis: this.analyzeArtifacts(sessions),
                performanceMetrics: {
                    bestSession: this.findBestSession(sessions),
                    worstSession: this.findWorstSession(sessions),
                    consistencyScore: this.calculateConsistencyScore(sessions),
                    improvementRate: this.calculateImprovementRate(sessions)
                },
                sessionDistribution: this.analyzeSessionDistribution(sessions)
            }
        };
    }

    generateClinicalOutcomesSection(data) {
        return {
            title: 'Clinical Outcomes',
            content: this.generateClinicalOutcomes(data).sections.assessment_comparison
        };
    }

    generateProgressTrends(data) {
        const sessions = data.sessions;
        
        return {
            title: 'Progress Trends',
            content: {
                successRateTrend: this.analyzeSuccessRateTrend(sessions),
                sessionToSessionImprovement: this.analyzeSessionImprovement(sessions),
                plateauAnalysis: this.analyzePlateaus(sessions),
                breakthroughMoments: this.identifyBreakthroughs(sessions),
                trendPrediction: this.predictFutureProgress(sessions)
            }
        };
    }

    generateFinalAssessment(data) {
        const finalAssessment = data.assessments[data.assessments.length - 1];
        const initialAssessment = data.assessments[0];
        
        if (!finalAssessment || !initialAssessment) {
            return {
                title: 'Final Assessment',
                content: { note: 'Insufficient assessment data for comparison' }
            };
        }

        return {
            title: 'Final Assessment',
            content: {
                assessmentDate: new Date(finalAssessment.created_at).toLocaleDateString(),
                clinicalChanges: this.calculateAssessmentChanges(initialAssessment, finalAssessment),
                symptomResolution: this.analyzeSymptomResolution(data),
                functionalImprovements: this.assessFunctionalImprovements(data),
                treatmentResponse: this.classifyTreatmentResponse(data),
                finalSeverity: this.calculateFinalSeverity(finalAssessment)
            }
        };
    }

    generateTreatmentRecommendations(data) {
        const recommendations = [];
        
        // Analyze treatment outcome and provide recommendations
        const outcome = this.determineTreatmentOutcome(data);
        const successRate = this.calculateOverallSuccessRate(data.sessions);
        const assessmentImprovement = this.hasSignificantAssessmentImprovement(data);
        
        if (outcome === 'successful' && successRate > 70) {
            recommendations.push({
                type: 'maintenance',
                priority: 'medium',
                recommendation: 'Consider maintenance sessions every 2-4 weeks for 3 months to consolidate gains'
            });
        }
        
        if (successRate < 50) {
            recommendations.push({
                type: 'alternative',
                priority: 'high',
                recommendation: 'Consider alternative treatment approaches or medication consultation'
            });
        }
        
        if (assessmentImprovement) {
            recommendations.push({
                type: 'lifestyle',
                priority: 'medium',
                recommendation: 'Maintain regular sleep schedule and stress management practices to preserve improvements'
            });
        }
        
        // Add protocol-specific recommendations
        const protocolRecommendations = this.generateProtocolRecommendations(data);
        recommendations.push(...protocolRecommendations);
        
        return {
            title: 'Treatment Recommendations',
            content: {
                recommendations: recommendations,
                homeExercises: this.generateHomeExercises(data),
                lifestyleFactors: this.generateLifestyleRecommendations(data),
                relapsePrevention: this.generateRelapsePreventionPlan(data)
            }
        };
    }

    generateFollowUpPlan(data) {
        return {
            title: 'Follow-Up Plan',
            content: {
                followUpSchedule: this.createFollowUpSchedule(data),
                monitoringParameters: this.defineMonitoringParameters(data),
                reassessmentTimeline: this.createReassessmentTimeline(data),
                emergencyContacts: this.getEmergencyContacts(),
                supportResources: this.getSupportResources()
            }
        };
    }

    // ====================================
    // CLINICAL OUTCOMES REPORT
    // ====================================

    async generateClinicalOutcomes(data, options) {
        const report = {
            type: 'clinical_outcomes',
            title: 'Clinical Outcomes Analysis',
            generatedAt: new Date().toISOString(),
            patient: data.patient,
            sections: {},
            charts: {}
        };

        report.sections.patient_information = this.generatePatientInformation(data);
        report.sections.assessment_comparison = this.generateAssessmentComparison(data);
        report.sections.symptom_changes = this.analyzeSymptomChanges(data);
        report.sections.functional_improvements = this.analyzeFunctionalImprovements(data);
        report.sections.treatment_response = this.analyzeTreatmentResponse(data);
        report.sections.statistical_analysis = this.performStatisticalAnalysis(data);

        // Generate outcome-specific charts
        report.charts = await this.generateOutcomeCharts(data);

        return report;
    }

    generateAssessmentComparison(data) {
        const initial = data.assessments[0];
        const final = data.assessments[data.assessments.length - 1];
        
        if (!initial || !final) {
            return {
                title: 'Assessment Comparison',
                content: { error: 'Insufficient assessment data for comparison' }
            };
        }

        const initialScores = this.extractAssessmentScores(initial);
        const finalScores = this.extractAssessmentScores(final);
        const comparisons = {};

        Object.keys(initialScores).forEach(test => {
            if (finalScores[test] !== undefined) {
                const change = initialScores[test] - finalScores[test]; // Lower is better
                const percentChange = initialScores[test] > 0 ? (change / initialScores[test]) * 100 : 0;
                const significant = Math.abs(change) >= this.getSignificantChangeThreshold(test);

                comparisons[test] = {
                    initial: initialScores[test],
                    final: finalScores[test],
                    change: change,
                    percentChange: percentChange,
                    significant: significant,
                    interpretation: this.interpretChange(change, test)
                };
            }
        });

        return {
            title: 'Assessment Comparison',
            content: {
                timeframe: {
                    initial: new Date(initial.created_at).toLocaleDateString(),
                    final: new Date(final.created_at).toLocaleDateString(),
                    duration: this.calculateDaysBetween(initial.created_at, final.created_at)
                },
                comparisons: comparisons,
                summary: this.summarizeAssessmentChanges(comparisons),
                clinicalSignificance: this.assessClinicalSignificance(comparisons)
            }
        };
    }

    // ====================================
    // PROGRESS REPORT
    // ====================================

    async generateProgressReport(data, options) {
        const reportPeriod = options.reportPeriod || 'last_month';
        const filteredSessions = this.filterSessionsByPeriod(data.sessions, reportPeriod);

        const report = {
            type: 'progress_report',
            title: 'Neurofeedback Progress Report',
            generatedAt: new Date().toISOString(),
            reportPeriod: reportPeriod,
            patient: data.patient,
            sections: {},
            charts: {}
        };

        report.sections.patient_information = this.generatePatientInformation(data);
        report.sections.reporting_period = this.generateReportingPeriod(filteredSessions, reportPeriod);
        report.sections.recent_sessions = this.generateRecentSessions(filteredSessions);
        report.sections.progress_trends = this.generateProgressTrends({ ...data, sessions: filteredSessions });
        report.sections.clinical_changes = this.analyzeRecentClinicalChanges(data, reportPeriod);
        report.sections.protocol_adjustments = this.analyzeProtocolAdjustments(data, reportPeriod);
        report.sections.next_steps = this.generateNextSteps(data);

        report.charts = await this.generateProgressCharts(filteredSessions);

        return report;
    }

    // ====================================
    // CHART GENERATION
    // ====================================

    async generateReportCharts(data, reportType) {
        const charts = {};

        if (!this.chartLibrary) {
            return charts;
        }

        try {
            // Success Rate Trend Chart
            charts.successRateTrend = await this.createSuccessRateTrendChart(data.sessions);
            
            // Assessment Comparison Chart
            if (data.assessments.length >= 2) {
                charts.assessmentComparison = await this.createAssessmentComparisonChart(data.assessments);
            }
            
            // Protocol Effectiveness Chart
            if (data.treatmentPlan?.blocks) {
                charts.protocolEffectiveness = await this.createProtocolEffectivenessChart(data);
            }
            
            // Session Distribution Chart
            charts.sessionDistribution = await this.createSessionDistributionChart(data.sessions);
            
            if (reportType === 'discharge_summary') {
                // Add discharge-specific charts
                charts.treatmentTimeline = await this.createTreatmentTimelineChart(data);
                charts.overallProgress = await this.createOverallProgressChart(data);
            }
            
        } catch (error) {
            console.error('Error generating charts:', error);
        }

        return charts;
    }

    async createSuccessRateTrendChart(sessions) {
        if (sessions.length === 0) return null;

        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 400;
        
        const ctx = canvas.getContext('2d');
        
        const chart = new this.chartLibrary(ctx, {
            type: 'line',
            data: {
                labels: sessions.map((session, index) => `Session ${index + 1}`),
                datasets: [{
                    label: 'Success Rate (%)',
                    data: sessions.map(session => session.overall_success_rate || 0),
                    borderColor: '#10b981',
                    backgroundColor: '#10b98120',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.1
                }]
            },
            options: {
                responsive: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Session Success Rate Trend'
                    },
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        title: {
                            display: true,
                            text: 'Success Rate (%)'
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

        return {
            chart: chart,
            canvas: canvas,
            dataUrl: canvas.toDataURL()
        };
    }

    async createAssessmentComparisonChart(assessments) {
        if (assessments.length < 2) return null;

        const initial = this.extractAssessmentScores(assessments[0]);
        const final = this.extractAssessmentScores(assessments[assessments.length - 1]);
        const tests = Object.keys(initial).filter(test => final[test] !== undefined);

        if (tests.length === 0) return null;

        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 400;
        
        const ctx = canvas.getContext('2d');
        
        const chart = new this.chartLibrary(ctx, {
            type: 'bar',
            data: {
                labels: tests.map(test => test.toUpperCase()),
                datasets: [
                    {
                        label: 'Initial',
                        data: tests.map(test => initial[test]),
                        backgroundColor: '#ef4444',
                    },
                    {
                        label: 'Final',
                        data: tests.map(test => final[test]),
                        backgroundColor: '#10b981',
                    }
                ]
            },
            options: {
                responsive: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Assessment Score Comparison (Lower is Better)'
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

        return {
            chart: chart,
            canvas: canvas,
            dataUrl: canvas.toDataURL()
        };
    }

    // ====================================
    // UTILITY METHODS
    // ====================================

    calculateAge(dateOfBirth) {
        const today = new Date();
        const birthDate = new Date(dateOfBirth);
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        
        return age;
    }

    calculateTreatmentDuration(sessions) {
        if (sessions.length === 0) return 'N/A';
        
        const startDate = new Date(sessions[0].start_time);
        const endDate = new Date(sessions[sessions.length - 1].end_time || sessions[sessions.length - 1].start_time);
        const diffTime = Math.abs(endDate - startDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const weeks = Math.floor(diffDays / 7);
        const months = Math.floor(diffDays / 30);
        
        if (months > 0) {
            return `${months} month${months > 1 ? 's' : ''} (${weeks} weeks)`;
        } else if (weeks > 0) {
            return `${weeks} week${weeks > 1 ? 's' : ''}`;
        } else {
            return `${diffDays} day${diffDays > 1 ? 's' : ''}`;
        }
    }

    calculateOverallSuccessRate(sessions) {
        if (sessions.length === 0) return 0;
        
        const totalSuccessRate = sessions.reduce((sum, session) => sum + (session.overall_success_rate || 0), 0);
        return Math.round(totalSuccessRate / sessions.length * 100) / 100;
    }

    getCompletedBlocks(data) {
        const blocks = data.treatmentPlan?.blocks || [];
        const currentSession = data.sessions.length;
        
        return blocks.filter(block => currentSession >= block.endSession).length;
    }

    getProtocolsUsed(data) {
        const blocks = data.treatmentPlan?.blocks || [];
        const uniqueProtocols = [...new Set(blocks.map(block => block.protocol))];
        return uniqueProtocols;
    }

    determineTreatmentOutcome(data) {
        const successRate = this.calculateOverallSuccessRate(data.sessions);
        const assessmentImprovement = this.hasSignificantAssessmentImprovement(data);
        
        if (successRate >= 70 && assessmentImprovement) {
            return 'successful';
        } else if (successRate >= 50 || assessmentImprovement) {
            return 'partially_successful';
        } else {
            return 'limited_success';
        }
    }

    hasSignificantAssessmentImprovement(data) {
        if (data.assessments.length < 2) return false;
        
        const initial = this.extractAssessmentScores(data.assessments[0]);
        const final = this.extractAssessmentScores(data.assessments[data.assessments.length - 1]);
        
        return Object.keys(initial).some(test => {
            if (final[test] === undefined) return false;
            const change = initial[test] - final[test];
            return change >= this.getSignificantChangeThreshold(test);
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
            'gad7': 3,
            'phq9': 3,
            'rumination': 5,
            'trauma': 10,
            'inattention': 4
        };
        return thresholds[test] || 3;
    }

    interpretChange(change, test) {
        const threshold = this.getSignificantChangeThreshold(test);
        
        if (change >= threshold) {
            return 'significant_improvement';
        } else if (change > 0) {
            return 'mild_improvement';
        } else if (change === 0) {
            return 'no_change';
        } else if (change >= -threshold) {
            return 'mild_decline';
        } else {
            return 'significant_decline';
        }
    }

    getBlockSessions(sessions, block) {
        return sessions.filter(session => {
            const sessionNum = sessions.indexOf(session) + 1;
            return sessionNum >= block.startSession && sessionNum <= block.endSession;
        });
    }

    calculateAvgSuccessRate(sessions) {
        if (sessions.length === 0) return 0;
        return sessions.reduce((sum, s) => sum + (s.overall_success_rate || 0), 0) / sessions.length;
    }

    // ====================================
    // EXPORT FUNCTIONALITY
    // ====================================

    async exportReport(format = 'html') {
        if (!this.currentReport) {
            throw new Error('No report to export');
        }

        switch (format) {
            case 'html':
                return this.exportToHTML();
            case 'pdf':
                return this.exportToPDF();
            case 'json':
                return this.exportToJSON();
            case 'csv':
                return this.exportToCSV();
            default:
                throw new Error(`Unsupported export format: ${format}`);
        }
    }

    exportToHTML() {
        const html = this.generateHTMLReport(this.currentReport);
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.currentReport.type}-${this.currentReport.patient.id}-${new Date().toISOString().split('T')[0]}.html`;
        a.click();
        URL.revokeObjectURL(url);
        
        return { success: true, format: 'html' };
    }

    exportToJSON() {
        const json = JSON.stringify(this.currentReport, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.currentReport.type}-${this.currentReport.patient.id}-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        return { success: true, format: 'json' };
    }

    generateHTMLReport(report) {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${report.title}</title>
    <style>
        body { font-family: 'Inter', system-ui, sans-serif; line-height: 1.6; color: #333; max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; border-bottom: 2px solid #e5e7eb; padding-bottom: 20px; margin-bottom: 30px; }
        .section { margin-bottom: 30px; }
        .section-title { color: #1f2937; font-size: 1.5em; font-weight: 600; margin-bottom: 15px; border-left: 4px solid #3b82f6; padding-left: 15px; }
        .content-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
        .info-item { margin-bottom: 10px; }
        .info-label { font-weight: 600; color: #4b5563; }
        .info-value { color: #1f2937; }
        .chart-container { text-align: center; margin: 20px 0; }
        .chart-container img { max-width: 100%; height: auto; border: 1px solid #e5e7eb; border-radius: 8px; }
        .table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        .table th, .table td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
        .table th { background-color: #f9fafb; font-weight: 600; }
        .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 0.9em; }
    </style>
</head>
<body>
    <div class="header">
        <h1>${report.title}</h1>
        <p>Generated on ${new Date(report.generatedAt).toLocaleDateString()}</p>
        <p>Patient: ${report.patient.first_name} ${report.patient.last_name} (ID: ${report.patient.id})</p>
    </div>

    ${Object.entries(report.sections).map(([key, section]) => `
        <div class="section">
            <h2 class="section-title">${section.title}</h2>
            ${this.renderSectionContent(section.content)}
        </div>
    `).join('')}

    <div class="footer">
        <p>This report was generated by the Neurofeedback Treatment System</p>
        <p>Report Type: ${report.type} | Generated by: ${report.generatedBy || 'System'}</p>
    </div>
</body>
</html>
        `;
    }

    renderSectionContent(content) {
        if (typeof content === 'string') {
            return `<p>${content}</p>`;
        }

        if (Array.isArray(content)) {
            return `<ul>${content.map(item => `<li>${item}</li>`).join('')}</ul>`;
        }

        if (typeof content === 'object' && content !== null) {
            return Object.entries(content).map(([key, value]) => {
                if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    return `<h4>${key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</h4>${this.renderSectionContent(value)}`;
                } else if (Array.isArray(value)) {
                    return `<p><span class="info-label">${key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:</span> ${value.join(', ')}</p>`;
                } else {
                    return `<p><span class="info-label">${key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:</span> <span class="info-value">${value}</span></p>`;
                }
            }).join('');
        }

        return `<p>${content}</p>`;
    }

    // ====================================
    // UI INTERFACE
    // ====================================

    createReportingInterface() {
        // Create reporting interface in the main application
        this.addReportingNavigation();
    }

    addReportingNavigation() {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;

        // Find or create reports section
        let reportsSection = sidebar.querySelector('.nav-section.reports');
        if (!reportsSection) {
            reportsSection = document.createElement('div');
            reportsSection.className = 'nav-section reports';
            reportsSection.innerHTML = `
                <h3>Reports</h3>
                <button class="nav-item" data-view="reports">
                    <span class="icon" data-lucide="file-text"></span>
                    Generate Reports
                </button>
            `;
            sidebar.appendChild(reportsSection);
        }

        // Create reports view
        this.createReportsView();

        // Refresh icons
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            setTimeout(() => lucide.createIcons(), 100);
        }
    }

    createReportsView() {
        const mainContent = document.getElementById('mainContent');
        if (!mainContent) return;

        let reportsView = document.getElementById('reports-view');
        if (reportsView) return;

        reportsView = document.createElement('div');
        reportsView.className = 'view';
        reportsView.id = 'reports-view';

        reportsView.innerHTML = `
            <div class="view-header">
                <h2>Report Generation</h2>
            </div>

            <div class="reports-section">
                <div class="section-header">
                    <h3>Generate Report</h3>
                </div>
                
                <div class="report-form">
                    <div class="form-row">
                        <div class="form-group">
                            <label for="reportPatientSelect">Select Patient</label>
                            <select id="reportPatientSelect" class="form-control">
                                <option value="">Choose a patient...</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="reportTypeSelect">Report Type</label>
                            <select id="reportTypeSelect" class="form-control">
                                ${Object.entries(this.reportTypes).map(([key, name]) => 
                                    `<option value="${key}">${name}</option>`
                                ).join('')}
                            </select>
                        </div>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="reportFormatSelect">Export Format</label>
                            <select id="reportFormatSelect" class="form-control">
                                ${this.exportFormats.map(format => 
                                    `<option value="${format}">${format.toUpperCase()}</option>`
                                ).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="clinicianName">Clinician Name</label>
                            <input type="text" id="clinicianName" class="form-control" placeholder="Enter clinician name">
                        </div>
                    </div>
                    
                    <div class="form-actions">
                        <button id="generateReportBtn" class="btn btn-primary">Generate Report</button>
                        <button id="previewReportBtn" class="btn btn-secondary">Preview</button>
                    </div>
                </div>
                
                <div id="reportPreview" class="report-preview" style="display: none;">
                    <h4>Report Preview</h4>
                    <div id="reportPreviewContent"></div>
                    <div class="preview-actions">
                        <button id="exportReportBtn" class="btn btn-primary">Export Report</button>
                    </div>
                </div>
            </div>
        `;

        mainContent.appendChild(reportsView);
        this.bindReportingEvents();
    }

    bindReportingEvents() {
        // Load patient list
        this.loadPatientListForReports();

        // Generate report
        document.getElementById('generateReportBtn')?.addEventListener('click', async () => {
            await this.handleGenerateReport();
        });

        // Preview report
        document.getElementById('previewReportBtn')?.addEventListener('click', async () => {
            await this.handlePreviewReport();
        });

        // Export report
        document.getElementById('exportReportBtn')?.addEventListener('click', async () => {
            await this.handleExportReport();
        });
    }

    async loadPatientListForReports() {
        try {
            const patients = await window.api.getAllPatients();
            const select = document.getElementById('reportPatientSelect');
            if (!select) return;

            select.innerHTML = '<option value="">Choose a patient...</option>';

            patients.forEach(patient => {
                const option = document.createElement('option');
                option.value = patient.id;
                option.textContent = `${patient.first_name} ${patient.last_name}`;
                select.appendChild(option);
            });
        } catch (error) {
            console.error('Error loading patients for reports:', error);
        }
    }

    async handleGenerateReport() {
        const patientId = document.getElementById('reportPatientSelect')?.value;
        const reportType = document.getElementById('reportTypeSelect')?.value;
        const clinicianName = document.getElementById('clinicianName')?.value;

        if (!patientId || !reportType) {
            alert('Please select a patient and report type');
            return;
        }

        try {
            const options = {
                clinicianName: clinicianName,
                includeProtocolSummaries: true,
                includeTransitions: true
            };

            this.currentReport = await this.generateReport(reportType, patientId, options);
            
            // Show preview
            this.showReportPreview();
            
        } catch (error) {
            console.error('Error generating report:', error);
            alert('Failed to generate report: ' + error.message);
        }
    }

    async handlePreviewReport() {
        await this.handleGenerateReport();
    }

    async handleExportReport() {
        if (!this.currentReport) {
            alert('No report to export');
            return;
        }

        const format = document.getElementById('reportFormatSelect')?.value || 'html';

        try {
            const result = await this.exportReport(format);
            if (result.success) {
                alert(`Report exported successfully as ${format.toUpperCase()}`);
            }
        } catch (error) {
            console.error('Error exporting report:', error);
            alert('Failed to export report: ' + error.message);
        }
    }

    showReportPreview() {
        const preview = document.getElementById('reportPreview');
        const content = document.getElementById('reportPreviewContent');
        
        if (!preview || !content || !this.currentReport) return;

        // Generate simple preview
        content.innerHTML = `
            <div class="report-summary">
                <h3>${this.currentReport.title}</h3>
                <p><strong>Patient:</strong> ${this.currentReport.patient.first_name} ${this.currentReport.patient.last_name}</p>
                <p><strong>Generated:</strong> ${new Date(this.currentReport.generatedAt).toLocaleDateString()}</p>
                <p><strong>Sections:</strong> ${Object.keys(this.currentReport.sections).length}</p>
                <p><strong>Charts:</strong> ${Object.keys(this.currentReport.charts || {}).length}</p>
            </div>
        `;

        preview.style.display = 'block';
    }

    setupEventListeners() {
        // Navigation event listener for reports view
        document.addEventListener('click', (e) => {
            if (e.target.matches('[data-view="reports"]')) {
                this.loadPatientListForReports();
            }
        });
    }
}

// Make it globally available
window.ComprehensiveReporting = ComprehensiveReporting;
