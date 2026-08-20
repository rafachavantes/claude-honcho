// src/injection-policy.ts
var SLIM_POINTER = "Honcho memory is active for this session; older details can be recalled via the honcho tools.";
function decideInjection(source, injectOnCompact) {
  if (source !== "compact")
    return "full";
  return injectOnCompact;
}

export { SLIM_POINTER, decideInjection };

//# debugId=8183B81105930EC064756E2164756E21
//# sourceMappingURL=chunk-d0w1kvcv.js.map
