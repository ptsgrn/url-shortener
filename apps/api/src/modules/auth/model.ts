import { t, type UnwrapSchema } from "elysia";
import { errorBody } from "../../utils/error.ts";

export enum AuthError {
  /** Missing, invalid or expired access token. */
  Unauthorized = "AUTH_UNAUTHORIZED",
  /** Signed in, but the user's role is too low or the user is banned. */
  Forbidden = "AUTH_FORBIDDEN",
  /** Missing or unknown refresh token. */
  InvalidRefreshToken = "AUTH_INVALID_REFRESH_TOKEN",
  RefreshTokenExpired = "AUTH_REFRESH_TOKEN_EXPIRED",
  /** An already-rotated refresh token was presented; all of the user's sessions were revoked. */
  RefreshTokenReused = "AUTH_REFRESH_TOKEN_REUSED",
  UnknownProvider = "AUTH_UNKNOWN_PROVIDER",
  InvalidOAuthState = "AUTH_INVALID_OAUTH_STATE",
  OAuthExchangeFailed = "AUTH_OAUTH_EXCHANGE_FAILED",
  /** Sign-in refused: the email isn't verified or its domain isn't allowed (FR-01). */
  EmailNotAllowed = "AUTH_EMAIL_NOT_ALLOWED",
  /** Sign-in refused: an admin suspended the account (FR-15). */
  AccountSuspended = "AUTH_ACCOUNT_SUSPENDED",
  /** Sign-in refused: the account was deleted. */
  AccountUnavailable = "AUTH_ACCOUNT_UNAVAILABLE",
}

export const AuthErrorStatus = {
  [AuthError.Unauthorized]: 401,
  [AuthError.Forbidden]: 403,
  [AuthError.InvalidRefreshToken]: 401,
  [AuthError.RefreshTokenExpired]: 401,
  [AuthError.RefreshTokenReused]: 401,
  [AuthError.UnknownProvider]: 404,
  [AuthError.InvalidOAuthState]: 400,
  [AuthError.OAuthExchangeFailed]: 400,
  [AuthError.EmailNotAllowed]: 403,
  [AuthError.AccountSuspended]: 403,
  [AuthError.AccountUnavailable]: 403,
} as const satisfies Record<AuthError, number>;

export type RefreshError =
  | AuthError.InvalidRefreshToken
  | AuthError.RefreshTokenExpired
  | AuthError.RefreshTokenReused;

export const AuthModel = {
  providerParams: t.Object({ provider: t.String() }),
  signInQuery: t.Object({ redirectTo: t.Optional(t.String()) }),
  // Providers append their own params (Google: iss, scope, authuser, hd,
  // prompt), so anything besides code and state is allowed and ignored.
  callbackQuery: t.Object(
    {
      code: t.Optional(t.String()),
      state: t.Optional(t.String()),
    },
    { additionalProperties: true },
  ),
  ok: t.Object({ ok: t.Literal(true) }),
  unauthorized: errorBody(AuthError.Unauthorized),
  forbidden: errorBody(AuthError.Forbidden),
  refreshFailed: errorBody(
    AuthError.InvalidRefreshToken,
    AuthError.RefreshTokenExpired,
    AuthError.RefreshTokenReused,
  ),
  unknownProvider: errorBody(AuthError.UnknownProvider),
  signInFailed: errorBody(
    AuthError.InvalidOAuthState,
    AuthError.OAuthExchangeFailed,
  ),
  signInRefused: errorBody(
    AuthError.EmailNotAllowed,
    AuthError.AccountSuspended,
    AuthError.AccountUnavailable,
  ),
} as const;

export type AuthModel = {
  [k in keyof typeof AuthModel]: UnwrapSchema<(typeof AuthModel)[k]>;
};
