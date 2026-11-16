/**
 * Load-tests short link creation (`POST /api/v1/links`).
 *
 * Production (copy the `access_token` cookie from a signed-in browser; it lasts 15 minutes):
 *   bun scripts/benchmark-create.ts --url https://go.ptsgrn.dev --token <access_token> -c 10 -d 30 --cleanup
 *
 * Local dev server (signs in through the dev tools and whitelists the target's host):
 *   bun scripts/benchmark-create.ts --url http://localhost:3000 --dev -c 10 -d 30
 *
 * Every request creates a real link with a random code. `--cleanup` deletes them
 * afterwards; their codes stay reserved, as deleted codes always do.
 */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    url: { type: "string", default: "http://localhost:3000" },
    token: { type: "string" },
    dev: { type: "boolean", default: false },
    connections: { type: "string", short: "c", default: "10" },
    duration: { type: "string", short: "d", default: "30" },
    target: { type: "string", default: "https://www.chula.ac.th/benchmark" },
    cleanup: { type: "boolean", default: false },
    out: { type: "string" },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (args.help) {
  console.log(`Options:
  --url <origin>        Site to test (default http://localhost:3000)
  --token <jwt>         Value of the access_token cookie (production)
  --dev                 Sign in through /api/dev/users instead (local dev server only)
  -c, --connections <n> Concurrent requests (default 10)
  -d, --duration <s>    Seconds to run (default 30)
  --target <url>        Destination for the links; its host must be whitelisted
  --cleanup             Delete the created links afterwards
  --out <file.csv>      Write every request (time, latency, status, error) to a CSV`);
  process.exit(0);
}

const origin = args.url.replace(/\/$/, "");
const connections = Number(args.connections);
const durationMs = Number(args.duration) * 1000;

async function devSession(): Promise<string> {
  const res = await fetch(`${origin}/api/dev/users`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Benchmark admin", role: "admin" }),
  });
  if (!res.ok)
    throw new Error(`dev sign-in failed (${res.status}): needs DEV_TOOLS=true`);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  // A fresh database has no whitelist, which blocks every destination.
  const rule = await fetch(`${origin}/api/v1/rules`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      list: "whitelist",
      pattern: new URL(args.target).hostname,
    }),
  });
  if (!rule.ok && rule.status !== 409)
    throw new Error(`whitelisting failed (${rule.status})`);
  return cookie;
}

const cookie = args.dev
  ? await devSession()
  : args.token
    ? `access_token=${args.token}`
    : (console.error(
        "Pass --token <access_token> (or --dev for a local dev server).",
      ),
      process.exit(1));

// Check the session once, rather than measuring a run of 401s.
const me = await fetch(`${origin}/api/v1/auth/me`, { headers: { cookie } });
if (!me.ok) {
  console.error(
    `Not signed in (${me.status}). The access_token cookie lasts 15 minutes; copy a fresh one.`,
  );
  process.exit(1);
}
const user = (await me.json()) as { name: string | null; email: string | null };
console.log(`Signed in as ${user.name ?? user.email}`);

type Sample = {
  start: number;
  ms: number;
  status: number;
  error: string | null;
  code: string | null;
};
const samples: Sample[] = [];
const t0 = performance.now();
const deadline = t0 + durationMs;

async function worker() {
  while (performance.now() < deadline) {
    const start = performance.now();
    let status = 0;
    let error: string | null = null;
    let code: string | null = null;
    try {
      const res = await fetch(`${origin}/api/v1/links`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ url: args.target }),
      });
      status = res.status;
      const body = (await res.json().catch(() => null)) as {
        code?: string;
        error?: string;
      } | null;
      if (res.ok) code = body?.code ?? null;
      else error = body?.error ?? res.statusText;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    samples.push({
      start: start - t0,
      ms: performance.now() - start,
      status,
      error,
      code,
    });
  }
}

console.log(
  `POST ${origin}/api/v1/links — ${connections} connections, ${durationMs / 1000}s, target ${args.target}`,
);
await Promise.all(Array.from({ length: connections }, worker));
const elapsed = (performance.now() - t0) / 1000;

// ---- Report ----
const pct = (sorted: number[], p: number) => {
  const k = ((sorted.length - 1) * p) / 100;
  const f = Math.floor(k);
  const c = Math.min(f + 1, sorted.length - 1);
  return sorted[f] + (sorted[c] - sorted[f]) * (k - f);
};
const describe = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / s.length);
  return {
    n: s.length,
    min: s[0],
    p50: pct(s, 50),
    p90: pct(s, 90),
    p95: pct(s, 95),
    p99: pct(s, 99),
    max: s.at(-1)!,
    mean,
    sd,
  };
};

const ok = samples.filter((s) => s.status === 200);
const count = <K extends string | number>(keys: K[]) =>
  Object.fromEntries(
    [...new Set(keys)].map((k) => [k, keys.filter((x) => x === k).length]),
  );
// Requests only start before the deadline, so bucket by the test's length, not elapsed time.
const perSecond = Array.from(
  { length: Math.ceil(durationMs / 1000) },
  (_, i) =>
    samples.filter((s) => s.start >= i * 1000 && s.start < (i + 1) * 1000)
      .length,
);

console.log(
  `\n${samples.length} requests in ${elapsed.toFixed(2)}s — ${(samples.length / elapsed).toFixed(1)} req/s`,
);
console.log(
  `Created: ${ok.length} (${((ok.length / samples.length) * 100).toFixed(1)}%)`,
);
console.log("Status codes:", count(samples.map((s) => s.status)));
const errors = samples.filter((s) => s.error).map((s) => s.error!);
if (errors.length) console.log("Errors:", count(errors));

if (ok.length) {
  const d = describe(ok.map((s) => s.ms));
  console.log("\nLatency of successful creates (ms):");
  console.table({
    latency: Object.fromEntries(
      Object.entries(d).map(([k, v]) => [
        k,
        k === "n" ? v : Number(v.toFixed(1)),
      ]),
    ),
  });
}
console.log("Requests started per second:", perSecond.join(" "));

if (args.out) {
  writeFileSync(
    args.out,
    "start_ms,latency_ms,status,error,code\n" +
      samples
        .map((s) =>
          [
            s.start.toFixed(1),
            s.ms.toFixed(1),
            s.status,
            s.error ?? "",
            s.code ?? "",
          ].join(","),
        )
        .join("\n") +
      "\n",
  );
  console.log(`Raw samples written to ${args.out}`);
}

if (args.cleanup && ok.length) {
  process.stdout.write(`\nDeleting ${ok.length} created links… `);
  const codes = ok.map((s) => s.code!).filter(Boolean);
  let deleted = 0;
  // A few at a time, so cleanup doesn't become a second load test.
  for (let i = 0; i < codes.length; i += 5) {
    const batch = await Promise.all(
      codes.slice(i, i + 5).map((code) =>
        fetch(`${origin}/api/v1/links/${code}`, {
          method: "DELETE",
          headers: { cookie },
        }),
      ),
    );
    deleted += batch.filter((r) => r.status === 204).length;
  }
  console.log(`${deleted}/${codes.length} deleted.`);
}
