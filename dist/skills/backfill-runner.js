#!/usr/bin/env bun
// @bun
import {
  require_client,
  require_conclusions,
  require_errors,
  require_message,
  require_pagination,
  require_peer,
  require_session,
  require_session_context,
  require_streaming
} from "../chunk-0cx554d1.js";
import {
  __commonJS,
  __toESM
} from "../chunk-rcx39hvm.js";

// node_modules/@honcho-ai/sdk/dist/index.js
var require_dist = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.Summary = exports.SessionSummaries = exports.SessionContext = exports.Session = exports.PeerContext = exports.Peer = exports.Page = exports.Message = exports.DialecticStreamResponse = exports.UnprocessableEntityError = exports.TimeoutError = exports.ServerError = exports.RateLimitError = exports.PermissionDeniedError = exports.NotFoundError = exports.HonchoError = exports.ConnectionError = exports.ConflictError = exports.BadRequestError = exports.AuthenticationError = exports.ConclusionScope = exports.Conclusion = exports.Honcho = undefined;
  var client_1 = require_client();
  Object.defineProperty(exports, "Honcho", { enumerable: true, get: function() {
    return client_1.Honcho;
  } });
  var conclusions_1 = require_conclusions();
  Object.defineProperty(exports, "Conclusion", { enumerable: true, get: function() {
    return conclusions_1.Conclusion;
  } });
  Object.defineProperty(exports, "ConclusionScope", { enumerable: true, get: function() {
    return conclusions_1.ConclusionScope;
  } });
  var errors_1 = require_errors();
  Object.defineProperty(exports, "AuthenticationError", { enumerable: true, get: function() {
    return errors_1.AuthenticationError;
  } });
  Object.defineProperty(exports, "BadRequestError", { enumerable: true, get: function() {
    return errors_1.BadRequestError;
  } });
  Object.defineProperty(exports, "ConflictError", { enumerable: true, get: function() {
    return errors_1.ConflictError;
  } });
  Object.defineProperty(exports, "ConnectionError", { enumerable: true, get: function() {
    return errors_1.ConnectionError;
  } });
  Object.defineProperty(exports, "HonchoError", { enumerable: true, get: function() {
    return errors_1.HonchoError;
  } });
  Object.defineProperty(exports, "NotFoundError", { enumerable: true, get: function() {
    return errors_1.NotFoundError;
  } });
  Object.defineProperty(exports, "PermissionDeniedError", { enumerable: true, get: function() {
    return errors_1.PermissionDeniedError;
  } });
  Object.defineProperty(exports, "RateLimitError", { enumerable: true, get: function() {
    return errors_1.RateLimitError;
  } });
  Object.defineProperty(exports, "ServerError", { enumerable: true, get: function() {
    return errors_1.ServerError;
  } });
  Object.defineProperty(exports, "TimeoutError", { enumerable: true, get: function() {
    return errors_1.TimeoutError;
  } });
  Object.defineProperty(exports, "UnprocessableEntityError", { enumerable: true, get: function() {
    return errors_1.UnprocessableEntityError;
  } });
  var streaming_1 = require_streaming();
  Object.defineProperty(exports, "DialecticStreamResponse", { enumerable: true, get: function() {
    return streaming_1.DialecticStreamResponse;
  } });
  var message_1 = require_message();
  Object.defineProperty(exports, "Message", { enumerable: true, get: function() {
    return message_1.Message;
  } });
  var pagination_1 = require_pagination();
  Object.defineProperty(exports, "Page", { enumerable: true, get: function() {
    return pagination_1.Page;
  } });
  var peer_1 = require_peer();
  Object.defineProperty(exports, "Peer", { enumerable: true, get: function() {
    return peer_1.Peer;
  } });
  Object.defineProperty(exports, "PeerContext", { enumerable: true, get: function() {
    return peer_1.PeerContext;
  } });
  var session_1 = require_session();
  Object.defineProperty(exports, "Session", { enumerable: true, get: function() {
    return session_1.Session;
  } });
  var session_context_1 = require_session_context();
  Object.defineProperty(exports, "SessionContext", { enumerable: true, get: function() {
    return session_context_1.SessionContext;
  } });
  Object.defineProperty(exports, "SessionSummaries", { enumerable: true, get: function() {
    return session_context_1.SessionSummaries;
  } });
  Object.defineProperty(exports, "Summary", { enumerable: true, get: function() {
    return session_context_1.Summary;
  } });
});

// src/skills/backfill-runner.ts
var import_sdk = __toESM(require_dist(), 1);

// src/config.ts
import { homedir } from "os";
import { join, basename, dirname, resolve, sep } from "path";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs";
function sanitizeForSessionName(s) {
  return s.toLowerCase().replace(/[^a-z0-9-_]/g, "-");
}
var HONCHO_BASE_URLS = {
  production: "https://api.honcho.dev/v3",
  local: "http://localhost:8000/v3"
};
var _detectedHost = null;
function setDetectedHost(host) {
  _detectedHost = host;
}
function getDetectedHost() {
  return _detectedHost ?? "claude_code";
}
var DEFAULT_WORKSPACE = {
  cursor: "cursor",
  claude_code: "claude_code",
  obsidian: "obsidian"
};
var DEFAULT_AI_PEER = {
  cursor: "cursor",
  claude_code: "claude",
  obsidian: "honcho"
};
var CONFIG_DIR = join(homedir(), ".honcho");
var CONFIG_FILE = join(CONFIG_DIR, "config.json");
function getConfigDir() {
  return CONFIG_DIR;
}
function configExists() {
  return existsSync(CONFIG_FILE);
}
function loadConfig(host) {
  const resolvedHost = host ?? getDetectedHost();
  if (configExists()) {
    try {
      const content = readFileSync(CONFIG_FILE, "utf-8");
      const raw = JSON.parse(content);
      return resolveConfig(raw, resolvedHost);
    } catch {}
  }
  return loadConfigFromEnv(resolvedHost);
}
function resolveConfig(raw, host) {
  const hostBlock = raw.hosts?.[host] ?? raw.hosts?.[host.replace(/_/g, "-")] ?? raw.hosts?.[host.replace(/-/g, "_")];
  const apiKey = process.env.HONCHO_API_KEY || hostBlock?.apiKey || raw.apiKey;
  if (!apiKey)
    return null;
  const peerName = raw.peerName || process.env.HONCHO_PEER_NAME || process.env.USER || process.env.USERNAME || "user";
  let workspace;
  let aiPeer;
  if (raw.globalOverride === true) {
    workspace = raw.workspace ?? DEFAULT_WORKSPACE[host];
    aiPeer = raw.aiPeer ?? hostBlock?.aiPeer ?? DEFAULT_AI_PEER[host];
  } else if (hostBlock) {
    workspace = hostBlock.workspace ?? DEFAULT_WORKSPACE[host];
    aiPeer = hostBlock.aiPeer ?? DEFAULT_AI_PEER[host];
  } else {
    workspace = process.env.HONCHO_WORKSPACE ?? raw.workspace ?? DEFAULT_WORKSPACE[host];
    if (host === "cursor") {
      aiPeer = raw.cursorPeer ?? DEFAULT_AI_PEER["cursor"];
    } else {
      aiPeer = raw.claudePeer ?? DEFAULT_AI_PEER["claude_code"];
    }
  }
  const config = {
    apiKey,
    peerName,
    workspace,
    aiPeer,
    sessionStrategy: hostBlock?.sessionStrategy ?? raw.sessionStrategy,
    sessionPeerPrefix: hostBlock?.sessionPeerPrefix ?? raw.sessionPeerPrefix,
    sessions: raw.sessions,
    saveMessages: hostBlock?.saveMessages ?? raw.saveMessages,
    saveToolUse: hostBlock?.saveToolUse ?? raw.saveToolUse,
    saveGitEvents: hostBlock?.saveGitEvents ?? raw.saveGitEvents,
    reasoningLevel: hostBlock?.reasoningLevel ?? raw.reasoningLevel,
    observationMode: hostBlock?.observationMode ?? raw.observationMode,
    messageUpload: hostBlock?.messageUpload ?? raw.messageUpload,
    contextRefresh: hostBlock?.contextRefresh ?? raw.contextRefresh,
    endpoint: hostBlock?.endpoint ?? raw.endpoint,
    redactPatterns: hostBlock?.redactPatterns ?? raw.redactPatterns,
    injection: hostBlock?.injection ?? raw.injection,
    rememberTool: hostBlock?.rememberTool ?? raw.rememberTool,
    injectOnCompact: hostBlock?.injectOnCompact ?? raw.injectOnCompact,
    preCompactAnchor: hostBlock?.preCompactAnchor ?? raw.preCompactAnchor,
    enabled: hostBlock?.enabled ?? raw.enabled,
    logging: hostBlock?.logging ?? raw.logging,
    globalOverride: raw.globalOverride
  };
  return mergeWithEnvVars(config);
}
function loadConfigFromEnv(host) {
  const apiKey = process.env.HONCHO_API_KEY;
  if (!apiKey) {
    return null;
  }
  const resolvedHost = host ?? getDetectedHost();
  const peerName = process.env.HONCHO_PEER_NAME || process.env.USER || process.env.USERNAME || "user";
  const workspace = process.env.HONCHO_WORKSPACE || DEFAULT_WORKSPACE[resolvedHost];
  const hostPeerEnv = resolvedHost === "cursor" ? process.env.HONCHO_CURSOR_PEER : process.env.HONCHO_CLAUDE_PEER;
  const aiPeer = process.env.HONCHO_AI_PEER || hostPeerEnv || DEFAULT_AI_PEER[resolvedHost];
  const endpoint = process.env.HONCHO_ENDPOINT;
  const config = {
    apiKey,
    peerName,
    workspace,
    aiPeer,
    saveMessages: process.env.HONCHO_SAVE_MESSAGES !== "false",
    saveToolUse: process.env.HONCHO_SAVE_TOOL_USE === "true",
    saveGitEvents: process.env.HONCHO_SAVE_GIT_EVENTS === "true",
    enabled: process.env.HONCHO_ENABLED !== "false",
    logging: process.env.HONCHO_LOGGING !== "false"
  };
  if (endpoint) {
    if (endpoint === "local") {
      config.endpoint = { environment: "local" };
    } else if (endpoint.startsWith("http")) {
      config.endpoint = { baseUrl: endpoint };
    }
  }
  return config;
}
function mergeWithEnvVars(config) {
  if (process.env.HONCHO_API_KEY) {
    config.apiKey = process.env.HONCHO_API_KEY;
  }
  if (process.env.HONCHO_PEER_NAME) {
    config.peerName = process.env.HONCHO_PEER_NAME;
  }
  if (process.env.HONCHO_ENABLED === "false") {
    config.enabled = false;
  }
  if (process.env.HONCHO_LOGGING === "false") {
    config.logging = false;
  }
  if (process.env.HONCHO_SAVE_TOOL_USE !== undefined) {
    config.saveToolUse = process.env.HONCHO_SAVE_TOOL_USE === "true";
  }
  if (process.env.HONCHO_SAVE_GIT_EVENTS !== undefined) {
    config.saveGitEvents = process.env.HONCHO_SAVE_GIT_EVENTS === "true";
  }
  return config;
}
function deriveSessionName(strategy, cwd, opts = {}) {
  const usePrefix = opts.sessionPeerPrefix !== false;
  const peerPart = opts.peerName ? sanitizeForSessionName(opts.peerName) : "user";
  const repoPart = sanitizeForSessionName(basename(cwd));
  const base = usePrefix ? `${peerPart}-${repoPart}` : repoPart;
  switch (strategy) {
    case "git-branch": {
      if (opts.branch) {
        const branchPart = sanitizeForSessionName(opts.branch);
        return `${base}-${branchPart}`;
      }
      return base;
    }
    case "chat-instance": {
      if (opts.instanceId) {
        return usePrefix ? `${peerPart}-chat-${opts.instanceId}` : `chat-${opts.instanceId}`;
      }
      return base;
    }
    case "per-directory":
    default:
      return base;
  }
}
var VALID_INJECT_ON_COMPACT = new Set(["full", "slim", "off"]);
var VALID_PRE_COMPACT_ANCHOR = new Set(["full", "off"]);
function getHonchoBaseUrlForEndpoint(endpoint) {
  if (endpoint?.baseUrl) {
    const url = endpoint.baseUrl;
    return url.endsWith("/v3") ? url : `${url}/v3`;
  }
  if (endpoint?.environment === "local") {
    return HONCHO_BASE_URLS.local;
  }
  return HONCHO_BASE_URLS.production;
}
function getHonchoBaseUrl(config) {
  return getHonchoBaseUrlForEndpoint(config.endpoint);
}
function getHonchoClientOptions(config) {
  return {
    apiKey: config.apiKey,
    baseURL: getHonchoBaseUrl(config),
    workspaceId: config.workspace,
    timeout: 120000,
    maxRetries: 1
  };
}
var VALID_ENVIRONMENTS = new Set(["production", "local"]);
function getObservationMode(config) {
  return config.observationMode ?? "unified";
}

// src/cache.ts
import { homedir as homedir2 } from "os";
import { join as join2 } from "path";
var CACHE_DIR = join2(homedir2(), ".honcho");
var ID_CACHE_FILE = join2(CACHE_DIR, "cache.json");
var CONTEXT_CACHE_FILE = join2(CACHE_DIR, "context-cache.json");
var CONTEXT_CACHE_KNOWN_KEYS = new Set([
  "claudeContext",
  "summaries",
  "messageCount",
  "postCompact"
]);
var GIT_STATE_FILE = join2(CACHE_DIR, "git-state.json");
var MAX_MESSAGE_SIZE = 24000;
function chunkContent(content, maxSize = MAX_MESSAGE_SIZE) {
  if (content.length <= maxSize) {
    return [content];
  }
  const chunks = [];
  let remaining = content;
  while (remaining.length > 0) {
    if (remaining.length <= maxSize) {
      chunks.push(remaining);
      break;
    }
    let splitIndex = remaining.lastIndexOf(`
`, maxSize);
    if (splitIndex <= 0 || splitIndex < maxSize * 0.25) {
      splitIndex = remaining.lastIndexOf(" ", maxSize);
    }
    if (splitIndex <= 0 || splitIndex < maxSize * 0.25) {
      splitIndex = maxSize;
    }
    chunks.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex).trimStart();
  }
  if (chunks.length > 1) {
    return chunks.map((chunk, i) => `[Part ${i + 1}/${chunks.length}] ${chunk}`);
  }
  return chunks;
}
var HONCHO_MAX_BATCH = 100;
async function addMessagesBatched(session, messages, resolveFallback) {
  let active = session;
  let usedFallback = false;
  for (let i = 0;i < messages.length; i += HONCHO_MAX_BATCH) {
    const batch = messages.slice(i, i + HONCHO_MAX_BATCH);
    try {
      await active.addMessages(batch);
    } catch (e) {
      if (usedFallback || !resolveFallback)
        throw e;
      active = await resolveFallback(e);
      usedFallback = true;
      await active.addMessages(batch);
    }
  }
}

// src/skills/transcript-parse.ts
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "fs";
function entryType(entry) {
  return entry.type || entry.role;
}
function isRealUserPrompt(entry) {
  if (entry.isMeta)
    return false;
  const mc = entry.message?.content ?? entry.content;
  const text = typeof mc === "string" ? mc : Array.isArray(mc) ? mc.filter((b) => b.type === "text" && b.text).map((b) => b.text).join("") : "";
  const trimmed = text.trim();
  return trimmed.length > 0 && !trimmed.startsWith("<");
}
function userText(entry) {
  const mc = entry.message?.content ?? entry.content;
  if (typeof mc === "string")
    return mc;
  if (Array.isArray(mc))
    return mc.filter((p) => p.type === "text").map((p) => p.text || "").join(`
`);
  return "";
}
function assistantText(entry) {
  const mc = entry.message?.content ?? entry.content;
  if (typeof mc === "string")
    return mc;
  if (Array.isArray(mc))
    return mc.filter((p) => p.type === "text" && p.text).map((p) => p.text).join(`

`);
  return "";
}
function readLines(transcriptPath) {
  if (!transcriptPath || !existsSync2(transcriptPath))
    return [];
  try {
    return readFileSync2(transcriptPath, "utf-8").split(`
`).filter((line) => line.trim());
  } catch {
    return [];
  }
}
function parseTranscriptForBackfill(transcriptPath) {
  const messages = [];
  let cwd;
  let gitBranch;
  let sessionId;
  for (const line of readLines(transcriptPath)) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.cwd)
      cwd = entry.cwd;
    if (entry.gitBranch)
      gitBranch = entry.gitBranch;
    if (entry.sessionId)
      sessionId = entry.sessionId;
    if (entry.isMeta || entry.isSidechain)
      continue;
    const type = entryType(entry);
    if (type === "user") {
      if (!isRealUserPrompt(entry))
        continue;
      const content = userText(entry).trim();
      if (content) {
        messages.push({ role: "user", content, timestamp: entry.timestamp, cwd: entry.cwd, gitBranch: entry.gitBranch });
      }
    } else if (type === "assistant") {
      const content = assistantText(entry).trim();
      if (content) {
        messages.push({ role: "assistant", content, timestamp: entry.timestamp, cwd: entry.cwd, gitBranch: entry.gitBranch });
      }
    }
  }
  for (let i = 0;i < messages.length; i++) {
    if (messages[i].role !== "assistant")
      continue;
    const next = messages[i + 1];
    messages[i].isResponse = !next || next.role === "user";
  }
  return { messages, cwd, gitBranch, sessionId };
}

// src/styles.ts
var colors = {
  reset: "\x1B[0m",
  bold: "\x1B[1m",
  dim: "\x1B[2m",
  orange: "\x1B[38;5;208m",
  lightOrange: "\x1B[38;5;214m",
  peach: "\x1B[38;5;215m",
  palePeach: "\x1B[38;5;223m",
  paleBlue: "\x1B[38;5;195m",
  lightBlue: "\x1B[38;5;159m",
  skyBlue: "\x1B[38;5;117m",
  brightBlue: "\x1B[38;5;81m",
  success: "\x1B[38;5;114m",
  error: "\x1B[38;5;203m",
  warn: "\x1B[38;5;214m",
  white: "\x1B[38;5;255m",
  gray: "\x1B[38;5;245m"
};
var symbols = {
  check: String.fromCodePoint(10003),
  cross: String.fromCodePoint(10007),
  dot: String.fromCodePoint(183),
  bullet: String.fromCodePoint(8226),
  arrow: String.fromCodePoint(8594),
  line: String.fromCodePoint(9472),
  corner: String.fromCodePoint(9492),
  pipe: String.fromCodePoint(9474),
  sparkle: String.fromCodePoint(10022)
};
function header(text) {
  const line = symbols.line.repeat(text.length);
  return `${colors.orange}${text}${colors.reset}
${colors.dim}${line}${colors.reset}`;
}
function section(text) {
  return `${colors.lightBlue}${text}${colors.reset}`;
}
function label(text) {
  return `${colors.skyBlue}${text}${colors.reset}`;
}
function dim(text) {
  return `${colors.dim}${text}${colors.reset}`;
}
function success(message) {
  return `${colors.success}${symbols.check}${colors.reset} ${message}`;
}
function error(message) {
  return `${colors.error}${symbols.cross}${colors.reset} ${message}`;
}
function warn(message) {
  return `${colors.warn}!${colors.reset} ${message}`;
}
function listItem(text, indent = 0) {
  const padding = "  ".repeat(indent);
  return `${padding}${colors.dim}${symbols.bullet}${colors.reset} ${text}`;
}

// src/skills/backfill-runner.ts
import { homedir as homedir3 } from "os";
import { join as join3, basename as basename2 } from "path";
import { pathToFileURL } from "url";
import { existsSync as existsSync3, readFileSync as readFileSync3, writeFileSync as writeFileSync2, mkdirSync as mkdirSync2, readdirSync, statSync as statSync2 } from "fs";
function parseArgs(argv) {
  const args = { days: 30, dryRun: false };
  for (let i = 0;i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run")
      args.dryRun = true;
    else if (a === "--yes") {} else if (a === "--days")
      args.days = parseInt(argv[++i] ?? "30", 10) || 30;
    else if (a.startsWith("--days="))
      args.days = parseInt(a.slice("--days=".length), 10) || 30;
    else if (a === "--workspace")
      args.workspace = argv[++i];
    else if (a.startsWith("--workspace="))
      args.workspace = a.slice("--workspace=".length);
  }
  return args;
}
var PROJECTS_DIR = join3(homedir3(), ".claude", "projects");
var STATE_FILE = join3(getConfigDir(), "backfill-state.json");
function loadState() {
  try {
    return JSON.parse(readFileSync3(STATE_FILE, "utf-8"));
  } catch {
    return { imported: {} };
  }
}
function saveState(state) {
  if (!existsSync3(getConfigDir()))
    mkdirSync2(getConfigDir(), { recursive: true });
  writeFileSync2(STATE_FILE, JSON.stringify(state, null, 2));
}
function findTranscripts(days) {
  if (!existsSync3(PROJECTS_DIR))
    return [];
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const out = [];
  for (const dir of readdirSync(PROJECTS_DIR)) {
    const dirPath = join3(PROJECTS_DIR, dir);
    let entries;
    try {
      if (!statSync2(dirPath).isDirectory())
        continue;
      entries = readdirSync(dirPath);
    } catch {
      continue;
    }
    for (const file of entries) {
      if (!file.endsWith(".jsonl"))
        continue;
      const path = join3(dirPath, file);
      try {
        const st = statSync2(path);
        if (st.mtimeMs >= cutoff)
          out.push({ path, mtimeMs: st.mtimeMs });
      } catch {
        continue;
      }
    }
  }
  return out;
}
function groupIntoSessions(transcripts, strategy, peerName, sessionPeerPrefix, sessionOverrides = {}) {
  const groups = new Map;
  let parsed = 0;
  let empty = 0;
  for (const { path } of transcripts) {
    const { messages, cwd: tCwd, gitBranch: tBranch, sessionId } = parseTranscriptForBackfill(path);
    if (messages.length === 0) {
      empty++;
      continue;
    }
    parsed++;
    const source = basename2(path);
    for (const msg of messages) {
      const cwd = msg.cwd || tCwd;
      if (!cwd)
        continue;
      const name = strategy === "per-directory" && sessionOverrides[cwd] ? sessionOverrides[cwd] : deriveSessionName(strategy, cwd, {
        peerName,
        sessionPeerPrefix,
        branch: msg.gitBranch || tBranch,
        instanceId: sessionId
      });
      let group = groups.get(name);
      if (!group) {
        group = { name, messages: [] };
        groups.set(name, group);
      }
      group.messages.push({ ...msg, sourceTranscript: source });
    }
  }
  return { groups, parsed, empty };
}
async function run() {
  setDetectedHost("claude_code");
  const args = parseArgs(process.argv.slice(2));
  console.log("");
  console.log(header("honcho backfill"));
  console.log("");
  const config = loadConfig();
  if (!config) {
    console.log(warn("No Honcho config found \u2014 run /honcho:setup first."));
    process.exit(1);
  }
  const targetWorkspace = args.workspace || config.workspace;
  const strategy = config.sessionStrategy ?? "per-directory";
  console.log(`  ${label("Workspace")}:   ${targetWorkspace}${args.workspace ? dim("  (override)") : ""}`);
  console.log(`  ${label("Strategy")}:    ${strategy}`);
  console.log(`  ${label("Window")}:      last ${args.days} days`);
  console.log(`  ${label("User peer")}:   ${config.peerName}`);
  console.log(`  ${label("AI peer")}:     ${config.aiPeer}`);
  console.log("");
  const allTranscripts = findTranscripts(args.days);
  const state = loadState();
  const already = allTranscripts.filter((t) => state.imported[`${targetWorkspace}::${t.path}`] === t.mtimeMs);
  const todo = allTranscripts.filter((t) => state.imported[`${targetWorkspace}::${t.path}`] !== t.mtimeMs);
  console.log(section("Scanning transcripts"));
  console.log(listItem(`${allTranscripts.length} transcript(s) in window`));
  if (already.length > 0) {
    console.log(listItem(dim(`${already.length} already imported into ${targetWorkspace} \u2014 skipping`)));
  }
  if (todo.length === 0) {
    console.log("");
    console.log(success("Nothing new to import."));
    process.exit(0);
  }
  const { groups, parsed, empty } = groupIntoSessions(todo, strategy, config.peerName, config.sessionPeerPrefix, config.sessions ?? {});
  const totalMessages = [...groups.values()].reduce((n, g) => n + g.messages.length, 0);
  console.log(listItem(`${parsed} transcript(s) with content${empty ? dim(` (${empty} empty, skipped)`) : ""}`));
  console.log(listItem(`${groups.size} session(s), ${totalMessages} message(s) to upload`));
  console.log("");
  console.log(section("Sessions"));
  const sorted = [...groups.values()].sort((a, b) => b.messages.length - a.messages.length);
  for (const g of sorted.slice(0, 15)) {
    console.log(listItem(`${g.name} ${dim(`(${g.messages.length} msg)`)}`));
  }
  if (sorted.length > 15)
    console.log(listItem(dim(`\u2026 and ${sorted.length - 15} more`)));
  console.log("");
  if (args.dryRun) {
    console.log(success("Dry run \u2014 no messages uploaded."));
    process.exit(0);
  }
  const opts = getHonchoClientOptions(config);
  opts.workspaceId = targetWorkspace;
  opts.timeout = 60000;
  opts.maxRetries = 3;
  const honcho = new import_sdk.Honcho(opts);
  const observationMode = getObservationMode(config);
  console.log(section(`Uploading to ${targetWorkspace}`));
  let uploadedSessions = 0;
  let uploadedMessages = 0;
  const errors = [];
  for (const g of sorted) {
    try {
      const [session, userPeer, aiPeer] = await Promise.all([
        honcho.session(g.name),
        honcho.peer(config.peerName),
        honcho.peer(config.aiPeer)
      ]);
      const peers = observationMode === "directional" ? [userPeer, [aiPeer, { observeOthers: true }]] : [userPeer, aiPeer];
      await session.addPeers(peers);
      const fallbackTs = new Date().toISOString();
      const messages = g.messages.flatMap((m) => {
        const peer = m.role === "user" ? userPeer : aiPeer;
        return chunkContent(m.content).map((chunk) => peer.message(chunk, {
          createdAt: m.timestamp || fallbackTs,
          metadata: {
            backfill: true,
            source_transcript: m.sourceTranscript,
            session_affinity: g.name,
            type: m.role === "assistant" ? m.isResponse ? "assistant_response" : "assistant_intermediate" : undefined
          }
        }));
      });
      await addMessagesBatched(session, messages);
      uploadedSessions++;
      uploadedMessages += g.messages.length;
      console.log(listItem(success(`${g.name} ${dim(`(${g.messages.length} msg)`)}`)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${g.name}: ${msg}`);
      console.log(listItem(warn(`${g.name} \u2014 ${msg}`)));
    }
  }
  if (errors.length === 0) {
    for (const t of todo) {
      state.imported[`${targetWorkspace}::${t.path}`] = t.mtimeMs;
    }
    saveState(state);
  }
  console.log("");
  console.log(success(`Imported ${uploadedMessages} message(s) across ${uploadedSessions} session(s) into ${targetWorkspace}.`));
  if (errors.length > 0) {
    console.log(warn(`${errors.length} session(s) failed \u2014 re-run to retry (not marked complete).`));
  }
  console.log("");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((err) => {
    console.log(error(`Backfill failed: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  });
}
export {
  groupIntoSessions,
  findTranscripts
};

//# debugId=98BD7B0E945BEB9464756E2164756E21
//# sourceMappingURL=backfill-runner.js.map
