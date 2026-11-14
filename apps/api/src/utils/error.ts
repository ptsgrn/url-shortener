import {
  t,
  type ElysiaCustomStatusResponse,
  type SelectiveStatus,
} from "elysia";
import { ResultAsync } from "neverthrow";

/**
 * Error handling: services never throw. They return `Result` / `ResultAsync`
 * whose error is a string enum member (one enum per domain, e.g. `AuthError`).
 * Controllers turn errors into `{ error: <enum value> }` responses with the
 * status from that domain's `…ErrorStatus` map (see `failWith`).
 */

/** Infrastructure failures the client can't act on (always HTTP 500). */
export enum InternalError {
  Database = "INTERNAL_DATABASE",
  Crypto = "INTERNAL_CRYPTO",
}

export const InternalErrorStatus = {
  [InternalError.Database]: 500,
  [InternalError.Crypto]: 500,
} as const satisfies Record<InternalError, number>;

const logAs =
  <C extends InternalError>(code: C) =>
  (cause: unknown): C => {
    console.error(`[${code}]`, cause);
    return code;
  };

/** Runs a DB query; a rejection (or sync throw) becomes `InternalError.Database`. */
export const dbQuery = <T>(
  run: () => PromiseLike<T>,
): ResultAsync<T, InternalError.Database> =>
  ResultAsync.fromThrowable(async () => run(), logAs(InternalError.Database))();

/** Runs a Web Crypto / JWT operation; a failure becomes `InternalError.Crypto`. */
export const cryptoOp = <T>(
  run: () => PromiseLike<T>,
): ResultAsync<T, InternalError.Crypto> =>
  ResultAsync.fromThrowable(async () => run(), logAs(InternalError.Crypto))();

/** Response body schema `{ error: <one of codes> }`. */
export const errorBody = <const E extends readonly [string, ...string[]]>(
  ...codes: E
) => t.Object({ error: t.UnionEnum(codes) });

export const internalErrorBody = errorBody(
  InternalError.Database,
  InternalError.Crypto,
);

type Fail<M extends Record<string, number>, E> = E extends keyof M
  ? ElysiaCustomStatusResponse<M[E], { error: E }>
  : never;

/**
 * The errors of `M` a route may return: those whose status code is declared
 * in the route's `response` schema (`Res`) with a body accepting that code.
 */
type Declared<Res, M extends Record<string, number>> = {
  [E in keyof M & string]: M[E] extends keyof Res
    ? { error: E } extends Res[M[E]]
      ? E
      : never
    : never;
}[keyof M & string];

/**
 * `failWith(statusMap)(status)` → `fail(error)` = `status(statusMap[error], { error })`.
 *
 * Pass the handler's own `status` (typed by the route's `response` schema):
 * `fail` then only accepts errors the schema declares, so `.match(ok, fail)`
 * on a service that can return an undeclared error is a type error.
 */
export const failWith =
  <const M extends Record<string, number>>(statusOf: M) =>
  <Res>(status: SelectiveStatus<Res>) =>
  (error: Declared<Res, M>): Fail<M, Declared<Res, M>> =>
    (status as unknown as (code: number, body: unknown) => never)(
      statusOf[error]!,
      { error },
    );
