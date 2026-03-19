import type { OutgoingMessage, PermissionRequest, NotificationMessage } from './types.js'

export interface ChannelConfig {
  enabled: boolean
  [key: string]: unknown
}

export abstract class ChannelAdapter {
  constructor(protected core: any, protected config: ChannelConfig) {}

  abstract start(): Promise<void>
  abstract stop(): Promise<void>

  // Outgoing: core → channel
  abstract sendMessage(sessionId: string, content: OutgoingMessage): Promise<void>
  abstract sendPermissionRequest(sessionId: string, request: PermissionRequest): Promise<void>
  abstract sendNotification(notification: NotificationMessage): Promise<void>

  // Session lifecycle on channel side
  abstract createSessionThread(sessionId: string, name: string): Promise<string>  // returns threadId
  abstract renameSessionThread(sessionId: string, newName: string): Promise<void>
}
