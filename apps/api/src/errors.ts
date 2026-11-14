// Every error code the API can return, for clients (`import { AuthError } from "api/errors"`).
export { AuthError } from "./modules/auth/model.ts";
export { LinkError } from "./modules/links/model.ts";
export { UserError } from "./modules/users/model.ts";
export { InternalError } from "./utils/error.ts";
