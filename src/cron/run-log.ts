import fs from "node:fs/promises";
import path from "node:path";

export type CronRunLogEntry = {
  ts: number;
  jobId: string;
  action: "finished";
  status?: "ok" | "error" | "skipped";
  error?: string;
  summary?: string;
  runAtMs?: number;
  durationMs?: number;
  nextRunAtMs?: number;
};

export function resolveCronRunLogPath(params: { storePath: string; jobId: string }) {
  const storePath = path.resolve(params.storePath);
  const dir = path.dirname(storePath);
  return path.join(dir, "runs", `${params.jobId}.jsonl`);
}

const writesByPath = new Map<string, Promise<void>>();

const defaultPruneOptions = {
  maxBytes: 2_000_000,
  keepLines: 2_000,
};

async function pruneIfNeeded(filePath: string, opts: { maxBytes: number; keepLines: number }) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat || stat.size <= opts.maxBytes) {
    return;
  }

  console.log(`Pruning log file ${filePath}, size: ${stat.size} bytes`);
  const raw = await fs.readFile(filePath, "utf-8").catch(() => "");
  if (!raw) {
    return;
  }
  const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);
  const kept = lines.slice(Math.max(0, lines.length - opts.keepLines));
  const tmp = `${filePath}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  await fs.writeFile(tmp, `${kept.join("\n")}\n`, "utf-8");
  await fs.rename(tmp, filePath);
  console.log(`Pruned log file ${filePath}, kept ${kept.length} lines`);
}

export async function appendCronRunLog(
  filePath: string,
  entry: CronRunLogEntry,
  opts?: { maxBytes?: number; keepLines?: number },
) {
  const resolved = path.resolve(filePath);
  const prev = writesByPath.get(resolved) ?? Promise.resolve();
  const next = prev
    .catch(() => undefined)
    .then(async () => {
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await fs.appendFile(resolved, `${JSON.stringify(entry)}\n`, "utf-8");
      console.log(`Appended log entry to ${resolved} for job ${entry.jobId}`);
      await pruneIfNeeded(resolved, {
        maxBytes: opts?.maxBytes ?? defaultPruneOptions.maxBytes,
        keepLines: opts?.keepLines ?? defaultPruneOptions.keepLines,
      });
    });
  writesByPath.set(resolved, next);
  await next;
}

export async function readCronRunLogEntries(
  filePath: string,
  opts?: { limit?: number; jobId?: string },
): Promise<CronRunLogEntry[]> {
  const limit = Math.max(1, Math.min(5000, Math.floor(opts?.limit ?? 200)));
  const jobId = opts?.jobId?.trim() || undefined;
  const resolved = path.resolve(filePath);
  const raw = await fs.readFile(resolved, "utf-8").catch(() => "");
  if (!raw.trim()) {
    console.log(`No log entries found at ${resolved}`);
    return [];
  }
  const parsed: CronRunLogEntry[] = [];
  const lines = raw.split("\n");
  for (let i = lines.length - 1; i >= 0 && parsed.length < limit; i--) {
    const line = lines[i]?.trim();
    if (!line) {
      continue;
    }
    try {
      const obj = JSON.parse(line) as Partial<CronRunLogEntry> | null;
      if (!obj || obj.action !== "finished") {
        continue;
      }
      if (typeof obj.jobId !== "string" || obj.jobId.trim().length === 0) {
        continue;
      }
      if (typeof obj.ts !== "number" || !Number.isFinite(obj.ts)) {
        continue;
      }
      if (jobId && obj.jobId !== jobId) {
        continue;
      }
      parsed.push(obj as CronRunLogEntry);
    } catch {
      // ignore invalid lines
    }
  }
  parsed.reverse();
  console.log(`Read ${parsed.length} log entries from ${resolved} for job ${jobId || 'all'}`);
  return parsed;
}
