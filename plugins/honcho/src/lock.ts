import { openSync, closeSync, unlinkSync, statSync, existsSync } from "fs";

export function acquireLock(path: string, ttlMs = 30_000): boolean {
  try {
    const fd = openSync(path, "wx"); // atomic: fails if file exists
    closeSync(fd);
    return true;
  } catch {
    try {
      const age = Date.now() - statSync(path).mtimeMs;
      if (age > ttlMs) {
        unlinkSync(path);
        const fd = openSync(path, "wx");
        closeSync(fd);
        return true;
      }
    } catch { /* lost the race or stat failed */ }
    return false;
  }
}

export function releaseLock(path: string): void {
  try { if (existsSync(path)) unlinkSync(path); } catch { /* ignore */ }
}
