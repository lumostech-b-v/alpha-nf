const { app, BrowserWindow, Menu, ipcMain, shell, nativeImage } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn, exec, execSync } = require('child_process');

let mainWindow;
let feedbackWindow = null;
let isDevMode = process.argv.includes('--dev');
let backendProcess = null;
let activeBackendUrl = null;
let isQuitting = false;

// Disable hardware acceleration to fix input freezing/glitching issues in production builds
// This addresses the issue where inputs (select, typing) freeze until DevTools is toggled
app.disableHardwareAcceleration();

// Root cause of the "inputs freeze until DevTools is toggled" bug on packaged Windows builds:
// Chromium's native window occlusion calculation sometimes wrongly decides the window is
// hidden behind other windows and suspends rendering + input routing to the web view.
// Opening DevTools changes the occlusion state and "unfreezes" it. Disabling the feature
// is the canonical fix. (Windows-only behaviour, which is why it never shows in dev on macOS.)
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

// Request single instance lock to prevent multiple app instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance is already running, quit this one
  console.log('Another instance is already running. Quitting...');
  app.quit();
} else {
  // Handle second instance launch - focus existing window
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Kill any orphan backend processes from previous runs
function killOrphanBackendProcesses() {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      // Kill any main.exe processes that might be leftover from previous runs
      exec('tasklist /FI "IMAGENAME eq main.exe" /FO CSV /NH', (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve();
          return;
        }
        
        // Parse the output to find PIDs
        const lines = stdout.trim().split('\n');
        for (const line of lines) {
          if (line.includes('main.exe')) {
            const match = line.match(/"main\.exe","(\d+)"/);
            if (match && match[1]) {
              const pid = match[1];
              console.log(`Killing orphan backend process with PID: ${pid}`);
              try {
                execSync(`taskkill /pid ${pid} /f /t`, { stdio: 'ignore' });
              } catch (e) {
                console.log(`Could not kill process ${pid}:`, e.message);
              }
            }
          }
        }
        resolve();
      });
    } else {
      // On macOS/Linux, find and kill main processes
      exec('pgrep -f "main.exe|uvicorn"', (error, stdout) => {
        if (!error && stdout.trim()) {
          const pids = stdout.trim().split('\n');
          for (const pid of pids) {
            if (pid && !isNaN(parseInt(pid))) {
              try {
                process.kill(parseInt(pid), 'SIGKILL');
                console.log(`Killed orphan process with PID: ${pid}`);
              } catch (e) {
                // Ignore errors
              }
            }
          }
        }
        resolve();
      });
    }
  });
}

// Free up the backend port if it's still in use
function freeBackendPort(port = 8000) {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      exec(`netstat -ano | findstr :${port}`, (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve();
          return;
        }
        
        // Parse PIDs from netstat output
        const lines = stdout.trim().split('\n');
        const pidsToKill = new Set();
        
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && !isNaN(parseInt(pid)) && parseInt(pid) !== 0) {
            pidsToKill.add(pid);
          }
        }
        
        for (const pid of pidsToKill) {
          console.log(`Killing process holding port ${port}, PID: ${pid}`);
          try {
            execSync(`taskkill /pid ${pid} /f`, { stdio: 'ignore' });
          } catch (e) {
            // Process might already be gone
          }
        }
        
        // Wait a moment for the port to be freed
        setTimeout(resolve, 500);
      });
    } else {
      exec(`lsof -ti:${port}`, (error, stdout) => {
        if (!error && stdout.trim()) {
          const pids = stdout.trim().split('\n');
          for (const pid of pids) {
            try {
              process.kill(parseInt(pid), 'SIGKILL');
              console.log(`Killed process holding port ${port}, PID: ${pid}`);
            } catch (e) {
              // Ignore
            }
          }
        }
        setTimeout(resolve, 500);
      });
    }
  });
}

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false, // Prevent renderer throttling when backgrounded
      offscreen: false // Ensure rendering happens on screen
    },
    titleBarStyle: 'default',
    backgroundColor: '#ffffff',
    show: false,
    icon: path.join(__dirname, '../assets/icon.png')
  });

  // Load the main HTML file
  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
    
    // Open DevTools in development mode
    if (isDevMode) {
      mainWindow.webContents.openDevTools();
    }

    // If backend is already running, send the URL to the new window
    if (activeBackendUrl) {
      console.log('Sending cached backend URL to new window:', activeBackendUrl);
      mainWindow.webContents.send('backend-ready');
      mainWindow.webContents.send('backend-url', activeBackendUrl);
    }
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    // Clean up focus recovery interval
    if (focusRecoveryInterval) {
      clearInterval(focusRecoveryInterval);
      focusRecoveryInterval = null;
    }
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // ========================================
  // FOCUS MANAGEMENT - Fix input freeze issues
  // ========================================
  
  // Track window focus state
  let isWindowFocused = true;
  let focusRecoveryInterval = null;
  
  // Handle window focus events
  mainWindow.on('focus', () => {
    isWindowFocused = true;
    console.log('[Focus] Window gained focus');

    // Notify renderer that window is focused
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window-focused');
      // Transfer input focus to the renderer process. OS-level window.focus() is not
      // enough on Windows packaged builds — without this, clicks on inputs are silently
      // ignored until DevTools is toggled (which calls webContents.focus() internally).
      mainWindow.webContents.focus();
    }
    
    // Clear any focus recovery interval
    if (focusRecoveryInterval) {
      clearInterval(focusRecoveryInterval);
      focusRecoveryInterval = null;
    }
  });
  
  mainWindow.on('blur', () => {
    isWindowFocused = false;
    console.log('[Focus] Window lost focus');
    
    // Notify renderer that window lost focus
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window-blurred');
    }
  });
  
  // Handle window activation (Windows/Linux)
  mainWindow.on('show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      // Small delay to ensure window is fully ready
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.focus();
          mainWindow.webContents.focus();
        }
      }, 100);
    }
  });
  
  // Periodic focus recovery - ensures window stays focused when it should be
  // This is critical for fixing input freeze issues in packaged .exe
  // The renderer will trigger focus recovery via IPC when it detects input freeze
  // This interval just monitors the state and logs for debugging
  focusRecoveryInterval = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      if (focusRecoveryInterval) {
        clearInterval(focusRecoveryInterval);
        focusRecoveryInterval = null;
      }
      return;
    }
    
    // Just monitor state - actual recovery is triggered by renderer via IPC
    const currentFocused = mainWindow.isFocused();
    if (currentFocused !== isWindowFocused) {
      isWindowFocused = currentFocused;
      // State will be updated by focus/blur handlers above
    }
  }, 5000); // Check every 5 seconds (less frequent, just for monitoring)
  
}

// App event listeners
app.whenReady().then(async () => {
  // Only proceed if we got the single instance lock
  if (!gotTheLock) return;

  // On macOS the dock icon comes from the .app bundle, so BrowserWindow `icon` is
  // ignored while running unpackaged (`npm run dev/start`). Set it explicitly so the
  // dev dock shows the app logo. (Packaged builds get their icon from electron-builder.)
  if (process.platform === 'darwin' && app.dock) {
    const dockIcon = nativeImage.createFromPath(path.join(__dirname, '../assets/icon.png'));
    if (!dockIcon.isEmpty()) app.dock.setIcon(dockIcon);
  }

  // Clean up any orphan processes from previous runs before starting
  console.log('Cleaning up orphan processes...');
  await killOrphanBackendProcesses();
  await freeBackendPort(8000);
  console.log('Orphan cleanup complete');

  // Start the backend executable
  startBackend();

  createWindow();
  createMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Clean up backend process on app quit
app.on('before-quit', async (event) => {
  // Prevent re-entry
  if (isQuitting) return;
  
  // If there's a backend process to clean up, handle it
  if (backendProcess && backendProcess.pid) {
    event.preventDefault();
    isQuitting = true;
    
    console.log('Terminating backend process before quit...');
    const pid = backendProcess.pid;
    backendProcess = null; // Clear immediately to prevent restart logic

    try {
      if (process.platform === 'win32') {
        // Use synchronous kill on Windows to ensure completion
        try {
          execSync(`taskkill /pid ${pid} /f /t`, { stdio: 'ignore', timeout: 5000 });
          console.log(`Killed backend process with PID: ${pid}`);
        } catch (e) {
          console.log('Taskkill completed (process may have already exited)');
        }
        
        // Also kill by name as a fallback
        try {
          execSync('taskkill /im main.exe /f', { stdio: 'ignore', timeout: 3000 });
        } catch (e) {
          // Ignore - process might not exist
        }
      } else {
        try {
          process.kill(-pid, 'SIGTERM');
        } catch(e) { /* ignore */ }
        
        // Give it a moment then force kill
        await new Promise(resolve => setTimeout(resolve, 500));
        
        try {
          process.kill(-pid, 'SIGKILL');
        } catch(e) { /* ignore */ }
      }
    } catch (e) {
      console.error('Error during backend cleanup:', e.message);
    }

    console.log('Backend process terminated, exiting app...');
    
    // Small delay to ensure process is fully cleaned up
    await new Promise(resolve => setTimeout(resolve, 300));
    app.exit(0);
  }
});

// Additional cleanup on will-quit
app.on('will-quit', (event) => {
  console.log('App will quit - performing final cleanup...');
  
  // Final synchronous cleanup attempt
  if (process.platform === 'win32') {
    try {
      execSync('taskkill /im main.exe /f', { stdio: 'ignore', timeout: 3000 });
    } catch (e) {
      // Ignore
    }
  }
});

// Handle quit event
app.on('quit', () => {
  console.log('App quit event received');
  isQuitting = true;
});

// Create application menu
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Session',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow.webContents.send('menu-new-session');
          }
        },
        { type: 'separator' },
        {
          label: 'Export Data',
          accelerator: 'CmdOrCtrl+E',
          click: () => {
            mainWindow.webContents.send('menu-export-data');
          }
        },
        { type: 'separator' },
        {
          role: 'quit'
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Doctor Management System',
          click: () => {
            mainWindow.webContents.send('menu-about');
          }
        }
      ]
    }
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideothers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });

    // Window menu
    template[4].submenu = [
      { role: 'close' },
      { role: 'minimize' },
      { role: 'zoom' },
      { type: 'separator' },
      { role: 'front' }
    ];
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Function to start the backend executable
function startBackend() {
  // Don't start if we're quitting
  if (isQuitting) {
    console.log('App is quitting, not starting backend');
    return;
  }

  try {
    // Try multiple potential paths for the backend executable
    let backendPath = path.join(process.resourcesPath, 'backend', 'main.exe');
    let backendFound = false;

    // Check if backend exists in resources path
    if (fs.existsSync(backendPath)) {
      backendFound = true;
    } else {
      // Check if we're in development mode (backend might be in project root)
      const devBackendPath = path.join(__dirname, '..', '..', 'pyServer', 'dist', 'main', 'main.exe');
      if (fs.existsSync(devBackendPath)) {
        backendPath = devBackendPath;
        backendFound = true;
      } else {
        // Check for backend in app directory (alternative packaging)
        const appBackendPath = path.join(process.resourcesPath, '..', 'main.exe');
        if (fs.existsSync(appBackendPath)) {
          backendPath = appBackendPath;
          backendFound = true;
        } else {
          // Check additional possible locations in the built app
          const possiblePaths = [
            path.join(process.resourcesPath, '..', '..', 'main.exe'), // For NSIS installer
            path.join(process.resourcesPath, '..', 'app', 'main.exe'), // For some Electron builds
            path.join(process.resourcesPath, 'main.exe'), // Direct in resources
          ];

          for (const possiblePath of possiblePaths) {
            if (fs.existsSync(possiblePath)) {
              backendPath = possiblePath;
              backendFound = true;
              break;
            }
          }
        }
      }
    }

    console.log('Attempting to start backend executable at:', backendPath);
    console.log('Backend found:', backendFound);

    if (!backendFound) {
      console.error('Backend executable not found at any expected location.');
      console.error('Contents of resourcesPath:', fs.readdirSync(process.resourcesPath));

      // Try to list all .exe files in resourcesPath and subdirectories
      const findExeFiles = (dir) => {
        let results = [];
        const items = fs.readdirSync(dir);
        for (const item of items) {
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            results = results.concat(findExeFiles(fullPath));
          } else if (item.endsWith('.exe')) {
            results.push(fullPath);
          }
        }
        return results;
      };

      console.error('Found executable files:', findExeFiles(process.resourcesPath));
      return;
    }

    // Start the backend process with proper Windows configuration to prevent console window from showing
    const backendOptions = {
      detached: false,  // Don't run as detached to better manage the process
      stdio: ['ignore', 'pipe', 'pipe'],  // Don't inherit stdin, but capture stdout/stderr
    };

    // On Windows, show the console window for debugging
    if (process.platform === 'win32') {
      backendOptions.windowsHide = false;  // Show console to see errors
      
      // Set database path to a writable user directory to avoid permission issues
      const userDataDir = path.join(os.homedir(), 'AppData', 'Local', 'NeuroFeedbackSystem');
      
      // Ensure the directory exists
      try {
        if (!fs.existsSync(userDataDir)) {
          fs.mkdirSync(userDataDir, { recursive: true });
        }
      } catch (err) {
        console.error('Failed to create user data directory:', err);
      }
      
      const dbPath = path.join(userDataDir, 'app.db');
      const databaseUrl = `sqlite:///${dbPath.replace(/\\/g, '/')}`;
      
      // Set environment variables for the backend
      backendOptions.env = { 
        ...process.env, 
        PYTHONUNBUFFERED: '1',
        DATABASE_URL: databaseUrl
      };
      
      console.log('Setting DATABASE_URL to:', databaseUrl);
    } else {
      // For macOS and Linux, also set a writable database path
      
      let userDataDir;
      if (process.platform === 'darwin') {
        userDataDir = path.join(os.homedir(), 'Library', 'Application Support', 'NeuroFeedbackSystem');
      } else {
        userDataDir = path.join(os.homedir(), '.local', 'share', 'NeuroFeedbackSystem');
      }
      
      try {
        if (!fs.existsSync(userDataDir)) {
          fs.mkdirSync(userDataDir, { recursive: true });
        }
        const dbPath = path.join(userDataDir, 'app.db');
        const databaseUrl = `sqlite:///${dbPath}`;
        backendOptions.env = { 
          ...process.env, 
          PYTHONUNBUFFERED: '1',
          DATABASE_URL: databaseUrl
        };
        console.log('Setting DATABASE_URL to:', databaseUrl);
      } catch (err) {
        console.error('Failed to create user data directory:', err);
        backendOptions.env = { ...process.env, PYTHONUNBUFFERED: '1' };
      }
    }

    backendProcess = spawn(backendPath, backendOptions);

    backendProcess.stdout.on('data', (data) => {
      console.log('Backend stdout:', data.toString());
    });

    backendProcess.stderr.on('data', (data) => {
      console.error('Backend stderr:', data.toString());
    });

    backendProcess.on('close', (code) => {
      console.log('Backend process exited with code:', code);
      backendProcess = null;
      // Restart the backend if it unexpectedly exits (but not if we're quitting)
      if (code !== 0 && !isQuitting) {
        console.log('Backend process exited unexpectedly, attempting restart in 2 seconds...');
        setTimeout(startBackend, 2000);
      }
    });

    let backendStartTime = Date.now();

    backendProcess.on('error', (err) => {
      console.error('Failed to start backend process:', err.message);
      console.error('Error code:', err.code);
      console.error('Error path:', err.path);
      // Try to find the correct path by logging more information
      console.error('Current working directory:', process.cwd());
      console.error('App path:', app.getAppPath());
      console.error('Process resources path:', process.resourcesPath);
      console.error('Backend executable path attempted:', backendPath);
    });

    // Handle the case where the process exits immediately (crashes)
    backendProcess.on('close', (code, signal) => {
      const uptime = Date.now() - backendStartTime;
      console.log(`Backend process closed with code: ${code}, signal: ${signal}`);
      console.log(`Backend process uptime: ${uptime}ms`);

      // Don't process if we're quitting
      if (isQuitting) {
        backendProcess = null;
        return;
      }

      if (uptime < 2000) { // If process lived less than 2 seconds, it likely crashed
        console.error('Backend process crashed immediately - likely missing dependencies or configuration');
        // Send error message to frontend
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('backend-error', {
            message: 'Backend crashed immediately - check dependencies',
            uptime: uptime
          });
        }
      }

      backendProcess = null;
      // Restart the backend if it unexpectedly exits (but not if we're quitting)
      if (code !== 0 && !isQuitting) {
        console.log('Backend process exited unexpectedly, attempting restart in 2 seconds...');
        setTimeout(startBackend, 2000);
      }
    });

    console.log('Backend process started successfully at:', backendPath);

    // Wait for backend to be ready before allowing frontend to make API calls
    checkBackendHealth();
  } catch (error) {
    console.error('Error starting backend:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Function to check if the backend is ready
async function checkBackendHealth() {
  const axios = require('axios');
  const maxRetries = 30; // 30 attempts with 1 second intervals = 30 seconds max wait
  let attempts = 0;

  // Try different common ports for the backend
  const portsToTry = [8000, 8080, 5000, 3000, 4000];
  let currentPortIndex = 0;

  const check = async () => {
    try {
      const port = portsToTry[currentPortIndex];
      const url = `http://localhost:${port}/health`;

      const response = await axios.get(url, { timeout: 2000 });
      if (response.status === 200) {
        console.log(`Backend is ready and responding on port ${port}`);
        
        const backendUrl = url.replace('/health', '');
        activeBackendUrl = backendUrl; // Cache for new windows

        // Optionally, send a message to renderer to indicate backend is ready
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('backend-ready');
          // Store the correct backend URL for use by the renderer process
          mainWindow.webContents.send('backend-url', backendUrl);
          console.log('Sent backend URL to renderer:', backendUrl);
        }
        return true;
      }
    } catch (error) {
      attempts++;
      if (attempts % 3 === 0 && currentPortIndex < portsToTry.length - 1) {
        // After 3 attempts on current port, try next port
        currentPortIndex++;
        attempts = 0; // Reset attempts for new port
        console.log(`Trying next port: ${portsToTry[currentPortIndex]}`);
      }

      if (currentPortIndex < portsToTry.length - 1 || attempts < maxRetries) {
        if (attempts < maxRetries) {
          console.log(`Backend not ready yet (attempt ${attempts}/${maxRetries}) on port ${portsToTry[currentPortIndex]}, retrying in 1 second...`);
          setTimeout(check, 1000); // Retry after 1 second
        }
      } else {
        console.error(`Backend failed to become ready after ${maxRetries} attempts on ports: ${portsToTry.join(', ')}`);
        console.error('Error:', error.message);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('backend-error', {
            message: `Backend failed to start after multiple attempts. Please check logs. Last error: ${error.message}`
          });
        }
      }
    }
  };

  // Start checking immediately
  check();

  // Also periodically check if backend is still running
  const healthCheckInterval = setInterval(() => {
    if (!backendProcess) {
      console.warn('Backend process is no longer running');
      clearInterval(healthCheckInterval);
    }
  }, 5000); // Check every 5 seconds
}

// IPC handlers
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// Allow frontend to restart backend if needed
ipcMain.handle('restart-backend', async () => {
  if (backendProcess) {
    console.log('Restarting backend process...');
    // Terminate current backend process
    if (backendProcess.pid) {
      try {
        if (process.platform === 'win32') {
          exec(`taskkill /pid ${backendProcess.pid} /f /t`, (error) => {
            if (error) {
              console.error('Error terminating backend process:', error);
            }
            // Start new backend after termination
            setTimeout(() => {
              startBackend();
            }, 1000);
          });
        } else {
          process.kill(-backendProcess.pid, 'SIGTERM');
          setTimeout(() => {
            startBackend();
          }, 1000);
        }
      } catch (e) {
        console.error('Failed to kill backend process:', e);
      }
    }
    backendProcess = null;
  } else {
    // If no backend is running, just start one
    startBackend();
  }
  return { success: true };
});

// Expose backend status to renderer
ipcMain.handle('get-backend-status', () => {
  return {
    isRunning: backendProcess !== null && backendProcess.pid !== undefined
  };
});

// Allow renderer to request backend restart
ipcMain.handle('request-backend-restart', async () => {
  console.log('Received request to restart backend');
  if (backendProcess) {
    // Try to gracefully shut down the current backend
    if (process.platform === 'win32') {
      exec(`taskkill /pid ${backendProcess.pid} /f /t`, (error) => {
        if (error) {
          console.error('Error terminating backend for restart:', error);
        }
        backendProcess = null;
        // Start new backend after termination
        setTimeout(() => {
          startBackend();
        }, 1000);
      });
    } else {
      try {
        process.kill(-backendProcess.pid, 'SIGTERM');
        backendProcess = null;
        setTimeout(() => {
          startBackend();
        }, 1000);
      } catch (e) {
        console.error('Error terminating backend for restart:', e);
        backendProcess = null;
        setTimeout(() => {
          startBackend();
        }, 1000);
      }
    }
  } else {
    // If no backend is running, just start one
    startBackend();
  }
  return { success: true };
});

ipcMain.handle('get-platform', () => {
  return process.platform;
});

ipcMain.handle('request-focus', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    console.log('Manually forcing focus to main window via IPC');
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  }
});

// Handle IPC requests to force focus recovery (for input freeze fixes)
ipcMain.handle('recover-window-focus', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    console.log('[Focus] Recovering window focus via IPC request');
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
    // Focus the render view too: mainWindow.focus() only focuses the OS window,
    // whereas inputs not receiving keystrokes is a webContents-level focus issue.
    mainWindow.webContents.focus();
    return { success: true };
  }
  return { success: false };
});

// Handle IPC requests to check focus state
ipcMain.handle('get-window-focus-state', () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { focused: false, visible: false, minimized: false };
  }
  return {
    focused: mainWindow.isFocused(),
    visible: mainWindow.isVisible(),
    minimized: mainWindow.isMinimized()
  };
});

// Feedback window handlers
ipcMain.handle('open-feedback-window', () => {
  try {
    if (feedbackWindow && !feedbackWindow.isDestroyed()) {
      feedbackWindow.focus();
      return;
    }

    console.log('Creating feedback window...');
    feedbackWindow = new BrowserWindow({
      width: 500,
      height: 600,
      minWidth: 400,
      minHeight: 500,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        preload: path.join(__dirname, 'preload.js')
      },
      titleBarStyle: 'hiddenInset',
      backgroundColor: '#000000',
      show: false,
      resizable: true,
      alwaysOnTop: true, // Make it always on top so it's visible
      skipTaskbar: false, // Show in taskbar independently
      // Removed parent property so minimizing feedback window won't minimize main app
      modal: false
    });

    const htmlPath = path.join(__dirname, 'renderer/feedback-window.html');
    console.log('Loading feedback window from:', htmlPath);
    
    // Check if file exists
    const fs = require('fs');
    if (!fs.existsSync(htmlPath)) {
      console.error('Feedback window HTML file not found at:', htmlPath);
      throw new Error(`Feedback window HTML file not found at: ${htmlPath}`);
    }

    feedbackWindow.loadFile(htmlPath).catch((error) => {
      console.error('Error loading feedback window HTML:', error);
    });

    feedbackWindow.once('ready-to-show', () => {
      console.log('Feedback window ready, showing...');
      feedbackWindow.show();
      feedbackWindow.focus();
    });

    feedbackWindow.on('closed', () => {
      console.log('Feedback window closed');
      feedbackWindow = null;

      // Refocus main window when feedback window closes.
      // webContents.focus() is required in addition to focus() so that the renderer
      // receives keyboard/mouse input again on Windows — OS-level focus alone is not enough.
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.focus();
        mainWindow.webContents.focus();
        mainWindow.webContents.send('feedback-window-closed');
      }
    });

    feedbackWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      console.error('Feedback window failed to load:', {
        errorCode,
        errorDescription,
        validatedURL
      });
    });

    feedbackWindow.webContents.on('did-finish-load', () => {
      console.log('Feedback window finished loading');
    });
  } catch (error) {
    console.error('Error creating feedback window:', error);
    throw error;
  }
});

ipcMain.handle('close-feedback-window', () => {
  if (feedbackWindow) {
    feedbackWindow.close();
    feedbackWindow = null;
  }
});

ipcMain.handle('update-feedback-value', (event, value, phaseMessage, feedbackType) => {
  console.log('Main process: Received feedback value update:', value, 'Type:', typeof value, 'Phase:', phaseMessage, 'FeedbackType:', feedbackType);
  
  if (feedbackWindow && !feedbackWindow.isDestroyed()) {
    console.log('Main process: Sending feedback value to feedback window:', value, phaseMessage, feedbackType);
    try {
      feedbackWindow.webContents.send('feedback-update', value, phaseMessage, feedbackType);
      console.log('Main process: Successfully sent feedback value to feedback window');
      return { success: true, value: value, phaseMessage: phaseMessage, feedbackType: feedbackType };
    } catch (error) {
      console.error('Main process: Error sending feedback value:', error);
      return { success: false, error: error.message };
    }
  } else {
    console.warn('Main process: Cannot send feedback value - window not available:', {
      hasWindow: !!feedbackWindow,
      isDestroyed: feedbackWindow ? feedbackWindow.isDestroyed() : 'N/A'
    });
    return { success: false, error: 'Feedback window not available' };
  }
});

ipcMain.handle('set-feedback-type', (event, feedbackType) => {
  console.log('Main process: Setting feedback type:', feedbackType);
  
  if (feedbackWindow && !feedbackWindow.isDestroyed()) {
    try {
      feedbackWindow.webContents.send('feedback-type-change', feedbackType);
      return { success: true, feedbackType: feedbackType };
    } catch (error) {
      console.error('Main process: Error setting feedback type:', error);
      return { success: false, error: error.message };
    }
  } else {
    return { success: false, error: 'Feedback window not available' };
  }
});

// Handle app protocol for deep linking (future feature)
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('neurofeedback', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('neurofeedback');
}