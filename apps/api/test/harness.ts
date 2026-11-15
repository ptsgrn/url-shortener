import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { getPlatformProxy } from "wrangler";
import { createApp } from "../src/app.ts";
import { createDb, type DB } from "../src/db/index.ts";
import { ACCESS_COOKIE } from "../src/modules/auth/cookie.ts";
import { Token } from "../src/modules/auth/token.ts";
import { users } from "../src/modules/users/schema.ts";
import type { Deps } from "../src/utils/deps.ts";

const MIGRATIONS = join(import.meta.dir, "../drizzle");

/** Applies `drizzle/*.sql` in order, like `wrangler d1 migrations apply`. */
const migrate = async (d1: D1Database) => {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const statements = readFileSync(join(MIGRATIONS, file), "utf8")
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const statement of statements) await d1.prepare(statement).run();
  }
};

type D1Database = Parameters<typeof createDb>[0] & {
  prepare(query: string): { run(): Promise<unknown> };
};

export interface TestUser {
  id: string;
  /** `Cookie` header value carrying a valid access token. */
  cookie: string;
}

export interface TestResponse {
  status: number;
  /**
   * Parsed JSON, else text; raw bytes for binary content (e.g. images).
   * Each test asserts its shape.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
  body: any;
  headers: Headers;
}

export interface Harness {
  db: DB;
  deps: Deps;
  /** `fetch`-like: `request("POST", "/v1/links", { body, as: user })`. */
  request(
    method: string,
    path: string,
    init?: {
      body?: unknown;
      as?: TestUser;
      query?: Record<string, string>;
      headers?: Record<string, string>;
    },
  ): Promise<TestResponse>;
  /** Inserts a user and signs a real access token for them (no OAuth). */
  signIn(opts?: {
    role?: "user" | "admin";
    banned?: boolean;
  }): Promise<TestUser>;
  /** Empties every table between tests (and invalidates cached regex rules). */
  reset(): Promise<void>;
  /** No-op: the shared Miniflare instance lives until the test process exits. */
  dispose(): Promise<void>;
}

/**
 * One Miniflare instance (in-memory D1, all migrations applied) for the whole
 * `bun test` process. Booting and disposing one per file left later files'
 * D1 calls ~100x slower and sometimes hung `dispose()` past the hook timeout.
 */
let platform: Promise<D1Database> | undefined;
const sharedD1 = () =>
  (platform ??= getPlatformProxy<{ DB: D1Database }>({
    configPath: join(import.meta.dir, "wrangler.jsonc"),
    persist: false,
  }).then(async (proxy) => {
    process.once("beforeExit", () => void proxy.dispose());
    await migrate(proxy.env.DB);
    return proxy.env.DB;
  }));

/**
 * The real app (`createApp`) on the shared, emptied D1 database. Each call
 * builds a fresh app, so module mocks registered before it apply (see
 * `links.collision.test.ts`). Files run one at a time, so sharing is safe.
 */
export const createHarness = async (
  overrides: Pick<Deps, "waitUntil"> = {},
): Promise<Harness> => {
  const db = createDb(await sharedD1());
  const deps: Deps = {
    ...overrides,
    db,
    env: {
      JWT_SECRET: "test-secret-test-secret-test-secret",
      GOOGLE_CLIENT_ID: "test",
      GOOGLE_CLIENT_SECRET: "test",
    },
  };
  const app = createApp(deps);

  const harness: Harness = {
    db,
    deps,
    async request(method, path, { body, as, query, headers: extra } = {}) {
      const url = new URL(`http://localhost/api${path}`);
      for (const [k, v] of Object.entries(query ?? {}))
        url.searchParams.set(k, v);
      const headers: Record<string, string> = { ...extra };
      if (body !== undefined) headers["content-type"] = "application/json";
      if (as) headers.cookie = as.cookie;
      const res = await app.handle(
        new Request(url, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
      );
      const type = res.headers.get("content-type") ?? "";
      if (/^(image|application\/octet-stream)/.test(type))
        return {
          status: res.status,
          body: new Uint8Array(await res.arrayBuffer()),
          headers: res.headers,
        };
      const text = await res.text();
      let parsed: unknown = text;
      try {
        parsed = text ? JSON.parse(text) : undefined;
      } catch {
        // Not JSON: keep the raw text.
      }
      return { status: res.status, body: parsed, headers: res.headers };
    },
    async signIn({ role = "user", banned = false } = {}) {
      const user = await db
        .insert(users)
        .values({
          name: `Test ${role}`,
          role,
          bannedAt: banned ? new Date().toISOString() : null,
        })
        .returning({ id: users.id })
        .get();
      const token = await Token.signAccess(deps.env.JWT_SECRET, user.id);
      if (token.isErr()) throw new Error(token.error);
      return { id: user.id, cookie: `${ACCESS_COOKIE}=${token.value}` };
    },
    async reset() {
      for (const table of [
        "link_visits",
        "links",
        "rules",
        "refresh_tokens",
        "accounts",
        "users",
      ])
        await db.run(sql.raw(`DELETE FROM ${table}`));
      // Rules were removed behind the service's back: bump the version so
      // cached compiled regexes are rebuilt.
      await db.run(
        sql`INSERT INTO rules_version (id, version) VALUES (1, 1)
            ON CONFLICT (id) DO UPDATE SET version = version + 1`,
      );
    },
    dispose: async () => {},
  };
  await harness.reset();
  return harness;
};
