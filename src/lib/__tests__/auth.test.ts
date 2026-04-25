// @vitest-environment node
import { describe, test, expect, vi, beforeEach } from "vitest";
import { SignJWT, jwtVerify } from "jose";

// Mock server-only so it doesn't throw outside Next.js server context
vi.mock("server-only", () => ({}));

const mockCookieSet = vi.fn();
const mockCookieGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn(() =>
    Promise.resolve({
      set: mockCookieSet,
      get: mockCookieGet,
    })
  ),
}));

const JWT_SECRET = new TextEncoder().encode("development-secret-key");

async function makeToken(payload: object, expiresIn = "7d") {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(expiresIn)
    .setIssuedAt()
    .sign(JWT_SECRET);
}

describe("createSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("sets the auth-token cookie", async () => {
    const { createSession } = await import("@/lib/auth");
    await createSession("user-123", "test@example.com");

    expect(mockCookieSet).toHaveBeenCalledOnce();
    const [cookieName] = mockCookieSet.mock.calls[0];
    expect(cookieName).toBe("auth-token");
  });

  test("cookie has httpOnly and correct sameSite options", async () => {
    const { createSession } = await import("@/lib/auth");
    await createSession("user-123", "test@example.com");

    const [, , options] = mockCookieSet.mock.calls[0];
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
  });

  test("cookie expires in ~7 days", async () => {
    const { createSession } = await import("@/lib/auth");
    const before = Date.now();
    await createSession("user-123", "test@example.com");
    const after = Date.now();

    const [, , options] = mockCookieSet.mock.calls[0];
    const expiresMs = options.expires.getTime();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    expect(expiresMs).toBeGreaterThanOrEqual(before + sevenDays - 1000);
    expect(expiresMs).toBeLessThanOrEqual(after + sevenDays + 1000);
  });

  test("JWT token contains userId and email", async () => {
    const { createSession } = await import("@/lib/auth");
    await createSession("user-123", "test@example.com");

    const [, token] = mockCookieSet.mock.calls[0];
    const { payload } = await jwtVerify(token, JWT_SECRET);

    expect(payload.userId).toBe("user-123");
    expect(payload.email).toBe("test@example.com");
  });

  test("cookie is not secure in non-production", async () => {
    const { createSession } = await import("@/lib/auth");
    await createSession("user-123", "test@example.com");

    const [, , options] = mockCookieSet.mock.calls[0];
    expect(options.secure).toBe(false);
  });

  test("cookie is secure in production", async () => {
    const originalEnv = process.env.NODE_ENV;
    vi.stubEnv("NODE_ENV", "production");

    const { createSession } = await import("@/lib/auth");
    await createSession("user-123", "test@example.com");

    const [, , options] = mockCookieSet.mock.calls[0];
    expect(options.secure).toBe(true);

    vi.unstubAllEnvs();
  });
});

describe("getSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns null when no cookie is present", async () => {
    mockCookieGet.mockReturnValue(undefined);

    const { getSession } = await import("@/lib/auth");
    const session = await getSession();

    expect(session).toBeNull();
  });

  test("returns the session payload for a valid token", async () => {
    const token = await makeToken({ userId: "user-123", email: "test@example.com" });
    mockCookieGet.mockReturnValue({ value: token });

    const { getSession } = await import("@/lib/auth");
    const session = await getSession();

    expect(session).not.toBeNull();
    expect(session?.userId).toBe("user-123");
    expect(session?.email).toBe("test@example.com");
  });

  test("returns null for a malformed token", async () => {
    mockCookieGet.mockReturnValue({ value: "not.a.valid.jwt" });

    const { getSession } = await import("@/lib/auth");
    const session = await getSession();

    expect(session).toBeNull();
  });

  test("returns null for an expired token", async () => {
    // Build a token that expired 1 second ago using a numeric timestamp
    const expiredAt = Math.floor(Date.now() / 1000) - 1;
    const token = await new SignJWT({ userId: "user-123", email: "test@example.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(expiredAt)
      .setIssuedAt()
      .sign(JWT_SECRET);
    mockCookieGet.mockReturnValue({ value: token });

    const { getSession } = await import("@/lib/auth");
    const session = await getSession();

    expect(session).toBeNull();
  });

  test("returns null for a token signed with a different secret", async () => {
    const wrongSecret = new TextEncoder().encode("wrong-secret");
    const token = await new SignJWT({ userId: "user-123", email: "test@example.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .setIssuedAt()
      .sign(wrongSecret);
    mockCookieGet.mockReturnValue({ value: token });

    const { getSession } = await import("@/lib/auth");
    const session = await getSession();

    expect(session).toBeNull();
  });
});
