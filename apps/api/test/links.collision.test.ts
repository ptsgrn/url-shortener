import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";

/** Codes `randomCode()` will return next; refilled per test. */
const queue: string[] = [];
mock.module("../src/modules/links/random.ts", () => ({
  randomCode: () => queue.shift() ?? "fallbak",
}));

// Imported after the mock so the links service picks it up.
const { createHarness } = await import("./harness.ts");
const { allowAll } = await import("./fixtures.ts");
type Harness = Awaited<ReturnType<typeof createHarness>>;
type TestUser = Awaited<ReturnType<Harness["signIn"]>>;

let h: Harness;
let user: TestUser;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(() => h.dispose());
beforeEach(async () => {
  await h.reset();
  queue.length = 0;
  user = await h.signIn();
  await allowAll(h, await h.signIn({ role: "admin" }));
});

const create = () =>
  h.request("POST", "/v1/links", {
    as: user,
    body: { url: "https://example.com" },
  });

describe("code collisions", () => {
  test("retries with a fresh code when the first one is taken", async () => {
    queue.push("AAAAAAA");
    expect((await create()).body.code).toBe("AAAAAAA");

    queue.push("AAAAAAA", "BBBBBBB");
    const res = await create();
    expect(res.status).toBe(200);
    expect(res.body.code).toBe("BBBBBBB");
  });

  test("a soft-deleted link's code stays reserved", async () => {
    queue.push("DELETED");
    await create();
    await h.request("DELETE", "/v1/links/DELETED", { as: user });

    queue.push("DELETED", "FRESH01");
    expect((await create()).body.code).toBe("FRESH01");
  });

  test("gives up with a 500 after 5 taken codes, without inserting", async () => {
    queue.push("TAKEN00");
    await create();

    queue.push(...Array(5).fill("TAKEN00"), "NEVER00");
    const res = await create();
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "INTERNAL_DATABASE" });
    expect(queue).toEqual(["NEVER00"]); // exactly 5 attempts
  });
});
