/**
 * Session Analysis Panel Component
 * Displays comprehensive analysis of all sessions for the current patient
 */

class SessionAnalysisPanel {
  constructor() {
    this.patient = null;
    this.sessions = [];
    this.containerId = "currentSessionStep";
  }

  // ====================================
  // UI CREATION
  // ====================================

  createAnalysisPanelHTML() {
    return `
      <div id="sessionAnalysisPanel" class="session-analysis-panel">
        <div class="analysis-header">
          <div class="analysis-header-content">
            <h2>Session Analysis</h2>
            <p class="analysis-subtitle">Comprehensive overview of all patient sessions</p>
          </div>
          <div class="analysis-summary" id="analysisSummary">
            <div class="summary-stats">
              <span class="summary-text">Loading sessions...</span>
            </div>
          </div>
        </div>
        
        <div class="analysis-content" id="analysisContent">
          <div class="loading-state">
            <div class="loading-spinner"></div>
            <p>Loading session data...</p>
          </div>
        </div>
      </div>
    `;
  }

  formatSessionDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}.${day}.${month}`;
  }

  getSeverityLabel(severity) {
    if (!severity && severity !== 0) return null;
    const labels = {
      1: 'Good condition',
      2: 'Mild issues',
      3: 'Medium',
      4: 'Bad condition',
      5: 'Severe condition'
    };
    return labels[severity] || 'Unknown';
  }

  createSessionCard(session, index) {
    // Find matching protocol - try multiple methods
    let protocol = null;
    if (this.protocols && this.protocols.length > 0) {
      // First try: match by protocol_type in features
      protocol = this.protocols.find(p => {
        if (p.features && p.features.protocol_type) {
          return p.features.protocol_type === session.protocol_type;
        }
        // Second try: check if protocol name contains the protocol_type
        if (p.name && session.protocol_type) {
          return p.name.toLowerCase().includes(session.protocol_type.toLowerCase()) ||
                 session.protocol_type.toLowerCase().includes(p.name.toLowerCase().substring(0, 3));
        }
        return false;
      });
      
      // Fallback: try to find by name containing protocol_type
      if (!protocol && session.protocol_type) {
        protocol = this.protocols.find(p => 
          p.name && p.name.toLowerCase().includes(session.protocol_type.toLowerCase())
        );
      }
    }
    
    const sessionNumber = this.sessions.length - index;
    
    // Format date
    const sessionDate = this.formatSessionDate(session.start_time);
    
    // Protocol display name - use protocol name if found, otherwise use protocol_type
    const protocolName = protocol ? protocol.name : (session.protocol_type || 'No Protocol');
    const protocolShort = `P${sessionNumber}`;
    
    // Success rates - handle both single value and dual values
    let successRateDisplay = 'N/A';
    if (session.overall_success_rate !== null && session.overall_success_rate !== undefined) {
      const rate1 = Math.round(session.overall_success_rate * 100);
      // Check if there's a second success rate (e.g., from different metrics)
      if (session.secondary_success_rate !== null && session.secondary_success_rate !== undefined) {
        const rate2 = Math.round(session.secondary_success_rate * 100);
        successRateDisplay = `${rate1}% / ${rate2}%`;
      } else {
        successRateDisplay = `${rate1}%`;
      }
    }
    
    // Clinical note
    const clinicalNote = session.doctor_notes || null;
    
    // Doctor score/rating - try to extract from doctor_notes if it's JSON, or check for a score field
    let doctorScore = null;
    let doctorScoreLabel = null;
    try {
      if (session.doctor_notes) {
        const notesData = typeof session.doctor_notes === 'string' 
          ? JSON.parse(session.doctor_notes) 
          : session.doctor_notes;
        if (notesData && typeof notesData === 'object') {
          doctorScore = notesData.score || notesData.rating || notesData.severity;
          if (doctorScore !== null && doctorScore !== undefined) {
            doctorScoreLabel = this.getSeverityLabel(doctorScore);
          }
        }
      }
    } catch (e) {
      // If doctor_notes is not JSON, treat it as plain text
    }
    
    // Also check if there's a direct severity field (for backward compatibility)
    const severity = session.severity || doctorScore || null;
    const severityLabel = severity ? this.getSeverityLabel(severity) : doctorScoreLabel;
    
    return `
      <div class="session-card-v2" data-session-id="${session.id}">
        <div class="session-card-v2-header">
          <span class="session-card-v2-title">Session ${sessionNumber}</span>
        </div>
        
        <div class="session-card-v2-body">
          <div class="session-card-v2-date">Date: ${sessionDate}</div>
          
          <div class="session-card-v2-protocol">${protocolShort}: ${protocolName}</div>
          
          <div class="session-card-v2-info-box">
            <div class="session-card-v2-info-row">
              <span class="info-label-v2">Overall Success Rate:</span>
              <span class="info-value-v2 ${this.getSuccessRateClass(session.overall_success_rate)}">${successRateDisplay}</span>
            </div>
            
            ${severity ? `
              <div class="session-card-v2-info-row">
                <span class="info-label-v2">Doctor Score:</span>
                <span class="info-value-v2 severity-${severity}">${severity}/5 ${severityLabel || ''}</span>
              </div>
            ` : ''}
            
            ${clinicalNote && typeof clinicalNote === 'string' && !clinicalNote.startsWith('{') ? `
              <div class="session-card-v2-info-row">
                <span class="info-label-v2">Clinical Note:</span>
                <span class="info-value-v2">${clinicalNote}</span>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  createDataFilesSection(session) {
    if (!session.raw_data_file && !session.processed_data_file) {
      return '';
    }

    return `
      <div class="data-files-section">
        ${session.raw_data_file ? `
          <div class="info-item">
            <span class="info-label">Raw Data</span>
            <span class="info-value file-path">${session.raw_data_file}</span>
          </div>
        ` : ''}
        ${session.processed_data_file ? `
          <div class="info-item">
            <span class="info-label">Processed Data</span>
            <span class="info-value file-path">${session.processed_data_file}</span>
          </div>
        ` : ''}
      </div>
    `;
  }

  createBaselineThresholdsSection(session) {
    let baselineData = null;
    let thresholdsData = null;

    try {
      if (session.baseline_data) {
        baselineData = typeof session.baseline_data === 'string' 
          ? JSON.parse(session.baseline_data) 
          : session.baseline_data;
      }
      if (session.thresholds) {
        thresholdsData = typeof session.thresholds === 'string' 
          ? JSON.parse(session.thresholds) 
          : session.thresholds;
      }
    } catch (e) {
      console.error('Error parsing baseline/thresholds data:', e);
    }

    if (!baselineData && !thresholdsData) {
      return '';
    }

    return `
      <div class="baseline-thresholds-section">
        ${baselineData ? `
          <div class="json-section">
            <div class="json-label">Baseline Data</div>
            <div class="json-content">
              <pre>${JSON.stringify(baselineData, null, 2)}</pre>
            </div>
          </div>
        ` : ''}
        ${thresholdsData ? `
          <div class="json-section">
            <div class="json-label">Thresholds</div>
            <div class="json-content">
              <pre>${JSON.stringify(thresholdsData, null, 2)}</pre>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  // ====================================
  // UTILITY METHODS
  // ====================================

  formatDuration(seconds) {
    if (!seconds) return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }

  createProtocolSection(protocol) {
    if (!protocol || !protocol.features) return '';
    
    const features = protocol.features;
    const frequencyBands = features.frequency_bands || [];
    
    return `
      <div class="protocol-section">
        <div class="protocol-header">
          <div class="protocol-name">${protocol.name}</div>
          ${protocol.note ? `<div class="protocol-note">${protocol.note}</div>` : ''}
        </div>
        ${frequencyBands.length > 0 ? `
          <div class="protocol-features">
            <div class="protocol-features-label">Frequency Bands</div>
            <div class="frequency-bands-list">
              ${frequencyBands.map(band => `
                <div class="frequency-band-item">
                  <div class="band-header">
                    <span class="band-frequency">${band.frequency} Hz</span>
                    <span class="band-type ${band.type === 'reward' ? 'band-reward' : 'band-inhibit'}">${band.type}</span>
                  </div>
                  <div class="band-details">
                    <span class="band-range">Range: ${band.frequency_range[0]} - ${band.frequency_range[1]} Hz</span>
                    <span class="band-channels">Channels: ${band.channels.join(', ')}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  getSuccessRateClass(rate) {
    if (rate === null || rate === undefined) return '';
    if (rate >= 0.7) return 'success-high';
    if (rate >= 0.5) return 'success-medium';
    return 'success-low';
  }

  // ====================================
  // DATA LOADING
  // ====================================

  async show(patient) {
    if (!patient) return;
    this.patient = patient;

    const container = document.getElementById(this.containerId);
    if (!container) return;

    const stepContent = container.querySelector(".session-step-content");
    stepContent?.querySelectorAll("h2, p").forEach(el => el.style.display = "none");

    let panel = document.getElementById("sessionAnalysisPanel");
    if (!panel) {
      const panelHTML = this.createAnalysisPanelHTML();
      stepContent ? stepContent.insertAdjacentHTML("beforeend", panelHTML) : container.innerHTML = panelHTML;
      panel = document.getElementById("sessionAnalysisPanel");
    }

    await this.loadSessions();
  }

  async loadSessions() {
    const contentDiv = document.getElementById("analysisContent");
    const summaryDiv = document.getElementById("analysisSummary");
    
    if (!contentDiv || !summaryDiv) return;

    try {
      contentDiv.innerHTML = '<div class="loading-state"><p>Loading session data...</p></div>';
      
      // Load protocols and sessions in parallel
      [this.protocols, this.sessions] = await Promise.all([
        window.api.getAllProtocols().catch(() => []),
        window.api.getSessionsByPatient(this.patient.id)
      ]);
      
      // Filter out active sessions - only show completed ones
      if (this.sessions) {
        this.sessions = this.sessions.filter(s => s.end_time !== null);
      }
      
      if (!this.sessions || this.sessions.length === 0) {
        contentDiv.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">📊</div>
            <h3>No Sessions Found</h3>
            <p>No sessions have been recorded for this patient yet.</p>
            <p class="empty-state-hint">Start a new session from the Planning page to begin tracking progress.</p>
          </div>
        `;
        summaryDiv.innerHTML = '<div class="summary-stats"><span class="summary-text">No sessions available</span></div>';
        return;
      }

      // Sort sessions by start_time (newest first)
      this.sessions.sort((a, b) => {
        const timeA = a.start_time ? new Date(a.start_time).getTime() : 0;
        const timeB = b.start_time ? new Date(b.start_time).getTime() : 0;
        return timeB - timeA;
      });

      // Update summary with enhanced stats
      const completedCount = this.sessions.filter(s => s.end_time !== null).length;
      const activeCount = this.sessions.filter(s => s.start_time && !s.end_time).length;
      const avgSuccessRate = this.sessions
        .filter(s => s.overall_success_rate !== null && s.overall_success_rate !== undefined)
        .reduce((sum, s, _, arr) => sum + (s.overall_success_rate / arr.length), 0);
      
      summaryDiv.innerHTML = `
        <div class="summary-stats">
          <div class="summary-stat-item">
            <span class="summary-stat-value">${this.sessions.length}</span>
            <span class="summary-stat-label">Total Sessions</span>
          </div>
          <div class="summary-stat-item">
            <span class="summary-stat-value">${completedCount}</span>
            <span class="summary-stat-label">Completed</span>
          </div>
          ${activeCount > 0 ? `
          <div class="summary-stat-item">
            <span class="summary-stat-value">${activeCount}</span>
            <span class="summary-stat-label">Active</span>
          </div>
          ` : ''}
          ${avgSuccessRate > 0 ? `
          <div class="summary-stat-item">
            <span class="summary-stat-value">${(avgSuccessRate * 100).toFixed(1)}%</span>
            <span class="summary-stat-label">Avg Success Rate</span>
          </div>
          ` : ''}
        </div>
      `;

      // Render session cards
      contentDiv.innerHTML = this.sessions.map((session, index) => 
        this.createSessionCard(session, index)
      ).join('');

    } catch (error) {
      console.error("Error loading sessions:", error);
      contentDiv.innerHTML = `
        <div class="error-state">
          <h3>Error Loading Sessions</h3>
          <p>${error.message || 'Failed to load session data'}</p>
        </div>
      `;
      summaryDiv.innerHTML = '<span class="summary-text error">Error loading sessions</span>';
    }
  }

  hide() {
    document.getElementById("sessionAnalysisPanel")?.remove();
  }
}

window.SessionAnalysisPanel = SessionAnalysisPanel;

