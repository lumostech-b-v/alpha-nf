const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  requestFocus: () => ipcRenderer.invoke('request-focus'),
  
  // Window focus management
  recoverWindowFocus: () => ipcRenderer.invoke('recover-window-focus'),
  getWindowFocusState: () => ipcRenderer.invoke('get-window-focus-state'),
  onWindowFocused: (callback) => ipcRenderer.on('window-focused', callback),
  onWindowBlurred: (callback) => ipcRenderer.on('window-blurred', callback),

  // Menu actions
  onMenuNewSession: (callback) => ipcRenderer.on('menu-new-session', callback),
  onMenuExportData: (callback) => ipcRenderer.on('menu-export-data', callback),
  onMenuAbout: (callback) => ipcRenderer.on('menu-about', callback),

  // Feedback window
  openFeedbackWindow: () => ipcRenderer.invoke('open-feedback-window'),
  closeFeedbackWindow: () => ipcRenderer.invoke('close-feedback-window'),
  updateFeedbackValue: (value, phaseMessage, feedbackType) => ipcRenderer.invoke('update-feedback-value', value, phaseMessage, feedbackType),
  setFeedbackType: (feedbackType) => ipcRenderer.invoke('set-feedback-type', feedbackType),
  onFeedbackWindowClosed: (callback) => ipcRenderer.on('feedback-window-closed', callback),
  onFeedbackUpdate: (callback) => {
    console.log('Preload: Setting up feedback-update listener');
    // Remove existing listeners first to avoid duplicates
    ipcRenderer.removeAllListeners('feedback-update');
    // Add new listener
    ipcRenderer.on('feedback-update', (event, value, phaseMessage, feedbackType) => {
      console.log('Preload: Received feedback-update message:', value, typeof value, phaseMessage, feedbackType);
      callback(value, phaseMessage, feedbackType);
    });
    console.log('Preload: Feedback-update listener registered');
  },
  onFeedbackTypeChange: (callback) => {
    ipcRenderer.removeAllListeners('feedback-type-change');
    ipcRenderer.on('feedback-type-change', (event, feedbackType) => {
      callback(feedbackType);
    });
  },

  // Backend status
  onBackendReady: (callback) => ipcRenderer.on('backend-ready', callback),
  onBackendUrl: (callback) => ipcRenderer.on('backend-url', (event, url) => callback(url)),
  onBackendError: (callback) => ipcRenderer.on('backend-error', (event, error) => callback(error)),

  // Remove listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});