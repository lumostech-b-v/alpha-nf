# Notification/Feedback Summary

This document lists all notification/feedback messages found throughout the application.

## Notification System

The app uses a centralized notification system via `window.ui.showNotification(message, type)` where type can be:
- `success` - Green notifications
- `error` - Red notifications  
- `warning` - Yellow/orange notifications
- `info` - Blue/informational notifications

## Notification Locations

### 1. Core Application (`NeuroFeedbackApp.js`)
- **Line 69**: `'Backend error occurred'` (error)
- **Line 83**: `'Welcome to Doctor Management System'` (success)
- **Line 224**: `'WebSocket not connected. Starting demo mode...'` (warning)
- **Line 263**: `'All connections successful'` (success)
- **Line 265**: `'API connected, WebSocket failed'` (warning)
- **Line 268**: `'Connection test failed'` (error)
- **Line 295**: `'Backend connection failed - working in offline mode'` (warning)
- **Line 434**: `'Connection restored'` (success)
- **Line 442**: `'Connection lost - working offline'` (warning)
- **Line 709**: `'Application data exported successfully'` (success)
- **Line 714**: `'Export failed: ' + error.message` (error)

### 2. UI Initialization (`ui-init.js`)
- **Line 61**: `'UI state reset'` (info)

### 3. UI Utils (`ui-utils.js`)
- **Line 31**: `'Operation timed out'` (warning)
- **Line 267**: `'Logged out successfully'` (success)
- **Line 276**: `'Logout failed'` (error)
- **Line 375**: `'UI state has been reset'` (info)

### 4. UI Protocols (`ui-protocols.js`)
- **Line 53**: `'Error loading protocols: ' + error.message` (error)
- **Line 225**: `'Default protocols cannot be edited'` (warning)
- **Line 233**: `'Error loading protocol: ' + error.message` (error)
- **Line 241**: `'Default protocols cannot be deleted'` (warning)
- **Line 287**: `'Protocol deleted successfully'` (success)
- **Line 293**: `'Error deleting protocol: ' + error.message` (error)
- **Line 812**: `'Invalid frequency range. Min must be less than max and both must be positive.'` (error)
- **Line 851**: `'Please select a channel for all ${type} bands'` (error)
- **Line 891**: `'Please provide both numerator and denominator for all ratio bands'` (error)
- **Line 928**: `'Please select at least one frequency band or ratio band'` (error)
- **Line 971**: `'Protocol updated successfully'` (success)
- **Line 974**: `'Protocol created successfully'` (success)
- **Line 979**: `'Error saving protocol: ' + error.message` (error)

### 5. Session Planning Panel (`SessionPlanningPanel.js`)
- **Line 447**: `'No active block found'` (error)
- **Line 455**: `'No protocols available'` (error)
- **Line 484**: `'Invalid protocol ID'` (error)
- **Line 493**: `'Block not saved yet. Please save the plan first.'` (warning)
- **Line 507**: `'Protocol updated successfully'` (success)
- **Line 510**: `'Error updating protocol: ' + (error.message || 'Unknown error')` (error)
- **Line 786**: Dynamic notification for plan generation (info/error)
- **Line 802**: `'Could not generate plan: ${errorMessage}. Please create blocks manually.'` (error)
- **Line 1144**: `'Scenario applied successfully'` (success)
- **Line 1214**: `'Please use the main Treatment Plan view to create protocols'` (info)
- **Line 1329**: `'Please fill in all required fields'` (error)
- **Line 1335**: `'Session number must be between 1 and ${maxSessions}'` (error)
- **Line 1345**: `'A checkpoint already exists for this session'` (error)
- **Line 1360**: `'Checkpoint saved successfully'` (success)
- **Line 1415**: `'Checkpoint deleted'` (success)
- **Line 1456**: `'Block "${block.name}": Start session must be before or equal to end session'` (error)
- **Line 1538**: `'Treatment plan saved successfully'` (success)
- **Line 1540**: `'Error saving treatment plan: ${error.message || "Unknown error occurred"}'` (error)

### 6. Session Recording Panel (`SessionRecordingPanel.js`)
- **Line 685**: `'Error: Session settings not found'` (error)
- **Line 766**: `'Session started - Waiting for data stream...'` (info)
- **Line 769**: `'Error starting session: ' + error.message` (error)
- **Line 779**: `'Error opening feedback window'` (error)
- **Line 1436**: `'Session paused'` (info)
- **Line 1439**: `'Error pausing session: ' + error.message` (error)
- **Line 1473**: `'Session resumed'` (success)
- **Line 1476**: `'Error resuming session: ' + error.message` (error)
- **Line 1529**: `'Session stopped'` (info)
- **Line 1532**: `'Error stopping session: ' + error.message` (error)

### 7. WebSocket Manager (`WebSocketManager.js`)
- **Line 100**: `'WebSocket connection error'` (error)
- **Line 135**: `'Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})'` (info)
- **Line 142**: `'Connection failed. Please check server status.'` (error)
- **Line 215**: `'Connected to neurofeedback server'` (success)
- **Line 543**: Dynamic notification from server (info/error)
- **Line 550**: `'Server error: ' + data.message` (error)
- **Line 563**: Dynamic message notification (info)
- **Line 571**: `'Finalizing session...'` (info)
- **Line 574**: `'Starting round ${roundNumber + 1}...'` (info)
- **Line 598**: Dynamic success message (success)
- **Line 810**: `'Session completed successfully'` (success)
- **Line 825**: `'Waiting for data from backend... Check backend logs if this persists.'` (warning)

### 8. Treatment Plan Manager (`TreatmentPlanManager.js`)
- **Line 127**: `'Error loading patients'` (error)
- **Line 589**: `'Protocol "${protocol.name}" selected'` (success)
- **Line 719**: `'Please fill in all required fields'` (error)
- **Line 727**: `'Protocol ID ${protocol.id} already exists'` (error)
- **Line 736**: `'Protocol saved successfully'` (success)
- **Line 826**: `'Cannot delete protocol that is used in treatment blocks'` (error)
- **Line 1005**: `'Please select a protocol'` or `'Please fill in all required fields'` (error)
- **Line 1010**: `'Start session must be before or equal to end session'` (error)
- **Line 1022**: `'This block overlaps with an existing block'` (error)
- **Line 1039**: `'Block saved successfully'` (success)
- **Line 1190**: `'Please fill in all required fields'` (error)
- **Line 1195**: `'Session number must be between 1 and ${this.planData.totalSessions}'` (error)
- **Line 1205**: `'A checkpoint already exists for this session'` (error)
- **Line 1221**: `'Checkpoint saved successfully'` (success)
- **Line 1392**: `'Please select a scenario first'` (warning)
- **Line 1466**: `'${scenario.name} scenario applied successfully'` (success)
- **Line 1472**: `'Error applying scenario'` (error)
- **Line 1483**: `'Please select a patient first'` (error)
- **Line 1495**: `'Treatment plan saved successfully'` (success)
- **Line 1499**: `'Error saving treatment plan: ' + error.message` (error)

### 9. Patient Profile (`PatientProfile.js`)
- **Line 893**: Dynamic notification for patient save (success/error)
- **Line 906**: Dynamic notification for patient update (success/error)
- **Line 1007**: `'No disorder selected'` (error)
- **Line 1015**: `'No disorder selected'` (error)
- **Line 1032**: `'No protocols available. Please initialize protocols first.'` (error)
- **Line 1044**: Dynamic notification (success/error)
- **Line 1053**: Dynamic notification (success/error)

### 10. Protocol Transition (`protocol-transition.js`)
- **Line 925**: Dynamic notification from protocol transition system (info/error/success/warning)

### 11. Auth Manager (`AuthManager.js`)
- Uses `showNotification` method (line 343-351) but delegates to UI system

## Statistics

- **Total Notification Calls**: ~172 instances
- **By Type**:
  - Success: ~35
  - Error: ~80
  - Warning: ~15
  - Info: ~25
  - Dynamic/Context-dependent: ~17

## Common Patterns

1. **Form Validation**: Many "Please fill in all required fields" messages
2. **Save Operations**: Success/error pairs for save operations
3. **Connection Status**: Multiple connection-related notifications
4. **Session Management**: Session start/pause/resume/stop notifications
5. **Protocol Management**: Create/update/delete protocol notifications

## Notification Implementation

The notification system is implemented in:
- `frontend/src/renderer/js/core/ui/ui-utils.js` (lines 127-149)
- CSS styling in `frontend/src/renderer/css/styles.css` (lines 1914-2019)
- Notification container in HTML (referenced as `notificationContainer`)

Notifications auto-dismiss after 5 seconds and can be manually closed with an × button.

