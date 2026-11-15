import { nanoid } from "nanoid";

export const randomCode = (length: number = 7) => nanoid(length);
