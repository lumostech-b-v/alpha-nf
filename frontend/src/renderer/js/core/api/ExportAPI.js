/**
 * Data Export API Module
 * Handles data export operations
 */

class ExportAPI {
    constructor(sessionAPI, patientAPI, userAPI) {
        this.sessionAPI = sessionAPI;
        this.patientAPI = patientAPI;
        this.userAPI = userAPI;
    }

    async exportSessions(format = 'csv') {
        try {
            const sessions = await this.sessionAPI.getSessions();
            const patients = this.patientAPI.getAllPatients
                ? await this.patientAPI.getAllPatients()
                : await this.patientAPI.getPatients();
            const users = await this.userAPI.getUsers();

            // Create lookup maps
            const patientMap = {};
            const userMap = {};
            
            patients.forEach(p => patientMap[p.id] = p);
            users.forEach(u => userMap[u.id] = u);

            // Enrich sessions with patient and doctor names
            const enrichedSessions = sessions.map(session => ({
                ...session,
                patient_name: patientMap[session.patient_id] 
                    ? `${patientMap[session.patient_id].first_name} ${patientMap[session.patient_id].last_name}` 
                    : 'Unknown',
                doctor_name: userMap[session.doctor_id] 
                    ? `${userMap[session.doctor_id].first_name} ${userMap[session.doctor_id].last_name}` 
                    : 'Unknown'
            }));

            if (format === 'csv') {
                return this.convertToCSV(enrichedSessions);
            } else {
                return enrichedSessions;
            }
        } catch (error) {
            throw error;
        }
    }

    convertToCSV(data) {
        if (!data || data.length === 0) {
            return '';
        }

        const headers = [
            'ID', 'Patient', 'Doctor', 'Protocol', 'Status',
            'Start Time', 'End Time', 'Duration (s)', 'Success Rate (%)',
            'Reward Time (s)', 'Artifact Time (s)', 'Average Impedance',
            'Channels', 'Sample Rate', 'Rounds',
            'Created At', 'Synced'
        ];

        const rows = data.map(session => [
            session.id,
            session.patient_name,
            session.doctor_name,
            session.protocol_type,
            session.start_time,
            session.end_time || '',
            session.duration_seconds || '',
            session.overall_success_rate || '',
            session.total_reward_time_seconds || '',
            session.total_artifact_time_seconds || '',
            session.average_impedance || '',
            session.channels,
            session.sample_rate,
            session.session_rounds,
            session.created_at,
            session.synced
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(field => 
                typeof field === 'string' && field.includes(',') 
                    ? `"${field}"` 
                    : field
            ).join(','))
        ].join('\n');

        return csvContent;
    }
}
