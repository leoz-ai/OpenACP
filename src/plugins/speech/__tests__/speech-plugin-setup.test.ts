import { describe, it, expect, vi, beforeEach } from "vitest";
import speechPlugin from "../index.js";
import type { SpeechService } from "../speech-service.js";

function makePluginCtx(overrides: {
  pluginConfig?: Record<string, unknown>
  legacyConfig?: Record<string, unknown>
}) {
  let registeredService: SpeechService | undefined;

  const ctx = {
    pluginConfig: overrides.pluginConfig ?? {},
    instanceRoot: undefined,
    config: {
      get: vi.fn().mockReturnValue(overrides.legacyConfig ?? {}),
    },
    registerService: vi.fn((_, svc) => { registeredService = svc as SpeechService }),
    registerCommand: vi.fn(),
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    core: undefined,
    sessions: undefined,
  } as any;

  return { ctx, getService: () => registeredService };
}

describe("speech plugin setup()", () => {
  it("enables STT when groqApiKey is in plugin settings", async () => {
    const { ctx, getService } = makePluginCtx({
      pluginConfig: { groqApiKey: "gsk_from_settings" },
    });

    await speechPlugin.setup!(ctx);

    expect(getService()!.isSTTAvailable()).toBe(true);
    expect(ctx.log.warn).not.toHaveBeenCalled();
  });

  it("falls back to legacy config when groqApiKey missing from plugin settings", async () => {
    const { ctx, getService } = makePluginCtx({
      pluginConfig: { sttProvider: "groq" }, // no groqApiKey
      legacyConfig: {
        speech: {
          stt: {
            provider: "groq",
            providers: { groq: { apiKey: "gsk_from_legacy" } },
          },
          tts: { provider: null, providers: {} },
        },
      },
    });

    await speechPlugin.setup!(ctx);

    expect(getService()!.isSTTAvailable()).toBe(true);
    expect(ctx.log.warn).toHaveBeenCalledWith(
      expect.stringContaining("legacy config"),
    );
  });

  it("disables STT when groqApiKey missing from both settings and legacy config", async () => {
    const { ctx, getService } = makePluginCtx({
      pluginConfig: { sttProvider: "groq" },
      legacyConfig: { workspace: { baseDir: "~/" } }, // no speech config
    });

    await speechPlugin.setup!(ctx);

    expect(getService()!.isSTTAvailable()).toBe(false);
  });
});
