import { Elysia, ElysiaCustomStatusResponse } from "elysia";

/**
 * Services `throw status(...)` (see the Elysia best-practice guide). With
 * `aot: false` (required on Workers), Elysia 1.4 turns a thrown status into an
 * empty 500 unless an error hook returns it, so return it as the response here.
 */
export const statusErrors = new Elysia({ name: "status-errors", aot: false })
  .onError({ as: "global" }, ({ error }) => {
    if (error instanceof ElysiaCustomStatusResponse) return error;
  });
