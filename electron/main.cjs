const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");

const rootDir = app.getAppPath();
const dataDir = path.join(rootDir, "data");
const collectorScript = path.join(rootDir, "scripts", "qq-notification-collector.ps1");
const devServerArg = process.argv.find((arg) => arg.startsWith("--dev-server="));
const devServerUrl = devServerArg ? devServerArg.split("=").slice(1).join("=") : "";

let mainWindow = null;
let collectorProcess = null;
let collectorLog = [];
let collectorWanted = false;
let collectorRestartTimer = null;
let collectorRestartCount = 0;

const maxCollectorRestarts = 5;

function sendStatus() {
  if (!mainWindow) return;
  mainWindow.webContents.send("collector:status", {
    running: Boolean(collectorProcess),
    pid: collectorProcess?.pid ?? null,
    log: collectorLog.slice(-80),
  });
}

function appendLog(type, text) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    collectorLog.push({ type, text: line, at: new Date().toISOString() });
    if (line.includes("Listening for QQ notifications")) {
      collectorRestartCount = 0;
    }
  }

  collectorLog = collectorLog.slice(-200);
  sendStatus();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 920,
    minHeight: 620,
    title: "QQ 通知采集",
    backgroundColor: "#f5f7fb",
    webPreferences: {
      preload: path.join(rootDir, "electron", "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(rootDir, "dist", "index.html"));
  }
}

function clearCollectorRestartTimer() {
  if (collectorRestartTimer) {
    clearTimeout(collectorRestartTimer);
    collectorRestartTimer = null;
  }
}

function spawnCollectorProcess() {
  if (collectorProcess) {
    return { ok: true, running: true };
  }

  fs.mkdirSync(dataDir, { recursive: true });

  collectorProcess = spawn(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      collectorScript,
      "-OutDir",
      dataDir,
      "-IntervalSeconds",
      "2",
    ],
    {
      cwd: rootDir,
      windowsHide: true,
    }
  );

  appendLog("info", `Collector started, pid=${collectorProcess.pid}`);

  collectorProcess.stdout.on("data", (data) => appendLog("stdout", data));
  collectorProcess.stderr.on("data", (data) => appendLog("stderr", data));
  collectorProcess.on("error", (error) => {
    appendLog("stderr", `Collector process error: ${error.message}`);
  });
  collectorProcess.on("exit", (code, signal) => {
    appendLog("info", `Collector exited, code=${code}, signal=${signal ?? ""}`);
    collectorProcess = null;
    if (collectorWanted) {
      scheduleCollectorRestart();
    }
    sendStatus();
  });

  sendStatus();
  return { ok: true, running: true };
}

function scheduleCollectorRestart() {
  if (!collectorWanted || collectorRestartTimer || collectorProcess) {
    return;
  }

  if (collectorRestartCount >= maxCollectorRestarts) {
    appendLog("stderr", `Collector restart limit reached (${maxCollectorRestarts}).`);
    collectorWanted = false;
    sendStatus();
    return;
  }

  collectorRestartCount++;
  const delayMs = Math.min(collectorRestartCount * 1000, 5000);
  appendLog("info", `Collector will restart in ${delayMs}ms, attempt ${collectorRestartCount}/${maxCollectorRestarts}`);
  collectorRestartTimer = setTimeout(() => {
    collectorRestartTimer = null;
    if (collectorWanted && !collectorProcess) {
      spawnCollectorProcess();
    }
  }, delayMs);
}

function startCollector() {
  collectorWanted = true;
  clearCollectorRestartTimer();
  return spawnCollectorProcess();
}

function stopCollector() {
  collectorWanted = false;
  collectorRestartCount = 0;
  clearCollectorRestartTimer();

  if (!collectorProcess) {
    return { ok: true, running: false };
  }

  const proc = collectorProcess;
  collectorProcess = null;
  proc.kill();
  appendLog("info", "Collector stop requested");
  sendStatus();
  return { ok: true, running: false };
}

function readMessages() {
  if (!fs.existsSync(dataDir)) {
    return [];
  }

  return fs
    .readdirSync(dataDir)
    .filter((fileName) => /^qq-notifications-\d{4}-\d{2}-\d{2}\.jsonl$/.test(fileName))
    .sort()
    .flatMap((fileName) => {
      const filePath = path.join(dataDir, fileName);
      return fs
        .readFileSync(filePath, "utf8")
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
          try {
            return { ...JSON.parse(line), sourceFile: fileName };
          } catch {
            return null;
          }
        });
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
}

ipcMain.handle("collector:start", () => startCollector());
ipcMain.handle("collector:stop", () => stopCollector());
ipcMain.handle("collector:status", () => ({
  running: Boolean(collectorProcess),
  pid: collectorProcess?.pid ?? null,
  log: collectorLog.slice(-80),
}));
ipcMain.handle("messages:list", () => readMessages());
ipcMain.handle("messages:path", () => dataDir);

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  collectorWanted = false;
  clearCollectorRestartTimer();
  if (collectorProcess) {
    collectorProcess.kill();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
