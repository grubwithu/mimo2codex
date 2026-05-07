import { describe, expect, it } from "vitest";
import { reqToChat } from "../src/translate/reqToChat.js";
import type { ResponsesRequest } from "../src/translate/types.js";

describe("reqToChat", () => {
  it("instructions-only request becomes a single system message", () => {
    const req: ResponsesRequest = {
      model: "mimo-v2.5-pro",
      instructions: "You are MiMo.",
      input: [],
    };
    const chat = reqToChat(req);
    expect(chat).toEqual({
      model: "mimo-v2.5-pro",
      messages: [{ role: "system", content: "You are MiMo." }],
      stream: false,
    });
  });

  it("simple user text", () => {
    const req: ResponsesRequest = {
      model: "mimo-v2.5-pro",
      instructions: "be helpful",
      input: [
        { type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] },
      ],
    };
    const chat = reqToChat(req);
    expect(chat.messages).toEqual([
      { role: "system", content: "be helpful" },
      { role: "user", content: "hi" },
    ]);
  });

  it("string input is treated as user content", () => {
    const req: ResponsesRequest = {
      model: "mimo-v2.5-pro",
      input: "hello",
    };
    const chat = reqToChat(req);
    expect(chat.messages).toEqual([{ role: "user", content: "hello" }]);
  });

  it("developer role becomes system", () => {
    const req: ResponsesRequest = {
      model: "mimo-v2.5-pro",
      input: [
        { type: "message", role: "developer", content: [{ type: "input_text", text: "x" }] },
      ],
    };
    const chat = reqToChat(req);
    expect(chat.messages[0]).toEqual({ role: "system", content: "x" });
  });

  it("tool definitions wrap into function objects", () => {
    const req: ResponsesRequest = {
      model: "mimo-v2.5-pro",
      input: [{ type: "message", role: "user", content: "go" }],
      tools: [
        {
          type: "function",
          name: "shell",
          description: "run shell",
          parameters: { type: "object", properties: { cmd: { type: "string" } } },
          strict: true,
        },
      ],
      tool_choice: "auto",
    };
    const chat = reqToChat(req);
    expect(chat.tools).toEqual([
      {
        type: "function",
        function: {
          name: "shell",
          description: "run shell",
          parameters: { type: "object", properties: { cmd: { type: "string" } } },
          strict: true,
        },
      },
    ]);
    expect(chat.tool_choice).toBe("auto");
  });

  it("tool_choice with named function", () => {
    const req: ResponsesRequest = {
      model: "mimo-v2.5-pro",
      input: [{ type: "message", role: "user", content: "go" }],
      tool_choice: { type: "function", function: { name: "shell" } },
    };
    const chat = reqToChat(req);
    expect(chat.tool_choice).toEqual({ type: "function", function: { name: "shell" } });
  });

  it("function_call from history with output (round trip after tool exec)", () => {
    const req: ResponsesRequest = {
      model: "mimo-v2.5-pro",
      input: [
        { type: "message", role: "user", content: [{ type: "input_text", text: "list files" }] },
        {
          type: "function_call",
          call_id: "call_abc",
          name: "shell",
          arguments: '{"cmd":"ls"}',
        },
        { type: "function_call_output", call_id: "call_abc", output: "a.txt\nb.txt" },
        { type: "message", role: "user", content: "thanks, count them" },
      ],
    };
    const chat = reqToChat(req);
    expect(chat.messages).toEqual([
      { role: "user", content: "list files" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_abc",
            type: "function",
            function: { name: "shell", arguments: '{"cmd":"ls"}' },
          },
        ],
      },
      { role: "tool", tool_call_id: "call_abc", content: "a.txt\nb.txt" },
      { role: "user", content: "thanks, count them" },
    ]);
  });

  it("reasoning + function_call collapse into single assistant turn with reasoning_content", () => {
    const req: ResponsesRequest = {
      model: "mimo-v2.5-pro",
      input: [
        { type: "message", role: "user", content: "search for cats" },
        {
          type: "reasoning",
          summary: [{ type: "summary_text", text: "I should call the search tool." }],
        },
        {
          type: "function_call",
          call_id: "call_1",
          name: "search",
          arguments: '{"q":"cats"}',
        },
        { type: "function_call_output", call_id: "call_1", output: "5 results" },
      ],
    };
    const chat = reqToChat(req);
    expect(chat.messages).toEqual([
      { role: "user", content: "search for cats" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "search", arguments: '{"q":"cats"}' },
          },
        ],
        reasoning_content: "I should call the search tool.",
      },
      { role: "tool", tool_call_id: "call_1", content: "5 results" },
    ]);
  });

  it("user message with text + image parts", () => {
    const req: ResponsesRequest = {
      model: "mimo-v2-omni",
      input: [
        {
          type: "message",
          role: "user",
          content: [
            { type: "input_text", text: "what's this?" },
            { type: "input_image", image_url: "https://x/y.png", detail: "auto" },
          ],
        },
      ],
    };
    const chat = reqToChat(req);
    expect(chat.messages[0]).toEqual({
      role: "user",
      content: [
        { type: "text", text: "what's this?" },
        { type: "image_url", image_url: { url: "https://x/y.png", detail: "auto" } },
      ],
    });
  });

  it("max_output_tokens maps to max_completion_tokens (not max_tokens)", () => {
    const req: ResponsesRequest = {
      model: "mimo-v2.5-pro",
      input: "x",
      max_output_tokens: 1024,
    };
    const chat = reqToChat(req);
    expect(chat.max_completion_tokens).toBe(1024);
    expect((chat as Record<string, unknown>).max_tokens).toBeUndefined();
  });

  it("preserves stream flag", () => {
    const req: ResponsesRequest = { model: "mimo-v2.5-pro", input: "x", stream: true };
    expect(reqToChat(req).stream).toBe(true);
  });
});
