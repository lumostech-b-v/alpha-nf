/**
 * Assessment & Treatment Planning API Module
 * Handles assessment, treatment planning, and disorder-related operations
 */

class AssessmentAPI {
    constructor(axios, sessionAPI) {
        this.axios = axios;
        this.sessionAPI = sessionAPI;
        
        // Mapping from human-readable labels to backend field names
        this.qeegLabelToField = {
            'TBR ↑': 'high_tbr',
            'High TBR': 'high_tbr',
            'SMR ↓': 'smr_low',  // Will be stored in qeeg_other if no field exists
            'High-Beta ↑': 'high_beta_high',
            'High Beta ↑': 'high_beta_high',
            'Frontal Alpha Asymmetry': 'left_alpha_excess',
            'Frontal Beta ↓': 'frontal_beta_low',
            'Slow Peak Alpha': 'paf_slow',
            'Alpha ↓': 'alpha_low',  // Will be stored in qeeg_other
            'Alpha/Theta ↑': 'alpha_theta_high',  // Will be stored in qeeg_other
            'Theta ↑': 'theta_high',  // Will be stored in qeeg_other
            'Frontal Theta ↑': 'frontal_theta_high',  // Will be stored in qeeg_other
            'coherence': 'coherence',
            'other': 'qeeg_other'
        };
        
        // Reverse mapping from backend field names to human-readable labels
        this.qeegFieldToLabel = {
            'high_tbr': 'TBR ↑',
            'high_beta_high': 'High Beta ↑',
            'left_alpha_excess': 'Frontal Alpha Asymmetry',
            'frontal_beta_low': 'Frontal Beta ↓',
            'paf_slow': 'Slow Peak Alpha',
            'coherence': 'coherence',
            'qeeg_other': 'other'
        };
        
        // Mapping for disorder tests
        this.testLabelToField = {
            'RS/Conners': 'rs_conners',  // Will be stored in localStorage
            'Sleep (ISI)': 'isi',
            'Anxiety (GAD-7)': 'gad7',
            'Depression (PHQ-9)': 'phq',
            'WM Score': 'wm',
            'Y-BOCS': 'ybocs',  // Will be stored in localStorage
            'CAPS-5': 'caps5',  // Will be stored in localStorage
            'other': 'cognitive_other'
        };
        
        this.testFieldToLabel = {
            'isi': 'Sleep (ISI)',
            'gad7': 'Anxiety (GAD-7)',
            'phq': 'Depression (PHQ-9)',
            'wm': 'WM Score',
            'executive_c': 'Executive Control',
            'sustained_a': 'Sustained Attention',
            'cognitive_other': 'other'
        };
        
        // Mapping for observations
        this.obsLabelToField = {
            'Processing Speed Problem': 'processing_speed',
            'Inattention': 'inattention',
            'Rumination': 'rumination',
            'Trauma Intrusion': 'trauma',
            'Trauma': 'trauma',
            'Psychomotor Restlessness': 'psychomotor_restlessness',
            'Executive Control Problem': 'executive_control_problem',
            'Tension': 'tension',
            'Fatigue Problem': 'fatigue',
            'Sleep-Onset Latency': 'sleep_onset_latency',
            'Hyper Arousal': 'anxiety',
            'Over Focus': 'over_focus',
            'Intrusive Chatter': 'intrusive_chatter',
            'Executive Inflexibility': 'executive_inflexibility',
            'Compulsive Tension': 'compulsive_tension',
            'Emotional Dysregulation': 'emotional_dysregulation'
        };
        
        this.obsFieldToLabel = {
            'trauma': 'Trauma',
            'rumination': 'Rumination',
            'anxiety': 'Hyper Arousal',
            'observation_note': 'Clinical Notes'
        };
    }

    // Helper to convert human-readable keys to backend field names
    mapToBackendFields(data, labelToFieldMap) {
        const result = {};
        if (!data) return result;
        
        for (const [key, value] of Object.entries(data)) {
            const backendField = labelToFieldMap[key] || key;
            result[backendField] = value;
        }
        return result;
    }

    // Helper to convert backend field names to human-readable labels
    mapToFrontendLabels(data, fieldToLabelMap) {
        const result = {};
        if (!data) return result;
        
        for (const [key, value] of Object.entries(data)) {
            const frontendLabel = fieldToLabelMap[key] || key;
            result[frontendLabel] = value;
        }
        return result;
    }

    async createAssessment(patientId, assessmentData) {
        // Creates or updates a disorder for the patient
        try {
            // Extract disorder name from patient_issues
            const disorderName = assessmentData.patient_issues?.[0]?.issue || 'Unknown';
            
            // Map human-readable labels to backend field names
            const qeeg = assessmentData.qeeg_findings || {};
            const tests = assessmentData.disorder_tests || {};
            const obs = assessmentData.observations || {};
            
            // Check for QEEG findings using both human-readable labels and snake_case
            const getQeegValue = (labels) => {
                for (const label of labels) {
                    if (qeeg[label] === true) return true;
                }
                return false;
            };
            
            // Check for tests using both human-readable labels and snake_case
            const getTestValue = (labels) => {
                for (const label of labels) {
                    if (tests[label] === true) return true;
                }
                return false;
            };
            
            // Check for observations using both human-readable labels and snake_case
            const getObsValue = (labels) => {
                for (const label of labels) {
                    if (obs[label] === true) return true;
                }
                return false;
            };
            
            // Genuine free-text "Other" finding only.
            // Unmapped checkbox findings (e.g. "SMR ↓", "Alpha ↓") are already preserved
            // verbatim in the localStorage assessment payload written below, so they must
            // NOT also be folded into qeeg_other — doing that made each one appear a second
            // time as an "Other: …" row in the planning/preparation summaries.
            const qeegOtherText = qeeg.other_text || qeeg.other || '';
            
            // Map assessment data to disorder format with proper field mappings
            const disorderData = {
                disorder: disorderName,
                // QEEG findings - check both human-readable and snake_case keys
                left_alpha_excess: getQeegValue(['Frontal Alpha Asymmetry', 'left_alpha_excess']),
                frontal_beta_low: getQeegValue(['Frontal Beta ↓', 'frontal_beta_low']),
                high_beta_high: getQeegValue(['High-Beta ↑', 'High Beta ↑', 'high_beta_high']),
                high_tbr: getQeegValue(['TBR ↑', 'High TBR', 'high_tbr']),
                paf_slow: getQeegValue(['Slow Peak Alpha', 'paf_slow']),
                coherence: getQeegValue(['coherence', 'Coherence']),
                qeeg_other: qeegOtherText || null,
                // Disorder tests - check both human-readable and snake_case keys
                isi: getTestValue(['Sleep (ISI)', 'isi']),
                gad7: getTestValue(['Anxiety (GAD-7)', 'gad7']),
                phq: getTestValue(['Depression (PHQ-9)', 'phq', 'phq9']),
                wm: getTestValue(['WM Score', 'wm']),
                executive_c: getTestValue(['Executive Control', 'executive_c']),
                sustained_a: getTestValue(['Sustained Attention', 'sustained_a']),
                cognitive_other: tests.cognitive_other || tests.other_name || null,
                // Observations - check both human-readable and snake_case keys
                trauma: getObsValue(['Trauma', 'Trauma Intrusion', 'trauma']),
                rumination: getObsValue(['Rumination', 'rumination']),
                anxiety: getObsValue(['Hyper Arousal', 'anxiety', 'Tension']),
                observation_note: obs.observation_note || assessmentData.clinical_observation || null
            };
            
            // Check if patient already has a disorder
            let existingDisorder = null;
            try {
                const existingResponse = await this.axios.get(`/planning/disorders/patient/${patientId}`);
                existingDisorder = existingResponse.data;
            } catch (e) {
                // Patient doesn't have a disorder yet - will create new one
                if (e.response && e.response.status !== 404) {
                    throw e; // Re-throw if it's not a "not found" error
                }
            }
            
            let createdDisorder;
            if (existingDisorder) {
                // Patient already has a disorder - UPDATE it (creates new version)
                const updateResponse = await this.axios.put(`/planning/disorders/patient/${patientId}`, disorderData);
                createdDisorder = updateResponse.data;
            } else {
                // Patient doesn't have a disorder - CREATE new one
                disorderData.patient_id = patientId;
                const createResponse = await this.axios.post('/planning/disorders/', disorderData);
                createdDisorder = createResponse.data;
            }
            
            // Store full assessment data in localStorage for retrieval
            // This preserves all original human-readable labels and scores
            // since the backend Disorder model only stores a subset of fields
            try {
                const assessmentStorageKey = `assessment_${patientId}`;
                const dataToStore = {
                    patient_issues: assessmentData.patient_issues || [],
                    qeeg_findings: { ...(assessmentData.qeeg_findings || {}) },
                    disorder_tests: { ...(assessmentData.disorder_tests || {}) },
                    observations: { ...(assessmentData.observations || {}) },
                    clinical_observation: assessmentData.clinical_observation || '',
                    disorder_id: createdDisorder.id,
                    saved_at: new Date().toISOString()
                };
                localStorage.setItem(assessmentStorageKey, JSON.stringify(dataToStore));
            } catch (e) {
                console.warn('Failed to store assessment data in localStorage:', e);
                // Continue even if localStorage fails
            }
            
            // Disorder is already linked to patient via patient_id, and patient's disorder_id is updated by backend
            return createdDisorder;
        } catch (error) {
            throw error;
        }
    }

    async getAssessmentByPatient(patientId) {
        // Returns patient's disorder as assessment-like object for compatibility
        try {
            // Get disorder for this patient from planning endpoint (patients have one disorder)
            const response = await this.axios.get(`/planning/disorders/patient/${patientId}`);
            const disorder = response.data;
            
            if (!disorder) {
                return [];
            }
            
            // Try to get stored assessment data with all original labels from localStorage
            let storedAssessmentData = null;
            try {
                const assessmentStorageKey = `assessment_${patientId}`;
                const storedData = localStorage.getItem(assessmentStorageKey);
                if (storedData) {
                    storedAssessmentData = JSON.parse(storedData);
                }
            } catch (e) {
                // No stored data or parse error - continue without stored data
            }
            
            // Build qeeg_findings with BOTH human-readable labels AND snake_case for compatibility
            // This ensures the frontend checkboxes can find their values regardless of key format
            const qeegFindings = {
                // Human-readable labels (for frontend checkbox data-finding attributes)
                'TBR ↑': disorder.high_tbr || false,
                'High TBR': disorder.high_tbr || false,
                'SMR ↓': false,  // Will be loaded from localStorage
                'High-Beta ↑': disorder.high_beta_high || false,
                'High Beta ↑': disorder.high_beta_high || false,
                'Frontal Alpha Asymmetry': disorder.left_alpha_excess || false,
                'Frontal Beta ↓': disorder.frontal_beta_low || false,
                'Slow Peak Alpha': disorder.paf_slow || false,
                'Alpha ↓': false,  // Will be loaded from localStorage
                'Alpha/Theta ↑': false,  // Will be loaded from localStorage
                'Theta ↑': false,  // Will be loaded from localStorage
                'Frontal Theta ↑': false,  // Will be loaded from localStorage
                'coherence': disorder.coherence || false,
                'other': false,
                // Snake_case keys (for backward compatibility)
                left_alpha_excess: disorder.left_alpha_excess || false,
                frontal_beta_low: disorder.frontal_beta_low || false,
                high_beta_high: disorder.high_beta_high || false,
                high_tbr: disorder.high_tbr || false,
                paf_slow: disorder.paf_slow || false,
                coherence: disorder.coherence || false,
                other_text: disorder.qeeg_other || null
            };
            
            // Build disorder_tests with BOTH human-readable labels AND snake_case
            const disorderTests = {
                // Human-readable labels
                'RS/Conners': false,  // Will be loaded from localStorage
                'Sleep (ISI)': disorder.isi || false,
                'Anxiety (GAD-7)': disorder.gad7 || false,
                'Depression (PHQ-9)': disorder.phq || false,
                'WM Score': disorder.wm || false,
                'Y-BOCS': false,  // Will be loaded from localStorage
                'CAPS-5': false,  // Will be loaded from localStorage
                'other': false,
                // Snake_case keys
                isi: disorder.isi || false,
                gad7: disorder.gad7 || false,
                phq9: disorder.phq || false,
                phq: disorder.phq || false,
                wm: disorder.wm || false,
                executive_c: disorder.executive_c || false,
                sustained_a: disorder.sustained_a || false,
                cognitive_other: disorder.cognitive_other || null
            };
            
            // Build observations with BOTH human-readable labels AND snake_case
            const observations = {
                // Human-readable labels
                'Processing Speed Problem': false,
                'Inattention': false,
                'Rumination': disorder.rumination || false,
                'Trauma Intrusion': disorder.trauma || false,
                'Trauma': disorder.trauma || false,
                'Psychomotor Restlessness': false,
                'Executive Control Problem': false,
                'Tension': false,
                'Fatigue Problem': false,
                'Sleep-Onset Latency': false,
                'Hyper Arousal': disorder.anxiety || false,
                'Over Focus': false,
                'Intrusive Chatter': false,
                'Executive Inflexibility': false,
                'Compulsive Tension': false,
                'Emotional Dysregulation': false,
                // Snake_case keys
                trauma: disorder.trauma || false,
                rumination: disorder.rumination || false,
                anxiety: disorder.anxiety || false,
                observation_note: disorder.observation_note || null
            };
            
            // Merge in stored data from localStorage (preserves all original selections)
            if (storedAssessmentData) {
                // Merge QEEG findings
                if (storedAssessmentData.qeeg_findings) {
                    Object.keys(storedAssessmentData.qeeg_findings).forEach(key => {
                        if (storedAssessmentData.qeeg_findings[key] !== undefined) {
                            qeegFindings[key] = storedAssessmentData.qeeg_findings[key];
                        }
                    });
                }
                
                // Merge disorder tests (including scores)
                if (storedAssessmentData.disorder_tests) {
                    Object.keys(storedAssessmentData.disorder_tests).forEach(key => {
                        if (storedAssessmentData.disorder_tests[key] !== undefined) {
                            disorderTests[key] = storedAssessmentData.disorder_tests[key];
                        }
                    });
                }
                
                // Merge observations
                if (storedAssessmentData.observations) {
                    Object.keys(storedAssessmentData.observations).forEach(key => {
                        if (storedAssessmentData.observations[key] !== undefined) {
                            observations[key] = storedAssessmentData.observations[key];
                        }
                    });
                }
            }
            
            // Convert disorder to assessment-like format for backwards compatibility
            return [{
                id: disorder.id,
                patient_id: patientId,
                patient_issues: [{ issue: disorder.disorder, severity: 'Moderate', note: null }],
                qeeg_findings: qeegFindings,
                disorder_tests: disorderTests,
                observations: observations,
                clinical_observation: disorder.observation_note || '',
                created_at: disorder.created_at,
                is_completed: true
            }];
        } catch (error) {
            // If endpoint returns 404, patient has no disorder yet - this is normal
            if (error.response && error.response.status === 404) {
                return []; // Patient doesn't have a disorder yet
            }
            // Re-throw unexpected errors
            throw error;
        }
    }

    async saveTreatmentPlan(patientId, treatmentPlan) {
        // Store treatment plan in session notes for now
        const sessionData = {
            patient_id: patientId,
            doctor_id: treatmentPlan.doctor_id,
            session_type: "training", // Explicitly set session type
            protocol_type: 'planning',
            start_time: new Date().toISOString(),
            channels: JSON.stringify(['all']),
            sample_rate: 250,
            session_rounds: treatmentPlan.totalSessions || 20,
            doctor_notes: JSON.stringify({
                type: 'treatment_plan',
                blocks: treatmentPlan.blocks,
                protocols: treatmentPlan.protocols,
                checkpoints: treatmentPlan.checkpoints,
                scenarios: treatmentPlan.scenarios
            })
        };
        return await this.sessionAPI.createSession(sessionData);
    }

    async getTreatmentPlan(patientId) {
        try {
            const sessions = await this.sessionAPI.getSessionsByPatient(patientId);
            const treatmentPlanSession = sessions.find(s => s.protocol_type === 'planning');
            if (treatmentPlanSession && treatmentPlanSession.doctor_notes) {
                return JSON.parse(treatmentPlanSession.doctor_notes);
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    async createDisorder(disorderData) {
        // Creates a new disorder (first version) for a patient
        // NOTE: If patient already has a disorder, use updateDisorderForPatient instead
        try {
            if (!disorderData.patient_id) {
                throw new Error('patient_id is required to create a disorder');
            }
			console.log("this is the way")
            const response = await this.axios.post('/planning/disorders/', disorderData);
            return response.data;
        } catch (error) {
            throw error;
        }
    }

    async updateDisorderForPatient(patientId, disorderData) {
        // Updates disorder for a patient (creates new version, keeps history)
        // Uses PUT /planning/disorders/patient/{patient_id} endpoint
        try {
            const response = await this.axios.put(`/planning/disorders/patient/${patientId}`, disorderData);
            return response.data;
        } catch (error) {
            throw error;
        }
    }

    async getPatientLatestDisorder(patientId) {
        try {
            // Patients have one disorder, so get it directly
            const response = await this.axios.get(`/planning/disorders/patient/${patientId}`);
            return response.data;
        } catch (error) {
            // If patient has no disorder, return null (404 is expected and normal)
            if (error.response && error.response.status === 404) {
                return null; // Patient doesn't have a disorder yet
            }
            // Re-throw other errors
            throw error;
        }
    }

    async getScenariosByDisorder(disorderName) {
        // Simplified: return default scenarios for disorder
        // Blocks are now managed per patient, not per disorder
        return this.getDefaultScenariosForDisorder(disorderName);
    }

    getDefaultScenariosForDisorder(disorderName) {
        const scenarios = {
            'ADHD': [
                {
                    id: 'adhd-standard',
                    name: 'ADHD Standard Protocol',
                    description: 'Standard treatment for ADHD with TBR reduction',
                    sessions: 25,
                    blocks: [
                        { sessions: '1-8', protocol: 'TBR Reduction', target: 'Theta/Beta Ratio' },
                        { sessions: '9-17', protocol: 'SMR Enhancement', target: 'Sensory Motor Rhythm' },
                        { sessions: '18-25', protocol: 'Beta Enhancement', target: 'Frontal Beta' }
                    ]
                }
            ],
            'Anxiety': [
                {
                    id: 'anxiety-standard',
                    name: 'Anxiety Reduction Protocol',
                    description: 'Alpha enhancement and high beta reduction',
                    sessions: 20,
                    blocks: [
                        { sessions: '1-7', protocol: 'Alpha Enhancement', target: 'Alpha Waves' },
                        { sessions: '8-14', protocol: 'High Beta Reduction', target: 'High Beta' },
                        { sessions: '15-20', protocol: 'Coherence Training', target: 'Frontal Coherence' }
                    ]
                }
            ],
            'Depression': [
                {
                    id: 'depression-standard',
                    name: 'Depression Treatment Protocol',
                    description: 'Left frontal activation and alpha asymmetry',
                    sessions: 25,
                    blocks: [
                        { sessions: '1-9', protocol: 'Left Alpha Reduction', target: 'Alpha Asymmetry' },
                        { sessions: '10-17', protocol: 'Beta Enhancement', target: 'Frontal Beta' },
                        { sessions: '18-25', protocol: 'Coherence Training', target: 'Frontal Coherence' }
                    ]
                }
            ]
        };

        return scenarios[disorderName] || [];
    }

    async getTreatmentPlanByPatient(patientId) {
        try {
            // Get all blocks for patient
            const blocksResponse = await this.axios.get(`/planning/blocks/patient/${patientId}`);
            const blocks = blocksResponse.data || [];
            
            // Get checkpoints for patient (separate table now)
            let checkpoints = [];
            try {
                const checkpointsResponse = await this.axios.get(`/planning/checkpoints/patient/${patientId}`);
                checkpoints = checkpointsResponse.data || [];
            } catch (e) {
                // Checkpoints may not exist - 404 is expected if no checkpoints exist
                if (e.response && e.response.status !== 404) {
                    console.warn("Error loading checkpoints:", e);
                }
                // 404 is fine - patient just doesn't have checkpoints yet
            }
            
            // Get patient's disorder
            let disorder = null;
            try {
                const disorderResponse = await this.axios.get(`/planning/disorders/patient/${patientId}`);
                disorder = disorderResponse.data;
            } catch (e) {
                // Patient may not have a disorder yet - 404 is expected if no disorder exists
                if (e.response && e.response.status !== 404) {
                    // Only log if it's not a "not found" error
                    throw e;
                }
                // 404 is fine - patient just doesn't have a disorder yet
            }
            
            return {
                patient_id: patientId,
                blocks: blocks,
                checkpoints: checkpoints,
                disorder: disorder
            };
        } catch (error) {
            return null;
        }
    }

    async generatePlanFromDisorder(disorderName, patientId, totalSessions = null) {
        /**
         * Generate a treatment plan (blocks) based on disorder type.
         * Returns the generated plan (not yet saved to database).
         */
        try {
            const response = await this.axios.post('/planning/generate-plan', {
                disorder_name: disorderName,
                patient_id: patientId,
                total_sessions: totalSessions
            });
            return response.data;
        } catch (error) {
            console.error('Error generating plan from disorder:', error);
            throw error;
        }
    }

    async generateAndCreatePlanFromDisorder(disorderName, patientId, totalSessions = null) {
        /**
         * Generate a treatment plan from disorder and immediately create blocks in database.
         * Returns the created blocks.
         */
        try {
            const response = await this.axios.post('/planning/generate-plan/create', {
                disorder_name: disorderName,
                patient_id: patientId,
                total_sessions: totalSessions
            });
            return response.data;
        } catch (error) {
            console.error('Error generating and creating plan from disorder:', error);
            throw error;
        }
    }
}
