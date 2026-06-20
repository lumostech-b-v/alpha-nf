/**
 * Progress Tracking & Analytics API Module
 * Handles patient progress tracking and session analytics
 */

class AnalyticsAPI {
    constructor(axios, sessionAPI) {
        this.axios = axios;
        this.sessionAPI = sessionAPI;
    }

    async getPatientProgress(patientId) {
        try {
            const sessions = await this.sessionAPI.getSessionsByPatient(patientId);
            const allSessions = sessions
                .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

            const progressData = allSessions.map((session, index) => ({
                sessionNumber: index + 1,
                date: new Date(session.start_time).toLocaleDateString(),
                successRate: session.overall_success_rate || 0,
                duration: session.duration_seconds || 0,
                protocolType: session.protocol_type,
                rewardTime: session.total_reward_time_seconds || 0,
                artifactTime: session.total_artifact_time_seconds || 0,
            }));

            return {
                totalSessions: allSessions.length,
                completedSessions: allSessions.filter(s => s.end_time !== null).length,
                averageSuccessRate: progressData.reduce((sum, s) => sum + s.successRate, 0) / progressData.length || 0,
                totalTrainingTime: progressData.reduce((sum, s) => sum + s.duration, 0),
                progressData
            };
        } catch (error) {
            return {
                totalSessions: 0,
                completedSessions: 0,
                averageSuccessRate: 0,
                totalTrainingTime: 0,
                progressData: []
            };
        }
    }

    async getSessionAnalytics(sessionId) {
        try {
            const session = await this.sessionAPI.getSessionById(sessionId);
            
            // Parse any stored analytics data
            let analyticsData = {};
            if (session.baseline_data) {
                try {
                    analyticsData.baseline = JSON.parse(session.baseline_data);
                } catch (e) {
                    // Failed to parse baseline data
                }
            }
            if (session.thresholds) {
                try {
                    analyticsData.thresholds = JSON.parse(session.thresholds);
                } catch (e) {
                    // Failed to parse thresholds data
                }
            }

            return {
                session,
                analytics: analyticsData,
                metrics: {
                    successRate: session.overall_success_rate || 0,
                    duration: session.duration_seconds || 0,
                    rewardTime: session.total_reward_time_seconds || 0,
                    artifactTime: session.total_artifact_time_seconds || 0,
                    impedance: session.average_impedance || 0
                }
            };
        } catch (error) {
            throw error;
        }
    }
}

