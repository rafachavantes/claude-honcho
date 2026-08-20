#!/usr/bin/env bun
import"../chunk-d0w1kvcv.js";
import"../chunk-49wja30f.js";
import"../chunk-9pntsn3x.js";
import"../chunk-e4xc3kdd.js";
import {
  require_dist
} from "../chunk-wy62mnr7.js";
import {
  logApiCall,
  logHook,
  setLogContext
} from "../chunk-cq7cwz14.js";
import {
  __toESM,
  addMessagesBatched,
  chunkContent,
  getCachedStdin,
  getHonchoClientOptions,
  getInstanceIdForCwd,
  getSessionName,
  initHook,
  isPluginEnabled,
  loadConfig,
  readStdinText
} from "../chunk-47yh37te.js";

// src/hooks/save-user-message.ts
var import_sdk2 = __toESM(require_dist(), 1);

// src/hooks/user-prompt.ts
var import_sdk = __toESM(require_dist(), 1);
var TRIVIAL_REPLY_PATTERN = /^(yes|no|ok|sure|thanks|y|n|yep|nope|yeah|nah|continue|go ahead|do it|proceed)$/i;
function isTerseReply(prompt) {
  return TRIVIAL_REPLY_PATTERN.test(prompt.trim());
}
var HARNESS_INJECTED_PATTERNS = [
  /^<task-notification>/,
  /^<local-command-stdout>/,
  /^<command-name>/,
  /^<command-message>/,
  /^<system-reminder>/,
  /^<bash-(stdout|stderr|input)>/,
  /^<<[\w-]+>>$/
];
function isHarnessInjected(prompt) {
  const trimmed = prompt.trim();
  return HARNESS_INJECTED_PATTERNS.some((p) => p.test(trimmed));
}

// src/hooks/save-user-message.ts
async function handleSaveUserMessage() {
  const config = loadConfig();
  if (!config) {
    process.exit(0);
  }
  if (!isPluginEnabled() || config.saveMessages === false) {
    process.exit(0);
  }
  let hookInput = {};
  try {
    const input = getCachedStdin() ?? await readStdinText();
    if (input.trim()) {
      hookInput = JSON.parse(input);
    }
  } catch {
    process.exit(0);
  }
  const prompt = hookInput.prompt || "";
  if (!prompt.trim()) {
    process.exit(0);
  }
  const cwd = hookInput.workspace_roots?.[0] || hookInput.cwd || process.cwd();
  const instanceId = hookInput.session_id || getInstanceIdForCwd(cwd);
  const sessionName = getSessionName(cwd, instanceId || undefined);
  setLogContext(cwd, sessionName);
  if (isHarnessInjected(prompt)) {
    logHook("save-user-message", "Skipping upload (harness-injected content, not user input)");
    process.exit(0);
  }
  try {
    await postUserMessage(config, prompt, instanceId || undefined, sessionName);
  } catch (e) {
    logHook("save-user-message", `Upload failed: ${e}`);
  }
  process.exit(0);
}
async function postUserMessage(config, prompt, instanceId, sessionName) {
  const honcho = new import_sdk2.Honcho(getHonchoClientOptions(config));
  const noEnsure = () => Promise.resolve();
  const userPeer = new import_sdk2.Peer(config.peerName, honcho.workspaceId, honcho.http, undefined, undefined, noEnsure);
  const createdAt = new Date().toISOString();
  const configuration = isTerseReply(prompt) ? { reasoning: { enabled: false } } : undefined;
  const messages = chunkContent(prompt).map((chunk) => userPeer.message(chunk, {
    createdAt,
    metadata: {
      instance_id: instanceId || undefined,
      session_affinity: sessionName
    },
    ...configuration ? { configuration } : {}
  }));
  logApiCall("session.addMessages", "POST", `user prompt (${prompt.length} chars, ${messages.length} msg, direct)`);
  const session = new import_sdk2.Session(sessionName, honcho.workspaceId, honcho.http, undefined, undefined, noEnsure);
  await addMessagesBatched(session, messages, (e) => {
    logHook("save-user-message", `Direct upload failed, retrying via get-or-create: ${e}`);
    return honcho.session(sessionName);
  });
}

// hooks/save-user-message.ts
await initHook();
await handleSaveUserMessage();

//# debugId=4A4BFF58FB0DA73E64756E2164756E21
//# sourceMappingURL=save-user-message.js.map
