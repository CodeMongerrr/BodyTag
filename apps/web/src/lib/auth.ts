import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "./db";
import { appConfig } from "./config";

const COOKIE = "bt_session";
const DEV_SECRET = "dev-only-change-me";

/**
 * Resolved lazily (never at import time, so `next build` does not need it). In production a missing, default or
 * short SESSION_SECRET would let anyone forge a session cookie, so refuse to sign or verify instead.
 */
function sessionKey() {
  const raw = appConfig.sessionSecret;
  const isProd = process.env.NODE_ENV === "production";
  if (isProd && (raw === DEV_SECRET || raw.length < 16)) {
    throw new Error("SESSION_SECRET must be set to a long random value in production");
  }
  return new TextEncoder().encode(raw);
}

export type Session = {
  userId: string;
  email: string;
  handle: string;
};

export async function createSession(session: Session) {
  const token = await new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(sessionKey());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionKey(), { algorithms: ["HS256"] });
    if (!payload.userId || !payload.email || !payload.handle) return null;
    return {
      userId: String(payload.userId),
      email: String(payload.email),
      handle: String(payload.handle),
    };
  } catch {
    return null;
  }
}

export async function requireUser() {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}
