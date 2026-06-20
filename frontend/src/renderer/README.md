# Frontend Structure

## New Organized Structure

```
frontend/src/renderer/
├── index.html
├── app.js                    # Main entry point
├── components/
│   ├── auth/
│   │   └── AuthManager.js    # Authentication management
│   ├── patients/
│   │   └── TreatmentPlanManager.js
│   ├── sessions/
│   │   ├── ProgressVisualization.js
│   │   ├── ComprehensiveReporting.js
│   │   └── CheckpointDecision.js
│   └── common/
│       └── UIController.js   # Main UI management
├── services/
│   ├── API.js               # Backend API calls
│   └── WebSocketManager.js  # WebSocket handling
├── pages/
│   └── NeuroFeedbackApp.js  # Main application logic
└── js/                      # Legacy files (to be organized)
    ├── charts.js
    ├── session-analytics.js
    └── ...
```

## Benefits

1. **Clear Separation**: Each folder has a specific purpose
2. **Easy Navigation**: Related code is grouped together
3. **Scalable**: Easy to add new features
4. **Maintainable**: Changes are isolated to specific areas

## How It Works

- **components/**: UI components and feature modules
- **services/**: Backend communication (API, WebSocket)
- **pages/**: Main application logic
- **js/**: Legacy files (to be moved when needed)

## Migration Notes

- All existing functionality preserved
- No code changes required
- HTML updated to use new paths
- Backward compatible
