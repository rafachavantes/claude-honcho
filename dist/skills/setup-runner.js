#!/usr/bin/env bun
import {
  dim,
  header,
  label,
  listItem,
  require_dist,
  section,
  success,
  warn
} from "../chunk-hz8p56j7.js";
import"../chunk-0cx554d1.js";
import {
  __require,
  __toESM,
  configExists,
  getClaudeSettingsDir,
  getClaudeSettingsPath,
  getConfigDir,
  getConfigPath,
  getHonchoClientOptions,
  loadConfig,
  loadConfigFromEnv,
  saveConfig,
  saveRootField,
  setDetectedHost
} from "../chunk-rcx39hvm.js";

// src/skills/setup-runner.ts
var import_sdk = __toESM(require_dist(), 1);
import { copyFileSync, chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
function installStatusline() {
  console.log(section("Installing memory statusLine"));
  const src = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "scripts", "honcho-statusline.sh");
  const dest = join(getConfigDir(), "honcho-statusline.sh");
  try {
    if (!existsSync(getConfigDir()))
      mkdirSync(getConfigDir(), { recursive: true });
    copyFileSync(src, dest);
    chmodSync(dest, 493);
    console.log(success(`Renderer installed at ${dest}`));
  } catch (err) {
    console.log(warn(`Could not install renderer: ${err instanceof Error ? err.message : String(err)}`));
    return;
  }
  try {
    const raw = existsSync(getConfigPath()) ? JSON.parse(readFileSync(getConfigPath(), "utf-8")) : {};
    if (raw.statusline === undefined)
      saveRootField("statusline", "on");
  } catch {}
  const settingsPath = getClaudeSettingsPath();
  let settings = {};
  try {
    if (existsSync(settingsPath))
      settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
  } catch {
    console.log(warn(`Could not parse ${settingsPath} — add the statusLine entry manually:`));
    console.log(dim(`  "statusLine": { "type": "command", "command": "${dest}" }`));
    return;
  }
  const REFRESH = 1;
  const existing = settings.statusLine;
  if (existing?.command === dest) {
    if (existing.refreshInterval === REFRESH) {
      console.log(dim("statusLine already points at the honcho renderer"));
      return;
    }
    settings.statusLine = { type: "command", command: dest, refreshInterval: REFRESH };
    try {
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      console.log(success("statusLine refreshInterval enabled — memory glyph now animates"));
    } catch (err) {
      console.log(warn(`Could not update settings.json: ${err instanceof Error ? err.message : String(err)}`));
    }
    return;
  }
  if (existing) {
    console.log(warn("A different statusLine is already configured — leaving it untouched."));
    console.log(dim("  To use honcho's instead, set settings.json statusLine.command to:"));
    console.log(dim(`  ${dest}`));
    console.log(dim(`  and add  "refreshInterval": ${REFRESH}  so the glyph animates.`));
    return;
  }
  settings.statusLine = { type: "command", command: dest, refreshInterval: REFRESH };
  try {
    if (!existsSync(getClaudeSettingsDir()))
      mkdirSync(getClaudeSettingsDir(), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    console.log(success("statusLine registered in ~/.claude/settings.json"));
  } catch (err) {
    console.log(warn(`Could not write settings.json: ${err instanceof Error ? err.message : String(err)}`));
    console.log(dim(`  Add manually: "statusLine": { "type": "command", "command": "${dest}" }`));
  }
}
async function setup() {
  setDetectedHost("claude_code");
  console.log("");
  console.log(header("honcho setup"));
  console.log("");
  let apiKey = process.env.HONCHO_API_KEY;
  let keySource = "environment";
  if (!apiKey) {
    try {
      const { readFileSync: readFileSync2 } = await import("fs");
      const configRaw = readFileSync2(getConfigPath(), "utf-8");
      const configData = JSON.parse(configRaw);
      apiKey = configData.apiKey;
      keySource = "config";
    } catch {}
  }
  if (!apiKey) {
    console.log(warn("No API key found (checked env and config)"));
    console.log("");
    console.log("  1. Get a free key at https://app.honcho.dev");
    if (process.platform === "win32") {
      console.log("  2. Set it in PowerShell:");
      console.log(dim('     setx HONCHO_API_KEY "your-key-here"'));
    } else {
      console.log("  2. Add to ~/.zshrc or ~/.bashrc:");
      console.log(dim('     export HONCHO_API_KEY="your-key-here"'));
    }
    console.log("  3. Restart Claude Code and run /honcho:setup");
    process.exit(1);
  }
  console.log(success(`API key found (${keySource})`));
  console.log("");
  console.log(section("Validating connection"));
  const config = loadConfig() || loadConfigFromEnv();
  if (!config) {
    console.log(warn("Failed to build config from environment"));
    process.exit(1);
  }
  try {
    const honcho = new import_sdk.Honcho(getHonchoClientOptions(config));
    await honcho.workspaces();
    console.log(success("Connected to Honcho API"));
    console.log(`  ${label("Workspace")}: ${config.workspace}`);
    console.log(`  ${label("Peer")}:      ${config.peerName}`);
    console.log(`  ${label("AI Peer")}:   ${config.aiPeer}`);
    console.log("");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(warn(`Connection failed: ${msg}`));
    if (msg.includes("401") || msg.includes("auth")) {
      console.log(dim("  API key may be invalid. Get a new one at https://app.honcho.dev"));
    }
    process.exit(1);
  }
  if (!configExists()) {
    console.log(section("Creating config"));
    try {
      const { saveRootField: saveRootField2 } = await import("../chunk-eepy965d.js");
      saveRootField2("apiKey", config.apiKey);
      saveRootField2("peerName", config.peerName);
      saveConfig({
        apiKey: config.apiKey,
        peerName: config.peerName,
        workspace: config.workspace,
        aiPeer: config.aiPeer,
        saveMessages: true,
        enabled: true,
        logging: true
      });
      console.log(success(`Written to ${getConfigPath()}`));
    } catch (err) {
      console.log(warn(`Failed to write config: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
    console.log("");
  } else {
    console.log(dim(`Config already exists at ${getConfigPath()}`));
    console.log("");
  }
  installStatusline();
  console.log("");
  try {
    const { findTranscripts } = await import("./backfill-runner.js");
    const transcripts = findTranscripts(30);
    if (transcripts.length > 0) {
      console.log(section("Import past sessions (optional)"));
      console.log(listItem(`Found ${transcripts.length} local Claude Code session(s) from the last 30 days.`));
      console.log(dim("  Run /honcho:import whenever you'd like to add your past work to Honcho."));
      console.log("");
    }
  } catch {}
  console.log(success("Setup complete -- Honcho memory is ready"));
  console.log("");
}
setup();

//# debugId=98473BA269C59AA664756E2164756E21
//# sourceMappingURL=setup-runner.js.map
