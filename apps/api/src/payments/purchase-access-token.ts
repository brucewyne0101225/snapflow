import jwt from "jsonwebtoken";

interface PurchaseAccessTokenPayload {
  sub: string;
  purchaseId: string;
}

const PURCHASE_ACCESS_TOKEN_TTL = "12h";

function getPurchaseAccessTokenSecret() {
  return process.env.PURCHASE_ACCESS_TOKEN_SECRET ?? process.env.JWT_SECRET ?? "dev-purchase-secret";
}

export function signPurchaseAccessToken(input: { purchaseId: string }) {
  const payload: PurchaseAccessTokenPayload = {
    sub: input.purchaseId,
    purchaseId: input.purchaseId
  };

  return jwt.sign(payload, getPurchaseAccessTokenSecret(), {
    expiresIn: PURCHASE_ACCESS_TOKEN_TTL
  });
}

export function verifyPurchaseAccessToken(input: { purchaseId: string; token: string }) {
  const decoded = jwt.verify(input.token, getPurchaseAccessTokenSecret());

  if (
    typeof decoded !== "object" ||
    !decoded ||
    typeof decoded.purchaseId !== "string" ||
    decoded.purchaseId !== input.purchaseId
  ) {
    throw new Error("Invalid purchase access token.");
  }
}
