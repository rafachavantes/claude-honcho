import { test, expect } from "bun:test";
import { formatAssistantContent } from "./session-end.js";

test("appends [Used tools] marker when captureToolCalls is true (upstream default)", () => {
  const out = formatAssistantContent("Done.", ["Bash"], true);
  expect(out).toBe("Done.\n[Used tools: Bash]");
});

test("omits [Used tools] marker when captureToolCalls is false", () => {
  const out = formatAssistantContent("Done.", ["Bash", "Edit"], false);
  expect(out).toBe("Done.");
  expect(out).not.toContain("[Used tools");
});

test("never appends marker for long assistant text, even with capture on", () => {
  const longText = "x".repeat(150);
  const out = formatAssistantContent(longText, ["Bash"], true);
  expect(out).toBe(longText);
});

test("no marker when there are no tool uses", () => {
  const out = formatAssistantContent("Just text.", [], true);
  expect(out).toBe("Just text.");
});
