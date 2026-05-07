import { describe, expect, it } from "vitest";
import { pipeChatStreamToResponses } from "../src/translate/streamToSse.js";
import type { ChatStreamChunk, ResponsesRequest } from "../src/translate/types.js";
import { makeMemorySink } from "../src/util/sse.js";

const req: ResponsesRequest = { model: "mimo-v2.5-pro", input: "hi", stream: true };

async function* fromList(chunks: ChatStreamChunk[]): AsyncGenerator<ChatStreamChunk> {
  for (const c of chunks) yield c;
}

function chunk(
  delta: Partial<ChatStreamChunk["choices"][number]["delta"]>,
  finish: ChatStreamChunk["choices"][number]["finish_reason"] = null
): ChatStreamChunk {
  return {
    id: "x",
    object: "chat.completion.chunk",
    created: 0,
    model: "mimo-v2.5-pro",
    choices: [{ index: 0, delta, finish_reason: finish }],
  };
}

function eventNames(events: { event: string }[]): string[] {
  return events.map((e) => e.event);
}

describe("streamToSse", () => {
  it("plain text stream emits the canonical message lifecycle", async () => {
    const sink = makeMemorySink();
    await pipeChatStreamToResponses(
      sink,
      { chunks: fromList([chunk({ content: "hel" }), chunk({ content: "lo" }, "stop")]) },
      req,
      { exposeReasoning: true }
    );

    expect(eventNames(sink.events)).toEqual([
      "response.created",
      "response.in_progress",
      "response.output_item.added",
      "response.content_part.added",
      "response.output_text.delta",
      "response.output_text.delta",
      "response.output_text.done",
      "response.content_part.done",
      "response.output_item.done",
      "response.completed",
    ]);

    const completed = sink.events.find((e) => e.event === "response.completed")!;
    const resp = (completed.data as { response: { output: Array<{ content: Array<{ text: string }> }> } }).response;
    expect(resp.output[0].content[0].text).toBe("hello");
  });

  it("reasoning then text emits reasoning lifecycle followed by message lifecycle", async () => {
    const sink = makeMemorySink();
    await pipeChatStreamToResponses(
      sink,
      {
        chunks: fromList([
          chunk({ reasoning_content: "thinking… " }),
          chunk({ reasoning_content: "done" }),
          chunk({ content: "answer" }, "stop"),
        ]),
      },
      req,
      { exposeReasoning: true }
    );

    const names = eventNames(sink.events);
    expect(names.slice(0, 2)).toEqual(["response.created", "response.in_progress"]);
    // First item: reasoning
    expect(names).toContain("response.reasoning_summary_text.delta");
    expect(names).toContain("response.reasoning_summary_text.done");
    expect(names).toContain("response.reasoning_summary_part.done");
    // Then message
    expect(names).toContain("response.output_text.delta");
    expect(names).toContain("response.completed");

    // Order: reasoning done before message added
    const reasoningDoneIdx = names.indexOf("response.reasoning_summary_text.done");
    const messageAddedIdx = names.findIndex(
      (n, i) => n === "response.output_item.added" && i > reasoningDoneIdx
    );
    expect(messageAddedIdx).toBeGreaterThan(reasoningDoneIdx);
  });

  it("--no-reasoning suppresses reasoning events", async () => {
    const sink = makeMemorySink();
    await pipeChatStreamToResponses(
      sink,
      {
        chunks: fromList([
          chunk({ reasoning_content: "ignore me" }),
          chunk({ content: "ok" }, "stop"),
        ]),
      },
      req,
      { exposeReasoning: false }
    );
    const names = eventNames(sink.events);
    expect(names.some((n) => n.startsWith("response.reasoning"))).toBe(false);
    expect(names).toContain("response.completed");
  });

  it("single tool_call streams arguments deltas", async () => {
    const sink = makeMemorySink();
    await pipeChatStreamToResponses(
      sink,
      {
        chunks: fromList([
          chunk({
            tool_calls: [
              { index: 0, id: "call_1", type: "function", function: { name: "shell", arguments: '{"c' } },
            ],
          }),
          chunk({
            tool_calls: [{ index: 0, function: { arguments: 'md":"ls"}' } }],
          }),
          chunk({}, "tool_calls"),
        ]),
      },
      req,
      { exposeReasoning: true }
    );

    const names = eventNames(sink.events);
    expect(names).toContain("response.function_call_arguments.delta");
    expect(names).toContain("response.function_call_arguments.done");
    const doneEvt = sink.events.find((e) => e.event === "response.function_call_arguments.done")!;
    expect((doneEvt.data as { arguments: string }).arguments).toBe('{"cmd":"ls"}');
    const completed = sink.events.find((e) => e.event === "response.completed")!;
    const resp = (completed.data as {
      response: { output: Array<{ type: string; arguments: string; call_id: string; name: string }> };
    }).response;
    const fc = resp.output.find((o) => o.type === "function_call")!;
    expect(fc.arguments).toBe('{"cmd":"ls"}');
    expect(fc.call_id).toBe("call_1");
    expect(fc.name).toBe("shell");
  });

  it("parallel tool calls finalize in order", async () => {
    const sink = makeMemorySink();
    await pipeChatStreamToResponses(
      sink,
      {
        chunks: fromList([
          chunk({
            tool_calls: [
              { index: 0, id: "call_a", type: "function", function: { name: "f1", arguments: "{}" } },
              { index: 1, id: "call_b", type: "function", function: { name: "f2", arguments: "{}" } },
            ],
          }),
          chunk({}, "tool_calls"),
        ]),
      },
      req,
      { exposeReasoning: true }
    );

    const completed = sink.events.find((e) => e.event === "response.completed")!;
    const resp = (completed.data as { response: { output: Array<{ type: string; call_id: string }> } })
      .response;
    const fcs = resp.output.filter((o) => o.type === "function_call");
    expect(fcs).toHaveLength(2);
    expect(fcs[0].call_id).toBe("call_a");
    expect(fcs[1].call_id).toBe("call_b");
  });

  it("text then tool_call switches active item correctly", async () => {
    const sink = makeMemorySink();
    await pipeChatStreamToResponses(
      sink,
      {
        chunks: fromList([
          chunk({ content: "let me try " }),
          chunk({
            tool_calls: [
              { index: 0, id: "call_1", type: "function", function: { name: "shell", arguments: "{}" } },
            ],
          }),
          chunk({}, "tool_calls"),
        ]),
      },
      req,
      { exposeReasoning: true }
    );
    const names = eventNames(sink.events);
    // text item must finalize before function_call appears
    const textDone = names.indexOf("response.output_text.done");
    const fcAdded = names.findIndex(
      (n, i) => n === "response.output_item.added" && i > textDone
    );
    expect(textDone).toBeGreaterThan(0);
    expect(fcAdded).toBeGreaterThan(textDone);
  });

  it("upstream error emits response.failed", async () => {
    const sink = makeMemorySink();
    async function* boom(): AsyncGenerator<ChatStreamChunk> {
      yield chunk({ content: "partial " });
      throw new Error("boom");
    }
    await pipeChatStreamToResponses(sink, { chunks: boom() }, req, {
      exposeReasoning: true,
    });
    const names = eventNames(sink.events);
    expect(names).toContain("response.failed");
    expect(names).not.toContain("response.completed");
  });

  it("sequence_number is monotonic", async () => {
    const sink = makeMemorySink();
    await pipeChatStreamToResponses(
      sink,
      { chunks: fromList([chunk({ content: "a" }), chunk({ content: "b" }, "stop")]) },
      req,
      { exposeReasoning: true }
    );
    const seqs = sink.events.map((e) => (e.data as { sequence_number: number }).sequence_number);
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]).toBe(seqs[i - 1] + 1);
    }
  });
});
