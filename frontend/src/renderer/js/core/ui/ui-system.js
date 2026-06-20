/**
 * UI System - System status
 */
(function() {
    'use strict';

    async function checkSystemStatus() {
        // Backend Connection
        try {
            const health = await window.api.checkHealth();
            window.ui.updateSystemStatus('backendStatus', 'backendStatusText', true, 'Connected');
            window.ui.updateConnectionStatus(true);
        } catch (error) {
            window.ui.updateSystemStatus('backendStatus', 'backendStatusText', false, 'Disconnected');
            window.ui.updateConnectionStatus(false);
        }
        
        // Database Status (assume same as backend for now)
        window.ui.updateSystemStatus('dbStatus', 'dbStatusText', true, 'Available');
        
        // Signal Processing (placeholder)
        window.ui.updateSystemStatus('signalProcessingStatus', 'signalProcessingStatusText', true, 'Ready');
    }

    function updateSystemStatus(dotId, textId, isOnline, text) {
        const dot = document.getElementById(dotId);
        const textEl = document.getElementById(textId);
        
        dot.className = isOnline ? 'status-dot online' : 'status-dot offline';
        textEl.textContent = text;
    }

    function updateConnectionStatus(isConnected) {
        const indicator = document.getElementById('statusIndicator');
        const text = document.getElementById('statusText');
        
        if (isConnected) {
            indicator.className = 'status-indicator connected';
            text.textContent = 'Connected';
        } else {
            indicator.className = 'status-indicator error';
            text.textContent = 'Disconnected';
        }
    }

    async function testConnection() {
        try {
            window.ui.showLoading(true);
            const result = await window.api.testConnection();
            
            if (result.success) {
                
                window.ui.updateConnectionStatus(true);
            } else {
                
                window.ui.updateConnectionStatus(false);
            }
        } catch (error) {
            
            window.ui.updateConnectionStatus(false);
        } finally {
            window.ui.showLoading(false);
        }
    }

    // Export functions to window.uiFunctions
    window.uiFunctions = window.uiFunctions || {};
    window.uiFunctions.checkSystemStatus = checkSystemStatus;
    window.uiFunctions.updateSystemStatus = updateSystemStatus;
    window.uiFunctions.updateConnectionStatus = updateConnectionStatus;
    window.uiFunctions.testConnection = testConnection;
})();