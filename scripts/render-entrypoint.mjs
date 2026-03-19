import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

function resolveStateDir() {
  const explicit = (process.env.OPENCLAW_STATE_DIR || process.env.CLAWDBOT_STATE_DIR || "").trim();
  if (explicit) {
    return explicit;
  }

  const home = (process.env.OPENCLAW_HOME || "").trim();
  if (home) {
    return path.join(home, ".openclaw");
  }

  return path.join(process.cwd(), ".openclaw");
}

function resolveConfigPath() {
  const explicit = (process.env.OPENCLAW_CONFIG_PATH || "").trim();
  if (explicit) {
    return explicit;
  }
  return path.join(resolveStateDir(), "openclaw.json");
}

async function readJsonOrEmpty(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeConfigPatch() {
  const configPath = resolveConfigPath();
  const stateDir = path.dirname(configPath);

  await fs.mkdir(stateDir, { recursive: true });

  const cfg = await readJsonOrEmpty(configPath);
  const gateway = cfg.gateway && typeof cfg.gateway === "object" ? cfg.gateway : {};
  const controlUi =
    gateway.controlUi && typeof gateway.controlUi === "object" ? gateway.controlUi : {};

  const next = {
    ...cfg,
    gateway: {
      ...gateway,
      controlUi: {
        ...controlUi,
        dangerouslyAllowHostHeaderOriginFallback: true,
        dangerouslyDisableDeviceAuth: true,
      },
    },
  };

  await fs.writeFile(configPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

async function main() {
  await writeConfigPatch();

  const args = [
    "/app/openclaw.mjs",
    "gateway",
    "--allow-unconfigured",
    "--bind",
    "lan",
    "--port",
    "8080",
  ];

  const child = spawn(process.execPath, args, {
    stdio: "inherit",
    env: process.env,
  });

  const forwardSignal = (signal) => {
    if (!child.killed) {
      child.kill(signal);
    }
  };

  process.on("SIGINT", forwardSignal);
  process.on("SIGTERM", forwardSignal);

  child.on("exit", (code, signal) => {
    if (typeof code === "number") {
      process.exit(code);
    }
    process.kill(process.pid, signal || "SIGTERM");
  });
}

main().catch((err) => {
  process.stderr.write(`render-entrypoint failed: ${err?.stack || String(err)}\n`);
  process.exit(1);
});
