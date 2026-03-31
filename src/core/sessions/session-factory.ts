import type { AgentManager } from "../agents/agent-manager.js";
import type { SessionManager } from "./session-manager.js";
import type { SpeechService } from "../../plugins/speech/exports.js";
import type { EventBus } from "../event-bus.js";
import type { NotificationManager } from "../../plugins/notifications/notification.js";
import type { TunnelService } from "../../plugins/tunnel/tunnel-service.js";
import type { AgentEvent } from "../types.js";
import type { MiddlewareChain } from "../plugin/middleware-chain.js";
import { Session } from "./session.js";
import { createChildLogger } from "../utils/log.js";

const log = createChildLogger({ module: "session-factory" });

export interface SessionCreateParams {
  channelId: string;
  agentName: string;
  workingDirectory: string;
  resumeAgentSessionId?: string;
  existingSessionId?: string;
  initialName?: string;
}

export interface SideEffectDeps {
  eventBus: EventBus;
  notificationManager: NotificationManager;
  tunnelService?: TunnelService;
}

export class SessionFactory {
  middlewareChain?: MiddlewareChain;

  constructor(
    private agentManager: AgentManager,
    private sessionManager: SessionManager,
    private speechServiceAccessor: SpeechService | (() => SpeechService),
    private eventBus: EventBus,
    private instanceRoot?: string,
  ) {}

  private get speechService(): SpeechService {
    return typeof this.speechServiceAccessor === 'function'
      ? this.speechServiceAccessor()
      : this.speechServiceAccessor;
  }

  async create(params: SessionCreateParams): Promise<Session> {
    // Hook: session:beforeCreate — modifiable, can block
    let createParams = params;
    if (this.middlewareChain) {
      const payload = {
        agentName: params.agentName,
        workingDir: params.workingDirectory,
        userId: '', // userId is not part of SessionCreateParams — resolved upstream
        channelId: params.channelId,
        threadId: '', // threadId is assigned after session creation
      };
      const result = await this.middlewareChain.execute('session:beforeCreate', payload, async (p) => p);
      if (!result) throw new Error("Session creation blocked by middleware");
      // Apply any middleware modifications back to create params
      createParams = {
        ...params,
        agentName: result.agentName,
        workingDirectory: result.workingDir,
        channelId: result.channelId,
      };
    }

    // 1. Spawn or resume agent
    let agentInstance;
    try {
      agentInstance = createParams.resumeAgentSessionId
        ? await this.agentManager.resume(
            createParams.agentName,
            createParams.workingDirectory,
            createParams.resumeAgentSessionId,
          )
        : await this.agentManager.spawn(
            createParams.agentName,
            createParams.workingDirectory,
          );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err);

      // Emit a structured guidance error so adapters (Telegram, SSE UI) can show clear next steps.
      // We intentionally avoid leaking internal paths — instead, we point users at the openacp wrapper.
      const guidanceLines = [
        `❌ Failed to start agent "${createParams.agentName}": ${message}`,
        "",
        "Run the agent CLI once in a terminal for this OpenACP instance to complete login or setup.",
      ];
      if (this.instanceRoot) {
        guidanceLines.push(
          "",
          "Copy and run this command in your terminal:",
          `  cd "${this.instanceRoot}" && openacp agents run ${createParams.agentName}`,
        );
      } else {
        guidanceLines.push(
          "",
          "Copy and run this command in your terminal (same project where you started OpenACP):",
          `  openacp agents run ${createParams.agentName}`,
        );
      }
      guidanceLines.push(
        "",
        "After setup completes, retry creating the session here.",
      );

      const guidance: AgentEvent = {
        type: "system_message",
        message: guidanceLines.join("\n"),
      };

      // Create a lightweight "failed" session context so UIs listening on the event bus
      // still receive a message in the right channel/thread.
      const failedSession = new Session({
        id: createParams.existingSessionId,
        channelId: createParams.channelId,
        agentName: createParams.agentName,
        workingDirectory: createParams.workingDirectory,
        // Dummy agent instance — will never be prompted
        agentInstance: {
          sessionId: "",
          prompt: async () => {},
          cancel: async () => {},
          destroy: async () => {},
          on: () => {},
          off: () => {},
        } as any,
        speechService: this.speechService,
      });
      this.sessionManager.registerSession(failedSession);
      failedSession.emit("agent_event", guidance);
      this.eventBus.emit("agent:event", {
        sessionId: failedSession.id,
        event: guidance,
      });

      // Re-throw so callers still see the failure
      throw err;
    }

    // Wire middleware chain to agent instance for FS/terminal hooks
    agentInstance.middlewareChain = this.middlewareChain;

    // 2. Create Session instance
    const session = new Session({
      id: createParams.existingSessionId,
      channelId: createParams.channelId,
      agentName: createParams.agentName,
      workingDirectory: createParams.workingDirectory,
      agentInstance,
      speechService: this.speechService,
    });
    session.agentSessionId = agentInstance.sessionId;
    session.middlewareChain = this.middlewareChain;
    if (createParams.initialName) {
      session.name = createParams.initialName;
    }

    // 3. Register in SessionManager
    this.sessionManager.registerSession(session);
    this.eventBus.emit("session:created", {
      sessionId: session.id,
      agent: session.agentName,
      status: session.status,
    });

    return session;
  }

  wireSideEffects(session: Session, deps: SideEffectDeps): void {
    // Wire usage tracking via event bus (consumed by usage plugin)
    session.on("agent_event", (event: AgentEvent) => {
      if (event.type !== "usage") return;
      deps.eventBus.emit("usage:recorded", {
        sessionId: session.id,
        agentName: session.agentName,
        timestamp: new Date().toISOString(),
        tokensUsed: event.tokensUsed ?? 0,
        contextSize: event.contextSize ?? 0,
        cost: event.cost,
      });
    });

    // Clean up user tunnels when session ends
    session.on("status_change", (_from, to) => {
      if ((to === "finished" || to === "cancelled") && deps.tunnelService) {
        deps.tunnelService
          .stopBySession(session.id)
          .then((stopped) => {
            for (const entry of stopped) {
              deps.notificationManager
                .notifyAll({
                  sessionId: session.id,
                  sessionName: session.name,
                  type: "completed",
                  summary: `Tunnel stopped: port ${entry.port}${entry.label ? ` (${entry.label})` : ""} — session ended`,
                })
                .catch(() => {});
            }
          })
          .catch(() => {});
      }
    });
  }
}
