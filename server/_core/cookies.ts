import type { Request } from "express";

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some((proto: string) => proto.trim().toLowerCase() === "https");
}

export function getSessionCookieOptions(req: Request): {
  httpOnly: boolean;
  path: string;
  sameSite: "lax" | "none";
  secure: boolean;
} {
  const secure = isSecureRequest(req);

  // On Vercel (or any same-site deployment), "lax" works and avoids
  // third-party cookie blocking in Safari / Firefox.
  // Only use "none" when the API is on a different origin than the frontend.
  return {
    httpOnly: true,
    path: "/",
    sameSite: secure ? "lax" : "none",
    secure,
  };
}
