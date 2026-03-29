// src/core/adapter-primitives/output-mode-resolver.ts
import type { OutputMode } from "./format-types.js";

interface ConfigManagerLike {
  get(): Record<string, unknown>;
}

interface SessionManagerLike {
  getSession(id: string): { record?: { outputMode?: OutputMode } } | undefined;
}

export class OutputModeResolver {
  resolve(
    configManager: ConfigManagerLike,
    adapterName: string,
    sessionId?: string,
    sessionManager?: SessionManagerLike,
  ): OutputMode {
    const config = configManager.get();
    // 1. Global default
    let mode: OutputMode = (config.outputMode as OutputMode | undefined) ?? "medium";
    // 2. Per-adapter override
    const channels = config.channels as Record<string, unknown> | undefined;
    const channelCfg = channels?.[adapterName] as Record<string, unknown> | undefined;
    if (channelCfg?.outputMode) mode = channelCfg.outputMode as OutputMode;
    // 3. Per-session override (most specific)
    if (sessionId && sessionManager) {
      const session = sessionManager.getSession(sessionId);
      const sessionMode = session?.record?.outputMode;
      if (sessionMode) mode = sessionMode;
    }
    return mode;
  }
}
