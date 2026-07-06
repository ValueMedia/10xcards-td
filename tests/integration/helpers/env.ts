// Integration-test env loader + skip guard.
//
// Populates process.env from the gitignored `.dev.vars` (local Supabase config)
// for any key not already present, so the suite works both locally and in a real
// CI environment (where real env vars win). Then probes the Supabase instance for
// reachability. Exposes `hasSupabaseEnv` — every integration suite gates on it via
// `describe.skipIf(!hasSupabaseEnv)` so the tests are inert (skipped, not failed)
// when the env is missing OR the local Supabase is not running.
//
// Listed as a `setupFiles` entry for the integration project AND imported by the
// helpers, so process.env is populated before any module reads server env.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadDevVars(): void {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".dev.vars"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (!match) continue; // skips blank lines and `#` comments
      const [, key, rawValue] = match;
      if (process.env[key] === undefined) {
        process.env[key] = rawValue.replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // No `.dev.vars` — rely on whatever is already in process.env.
  }
}

loadDevVars();

export const supabaseUrl = process.env.SUPABASE_URL ?? "";
export const anonKey = process.env.SUPABASE_KEY ?? "";
export const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

async function probeReachable(): Promise<boolean> {
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${supabaseUrl}/auth/v1/health`, {
      headers: { apikey: anonKey },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

// Top-level await: resolved before importing test files run `describe.skipIf`.
export const hasSupabaseEnv = await probeReachable();
