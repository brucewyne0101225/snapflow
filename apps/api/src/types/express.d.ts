import type { AuthTokenPayload } from "../auth/jwt.js";

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthTokenPayload;
    }
  }
}

export {};
