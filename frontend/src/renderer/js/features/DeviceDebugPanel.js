/**
 * DeviceDebugPanel - visual device-connection diagnostic.
 *
 * Opens a modal, connects to ws://<backend>/sp/device_debug, and renders each
 * step of the acquisition flow (scan -> select -> open -> commands -> bytes ->
 * decoded samples) live, ending with a color-coded verdict.
 */
class DeviceDebugPanel {
  constructor() {
    this.modal = null;
    this.ws = null;
    this.running = false;
  }

  wsUrl() {
    const base = (window.api && window.api.baseURL) || 'http://localhost:8000';
    return base.replace(/^http/, 'ws') + '/sp/device_debug';
  }

  open() {
    this.ensureModal();
    this.modal.classList.add('active');
    this.run();
  }

  close() {
    if (this.modal) this.modal.classList.remove('active');
    this.abort();
  }

  abort() {
    if (this.ws) {
      try { this.ws.close(); } catch (e) { /* already closed */ }
      this.ws = null;
    }
    this.running = false;
    this.setRunButton(false);
  }

  ensureModal() {
    if (this.modal) return;
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'deviceDebugModal';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 720px;">
        <div class="modal-header">
          <h3>Device Connection Debug</h3>
          <button class="modal-close" id="deviceDebugClose">&times;</button>
        </div>
        <div style="padding: 16px 20px; max-height: 60vh; overflow-y: auto;">
          <div id="deviceDebugSteps" style="display: flex; flex-direction: column; gap: 8px;"></div>
          <div id="deviceDebugVerdict" style="display: none; margin-top: 14px; padding: 12px 14px; border-radius: 8px; font-weight: 600;"></div>
        </div>
        <div class="modal-actions" style="padding: 12px 20px; display: flex; justify-content: flex-end; gap: 8px;">
          <button class="btn btn-primary" id="deviceDebugRunBtn">Run again</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    this.modal = modal;

    modal.querySelector('#deviceDebugClose').addEventListener('click', () => this.close());
    modal.addEventListener('click', (e) => { if (e.target === modal) this.close(); });
    modal.querySelector('#deviceDebugRunBtn').addEventListener('click', () => this.run());
  }

  setRunButton(running) {
    const btn = this.modal && this.modal.querySelector('#deviceDebugRunBtn');
    if (btn) {
      btn.disabled = running;
      btn.textContent = running ? 'Running...' : 'Run again';
    }
  }

  run() {
    if (this.running) return;
    this.abort();
    this.running = true;
    this.setRunButton(true);

    const steps = this.modal.querySelector('#deviceDebugSteps');
    const verdict = this.modal.querySelector('#deviceDebugVerdict');
    steps.innerHTML = '';
    verdict.style.display = 'none';

    let ws;
    try {
      ws = new WebSocket(this.wsUrl());
    } catch (e) {
      this.showVerdict('fail', 'Could not reach the backend: ' + e.message);
      this.running = false;
      this.setRunButton(false);
      return;
    }
    this.ws = ws;

    ws.onmessage = (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch (e) { return; }
      if (data.type === 'step') this.renderStep(data);
      else if (data.type === 'verdict') this.showVerdict(data.status, data.message);
      else if (data.type === 'error') this.showVerdict('fail', data.message);
    };
    ws.onerror = () => {
      if (this.running) this.showVerdict('fail', 'Connection to backend failed. Is the backend running?');
    };
    ws.onclose = () => {
      this.running = false;
      this.setRunButton(false);
      this.ws = null;
    };
  }

  statusBadge(status) {
    const map = {
      running: { icon: '&#9203;', color: 'var(--text-secondary, #888)' },   // hourglass
      ok:      { icon: '&#10004;', color: '#2e9e5b' },                      // check
      warn:    { icon: '&#9888;',  color: '#c9862b' },                      // warning
      fail:    { icon: '&#10008;', color: '#cc3b3b' },                      // cross
    };
    return map[status] || map.running;
  }

  renderStep(data) {
    const steps = this.modal.querySelector('#deviceDebugSteps');
    let row = steps.querySelector(`[data-step-id="${data.id}"]`);
    if (!row) {
      row = document.createElement('div');
      row.dataset.stepId = data.id;
      row.style.cssText = 'display: flex; gap: 10px; align-items: flex-start; padding: 8px 10px; border: 1px solid var(--border-color, #ddd); border-radius: 8px;';
      steps.appendChild(row);
    }
    const badge = this.statusBadge(data.status);
    let extra = '';
    if (data.first_samples) {
      extra += `<div style="font-family: monospace; font-size: 12px; margin-top: 4px; opacity: 0.85;">first samples: ${data.first_samples}</div>`;
    }
    if (data.hex) {
      extra += `<div style="font-family: monospace; font-size: 12px; margin-top: 2px; opacity: 0.7;">hex: ${data.hex}</div>`;
    }
    row.innerHTML = `
      <div style="font-size: 16px; line-height: 1.4; color: ${badge.color};">${badge.icon}</div>
      <div style="flex: 1; min-width: 0;">
        <div style="font-weight: 600;">${data.label}</div>
        ${data.detail ? `<div style="font-size: 13px; margin-top: 2px; opacity: 0.85; word-break: break-word;">${data.detail}</div>` : ''}
        ${extra}
      </div>`;
    row.scrollIntoView({ block: 'nearest' });
  }

  showVerdict(status, message) {
    const verdict = this.modal.querySelector('#deviceDebugVerdict');
    const colors = {
      ok:   { bg: 'rgba(46, 158, 91, 0.12)',  fg: '#2e9e5b' },
      warn: { bg: 'rgba(201, 134, 43, 0.12)', fg: '#c9862b' },
      fail: { bg: 'rgba(204, 59, 59, 0.12)',  fg: '#cc3b3b' },
    };
    const c = colors[status] || colors.fail;
    verdict.style.display = 'block';
    verdict.style.background = c.bg;
    verdict.style.color = c.fg;
    verdict.textContent = message;
  }
}

window.DeviceDebugPanel = DeviceDebugPanel;

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('deviceDebugBtn');
  if (btn) {
    btn.addEventListener('click', () => {
      if (!window.deviceDebugPanel) window.deviceDebugPanel = new DeviceDebugPanel();
      window.deviceDebugPanel.open();
    });
  }
});
