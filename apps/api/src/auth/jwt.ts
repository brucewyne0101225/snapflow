import type { UserRole } from "@prisma/client";
import jwt from "jsonwebtoken";

export interface AuthTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
}

const ACCESS_TOKEN_TTL = "7d";

function getJwtSecret() {
  return process.env.JWT_SECRET ?? "dev-only-change-this-secret";
}

export function signAccessToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: ACCESS_TOKEN_TTL });
}

export function verifyAccessToken(token: string): AuthTokenPayload {
  const decoded = jwt.verify(token, getJwtSecret());

  if (
    typeof decoded !== "object" ||
    !decoded ||
    typeof decoded.sub !== "string" ||
    typeof decoded.email !== "string" ||
    typeof decoded.role !== "string"
  ) {
    throw new Error("Invalid token payload");
  }

  return {
    sub: decoded.sub,
    email: decoded.email,
    role: decoded.role as UserRole
  };
}
