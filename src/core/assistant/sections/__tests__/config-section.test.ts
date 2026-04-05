import { describe, it, expect, vi } from "vitest";
import { createConfigSection } from "../config.js";

function makeCore(opts: {
  workspaceBaseDir?: string
  legacySpeechProvider?: string | null
  speechService?: { isSTTAvailable(): boolean } | null
}) {
  return {
    configManager: {
      get: vi.fn().mockReturnValue({
        workspace: { baseDir: opts.workspaceBaseDir ?? "~/" },
        speech: opts.legacySpeechProvider
          ? { stt: { provider: opts.legacySpeechProvider } }
          : undefined,
      }),
    },
    lifecycleManager: opts.speechService !== undefined
      ? { serviceRegistry: { get: vi.fn().mockReturnValue(opts.speechService) } }
      : undefined,
  } as any;
}

describe("createConfigSection", () => {
  it("shows STT not configured when no speech service and no legacy config", () => {
    const section = createConfigSection(makeCore({ speechService: null }));
    const ctx = section.buildContext!();
    expect(ctx).toContain("STT: Not configured");
  });

  it("shows STT configured when speech service isSTTAvailable returns true", () => {
    const section = createConfigSection(makeCore({
      legacySpeechProvider: "groq",
      speechService: { isSTTAvailable: () => true },
    }));
    const ctx = section.buildContext!();
    expect(ctx).toContain("groq");
    expect(ctx).toContain("✅");
  });

  it("shows STT not configured when speech service exists but isSTTAvailable returns false", () => {
    // This is the bug case: legacy config says 'groq' but service is not actually available
    const section = createConfigSection(makeCore({
      legacySpeechProvider: "groq", // legacy config claims configured
      speechService: { isSTTAvailable: () => false }, // but service says no
    }));
    const ctx = section.buildContext!();
    expect(ctx).toContain("Not configured");
    expect(ctx).not.toContain("✅");
  });

  it("falls back to legacy config check when no lifecycleManager", () => {
    const section = createConfigSection(makeCore({
      legacySpeechProvider: "groq",
      speechService: undefined, // no lifecycleManager
    }));
    const ctx = section.buildContext!();
    expect(ctx).toContain("groq");
  });
});
