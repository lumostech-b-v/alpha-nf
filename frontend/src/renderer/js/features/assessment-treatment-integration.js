/**
 * Assessment-to-Treatment Integration
 * Creates automatic protocol suggestions based on QEEG findings and assessment results
 * Mimics clinical decision-making like Sarah's anxiety/rumination leading to specific protocols
 */

class AssessmentTreatmentIntegration {
    constructor() {
        this.protocolDatabase = this.initializeProtocolDatabase();
        this.scenarioDatabase = this.initializeScenarioDatabase();
        this.qeegProtocolMapping = this.initializeQEEGMapping();
        this.disorderProtocolMapping = this.initializeDisorderMapping();
        this.combinationRules = this.initializeCombinationRules();
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.createSuggestionInterface();
    }

    // ====================================
    // DATABASE INITIALIZATION
    // ====================================

    initializeProtocolDatabase() {
        return {
            'P1_frontal_activation': {
                name: 'P1 - Frontal Activation',
                location: 'F3',
                rewardFreq: '15-18',
                inhibitFreq: '8-12',
                target: 'Reduce rumination, improve focus',
                indications: ['rumination', 'executive_function', 'attention'],
                contraindications: ['seizure_history'],
                duration: 6,
                description: 'Activates left frontal cortex to improve executive function and reduce rumination'
            },
            'P2_calm_arousal': {
                name: 'P2 - Calm Arousal',
                location: 'Pz',
                rewardFreq: '15-18',
                inhibitFreq: '8-12',
                target: 'Decrease agitation, improve sleep',
                indications: ['anxiety', 'sleep_issues', 'hyperarousal'],
                contraindications: ['depression_severe'],
                duration: 9,
                description: 'Promotes calm alertness and reduces physiological arousal'
            },
            'P3_alpha_enhancement': {
                name: 'P3 - Alpha Enhancement',
                location: 'Pz',
                rewardFreq: '8-12',
                inhibitFreq: '15-30',
                target: 'Promote relaxation, reduce anxiety',
                indications: ['anxiety', 'stress', 'tension'],
                contraindications: ['depression'],
                duration: 8,
                description: 'Enhances alpha waves for relaxation and anxiety reduction'
            },
            'P4_beta_training': {
                name: 'P4 - Beta Training',
                location: 'C3',
                rewardFreq: '12-15',
                inhibitFreq: '4-8',
                target: 'Improve attention, reduce hyperactivity',
                indications: ['adhd', 'attention_deficit', 'hyperactivity'],
                contraindications: ['anxiety_severe'],
                duration: 12,
                description: 'Trains beta waves to improve focus and attention'
            },
            'P5_smr_training': {
                name: 'P5 - SMR Training',
                location: 'C4',
                rewardFreq: '12-15',
                inhibitFreq: '4-8, 22-30',
                target: 'Stabilize mood, improve sleep',
                indications: ['sleep_disorders', 'seizure_control', 'emotional_regulation'],
                contraindications: [],
                duration: 10,
                description: 'Sensorimotor rhythm training for stability and regulation'
            },
            'P6_gamma_coherence': {
                name: 'P6 - Gamma Coherence',
                location: 'Multiple',
                rewardFreq: '40-100',
                inhibitFreq: '4-12',
                target: 'Enhance cognitive performance',
                indications: ['cognitive_enhancement', 'memory_issues', 'processing_speed'],
                contraindications: ['seizure_history'],
                duration: 6,
                description: 'Gamma wave training for cognitive enhancement'
            },
            'P7_tbr_reduction': {
                name: 'P7 - TBR Reduction',
                location: 'Cz',
                rewardFreq: '15-18',
                inhibitFreq: '4-8',
                target: 'Reduce theta/beta ratio for attention',
                indications: ['high_tbr', 'attention_issues', 'adhd'],
                contraindications: ['anxiety_severe'],
                duration: 8,
                description: 'Reduces theta/beta ratio commonly elevated in ADHD'
            },
            'P8_coherence_training': {
                name: 'P8 - Coherence Training',
                location: 'F3-F4',
                rewardFreq: 'Coherence',
                inhibitFreq: 'Incoherence',
                target: 'Improve brain connectivity',
                indications: ['coherence_issues', 'processing_issues', 'integration_problems'],
                contraindications: [],
                duration: 10,
                description: 'Trains inter-hemispheric coherence and connectivity'
            }
        };
    }

    initializeScenarioDatabase() {
        return {
            'anxiety_rumination': {
                name: 'Anxiety & Rumination Treatment',
                description: 'Comprehensive treatment for anxiety with rumination patterns',
                blocks: [
                    {
                        name: 'Block 1: Frontal Activation',
                        protocol: 'P1_frontal_activation',
                        sessions: '1-6',
                        startSession: 1,
                        endSession: 6,
                        target: 'Reduce rumination, improve focus'
                    },
                    {
                        name: 'Block 2: Calm Arousal',
                        protocol: 'P2_calm_arousal',
                        sessions: '7-15',
                        startSession: 7,
                        endSession: 15,
                        target: 'Decrease agitation, improve sleep'
                    }
                ],
                checkpoints: [
                    { session: 10, type: 'progress_review', description: 'Re-assess with GAD-7, review QEEG if needed' },
                    { session: 16, type: 'comprehensive_review', description: 'Comprehensive re-assessment, define Block 3 if needed' }
                ],
                indications: ['anxiety', 'rumination', 'sleep_issues'],
                expectedOutcomes: ['reduced_anxiety', 'better_sleep', 'less_rumination']
            },
            'adhd_comprehensive': {
                name: 'ADHD Comprehensive Treatment',
                description: 'Multi-phase ADHD treatment with attention and impulse control focus',
                blocks: [
                    {
                        name: 'Block 1: TBR Reduction',
                        protocol: 'P7_tbr_reduction',
                        sessions: '1-8',
                        startSession: 1,
                        endSession: 8,
                        target: 'Reduce theta/beta ratio'
                    },
                    {
                        name: 'Block 2: Beta Training',
                        protocol: 'P4_beta_training',
                        sessions: '9-20',
                        startSession: 9,
                        endSession: 20,
                        target: 'Improve sustained attention'
                    }
                ],
                checkpoints: [
                    { session: 8, type: 'tbr_reassessment', description: 'Check TBR reduction progress' },
                    { session: 15, type: 'attention_assessment', description: 'Assess attention improvements' }
                ],
                indications: ['adhd', 'high_tbr', 'attention_deficit'],
                expectedOutcomes: ['better_focus', 'reduced_hyperactivity', 'improved_impulse_control']
            },
            'depression_activation': {
                name: 'Depression Activation Protocol',
                description: 'Left frontal activation for depression treatment',
                blocks: [
                    {
                        name: 'Block 1: Frontal Activation',
                        protocol: 'P1_frontal_activation',
                        sessions: '1-10',
                        startSession: 1,
                        endSession: 10,
                        target: 'Increase left frontal activity'
                    },
                    {
                        name: 'Block 2: Mood Stabilization',
                        protocol: 'P5_smr_training',
                        sessions: '11-20',
                        startSession: 11,
                        endSession: 20,
                        target: 'Stabilize mood and regulate emotions'
                    }
                ],
                checkpoints: [
                    { session: 10, type: 'depression_assessment', description: 'Re-administer PHQ-9 and assess mood changes' },
                    { session: 16, type: 'mood_stability_check', description: 'Evaluate mood stability and regulation' }
                ],
                indications: ['depression', 'low_frontal_activity', 'mood_dysregulation'],
                expectedOutcomes: ['improved_mood', 'better_emotional_regulation', 'increased_motivation']
            },
            'sleep_disorders': {
                name: 'Sleep Disorder Treatment',
                description: 'SMR-based protocol for sleep improvement',
                blocks: [
                    {
                        name: 'Block 1: SMR Training',
                        protocol: 'P5_smr_training',
                        sessions: '1-12',
                        startSession: 1,
                        endSession: 12,
                        target: 'Improve sleep quality and duration'
                    },
                    {
                        name: 'Block 2: Alpha Enhancement',
                        protocol: 'P3_alpha_enhancement',
                        sessions: '13-20',
                        startSession: 13,
                        endSession: 20,
                        target: 'Promote relaxation and sleep onset'
                    }
                ],
                checkpoints: [
                    { session: 8, type: 'sleep_assessment', description: 'Assess sleep quality improvements' },
                    { session: 16, type: 'sleep_maintenance', description: 'Evaluate sleep maintenance and overall quality' }
                ],
                indications: ['sleep_disorders', 'insomnia', 'poor_sleep_quality'],
                expectedOutcomes: ['better_sleep_onset', 'improved_sleep_quality', 'reduced_night_awakenings']
            }
        };
    }

    initializeQEEGMapping() {
        return {
            'left_alpha_excess': {
                primaryProtocols: ['P1_frontal_activation'],
                secondaryProtocols: ['P4_beta_training'],
                reasoning: 'Excess alpha in left hemisphere often indicates underactivation, requiring activation protocols'
            },
            'frontal_beta_low': {
                primaryProtocols: ['P1_frontal_activation', 'P4_beta_training'],
                secondaryProtocols: ['P7_tbr_reduction'],
                reasoning: 'Low frontal beta suggests poor executive function and attention, requiring beta enhancement'
            },
            'high_beta_high': {
                primaryProtocols: ['P2_calm_arousal', 'P3_alpha_enhancement'],
                secondaryProtocols: ['P5_smr_training'],
                reasoning: 'High beta indicates hyperarousal and anxiety, requiring calming protocols'
            },
            'high_tbr': {
                primaryProtocols: ['P7_tbr_reduction', 'P4_beta_training'],
                secondaryProtocols: ['P1_frontal_activation'],
                reasoning: 'High theta/beta ratio is classic ADHD pattern, requires TBR reduction'
            },
            'paf_slow': {
                primaryProtocols: ['P3_alpha_enhancement', 'P6_gamma_coherence'],
                secondaryProtocols: ['P1_frontal_activation'],
                reasoning: 'Slow peak alpha frequency may indicate cognitive slowing, requires activation'
            },
            'coherence': {
                primaryProtocols: ['P8_coherence_training'],
                secondaryProtocols: ['P6_gamma_coherence'],
                reasoning: 'Coherence issues require specific connectivity training protocols'
            },
            'isi': {
                primaryProtocols: ['P5_smr_training', 'P8_coherence_training'],
                secondaryProtocols: ['P3_alpha_enhancement'],
                reasoning: 'ISI (inter-stimulus interval) issues suggest timing problems, requiring stabilization'
            }
        };
    }

    initializeDisorderMapping() {
        return {
            'gad7': {
                mild: { protocols: ['P3_alpha_enhancement'], scenarios: [] },
                moderate: { protocols: ['P2_calm_arousal', 'P3_alpha_enhancement'], scenarios: ['anxiety_rumination'] },
                severe: { protocols: ['P2_calm_arousal'], scenarios: ['anxiety_rumination'] }
            },
            'phq9': {
                mild: { protocols: ['P1_frontal_activation'], scenarios: [] },
                moderate: { protocols: ['P1_frontal_activation', 'P5_smr_training'], scenarios: ['depression_activation'] },
                severe: { protocols: ['P1_frontal_activation'], scenarios: ['depression_activation'] }
            },
            'rumination': {
                present: { protocols: ['P1_frontal_activation'], scenarios: ['anxiety_rumination'] }
            },
            'trauma': {
                present: { protocols: ['P5_smr_training', 'P3_alpha_enhancement'], scenarios: [] }
            },
            'inattention': {
                mild: { protocols: ['P4_beta_training'], scenarios: [] },
                moderate: { protocols: ['P7_tbr_reduction', 'P4_beta_training'], scenarios: ['adhd_comprehensive'] },
                severe: { protocols: ['P7_tbr_reduction'], scenarios: ['adhd_comprehensive'] }
            }
        };
    }

    initializeCombinationRules() {
        return [
            {
                conditions: ['anxiety', 'rumination', 'sleep_issues'],
                scenario: 'anxiety_rumination',
                priority: 'high',
                reasoning: 'Classic anxiety-rumination-sleep disruption pattern requires sequential frontal activation and calming'
            },
            {
                conditions: ['high_tbr', 'attention_deficit', 'hyperactivity'],
                scenario: 'adhd_comprehensive',
                priority: 'high',
                reasoning: 'ADHD presentation with elevated TBR requires comprehensive attention training'
            },
            {
                conditions: ['depression', 'low_frontal_activity'],
                scenario: 'depression_activation',
                priority: 'high',
                reasoning: 'Depression with frontal hypoactivation requires activation protocols'
            },
            {
                conditions: ['sleep_disorders', 'poor_sleep_quality'],
                scenario: 'sleep_disorders',
                priority: 'medium',
                reasoning: 'Primary sleep issues benefit from SMR training and relaxation protocols'
            },
            {
                conditions: ['anxiety', 'high_beta_high'],
                protocols: ['P2_calm_arousal', 'P3_alpha_enhancement'],
                priority: 'medium',
                reasoning: 'Anxiety with high beta requires immediate arousal reduction'
            },
            {
                conditions: ['frontal_beta_low', 'executive_dysfunction'],
                protocols: ['P1_frontal_activation', 'P4_beta_training'],
                priority: 'medium',
                reasoning: 'Executive dysfunction with low frontal beta needs activation training'
            }
        ];
    }

    // ====================================
    // MAIN ANALYSIS ENGINE
    // ====================================

    async analyzeAssessmentAndSuggestTreatment(patientId) {
        try {
            // Load assessment data
            const assessmentData = await this.loadPatientAssessmentData(patientId);
            
            // Extract clinical indicators
            const indicators = this.extractClinicalIndicators(assessmentData);
            
            // Generate protocol suggestions
            const protocolSuggestions = this.generateProtocolSuggestions(indicators);
            
            // Generate scenario suggestions
            const scenarioSuggestions = this.generateScenarioSuggestions(indicators);
            
            // Create integrated treatment plan
            const treatmentPlan = this.createIntegratedTreatmentPlan(
                indicators, 
                protocolSuggestions, 
                scenarioSuggestions
            );
            
            return {
                indicators,
                protocolSuggestions,
                scenarioSuggestions,
                treatmentPlan,
                confidence: this.calculateConfidence(indicators, protocolSuggestions),
                reasoning: this.generateReasoning(indicators, treatmentPlan)
            };
            
        } catch (error) {
            console.error('Error analyzing assessment:', error);
            throw error;
        }
    }

    async loadPatientAssessmentData(patientId) {
        const assessments = await window.api.getAssessmentByPatient(patientId);
        const patient = await window.api.getPatient(patientId);
        const sessions = await window.api.getSessionsByPatient(patientId);
        
        return {
            patient,
            assessments,
            sessions,
            latestAssessment: assessments[assessments.length - 1]
        };
    }

    extractClinicalIndicators(assessmentData) {
        const indicators = {
            qeegFindings: [],
            disorderScores: {},
            symptoms: [],
            severityLevels: {},
            riskFactors: [],
            patientIssues: []
        };

        if (!assessmentData.latestAssessment) {
            return indicators;
        }

        try {
            const notes = typeof assessmentData.latestAssessment.doctor_notes === 'string'
                ? JSON.parse(assessmentData.latestAssessment.doctor_notes)
                : assessmentData.latestAssessment.doctor_notes;

            // Extract QEEG findings
            if (notes.qeeg_findings) {
                Object.keys(notes.qeeg_findings).forEach(finding => {
                    if (notes.qeeg_findings[finding] === true) {
                        indicators.qeegFindings.push(finding);
                    }
                });
            }

            // Extract disorder test scores
            if (notes.disorder_tests) {
                Object.keys(notes.disorder_tests).forEach(test => {
                    const testData = notes.disorder_tests[test];
                    if (testData.administered && testData.score !== undefined) {
                        const score = parseFloat(testData.score);
                        indicators.disorderScores[test] = score;
                        indicators.severityLevels[test] = this.categorizeScore(test, score);
                    }
                });
            }

            // Extract patient issues
            if (notes.patient_issues && Array.isArray(notes.patient_issues)) {
                indicators.patientIssues = notes.patient_issues.map(issue => ({
                    issue: issue.issue.toLowerCase(),
                    severity: issue.severity.toLowerCase(),
                    note: issue.note
                }));

                // Convert issues to symptoms
                indicators.symptoms = indicators.patientIssues.map(item => item.issue);
            }

            // Extract risk factors from clinical observation
            if (notes.clinical_observation) {
                indicators.riskFactors = this.extractRiskFactors(notes.clinical_observation);
            }

        } catch (error) {
            console.error('Error extracting clinical indicators:', error);
        }

        return indicators;
    }

    categorizeScore(test, score) {
        const categories = {
            'gad7': { mild: [0, 7], moderate: [8, 14], severe: [15, 21] },
            'phq9': { mild: [0, 9], moderate: [10, 19], severe: [20, 27] },
            'rumination': { mild: [0, 20], moderate: [21, 40], severe: [41, 100] },
            'trauma': { mild: [0, 30], moderate: [31, 60], severe: [61, 100] },
            'inattention': { mild: [0, 20], moderate: [21, 40], severe: [41, 100] }
        };

        const testCategories = categories[test];
        if (!testCategories) return 'unknown';

        if (score <= testCategories.mild[1]) return 'mild';
        if (score <= testCategories.moderate[1]) return 'moderate';
        return 'severe';
    }

    extractRiskFactors(clinicalObservation) {
        const riskFactors = [];
        const text = clinicalObservation.toLowerCase();

        // Pattern matching for common risk factors
        if (text.includes('seizure') || text.includes('epilepsy')) {
            riskFactors.push('seizure_history');
        }
        if (text.includes('medication') && text.includes('change')) {
            riskFactors.push('medication_changes');
        }
        if (text.includes('suicidal') || text.includes('self-harm')) {
            riskFactors.push('suicide_risk');
        }
        if (text.includes('substance') || text.includes('alcohol') || text.includes('drug')) {
            riskFactors.push('substance_use');
        }

        return riskFactors;
    }

    // ====================================
    // SUGGESTION GENERATION
    // ====================================

    generateProtocolSuggestions(indicators) {
        const suggestions = [];
        const scored_protocols = {};

        // Score protocols based on QEEG findings
        indicators.qeegFindings.forEach(finding => {
            const mapping = this.qeegProtocolMapping[finding];
            if (mapping) {
                mapping.primaryProtocols.forEach(protocol => {
                    scored_protocols[protocol] = (scored_protocols[protocol] || 0) + 3;
                });
                mapping.secondaryProtocols.forEach(protocol => {
                    scored_protocols[protocol] = (scored_protocols[protocol] || 0) + 1;
                });
            }
        });

        // Score protocols based on disorder test results
        Object.keys(indicators.severityLevels).forEach(test => {
            const severity = indicators.severityLevels[test];
            const mapping = this.disorderProtocolMapping[test];
            if (mapping && mapping[severity]) {
                mapping[severity].protocols.forEach(protocol => {
                    scored_protocols[protocol] = (scored_protocols[protocol] || 0) + 2;
                });
            }
        });

        // Score protocols based on symptoms
        indicators.symptoms.forEach(symptom => {
            Object.keys(this.protocolDatabase).forEach(protocolId => {
                const protocol = this.protocolDatabase[protocolId];
                if (protocol.indications.includes(symptom)) {
                    scored_protocols[protocolId] = (scored_protocols[protocolId] || 0) + 1;
                }
            });
        });

        // Apply contraindication penalties
        Object.keys(scored_protocols).forEach(protocolId => {
            const protocol = this.protocolDatabase[protocolId];
            indicators.riskFactors.forEach(riskFactor => {
                if (protocol.contraindications.includes(riskFactor)) {
                    scored_protocols[protocolId] -= 5;
                }
            });
        });

        // Sort and format suggestions
        const sorted = Object.entries(scored_protocols)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5);

        sorted.forEach(([protocolId, score]) => {
            if (score > 0) {
                const protocol = this.protocolDatabase[protocolId];
                suggestions.push({
                    id: protocolId,
                    protocol: protocol,
                    score: score,
                    confidence: this.calculateProtocolConfidence(protocolId, indicators),
                    reasoning: this.generateProtocolReasoning(protocolId, indicators),
                    suitability: score >= 4 ? 'high' : score >= 2 ? 'medium' : 'low'
                });
            }
        });

        return suggestions;
    }

    generateScenarioSuggestions(indicators) {
        const suggestions = [];
        const scored_scenarios = {};

        // Apply combination rules
        this.combinationRules.forEach(rule => {
            if (rule.scenario) {
                const matches = rule.conditions.filter(condition => 
                    this.conditionMatches(condition, indicators)
                ).length;
                
                if (matches >= rule.conditions.length * 0.7) { // 70% match threshold
                    const score = matches / rule.conditions.length * (rule.priority === 'high' ? 3 : 2);
                    scored_scenarios[rule.scenario] = Math.max(scored_scenarios[rule.scenario] || 0, score);
                }
            }
        });

        // Check scenario indications directly
        Object.keys(this.scenarioDatabase).forEach(scenarioId => {
            const scenario = this.scenarioDatabase[scenarioId];
            const matches = scenario.indications.filter(indication =>
                indicators.symptoms.includes(indication) ||
                indicators.qeegFindings.includes(indication)
            ).length;

            if (matches > 0) {
                scored_scenarios[scenarioId] = (scored_scenarios[scenarioId] || 0) + matches * 0.5;
            }
        });

        // Sort and format suggestions
        const sorted = Object.entries(scored_scenarios)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 3);

        sorted.forEach(([scenarioId, score]) => {
            if (score > 0) {
                const scenario = this.scenarioDatabase[scenarioId];
                suggestions.push({
                    id: scenarioId,
                    scenario: scenario,
                    score: score,
                    confidence: score >= 2 ? 'high' : score >= 1 ? 'medium' : 'low',
                    reasoning: this.generateScenarioReasoning(scenarioId, indicators),
                    applicability: score >= 2 ? 'highly_applicable' : 'moderately_applicable'
                });
            }
        });

        return suggestions;
    }

    conditionMatches(condition, indicators) {
        // Check if condition matches patient indicators
        return indicators.symptoms.includes(condition) ||
               indicators.qeegFindings.includes(condition) ||
               Object.keys(indicators.severityLevels).includes(condition) ||
               indicators.patientIssues.some(issue => issue.issue === condition);
    }

    // ====================================
    // TREATMENT PLAN CREATION
    // ====================================

    createIntegratedTreatmentPlan(indicators, protocolSuggestions, scenarioSuggestions) {
        let treatmentPlan = {
            approach: 'custom',
            totalSessions: 20,
            blocks: [],
            checkpoints: [],
            protocols: [],
            reasoning: []
        };

        // If we have a high-confidence scenario, use it as a base
        const bestScenario = scenarioSuggestions.find(s => s.confidence === 'high');
        if (bestScenario) {
            treatmentPlan = this.adaptScenarioToPlan(bestScenario, indicators);
            treatmentPlan.reasoning.push(`Selected ${bestScenario.scenario.name} based on clinical presentation`);
        } else {
            // Build custom plan from protocol suggestions
            treatmentPlan = this.buildCustomTreatmentPlan(indicators, protocolSuggestions);
        }

        // Add adaptive elements
        treatmentPlan.adaptiveFeatures = this.addAdaptiveFeatures(indicators);
        
        // Calculate expected duration
        treatmentPlan.expectedDuration = this.calculateExpectedDuration(treatmentPlan);

        return treatmentPlan;
    }

    adaptScenarioToPlan(bestScenario, indicators) {
        const scenario = bestScenario.scenario;
        const plan = {
            approach: 'scenario_based',
            scenarioId: bestScenario.id,
            scenarioName: scenario.name,
            totalSessions: scenario.blocks.reduce((sum, block) => sum + (block.endSession - block.startSession + 1), 0),
            blocks: JSON.parse(JSON.stringify(scenario.blocks)), // Deep copy
            checkpoints: JSON.parse(JSON.stringify(scenario.checkpoints)),
            protocols: scenario.blocks.map(block => this.protocolDatabase[block.protocol]),
            reasoning: [`Applied ${scenario.name} scenario`]
        };

        // Adapt based on severity
        const severities = Object.values(indicators.severityLevels);
        if (severities.includes('severe')) {
            plan.totalSessions += 5; // Extend for severe cases
            plan.blocks.forEach(block => {
                block.endSession += Math.ceil((block.endSession - block.startSession + 1) * 0.25);
            });
            plan.reasoning.push('Extended duration due to severe symptom presentation');
        }

        return plan;
    }

    buildCustomTreatmentPlan(indicators, protocolSuggestions) {
        const plan = {
            approach: 'custom_protocol',
            totalSessions: 15,
            blocks: [],
            checkpoints: [],
            protocols: [],
            reasoning: ['Custom treatment plan built from protocol analysis']
        };

        // Select top 2-3 protocols
        const topProtocols = protocolSuggestions
            .filter(p => p.suitability !== 'low')
            .slice(0, 3);

        let currentSession = 1;
        topProtocols.forEach((suggestion, index) => {
            const protocol = suggestion.protocol;
            const blockSize = Math.max(4, Math.min(8, protocol.duration));
            
            const block = {
                name: `Block ${index + 1}: ${protocol.name}`,
                protocol: suggestion.id,
                startSession: currentSession,
                endSession: currentSession + blockSize - 1,
                target: protocol.target,
                reasoning: suggestion.reasoning
            };
            
            plan.blocks.push(block);
            plan.protocols.push(protocol);
            currentSession += blockSize;
            
            // Add checkpoint after each block
            if (index < topProtocols.length - 1) {
                plan.checkpoints.push({
                    session: block.endSession + 1,
                    type: 'progress_review',
                    description: `Assess progress with ${protocol.name} and prepare for next phase`
                });
            }
        });

        plan.totalSessions = currentSession - 1;
        return plan;
    }

    addAdaptiveFeatures(indicators) {
        const features = {
            baselineAdjustment: true,
            thresholdAdaptation: true,
            protocolSwitching: false,
            reinforcementSchedule: 'continuous'
        };

        // Adjust based on patient characteristics
        if (indicators.symptoms.includes('anxiety')) {
            features.gentleOnboarding = true;
            features.relaxationBreaks = true;
        }

        if (indicators.symptoms.includes('adhd') || indicators.symptoms.includes('attention')) {
            features.shorterSessions = true;
            features.frequentBreaks = true;
            features.reinforcementSchedule = 'variable';
        }

        if (indicators.severityLevels && Object.values(indicators.severityLevels).includes('severe')) {
            features.protocolSwitching = true;
            features.intensiveMonitoring = true;
        }

        return features;
    }

    calculateExpectedDuration(treatmentPlan) {
        const baseDuration = treatmentPlan.totalSessions;
        const weeksEstimate = Math.ceil(baseDuration / 2.5); // 2-3 sessions per week
        
        return {
            sessions: baseDuration,
            weeks: weeksEstimate,
            months: Math.ceil(weeksEstimate / 4)
        };
    }

    // ====================================
    // CONFIDENCE AND REASONING
    // ====================================

    calculateProtocolConfidence(protocolId, indicators) {
        const protocol = this.protocolDatabase[protocolId];
        let confidence = 0;

        // QEEG evidence
        const qeegSupport = indicators.qeegFindings.filter(finding => {
            const mapping = this.qeegProtocolMapping[finding];
            return mapping && (
                mapping.primaryProtocols.includes(protocolId) ||
                mapping.secondaryProtocols.includes(protocolId)
            );
        }).length;

        confidence += qeegSupport * 0.3;

        // Clinical assessment evidence
        const assessmentSupport = Object.keys(indicators.severityLevels).filter(test => {
            const severity = indicators.severityLevels[test];
            const mapping = this.disorderProtocolMapping[test];
            return mapping && mapping[severity] && mapping[severity].protocols.includes(protocolId);
        }).length;

        confidence += assessmentSupport * 0.4;

        // Symptom match
        const symptomMatch = indicators.symptoms.filter(symptom => 
            protocol.indications.includes(symptom)
        ).length / Math.max(indicators.symptoms.length, 1);

        confidence += symptomMatch * 0.3;

        return Math.min(confidence, 1.0);
    }

    calculateConfidence(indicators, protocolSuggestions) {
        if (protocolSuggestions.length === 0) return 0;
        
        const avgProtocolConfidence = protocolSuggestions.reduce((sum, p) => sum + p.confidence, 0) / protocolSuggestions.length;
        const dataQuality = this.assessDataQuality(indicators);
        
        return Math.min(avgProtocolConfidence * dataQuality, 1.0);
    }

    assessDataQuality(indicators) {
        let quality = 0;
        
        // QEEG data available
        if (indicators.qeegFindings.length > 0) quality += 0.4;
        
        // Assessment scores available
        if (Object.keys(indicators.disorderScores).length > 0) quality += 0.3;
        
        // Symptom information available
        if (indicators.symptoms.length > 0) quality += 0.2;
        
        // Clinical notes available
        if (indicators.riskFactors.length > 0) quality += 0.1;
        
        return Math.min(quality, 1.0);
    }

    generateProtocolReasoning(protocolId, indicators) {
        const protocol = this.protocolDatabase[protocolId];
        const reasons = [];

        // QEEG reasoning
        indicators.qeegFindings.forEach(finding => {
            const mapping = this.qeegProtocolMapping[finding];
            if (mapping && mapping.primaryProtocols.includes(protocolId)) {
                reasons.push(`${finding.replace('_', ' ')} finding supports this protocol: ${mapping.reasoning}`);
            }
        });

        // Assessment reasoning
        Object.keys(indicators.severityLevels).forEach(test => {
            const severity = indicators.severityLevels[test];
            const score = indicators.disorderScores[test];
            const mapping = this.disorderProtocolMapping[test];
            if (mapping && mapping[severity] && mapping[severity].protocols.includes(protocolId)) {
                reasons.push(`${test.toUpperCase()} score of ${score} (${severity}) indicates need for ${protocol.name}`);
            }
        });

        // Symptom reasoning
        const matchedSymptoms = indicators.symptoms.filter(symptom => 
            protocol.indications.includes(symptom)
        );
        if (matchedSymptoms.length > 0) {
            reasons.push(`Protocol targets reported symptoms: ${matchedSymptoms.join(', ')}`);
        }

        return reasons.join('; ');
    }

    generateScenarioReasoning(scenarioId, indicators) {
        const scenario = this.scenarioDatabase[scenarioId];
        const reasons = [];

        // Check which combination rule triggered
        const matchedRule = this.combinationRules.find(rule => 
            rule.scenario === scenarioId && 
            rule.conditions.every(condition => this.conditionMatches(condition, indicators))
        );

        if (matchedRule) {
            reasons.push(matchedRule.reasoning);
        }

        // Check indication matches
        const matchedIndications = scenario.indications.filter(indication =>
            indicators.symptoms.includes(indication) || indicators.qeegFindings.includes(indication)
        );

        if (matchedIndications.length > 0) {
            reasons.push(`Matches clinical presentation: ${matchedIndications.join(', ')}`);
        }

        return reasons.join('; ');
    }

    generateReasoning(indicators, treatmentPlan) {
        const reasoning = {
            clinicalPresentation: this.summarizeClinicalPresentation(indicators),
            treatmentRationale: treatmentPlan.reasoning,
            expectedOutcomes: this.predictOutcomes(indicators, treatmentPlan),
            alternativeConsiderations: this.generateAlternatives(indicators, treatmentPlan)
        };

        return reasoning;
    }

    summarizeClinicalPresentation(indicators) {
        const summary = [];

        if (indicators.qeegFindings.length > 0) {
            summary.push(`QEEG shows: ${indicators.qeegFindings.join(', ').replace(/_/g, ' ')}`);
        }

        Object.keys(indicators.severityLevels).forEach(test => {
            const score = indicators.disorderScores[test];
            const severity = indicators.severityLevels[test];
            summary.push(`${test.toUpperCase()}: ${score} (${severity})`);
        });

        if (indicators.symptoms.length > 0) {
            summary.push(`Primary symptoms: ${indicators.symptoms.join(', ')}`);
        }

        return summary.join('; ');
    }

    predictOutcomes(indicators, treatmentPlan) {
        const outcomes = [];
        
        treatmentPlan.protocols.forEach(protocol => {
            outcomes.push(`${protocol.name}: ${protocol.target}`);
        });

        // Add timeframe predictions
        const duration = treatmentPlan.expectedDuration;
        outcomes.push(`Expected improvement timeline: initial changes in 3-4 weeks, significant improvement in ${duration.weeks} weeks`);

        return outcomes;
    }

    generateAlternatives(indicators, treatmentPlan) {
        const alternatives = [];

        // Suggest medication consideration for severe cases
        if (Object.values(indicators.severityLevels).includes('severe')) {
            alternatives.push('Consider concurrent medication consultation for severe symptoms');
        }

        // Suggest different approaches
        if (treatmentPlan.approach === 'scenario_based') {
            alternatives.push('Custom protocol approach could be considered if scenario approach shows limited progress');
        } else {
            alternatives.push('Structured scenario-based approach available if individual protocols prove insufficient');
        }

        return alternatives;
    }

    // ====================================
    // UI INTERFACE
    // ====================================

    createSuggestionInterface() {
        // This interface will be embedded in the treatment planning view
        // It provides automatic suggestions when a patient is selected
    }

    setupEventListeners() {
        // Listen for patient selection in treatment planning
        document.addEventListener('change', async (e) => {
            if (e.target.id === 'treatmentPatientSelect' || e.target.id === 'assessmentPatientSelect') {
                const patientId = e.target.value;
                if (patientId) {
                    await this.displaySuggestions(patientId);
                }
            }
        });
    }

    async displaySuggestions(patientId) {
        try {
            const suggestions = await this.analyzeAssessmentAndSuggestTreatment(patientId);
            this.updateSuggestionDisplay(suggestions);
        } catch (error) {
            console.error('Error displaying suggestions:', error);
        }
    }

    updateSuggestionDisplay(suggestions) {
        // Find or create suggestion panel
        let panel = document.getElementById('treatmentSuggestionPanel');
        if (!panel) {
            panel = this.createSuggestionPanel();
        }

        this.populateSuggestionPanel(panel, suggestions);
    }

    createSuggestionPanel() {
        const panel = document.createElement('div');
        panel.id = 'treatmentSuggestionPanel';
        panel.className = 'treatment-suggestion-panel';
        
        // Insert after scenario selection in treatment plan view
        const scenarioSection = document.querySelector('.scenario-selection');
        if (scenarioSection && scenarioSection.parentNode) {
            scenarioSection.parentNode.insertBefore(panel, scenarioSection.nextSibling);
        }

        return panel;
    }

    populateSuggestionPanel(panel, suggestions) {
        panel.innerHTML = `
            <div class="suggestion-header">
                <h4>🧠 AI Treatment Recommendations</h4>
                <div class="confidence-indicator confidence-${suggestions.confidence >= 0.7 ? 'high' : suggestions.confidence >= 0.4 ? 'medium' : 'low'}">
                    Confidence: ${Math.round(suggestions.confidence * 100)}%
                </div>
            </div>

            <div class="suggestion-content">
                <!-- Clinical Presentation Summary -->
                <div class="clinical-summary">
                    <h5>Clinical Presentation</h5>
                    <p>${suggestions.reasoning.clinicalPresentation || 'Assessment data analysis pending'}</p>
                </div>

                <!-- Recommended Scenario -->
                ${suggestions.scenarioSuggestions.length > 0 ? `
                    <div class="scenario-suggestions">
                        <h5>Recommended Treatment Approach</h5>
                        ${suggestions.scenarioSuggestions.map(scenario => `
                            <div class="suggestion-item scenario-item ${scenario.confidence}">
                                <div class="suggestion-header">
                                    <span class="suggestion-title">${scenario.scenario.name}</span>
                                    <span class="confidence-badge">${scenario.confidence}</span>
                                </div>
                                <p class="suggestion-description">${scenario.scenario.description}</p>
                                <p class="suggestion-reasoning">${scenario.reasoning}</p>
                                <button class="btn btn-small btn-primary apply-scenario-btn" data-scenario="${scenario.id}">
                                    Apply This Scenario
                                </button>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}

                <!-- Protocol Suggestions -->
                <div class="protocol-suggestions">
                    <h5>Individual Protocol Recommendations</h5>
                    ${suggestions.protocolSuggestions.slice(0, 3).map(protocol => `
                        <div class="suggestion-item protocol-item ${protocol.suitability}">
                            <div class="suggestion-header">
                                <span class="suggestion-title">${protocol.protocol.name}</span>
                                <span class="suitability-badge">${protocol.suitability}</span>
                            </div>
                            <div class="protocol-details">
                                ${protocol.protocol.features?.frequency_bands ? `
                                    ${protocol.protocol.features.frequency_bands.map(band => `
                                        <span class="protocol-info">📍 ${band.channels?.join(', ') || 'N/A'} - ${band.frequency}Hz (${band.frequency_range?.[0]}-${band.frequency_range?.[1]}Hz) [${band.type}]</span>
                                    `).join('<br>')}
                                ` : `<span class="protocol-info">📍 Protocol details</span>`}
                            </div>
                            <p class="suggestion-reasoning">${protocol.reasoning}</p>
                        </div>
                    `).join('')}
                </div>

                <!-- Expected Outcomes -->
                <div class="expected-outcomes">
                    <h5>Expected Treatment Outcomes</h5>
                    <ul>
                        ${suggestions.reasoning.expectedOutcomes.map(outcome => `<li>${outcome}</li>`).join('')}
                    </ul>
                </div>

                <!-- Alternative Considerations -->
                ${suggestions.reasoning.alternativeConsiderations.length > 0 ? `
                    <div class="alternative-considerations">
                        <h5>Additional Considerations</h5>
                        <ul>
                            ${suggestions.reasoning.alternativeConsiderations.map(alt => `<li>${alt}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
            </div>
        `;

        // Bind apply scenario buttons
        panel.querySelectorAll('.apply-scenario-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const scenarioId = e.target.getAttribute('data-scenario');
                this.applyScenario(scenarioId, suggestions);
            });
        });
    }

    async applyScenario(scenarioId, suggestions) {
        try {
            const scenario = suggestions.scenarioSuggestions.find(s => s.id === scenarioId);
            if (!scenario) return;

            // Apply to treatment plan interface
            if (window.treatmentPlan) {
                await window.treatmentPlan.applyScenarioTemplate(scenario);
            }

            // Show success message
            alert(`Applied ${scenario.scenario.name} to treatment plan`);

        } catch (error) {
            console.error('Error applying scenario:', error);
            alert('Failed to apply scenario');
        }
    }
}

// Make it globally available
window.AssessmentTreatmentIntegration = AssessmentTreatmentIntegration;
