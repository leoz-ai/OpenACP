# Quick Start for Users

So someone on your team has set up OpenACP, and now you want to start using it. Good news: you don't need to install anything. You just need a Telegram, Discord, or Slack account and an invite to the right group.

## Prerequisites

- A Telegram, Discord, or Slack account — that's it.
- An invite to the group, server, or workspace where OpenACP is running.

The person who set up OpenACP will need to add you to the allowed users list before you can interact with the bot. Ask them to do that if you're not getting responses.

---

## Step 1: Get invited

Ask your team's OpenACP admin to add you and share an invite link to the group or server. On Telegram this will be a group with forum topics enabled. On Discord it'll be a server with a dedicated channel. On Slack it'll be a channel in your workspace.

Once you're in, you should see a bot in the member list. That's OpenACP.

---

## Step 2: Start a session

Send the `/new` command in the main channel or DM the bot directly.

```
/new
```

OpenACP will create a new session for you — on Telegram this becomes a dedicated forum topic just for your conversation. On Discord and Slack it works similarly. Each session maps to one AI agent instance, so your work is isolated from other users' sessions.

---

## Step 3: Send your first prompt

Just type naturally, like you're texting a colleague:

```
Hey, can you look at src/utils/parser.ts and tell me why the tests are failing?
```

The agent will start responding. You'll see the reply build up in real time as it streams back — no need to wait for the full response before you start reading.

---

## Step 4: Understand what you're seeing

**Streaming text** — The agent's reply arrives chunk by chunk. This is normal; it means you get to read the output as it's generated rather than waiting for it all.

**Tool call updates** — When the agent reads a file, runs a command, or does a web search, you'll see a brief status message like `Running: read_file src/utils/parser.ts`. This keeps you in the loop without flooding the chat.

**Permission buttons** — Some actions require your approval before the agent proceeds. You'll get a message with **Approve** and **Deny** buttons. Read what it's asking, then tap the one you want. The agent will wait for your answer.

---

## Step 5: Key commands

| Command | What it does |
|---|---|
| `/new` | Start a new session with a fresh agent instance |
| `/cancel` | Cancel the current in-progress response |
| `/status` | Show the status of your active session |
| `/menu` | Open the action menu (new session, list sessions, settings) |

For the full list of commands and how they behave on each platform, see [Chat Commands](../using-openacp/chat-commands.md).

---

## Tips

- You can have multiple sessions open at once — each `/new` creates a separate one.
- Session names are set automatically after your first prompt (the agent summarizes the topic).
- If the agent seems stuck, try `/cancel` followed by a new message. If it's completely unresponsive, ask your admin to check the daemon.
