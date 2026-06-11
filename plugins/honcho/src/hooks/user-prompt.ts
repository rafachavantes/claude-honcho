import { Honcho } from "@honcho-ai/sdk";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, getSessionName, getHonchoClientOptions, isPluginEnabled, getCachedStdin, getWriteMode, getDetectedHost, getInjectOnCompact } from "../config.js";
import { buildScopedContext } from "../context-builder.js";
import {
  getCachedUserContext,
  getStaleCachedUserContext,
  isContextCacheStale,
  setCachedUserContext,
  getMessageCount,
  incrementMessageCount,
  shouldRefreshKnowledgeGraph,
  markKnowledgeGraphRefreshed,
  getInstanceIdForCwd,
  queueMessage,
  spawnFlusher,
  consumePostCompactFlag,
} from "../cache.js";
import { drainInline } from "../flush.js";
import { SLIM_POINTER } from "../injection-policy.js";
import { logHook, logApiCall, logCache, setLogContext } from "../log.js";
import { visContextLine, visSkipMessage, addSystemMessage, verboseApiResult, verboseList } from "../visual.js";
import { honchoSessionUrl } from "../styles.js";
import { setMemoryState, setSessionLink } from "../state.js";

interface HookInput {
  prompt?: string;
  cwd?: string;
  session_id?: string;
  workspace_roots?: string[];
}

// Patterns to skip context injection
const SKIP_CONTEXT_PATTERNS = [
  /^(yes|no|ok|sure|thanks|y|n|yep|nope|yeah|nah|continue|go ahead|do it|proceed)$/i,
  /^\//, // slash commands
];

const FETCH_TIMEOUT_MS = 4000;

/**
 * Extract meaningful topics from a prompt for semantic search.
 * Returns terms that are high-signal for conclusion matching.
 */
function extractTopics(prompt: string): string[] {
  const topics: string[] = [];

  // File paths (high signal)
  const filePaths = prompt.match(/[\w\-\/\.]+\.(ts|tsx|js|jsx|py|rs|go|md|json|yaml|yml|toml|sql)/gi) || [];
  topics.push(...filePaths.slice(0, 5));

  // Quoted strings (explicit references)
  const quoted = prompt.match(/"([^"]+)"/g)?.map(q => q.slice(1, -1)) || [];
  topics.push(...quoted.slice(0, 3));

  // Technical terms
  const techTerms = prompt.match(/\b(react|vue|svelte|angular|elysia|express|fastapi|django|flask|postgres|redis|docker|kubernetes|bun|node|deno|typescript|python|rust|go|graphql|rest|api|auth|oauth|jwt|stripe|webhook|honcho|mcp|claude|cursor|sentry)\b/gi) || [];
  topics.push(...[...new Set(techTerms.map(t => t.toLowerCase()))].slice(0, 5));

  // Error patterns
  const errors = prompt.match(/error[:\s]+[\w\s]+|failed[:\s]+[\w\s]+|exception[:\s]+[\w\s]+/gi) || [];
  topics.push(...errors.slice(0, 2));

  if (topics.length > 0) {
    return [...new Set(topics)];
  }

  // Fallback: meaningful words >3 chars minus stopwords
  const stopwords = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'are', 'was', 'were', 'been', 'being', 'has', 'had', 'does', 'did', 'will', 'would', 'could', 'should', 'can', 'may', 'might', 'must', 'shall', 'need', 'want', 'like', 'just', 'also', 'more', 'some', 'what', 'when', 'where', 'which', 'who', 'how', 'why', 'all', 'each', 'every', 'both', 'few', 'most', 'other', 'into', 'over', 'such', 'only', 'same', 'than', 'very', 'your', 'make', 'take', 'come', 'give', 'look', 'think', 'know']);
  const words = prompt.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
  return [...new Set(words.filter(w => !stopwords.has(w)))].slice(0, 10);
}

function shouldSkipContextRetrieval(prompt: string): boolean {
  return SKIP_CONTEXT_PATTERNS.some((p) => p.test(prompt.trim()));
}

function formatSessionLink(sessionUrl: string): string {
  return `view your session in honcho GUI: ${sessionUrl}`;
}

function readVersionNag(): string | undefined {
  const dataDir = process.env.CLAUDE_PLUGIN_DATA;
  if (!dataDir) return undefined;
  const flag = join(dataDir, ".version-stale");
  if (!existsSync(flag)) return undefined;
  try {
    return readFileSync(flag, "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * UserPromptSubmit hook — serves cached context instantly, refreshes when stale.
 *
 * Context lifecycle:
 *   SessionStart          -> warms cache (parallel API calls, 30s budget);
 *                            on source=compact sets the post-compact flag instead
 *   UserPrompt            -> serves cache; refreshes (with 4s timeout) when TTL expires
 *                            or message threshold hit; first post-compact prompt
 *                            injects only a slim pointer (see injectOnCompact)
 *
 * On refresh failure, silently falls back to stale cache.
 * On no cache at all, exits silently — context will arrive next turn.
 */
export async function handleUserPrompt(): Promise<void> {
  const config = loadConfig();
  if (!config) {
    process.exit(0);
  }

  if (!isPluginEnabled()) {
    process.exit(0);
  }

  let hookInput: HookInput = {};
  try {
    const input = getCachedStdin() ?? await Bun.stdin.text();
    if (input.trim()) {
      hookInput = JSON.parse(input);
    }
  } catch {
    process.exit(0);
  }

  const prompt = hookInput.prompt || "";
  const cwd = hookInput.workspace_roots?.[0] || hookInput.cwd || process.cwd();
  const instanceId = hookInput.session_id || getInstanceIdForCwd(cwd);
  const sessionName = getSessionName(cwd, instanceId || undefined);

  setLogContext(cwd, sessionName);

  if (!prompt.trim()) {
    process.exit(0);
  }

  logHook("user-prompt", `Prompt received (${prompt.length} chars)`);
  setSessionLink(honchoSessionUrl(config.workspace, sessionName), sessionName, hookInput.session_id);

  // Queue user prompt for upload at session-end (instant, no network)
  if (config.saveMessages !== false) {
    queueMessage(prompt, config.peerName, cwd, instanceId || undefined);
    const mode = getWriteMode(config);
    if (mode === "detached") {
      spawnFlusher(cwd, sessionName, getDetectedHost());
    } else if (mode === "inline") {
      await drainInline(config, sessionName, cwd).catch(() => {});
    }
    // deferred: do nothing (legacy — waits for SessionEnd)
  }

  // Track message count for threshold-based refresh
  const messageCountBefore = getMessageCount();
  incrementMessageCount();

  // First prompt of the session: nudge the harness to actively call the honcho
  // MCP tools (search/chat/get_context) rather than rely only on this passive
  // injection. Injected once to respect a lean per-turn context budget.
  if (messageCountBefore === 0) {
    sessionToolHint =
      `Honcho memory tools are available — call honcho.search(query) or honcho.get_context to recall ` +
      `facts about ${config.peerName} across sessions, and honcho.chat(question) for dialectic/` +
      `psychological questions. Prefer querying over guessing when the user's history is relevant.`;
  }
  // Stagger the one-off banners so the first prompt isn't crowded. The
  // version-update nag (if stale) takes the first message and bumps the GUI
  // session link to the second; with no nag, the link shows on the first.
  // The nag flag is written at SessionStart and stable for the session, so
  // its presence on message 2 tells us the link hasn't been shown yet.
  const nag = readVersionNag();
  const sessionLink =
    messageCountBefore === 0
      ? nag ?? formatSessionLink(honchoSessionUrl(config.workspace, sessionName))
      : messageCountBefore === 1 && nag
        ? formatSessionLink(honchoSessionUrl(config.workspace, sessionName))
        : undefined;

  // Skip trivial prompts — no context needed for "y", "ok", etc.
  if (shouldSkipContextRetrieval(prompt)) {
    logHook("user-prompt", "Skipping context (trivial prompt)");
    visSkipMessage("user-prompt", sessionLink ? `${sessionLink} · trivial prompt` : "trivial prompt");
    process.exit(0);
  }

  // Post-compact downgrade: the host's compaction summary already carries
  // recent context, so inject at most a slim pointer instead of the full
  // cached package. The flag is one-shot — normal TTL/threshold cadence
  // resumes on the next prompt. (Placed after the trivial-prompt skip so a
  // "y"/"ok" first prompt doesn't burn the flag without an injection.)
  if (consumePostCompactFlag(cwd, instanceId || undefined)) {
    const mode = getInjectOnCompact(config);
    if (mode !== "full") {
      if (mode === "slim") {
        console.log(JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "UserPromptSubmit",
            additionalContext: `[Honcho Memory]: ${SLIM_POINTER}`,
          },
        }));
      }
      logHook("user-prompt", `Post-compact prompt: ${mode} injection`);
      process.exit(0);
    }
    // mode flipped to "full" since the flag was set — fall through to normal injection
  }

  // Decide whether to refresh: TTL expired or message threshold hit
  const forceRefresh = shouldRefreshKnowledgeGraph();
  const cachedContext = getCachedUserContext();
  const cacheIsStale = isContextCacheStale();

  if (cachedContext && !cacheIsStale && !forceRefresh) {
    // Fresh cache — serve instantly, no API call
    logCache("hit", "userContext", "fresh cache");
    verboseApiResult("peer.context() -> representation (cached)", cachedContext?.representation);
    verboseList("peer.context() -> peerCard (cached)", cachedContext?.peerCard);

    serveContext(config.peerName, cachedContext, true, sessionLink);
    process.exit(0);
  }

  // Cache is stale or threshold reached — try a fresh fetch with timeout
  logCache("miss", "userContext", forceRefresh ? "threshold refresh" : "stale cache");
  setMemoryState("recalling", undefined, hookInput.session_id);

  const fetchResult = await Promise.race([
    fetchFreshContext(config, prompt, sessionName).then(r => ({ ok: true as const, ...r })),
    new Promise<{ ok: false }>(resolve => setTimeout(() => resolve({ ok: false }), FETCH_TIMEOUT_MS)),
  ]).catch((): { ok: false } => ({ ok: false }));

  if (fetchResult.ok) {
    const { context } = fetchResult;
    if (forceRefresh) {
      markKnowledgeGraphRefreshed();
    }
    if (context) {
      serveContext(config.peerName, context, false, sessionLink);
      process.exit(0);
    }
  }

  // Fetch failed or timed out — silently fall back to stale cache
  const staleContext = getStaleCachedUserContext();
  if (staleContext) {
    logHook("user-prompt", "Serving stale cache after timeout");
    serveContext(config.peerName, staleContext, true, sessionLink);
  }
  // No cache at all — exit silently, context will arrive after session-start completes

  process.exit(0);
}

/**
 * Format and output context injection to Claude.
 */
function serveContext(
  peerName: string,
  context: any,
  cached: boolean,
  sessionLink?: string,
): void {
  const { parts: contextParts } = formatCachedContext(context, peerName);
  if (contextParts.length === 0) return;

  const visMsg = visContextLine("user-prompt", { cached });
  outputContext(peerName, contextParts, sessionLink ? `${sessionLink}\n${visMsg}` : visMsg);
}

async function fetchFreshContext(config: any, prompt: string, sessionName: string): Promise<{ context: any }> {
  const honcho = new Honcho(getHonchoClientOptions(config));

  const startTime = Date.now();

  const topics = extractTopics(prompt);
  const searchQuery = topics.length > 0 ? topics.join(" ") : undefined;

  try {
    const scoped = await buildScopedContext(honcho, config, { sessionName, searchQuery, maxConclusions: 12, summary: true });
    logApiCall("buildScopedContext", "GET", searchQuery ? `search: ${searchQuery.slice(0, 60)}` : "static context", Date.now() - startTime, true);
    setCachedUserContext(scoped);
    verboseApiResult("peer.context() -> representation (fresh)", scoped.representation);
    verboseList("peer.context() -> peerCard (fresh)", scoped.peerCard);
    return { context: scoped };
  } catch (e) {
    logHook("user-prompt", `buildScopedContext failed: ${e}`);
    throw e;
  }
}

function formatCachedContext(context: any, peerName: string): { parts: string[]; conclusionCount: number } {
  const parts: string[] = [];
  let conclusionCount = 0;
  if (context?.peerCard?.length) parts.push(`Profile: ${context.peerCard.join("; ")}`);
  const summaryContent = typeof context?.summary === "string" ? context.summary : context?.summary?.content;
  if (summaryContent && String(summaryContent).trim()) parts.push(`Project summary: ${String(summaryContent).trim().slice(0, 600)}`);
  const rep = context?.representation;
  if (typeof rep === "string" && rep.trim()) {
    const lines = rep.split("\n").filter((l: string) => l.trim() && !l.startsWith("#"));
    const selected = lines.slice(0, 5);
    conclusionCount = selected.length;
    const summary = selected.map((l: string) => l.replace(/^\[.*?\]\s*/, "").replace(/^- /, "")).join("; ");
    if (summary) parts.push(`Relevant project conclusions: ${summary}`);
  }
  return { parts, conclusionCount };
}

// Set once per session (first prompt) to nudge active use of the honcho MCP
// tools without taxing every turn's context budget.
let sessionToolHint = "";

function outputContext(peerName: string, contextParts: string[], systemMsg?: string): void {
  const base = `[Honcho Memory for ${peerName}]: ${contextParts.join(" | ")}`;
  let output: any = {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: sessionToolHint ? `${base}\n${sessionToolHint}` : base,
    },
  };
  if (systemMsg) {
    output = addSystemMessage(output, systemMsg);
  }
  console.log(JSON.stringify(output));
}
