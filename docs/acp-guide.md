# Agent Client Protocol (ACP) — Tài liệu tham khảo

> Phiên bản protocol: v0.11.3 (March 2026)
> Nguồn: agentclientprotocol.com | GitHub: agentclientprotocol/agent-client-protocol

---

## 1. ACP là gì?

Agent Client Protocol (ACP) là một giao thức chuẩn hoá giao tiếp giữa **code editor/IDE** (Client) và **AI coding agent** (Agent). Lấy cảm hứng từ Language Server Protocol (LSP) — cái đã chuẩn hoá autocomplete, go-to-definition, v.v. cho mọi editor — ACP làm điều tương tự cho AI coding agent.

**Trước ACP:** Mỗi cặp agent-editor cần custom integration riêng → N agents × M editors = N×M integration.

**Sau ACP:** Agent implement ACP một lần → chạy được trên mọi editor hỗ trợ ACP. Editor implement ACP một lần → dùng được mọi agent hỗ trợ ACP.


## 2. Tại sao cần ACP?

ACP giải quyết 3 vấn đề chính:

- **Integration overhead**: Mỗi combo agent-editor mới đều cần custom work. Với ACP, implement 1 lần là xong.
- **Limited compatibility**: Agent chỉ hoạt động trên vài editor nhất định. ACP phá bỏ giới hạn này.
- **Developer lock-in**: Chọn agent A nghĩa là phải dùng editor X. ACP cho phép tự do kết hợp.

**Mối quan hệ với MCP:** MCP (Model Context Protocol) xử lý **what** — agent truy cập data và tool gì. ACP xử lý **where** — agent sống ở đâu trong workflow của developer. Hai protocol bổ sung cho nhau.


## 3. Kiến trúc tổng quan

```
┌─────────────────────────────────────────────────┐
│                   USER (Developer)               │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│              CLIENT (Code Editor/IDE)            │
│                                                  │
│  - Gửi prompt của user đến Agent                │
│  - Render response (text, diff, tool calls)     │
│  - Quản lý permission cho tool execution        │
│  - Cung cấp filesystem access                   │
│  - Expose MCP servers cho Agent                 │
└──────────────────────┬──────────────────────────┘
                       │  JSON-RPC
                       │  (stdio / HTTP / WebSocket)
┌──────────────────────▼──────────────────────────┐
│                 AGENT (AI Coding Agent)           │
│                                                  │
│  - Nhận prompt, gọi LLM                        │
│  - Thực thi tool calls (edit file, run cmd...)  │
│  - Gửi update realtime về Client                │
│  - Kết nối MCP servers để lấy context           │
└─────────────────────────────────────────────────┘
```

### 3.1 Transport Layer

| Mode | Transport | Use case |
|------|-----------|----------|
| **Local** | JSON-RPC over stdio | Agent chạy như subprocess của editor |
| **Remote** | HTTP hoặc WebSocket | Agent chạy trên cloud/server riêng |

**Local mode** là phổ biến nhất hiện tại. Editor launch agent process, giao tiếp qua stdin/stdout. Một connection có thể quản lý nhiều session đồng thời.

**Remote mode** đang được phát triển thêm, phù hợp cho enterprise deployment hoặc shared agent infrastructure.

### 3.2 Trust Model

ACP hoạt động tốt nhất khi editor giao tiếp với **trusted agent**. User vẫn giữ quyền kiểm soát:
- Approve/reject tool execution
- Kiểm soát filesystem access
- Quản lý MCP server configurations


## 4. Protocol Flow chi tiết

### 4.1 Initialization (Handshake)

Khi editor kết nối agent, quá trình khởi tạo diễn ra:

```
Client                              Agent
  │                                   │
  │──── initialize ──────────────────►│
  │     {                             │
  │       protocolVersion: 1,         │
  │       clientCapabilities: {...},  │
  │       name: "my-editor",         │
  │       version: "1.0"             │
  │     }                             │
  │                                   │
  │◄──── initialize response ────────│
  │     {                             │
  │       protocolVersion: 1,         │
  │       agentCapabilities: {...},   │
  │       name: "my-agent",          │
  │       version: "2.0"             │
  │     }                             │
  │                                   │
```

**Client Capabilities (editor khai báo):**
- `fileSystem.readTextFile` — cho phép agent đọc file
- `fileSystem.writeTextFile` — cho phép agent ghi file
- `terminal` — cho phép agent chạy shell command

**Agent Capabilities (agent khai báo):**
- `loadSession` — hỗ trợ load lại session cũ
- `promptCapabilities` — loại content hỗ trợ: Image, Audio, embedded context
- `mcp` — hỗ trợ HTTP/SSE transport cho MCP
- Session methods — các operation hỗ trợ (list, fork, configure...)

**Version Negotiation:** Protocol version là một integer (MAJOR version). Nếu không khớp, agent trả về version cao nhất mà nó hỗ trợ. Client nên đóng connection nếu incompatible.


### 4.2 Prompt Turn (Vòng lặp chính)

Đây là core interaction cycle. Mỗi prompt turn gồm 6 bước:

```
Client                              Agent                    LLM
  │                                   │                       │
  │─── session/prompt ──────────────►│                       │
  │    { user message + resources }   │                       │
  │                                   │─── forward prompt ──►│
  │                                   │                       │
  │                                   │◄── response ─────────│
  │                                   │    (text + tool calls)│
  │◄── session/update (notification)─│                       │
  │    { plan, text, tool calls }     │                       │
  │                                   │                       │
  │    [Nếu có tool call]             │                       │
  │◄── permission request ───────────│                       │
  │──── permission response ────────►│                       │
  │                                   │── execute tool ──────►│
  │◄── session/update (tool status)──│                       │
  │    { in_progress / completed }    │                       │
  │                                   │                       │
  │    [Tool result → LLM → loop]     │                       │
  │                                   │                       │
  │◄── session/prompt response ──────│                       │
  │    { StopReason }                 │                       │
```

**Stop Reasons:**
- `end_turn` — Hoàn thành bình thường
- `max_tokens` — Hết token limit
- `max_turn_requests` — Vượt quá số lần gọi model
- `refusal` — Agent từ chối tiếp tục
- `cancelled` — Client huỷ turn

### 4.3 Session Management

```
session/new        → Tạo session mới
session/prompt     → Gửi prompt
session/update     → Agent gửi update (notification)
session/cancel     → Huỷ processing
session/list       → Liệt kê sessions
session/load       → Load lại session cũ
session/fork       → Fork session (branching)
session/configure  → Cấu hình session
```


## 5. MCP Integration

ACP tích hợp chặt chẽ với MCP:

- Editor truyền MCP server configs cho Agent trong quá trình initialize
- Agent kết nối trực tiếp đến MCP servers
- Khi editor expose tool qua MCP, nó deploy một **proxy tunnel** — route request ngược về editor
- Hỗ trợ cả stdio-based và HTTP/SSE MCP transport

```
Editor ──(ACP)──► Agent ──(MCP)──► MCP Server (DB, API, tools...)
  │                                      ▲
  └──── proxy tunnel (cho editor tools)──┘
```


## 6. Ecosystem hiện tại

### 6.1 Editors hỗ trợ ACP (Clients)
- **Zed** — Native ACP support
- **JetBrains IDEs** — Qua AI Assistant plugin
- **Neovim** — Community plugin
- **Marimo** — Notebook editor
- **Cursor** — ACP documentation có sẵn

### 6.2 Agents hỗ trợ ACP (40+)
- **Claude Code** (Anthropic)
- **Codex CLI** (OpenAI)
- **Gemini** (Google)
- **Goose** (Block)
- **GitHub Copilot** (public preview từ Jan 2026)
- **Cline**, **OpenHands**, **Factory Droid**, **Docker cagent**
- Và nhiều hơn nữa...

### 6.3 Official SDKs
| Language | Package | Registry |
|----------|---------|----------|
| Rust | `agent-client-protocol` | crates.io |
| TypeScript | `@agentclientprotocol/sdk` | npm |
| Python | `python-sdk` | PyPI |
| Java | `java-sdk` | Maven |
| Kotlin | `acp-kotlin` | Maven (JVM) |


## 7. Các hướng áp dụng để build product

### 7.1 Build một Agent mới

Nếu bạn muốn tạo AI coding agent riêng:

**Cách tiếp cận:**
1. Chọn SDK phù hợp (TypeScript hoặc Python phổ biến nhất)
2. Implement ACP protocol: initialize handshake, prompt turn loop, session management
3. Kết nối LLM backend (OpenAI, Anthropic, local model...)
4. Implement tool execution (file edit, terminal, search...)
5. Agent tự động tương thích mọi editor hỗ trợ ACP

**Ví dụ use case:**
- Agent chuyên cho một ngôn ngữ/framework cụ thể
- Agent tích hợp company-specific tools (CI/CD, internal APIs)
- Agent có specialized reasoning (security audit, performance optimization)

### 7.2 Build một Editor/Client mới

Nếu bạn muốn tạo IDE hoặc coding tool:

**Cách tiếp cận:**
1. Implement ACP client protocol
2. Hỗ trợ local agent launch (subprocess + stdio)
3. Render agent output (markdown text, diffs, tool status)
4. Implement permission UI cho tool execution
5. Tự động tương thích mọi ACP agent

### 7.3 Build Agent Platform / Registry

**Ý tưởng:** Một marketplace hoặc registry nơi developers discover, install, và manage ACP agents.

**Tham khảo:** ACP đã có concept Registry — bạn có thể build trên đó hoặc tạo curated experience riêng.

### 7.4 Build Enterprise Agent Infrastructure

**Ý tưởng:** Remote ACP agent hosting cho team/enterprise:
- Shared agent instances trên server
- Centralized MCP server management
- Usage tracking, audit logs
- Custom tool permissions per team/role

### 7.5 Build Agent Development Framework

**Ý tưởng:** Framework giúp developer dễ dàng build ACP agent:
- Boilerplate handling (protocol, session management)
- Plugin system cho tools
- Testing utilities
- Deployment tools (local + remote)

### 7.6 Bridge ACP với non-coding domains

ACP hiện focus vào coding, nhưng pattern này áp dụng được cho:
- Document editing agents
- Design tool agents
- Data analysis agents
- DevOps/infrastructure agents


## 8. Technical Notes khi implement

### 8.1 JSON-RPC Basics

ACP dùng JSON-RPC 2.0. Mỗi message có dạng:

```json
// Request
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "session/prompt",
  "params": { ... }
}

// Response
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": { ... }
}

// Notification (no id, no response expected)
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": { ... }
}
```

### 8.2 Content Types

Text mặc định là **Markdown**. Hỗ trợ thêm:
- Image content
- Audio content
- Embedded context (file references)

### 8.3 MCP Type Reuse

ACP reuse JSON structures từ MCP khi có thể, nhưng thêm custom types cho coding-specific features như diff display.

### 8.4 Feature Flags

Protocol dùng feature flags để indicate các tính năng đang phát triển. Check agent capabilities trong initialize response.


## 9. Resources

- **Specification:** https://agentclientprotocol.com
- **GitHub:** https://github.com/agentclientprotocol/agent-client-protocol
- **LLM-friendly docs:** https://agentclientprotocol.com/llms.txt
- **OpenAPI spec:** Available trong repo
- **SDKs:** Xem section 6.3
- **License:** Apache 2.0
- **RFDs (Requests for Dialog):** Process chính thức để propose protocol changes


## 10. Tóm tắt nhanh

| Khái niệm | Giải thích |
|-----------|-----------|
| ACP | Protocol chuẩn hoá giao tiếp editor ↔ agent |
| Client | Code editor/IDE (Zed, JetBrains, Neovim...) |
| Agent | AI coding tool (Claude Code, Codex, Gemini...) |
| Transport | stdio (local) hoặc HTTP/WebSocket (remote) |
| Protocol | JSON-RPC 2.0 |
| Session | Một phiên làm việc giữa client và agent |
| Prompt Turn | Một vòng request-response hoàn chỉnh |
| MCP | Protocol bổ sung — cung cấp data/tools cho agent |
| SDK | Rust, TypeScript, Python, Java, Kotlin |
| License | Apache 2.0 |
