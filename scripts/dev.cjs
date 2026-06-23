const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const devUrl = "http://127.0.0.1:5173";
const viteBin = path.join(rootDir, "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite");
const electronBin = path.join(rootDir, "node_modules", ".bin", process.platform === "win32" ? "electron.cmd" : "electron");

let viteProcess = null;
let electronProcess = null;
let shuttingDown = false;

function spawnLogged(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: rootDir,
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
    ...options,
  });

  child.stdout?.on("data", (data) => process.stdout.write(data));
  child.stderr?.on("data", (data) => process.stderr.write(data));

  child.on("exit", (code, signal) => {
    if (!shuttingDown) {
      console.log(`[dev] ${path.basename(command)} exited with code=${code}, signal=${signal ?? ""}`);
      shutdown(code || 0);
    }
  });

  return child;
}

function waitForHttp(url, timeoutMs = 30000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve();
      });

      request.on("error", () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }
        setTimeout(check, 250);
      });

      request.setTimeout(2000, () => {
        request.destroy();
      });
    };

    check();
  });
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  if (electronProcess && !electronProcess.killed) {
    electronProcess.kill();
  }

  if (viteProcess && !viteProcess.killed) {
    viteProcess.kill();
  }

  setTimeout(() => process.exit(code), 200);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function main() {
  console.log("[dev] starting Vite dev server...");
  viteProcess = spawnLogged(viteBin, ["--host", "127.0.0.1"]);

  console.log(`[dev] waiting for ${devUrl}...`);
  await waitForHttp(devUrl);

  console.log("[dev] opening Electron window...");
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;

  electronProcess = spawnLogged(electronBin, [".", `--dev-server=${devUrl}`], {
    env,
  });
}

main().catch((error) => {
  console.error(`[dev] ${error.message}`);
  shutdown(1);
});
