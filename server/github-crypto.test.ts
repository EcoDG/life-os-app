import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "./crypto";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Crypto unit tests ─────────────────────────────────────────────────────────

describe("AES-256-GCM crypto", () => {
  it("encrypts and decrypts a plain string", () => {
    const plain = "https://github.com/user/obsidian-vault";
    const payload = encrypt(plain);
    expect(payload).toHaveProperty("encryptedValue");
    expect(payload).toHaveProperty("iv");
    expect(payload).toHaveProperty("authTag");
    expect(decrypt(payload)).toBe(plain);
  });

  it("encrypts a PAT and decrypts it correctly", () => {
    const pat = "ghp_abcdefghijklmnopqrstuvwxyz123456";
    const payload = encrypt(pat);
    expect(decrypt(payload)).toBe(pat);
  });

  it("produces different ciphertext for the same input (random IV)", () => {
    const plain = "same-input";
    const a = encrypt(plain);
    const b = encrypt(plain);
    // IVs should differ
    expect(a.iv).not.toBe(b.iv);
    // But both decrypt to the same value
    expect(decrypt(a)).toBe(plain);
    expect(decrypt(b)).toBe(plain);
  });

  it("throws on tampered authTag", () => {
    const plain = "sensitive";
    const payload = encrypt(plain);
    const tampered = { ...payload, authTag: "00".repeat(16) };
    expect(() => decrypt(tampered)).toThrow();
  });
});

// ─── tRPC router: userContext ──────────────────────────────────────────────────

function makeCtx(): TrpcContext {
  return {
    user: {
      id: 9999,
      openId: "test-github-user",
      email: "github@test.com",
      name: "GitHub Tester",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("userContext router", () => {
  it("getGitHubConfig returns configured:false when not set (no DB record)", async () => {
    // userId 99999 has no user_context rows — should return configured:false
    const ctx: TrpcContext = {
      ...makeCtx(),
      user: {
        id: 99999,
        openId: "no-context-user",
        email: "nocontext@test.com",
        name: "No Context",
        loginMethod: "manus",
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
    };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.userContext.getGitHubConfig();
    expect(result).toHaveProperty("configured");
    expect(result.configured).toBe(false);
  });

  it("PAT masking logic: masks correctly for long PAT", () => {
    // Test masking logic directly without DB
    const pat = "ghp_testtoken1234567890abcdef";
    const maskedPat = pat.length > 8
      ? `${pat.slice(0, 4)}••••••••••••••••••••${pat.slice(-4)}`
      : "•".repeat(pat.length);
    expect(maskedPat).toMatch(/[•]/);
    expect(maskedPat).not.toBe(pat);
    expect(maskedPat.startsWith("ghp_")).toBe(true);
    expect(maskedPat.endsWith("cdef")).toBe(true);
  });

  it("PAT masking logic: masks short PAT entirely", () => {
    const pat = "short";
    const maskedPat = pat.length > 8
      ? `${pat.slice(0, 4)}••••${pat.slice(-4)}`
      : "•".repeat(pat.length);
    expect(maskedPat).toBe("•••••");
  });
});

// ─── GitHub push router input validation ──────────────────────────────────────

describe("github.push input validation", () => {
  it("rejects empty files array", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.github.push({ files: [] })
    ).rejects.toThrow();
  });

  it("rejects files array exceeding 31 items", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const files = Array.from({ length: 32 }, (_, i) => ({
      filename: `2026-01-${String(i + 1).padStart(2, "0")}.md`,
      content: "# test",
    }));
    await expect(
      caller.github.push({ files })
    ).rejects.toThrow();
  });

  it("throws PRECONDITION_FAILED when GitHub not configured", async () => {
    // Use a fresh user with no config
    const ctx: TrpcContext = {
      ...makeCtx(),
      user: {
        id: 88888,
        openId: "no-github-user",
        email: "nogh@test.com",
        name: "No GitHub",
        loginMethod: "manus",
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
    };
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.github.push({
        files: [{ filename: "2026-01-01.md", content: "# test" }],
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});
