if (process.env.VERCEL) {
  module.exports = require('./server').handleRequest;
} else {
  const { app, BrowserWindow } = require('electron');
  const { spawn } = require('child_process');

  let mainWindow;
  let serverProcess;

  function startServer() {
    const port = process.env.PORT || 0;
    serverProcess = spawn('node', ['server.js', `--port=${port}`], {
      cwd: __dirname,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    serverProcess.stdout.on('data', (data) => {
      const msg = data.toString();
      const match = msg.match(/(?:Server|Supplier comparison app) running at http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) {
        createWindow(match[1]);
      }
      console.log(msg.trim());
    });

    serverProcess.stderr.on('data', (data) => console.error(data.toString()));
    serverProcess.on('close', (code) => console.log(`Server exited with code ${code}`));
  }

  function createWindow(port) {
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
    mainWindow.loadURL(`http://127.0.0.1:${port}`);
    mainWindow.on('closed', () => {
      mainWindow = null;
      if (serverProcess) serverProcess.kill('SIGTERM');
    });
  }

  app.whenReady().then(startServer);

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      if (serverProcess) serverProcess.kill('SIGTERM');
      app.quit();
    }
  });

  app.on('activate', () => {
    if (!mainWindow) startServer();
  });
}
