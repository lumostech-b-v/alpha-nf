/**
 * Dashboard & Statistics API Module
 * Handles dashboard statistics operations
 */

class DashboardAPI {
    constructor(userAPI, patientAPI, sessionAPI) {
        this.userAPI = userAPI;
        this.patientAPI = patientAPI;
        this.sessionAPI = sessionAPI;
    }

    async getDashboardStats() {
        try {
            const [users, patients, allSessions] = await Promise.all([
                this.userAPI.getUsers(),
                this.patientAPI.getAllPatients?.() ? this.patientAPI.getAllPatients() : this.patientAPI.getPatients(),
                this.sessionAPI.getSessions()
            ]);

            // Calculate today's sessions
            const today = new Date().toISOString().split('T')[0];
            const completedToday = allSessions.filter(session => {
                const sessionDate = new Date(session.start_time).toISOString().split('T')[0];
                return sessionDate === today && session.end_time !== null;
            });

            return {
                totalPatients: patients.length,
                totalDoctors: users.length,
                completedToday: completedToday.length,
                recentSessions: allSessions
                    .sort((a, b) => new Date(b.start_time) - new Date(a.start_time))
                    .slice(0, 10)
            };
        } catch (error) {
            throw error;
        }
    }
}
