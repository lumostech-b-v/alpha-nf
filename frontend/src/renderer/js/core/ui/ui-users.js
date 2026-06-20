/**
 * UI Users - User management
 */
(function() {
    'use strict';

    async function editUser(userId) {
        try {
            const user = await window.api.getUserById(userId);
            window.ui.openUserModal(user);
        } catch (error) {
            
        }
    }

    async function deleteUser(userId) {
        if (!confirm('Are you sure you want to delete this doctor?')) {
            return;
        }
        
        try {
            await window.api.deleteUser(userId);
            
            await window.ui.loadUsersData();
        } catch (error) {
            
        }
    }

    async function createDefaultUser() {
        try {
            window.ui.showLoading(true);
            
            if (window.neuroFeedbackApp) {
                await window.neuroFeedbackApp.createDefaultUserManually();

                // Hide the button and reload dashboard
                const createUserBtn = document.getElementById('createUserBtn');
                if (createUserBtn) {
                    createUserBtn.style.display = 'none';
                }
                
                await window.ui.loadDashboardData();
            } else {
                throw new Error('Application not initialized');
            }
        } catch (error) {
            const errorMessage = error.message || error.toString() || 'Unknown error occurred';
            
            console.error('Full error object:', error);
        } finally {
            window.ui.showLoading(false);
        }
    }

    // Export functions to window.uiFunctions
    window.uiFunctions = window.uiFunctions || {};
    window.uiFunctions.editUser = editUser;
    window.uiFunctions.deleteUser = deleteUser;
    window.uiFunctions.createDefaultUser = createDefaultUser;
})();