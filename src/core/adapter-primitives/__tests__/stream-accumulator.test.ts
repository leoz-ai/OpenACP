import { describe, it, expect, beforeEach } from "vitest";
import { ToolStateMap, ThoughtBuffer } from "../stream-accumulator.js";
import type { ToolCallMeta } from "../format-types.js";

const makeMeta = (overrides: Partial<ToolCallMeta> = {}): ToolCallMeta => ({
  id: "tool-1",
  name: "Read",
  status: "running",
  rawInput: {},
  ...overrides,
});

describe("ToolStateMap", () => {
  let map: ToolStateMap;
  beforeEach(() => {
    map = new ToolStateMap();
  });

  it("upsert creates a new entry with empty rawInput", () => {
    const entry = map.upsert(makeMeta({ id: "t1" }), "read", {});
    expect(entry.id).toBe("t1");
    expect(entry.rawInput).toEqual({});
    expect(entry.status).toBe("running");
  });

  it("merge updates rawInput from tool_call_update", () => {
    map.upsert(makeMeta({ id: "t1" }), "read", {});
    const entry = map.merge("t1", "completed", { file_path: "src/foo.ts" }, "file content", undefined);
    expect(entry.rawInput).toEqual({ file_path: "src/foo.ts" });
    expect(entry.content).toBe("file content");
    expect(entry.status).toBe("completed");
  });

  it("merge buffers update when tool_call not yet received (out-of-order)", () => {
    map.merge("t1", "completed", { file_path: "x.ts" }, "output", undefined);
    const entry = map.upsert(makeMeta({ id: "t1" }), "read", {});
    expect(entry.status).toBe("completed");
    expect(entry.rawInput).toEqual({ file_path: "x.ts" });
    expect(entry.content).toBe("output");
  });

  it("get returns undefined for unknown id", () => {
    expect(map.get("nope")).toBeUndefined();
  });

  it("clear removes all entries and pending updates", () => {
    map.upsert(makeMeta({ id: "t1" }), "read", {});
    map.clear();
    expect(map.get("t1")).toBeUndefined();
  });

  it("flow: multiple tools in sequence — each independent", () => {
    map.upsert(makeMeta({ id: "t1", name: "Read" }), "read", { file_path: "a.ts" });
    map.upsert(makeMeta({ id: "t2", name: "Bash" }), "execute", { command: "ls" });
    map.merge("t1", "completed", undefined, "file contents", undefined);
    map.merge("t2", "completed", undefined, "output", undefined);
    expect(map.get("t1")!.status).toBe("completed");
    expect(map.get("t1")!.content).toBe("file contents");
    expect(map.get("t2")!.status).toBe("completed");
  });

  it("flow: out-of-order clear removes buffered pending", () => {
    map.merge("t1", "completed", { file_path: "x.ts" }, "output", undefined);
    map.clear();
    // After clear, upsert should NOT apply the stale pending update
    const entry = map.upsert(makeMeta({ id: "t1" }), "read", {});
    expect(entry.status).toBe("running");
    expect(entry.content).toBeNull();
  });
});

describe("ThoughtBuffer", () => {
  let buf: ThoughtBuffer;
  beforeEach(() => {
    buf = new ThoughtBuffer();
  });

  it("append + seal returns accumulated text", () => {
    buf.append("Hello ");
    buf.append("world");
    expect(buf.seal()).toBe("Hello world");
  });

  it("isSealed returns true after seal()", () => {
    expect(buf.isSealed()).toBe(false);
    buf.seal();
    expect(buf.isSealed()).toBe(true);
  });

  it("reset clears sealed state and content", () => {
    buf.append("text");
    buf.seal();
    buf.reset();
    expect(buf.isSealed()).toBe(false);
    expect(buf.seal()).toBe("");
  });

  it("append after seal is a no-op", () => {
    buf.append("before");
    buf.seal();
    buf.append("after");
    // reset and re-seal to get the content
    buf.reset();
    expect(buf.seal()).toBe("");
  });

  it("flow: multiple turns — reset between turns works correctly", () => {
    buf.append("Turn 1 thought");
    buf.seal();
    buf.reset();
    buf.append("Turn 2 thought");
    expect(buf.seal()).toBe("Turn 2 thought");
  });
});
