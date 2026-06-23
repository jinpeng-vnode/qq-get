const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");

const rootDir = app.getAppPath();
const dataFile = path.join(rootDir, "data", "qq-notifications.jsonl");
const collectorScript = path.join(rootDir, "scripts", "qq-notification-collector.ps1");
const devServerArg = process.argv.find((arg) => arg.startsWith("--dev-server="));
const devServerUrl = devServerArg ? devServerArg.split("=").slice(1).join("=") : "";

let mainWindow = null;
let collectorProcess = null;
let collectorLog = [];

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

function startCollector() {
  if (collectorProcess) {
    return { ok: true, running: true };
  }

  fs.mkdirSync(path.dirname(dataFile), { recursive: true });

  collectorProcess = spawn(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      collectorScript,
      "-OutFile",
      dataFile,
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
  collectorProcess.on("exit", (code, signal) => {
    appendLog("info", `Collector exited, code=${code}, signal=${signal ?? ""}`);
    collectorProcess = null;
    sendStatus();
  });

  sendStatus();
  return { ok: true, running: true };
}

function stopCollector() {
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
  if (!fs.existsSync(dataFile)) {
    return [];
  }

  return fs
    .readFileSync(dataFile, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .reverse();
}

ipcMain.handle("collector:start", () => startCollector());
ipcMain.handle("collector:stop", () => stopCollector());
ipcMain.handle("collector:status", () => ({
  running: Boolean(collectorProcess),
  pid: collectorProcess?.pid ?? null,
  log: collectorLog.slice(-80),
}));
ipcMain.handle("messages:list", () => readMessages());
ipcMain.handle("messages:path", () => dataFile);

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  if (collectorProcess) {
    collectorProcess.kill();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
