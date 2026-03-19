# Feature: Voice Message Control

**Phase**: 4

## Overview

Users can send voice messages on any channel to control AI agents. Voice is transcribed to text (speech-to-text) and sent as a regular prompt to the agent.

## Flow

```
User sends voice message in session topic
  → ChannelAdapter receives audio file
  → STT (Speech-to-Text) service transcribes audio
  → Transcribed text shown in topic: "🎤 You said: ..."
  → Text forwarded as prompt to agent
  → Agent responds normally
```

## STT Options

Pluggable STT provider interface:

```typescript
interface STTProvider {
  transcribe(audio: Buffer, format: string, language?: string): Promise<string>
}
```

Possible providers:
- **OpenAI Whisper API** — high quality, paid
- **Local Whisper** — self-hosted, free, requires GPU
- **Google Speech-to-Text** — good quality, free tier available
- **Deepgram** — fast, good quality

### Config

```json
{
  "stt": {
    "provider": "whisper",
    "options": {
      "apiKey": "...",
      "model": "whisper-1",
      "language": "en"
    }
  }
}
```

## Channel Support

| Channel | Voice Support |
|---------|--------------|
| Telegram | Native voice messages (OGG/Opus format) |
| Discord | Voice messages in text channels |
| WhatsApp | Native voice messages |

## File Sharing (Related)

Same phase — users can send files/images to the agent:

```
User sends image/file in session topic
  → ChannelAdapter downloads file
  → File saved to agent's working directory (or temp)
  → Agent notified of new file via prompt context
  → Agent can read/analyze the file
```

## Considerations

- Voice transcription adds latency — show "🎤 Transcribing..." status
- Large audio files may take longer — consider size limits
- Multi-language support depends on STT provider
- Privacy: audio is processed by STT provider — document this for self-hosted users
