# Neuro-Feedback Electron App

A modern, minimal Electron application for EEG neurofeedback system management.

## Features

- **Modern UI**: Clean, minimal black and white design
- **Complete Backend Integration**: Full REST API and WebSocket connectivity
- **Doctor Management**: CRUD operations for healthcare providers
- **Patient Management**: Patient records with doctor relationships
- **Session Management**: Neurofeedback session tracking and configuration
- **Live Sessions**: Real-time EEG monitoring and feedback
- **Data Visualization**: Interactive charts for EEG data and statistics
- **Export Functionality**: CSV export of session data
- **Offline Support**: Graceful handling of connection issues

## Architecture

The application follows a modular architecture with clear separation of concerns:

- **Main Process** (`src/main.js`): Electron application lifecycle
- **Renderer Process** (`src/renderer/`): Web application UI
- **API Module** (`js/api.js`): Backend REST API communication
- **UI Controller** (`js/ui.js`): User interface management
- **Charts Manager** (`js/charts.js`): Data visualization with Chart.js
- **WebSocket Manager** (`js/websocket.js`): Real-time communication
- **App Controller** (`js/app.js`): Application coordination

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- Python backend server running (see `../pyServer/README.md`)

### Installation

1. Install dependencies:
```bash
cd frontend
npm install
```

2. Start the application in development mode:
```bash
npm run dev
```

3. Build the application:
```bash
npm run build
```

### Building for Distribution

- **macOS**: `npm run build:mac`
- **Windows**: `npm run build:win`
- **Linux**: `npm run build:linux`

## Configuration

The application can be configured through the Settings panel or by modifying localStorage:

- **API URL**: Backend REST API endpoint (default: `http://localhost:8000`)
- **WebSocket URL**: Real-time data endpoint (default: `ws://localhost:8000`)
- **Auto-sync**: Automatic session synchronization
- **Theme**: UI appearance (currently light mode only)

## Usage

### Managing Doctors

1. Navigate to the "Doctors" section
2. Click "Add Doctor" to create new healthcare provider accounts
3. Edit or delete existing doctors using table actions

### Managing Patients

1. Navigate to the "Patients" section
2. Click "Add Patient" to register new patients
3. Assign patients to doctors during creation
4. Update patient information as needed

### Session Management

1. Navigate to the "Sessions" section to view all recorded sessions
2. Use filters to find specific sessions by patient, type, or status
3. Export session data using the "Export" button

### Live Sessions

1. Navigate to the "Live Session" section
2. Select a patient and configure session parameters:
   - Session Type: Baseline or Training
   - Protocol Type: TBR, Alpha, or Beta enhancement
   - EEG Channels: JSON array of channel names
   - Session rounds and duration
3. Click "Start Session" to begin real-time monitoring
4. Monitor EEG signals, frequency bands, and feedback values
5. Click "Stop Session" to end the session

### Dashboard

The dashboard provides an overview of:
- Total patients and doctors
- Active and completed sessions
- System status (backend, database, signal processing)
- Recent session activity

## Keyboard Shortcuts

- **Ctrl/Cmd + N**: New Session
- **Ctrl/Cmd + E**: Export Data
- **Ctrl/Cmd + R**: Reload Application
- **Ctrl/Cmd + ,**: Settings
- **Escape**: Close Modal

## Real-time Features

When connected to the backend WebSocket:
- Live EEG signal visualization
- Real-time frequency band analysis
- Continuous feedback value updates
- Session progress tracking

## Offline Mode

The application gracefully handles connection issues:
- Cached data remains available
- Offline status indicators
- Automatic reconnection attempts
- Data sync when connection restored

## Development

### Project Structure

```
frontend/
├── src/
│   ├── main.js              # Electron main process
│   ├── preload.js           # Secure IPC bridge
│   └── renderer/            # Web application
│       ├── index.html       # Main HTML file
│       ├── styles.css       # UI styles
│       └── js/              # JavaScript modules
│           ├── api.js       # REST API client
│           ├── ui.js        # UI controller
│           ├── charts.js    # Data visualization
│           ├── websocket.js # Real-time communication
│           └── app.js       # Main application
├── assets/                  # Application assets
├── package.json            # Dependencies and scripts
└── README.md              # This file
```

### Code Style

- **ES6+ JavaScript**: Modern JavaScript features
- **Modular Architecture**: Clear separation of concerns
- **Error Handling**: Comprehensive error management
- **Responsive Design**: Works on various screen sizes
- **Accessibility**: Keyboard navigation support

### Adding New Features

1. Create new modules in the `js/` directory
2. Register modules with the main application
3. Follow existing patterns for API integration
4. Update UI accordingly
5. Test with both online and offline modes

## API Integration

The application integrates with all backend endpoints:

- **Users API**: Doctor management (`/users/`)
- **Patients API**: Patient management (`/patients/`)
- **Sessions API**: Session management (`/sessions/`)
- **WebSocket**: Real-time data (`/ws/`)

See backend API documentation for detailed endpoint specifications.

## Troubleshooting

### Common Issues

1. **Backend Connection Failed**
   - Verify backend server is running on `localhost:8000`
   - Check API URL in Settings
   - Ensure CORS is properly configured

2. **WebSocket Connection Issues**
   - Verify WebSocket endpoint is available
   - Check browser console for connection errors
   - Try manual connection test in Settings

3. **Charts Not Displaying**
   - Ensure Chart.js is loaded
   - Check browser console for JavaScript errors
   - Verify chart containers exist in DOM

4. **Data Not Loading**
   - Check network connectivity
   - Verify backend API responses
   - Clear localStorage and reload

### Debug Commands

In development mode, use browser console:

```javascript
// Check application status
debugApp()

// Access modules directly
neuroFeedbackApp.modules.api.testConnection()
neuroFeedbackApp.modules.websocket.connect()
```

## License

This project is part of the Neuro-Feedback system. See main project documentation for licensing information.