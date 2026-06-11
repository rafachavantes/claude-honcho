export type InjectOnCompact = "full" | "slim" | "off";

export const SLIM_POINTER =
  "Honcho memory is active for this session; older details can be recalled via the honcho tools.";

/**
 * Source-aware injection policy. Only a SessionStart fired by context
 * compaction is downgraded — the host CLI's own compaction summary already
 * carries recent context. Every other source (startup, resume, clear,
 * missing) keeps full injection.
 */
export function decideInjection(
  source: string | undefined,
  injectOnCompact: InjectOnCompact,
): InjectOnCompact {
  if (source !== "compact") return "full";
  return injectOnCompact;
}
