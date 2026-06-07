import { join } from "path";
import { tmpdir } from "os";
import { Honcho } from "@honcho-ai/sdk";
import { getQueuedMessages, markMessagesUploadedByIds, chunkContent } from "./cache.js";
import type { HonchoCLAUDEConfig } from "./config.js";
import { loadConfig, getHonchoClientOptions, setDetectedHost } from "./config.js";
import type { HonchoHost } from "./config.js";
import { acquireLock, releaseLock } from "./lock.js";

// Re-export QueuedMessage type shape for callers
export type { HonchoCLAUDEConfig };

// ============================================
// Lock path helper
// ============================================

function lockPathFor(cwd: string): string {
  return join(tmpdir(), `honcho-flush-${Buffer.from(cwd).toString("hex").slice(0, 16)}.lock`);
}

// ============================================
// drainQueue — pure logic, no network, testable
// ============================================

interface QueuedMessage {
  id: string;
  content: string;
  peerId: string;
  cwd: string;
  timestamp: string;
  uploaded?: boolean;
  instanceId?: string;
  metadata?: Record<string, unknown>;
}

export interface DrainQueueOpts {
  cwd: string;
  upload: (msgs: QueuedMessage[]) => Promise<void>;
}

/**
 * Reads all queued messages for `opts.cwd`, calls `opts.upload`, then marks
 * them uploaded by id. If upload throws, the messages stay in the queue (the
 * throw propagates — caller decides what to do).
 */
export async function drainQueue(opts: DrainQueueOpts): Promise<void> {
  const msgs = getQueuedMessages(opts.cwd) as QueuedMessage[];
  if (msgs.length === 0) return;

  // Let upload throw — do NOT mark uploaded if it fails
  await opts.upload(msgs);

  markMessagesUploadedByIds(msgs.map((m) => m.id));
}

// ============================================
// realUpload — builds Honcho messages and uploads
// ============================================

/**
 * Builds chunked Honcho messages from queued messages and uploads them in one
 * addMessages call. The Honcho client is constructed lazily inside this
 * function so importing flush.ts in tests does NOT hit the network.
 */
export async function realUpload(
  config: HonchoCLAUDEConfig,
  sessionName: string,
  msgs: QueuedMessage[]
): Promise<void> {
  const honcho = new Honcho(getHonchoClientOptions(config));
  const session = await honcho.session(sessionName);

  const built: ReturnType<Awaited<ReturnType<typeof honcho.peer>>["message"]>[] = [];

  for (const m of msgs) {
    const peer = await honcho.peer(m.peerId);
    for (const chunk of chunkContent(m.content)) {
      built.push(
        peer.message(chunk, {
          createdAt: m.timestamp,
          metadata: {
            ...(m.metadata ?? {}),
            instance_id: m.instanceId,
            session_affinity: sessionName,
          },
        })
      );
    }
  }

  await session.addMessages(built);
}

// ============================================
// drainInline — lock-guarded inline drain
// ============================================

/**
 * Lock-guarded drain. Uses the same lock path as the detached flush process
 * so only one writer (inline or detached) runs at a time for a given cwd.
 * If the lock is held, silently skips (the other process will drain).
 */
export async function drainInline(
  config: HonchoCLAUDEConfig,
  sessionName: string,
  cwd: string
): Promise<void> {
  const lockPath = lockPathFor(cwd);
  if (!acquireLock(lockPath)) return;
  try {
    await drainQueue({ cwd, upload: (msgs) => realUpload(config, sessionName, msgs) });
  } finally {
    releaseLock(lockPath);
  }
}

// ============================================
// Detached entrypoint
// ============================================

if (import.meta.main) {
  const cwd = process.env.HONCHO_FLUSH_CWD || process.cwd();
  const sessionName = process.env.HONCHO_FLUSH_SESSION || "";
  const host = process.env.HONCHO_FLUSH_HOST as HonchoHost | undefined;
  if (host) setDetectedHost(host);
  const config = loadConfig();
  if (!config || !sessionName) process.exit(0);
  const lockPath = lockPathFor(cwd);
  if (!acquireLock(lockPath)) process.exit(0);
  try {
    await drainQueue({ cwd, upload: (msgs) => realUpload(config, sessionName, msgs) });
  } catch {
    /* kept in queue for next flush */
  } finally {
    releaseLock(lockPath);
  }
  process.exit(0);
}
