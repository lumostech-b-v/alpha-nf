class FeedbackWindow {
  constructor() {
    this.isOpen = false;
    this.feedbackType = 'Image';
  }

  async open(feedbackType = 'Image') {
    if (this.isOpen) return;
    if (!window.electronAPI?.openFeedbackWindow) return;
    
    this.feedbackType = feedbackType;
    await window.electronAPI.openFeedbackWindow();
    this.isOpen = true;
    
    // Send feedback type to the window
    if (window.electronAPI.setFeedbackType) {
      window.electronAPI.setFeedbackType(feedbackType);
    }
    
    window.electronAPI.onFeedbackWindowClosed(() => {
      this.isOpen = false;
      window.uiState?.sessionRecordingPanel?.stopSession();
    });
  }

  async close() {
    if (!this.isOpen) return;
    if (window.electronAPI?.closeFeedbackWindow) {
      await window.electronAPI.closeFeedbackWindow();
      this.isOpen = false;
    }
  }

  updateFeedback(value, phaseMessage = null, feedbackType = null) {
    if (!this.isOpen) return;
    const feedback = Math.max(0, Math.min(1, value));
    const type = feedbackType || this.feedbackType;
    window.electronAPI.updateFeedbackValue(feedback, phaseMessage, type);
  }
}

window.FeedbackWindow = FeedbackWindow;

