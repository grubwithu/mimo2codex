import type {
  ChatContentPart,
  ChatMessage,
  ChatRequest,
  ChatTool,
  ChatToolChoice,
  ChatToolCall,
  ResponsesContentPart,
  ResponsesInputItem,
  ResponsesMessageItem,
  ResponsesRequest,
  ResponsesTool,
  ResponsesToolChoice,
} from "./types.js";
import { log } from "../util/log.js";

function partsToChatContent(parts: ResponsesContentPart[] | string): string | ChatContentPart[] {
  if (typeof parts === "string") return parts;

  const out: ChatContentPart[] = [];
  for (const p of parts) {
    if (p.type === "input_text" || p.type === "output_text") {
      out.push({ type: "text", text: p.text });
    } else if (p.type === "input_image") {
      out.push({ type: "image_url", image_url: { url: p.image_url, detail: p.detail } });
    } else if (p.type === "input_file") {
      // MiMo doesn't natively support file inputs in chat completions.
      // Drop the part but leave the message intact.
      log.warn("dropped input_file part — MiMo chat API does not accept file inputs");
    }
  }

  // If the message is purely text, collapse to a string for cleaner upstream payloads.
  if (out.length > 0 && out.every((p) => p.type === "text")) {
    return out.map((p) => (p as { text: string }).text).join("");
  }
  if (out.length === 0) return "";
  return out;
}

function messageItemToChat(item: ResponsesMessageItem): ChatMessage {
  const role = item.role === "developer" ? "system" : item.role;
  const content = partsToChatContent(item.content);
  if (role === "assistant") {
    return { role: "assistant", content: typeof content === "string" ? content : "" };
  }
  return { role, content };
}

function toolToChat(t: ResponsesTool): ChatTool {
  return {
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
      strict: t.strict ?? null,
    },
  };
}

function toolChoiceToChat(tc: ResponsesToolChoice | undefined): ChatToolChoice | undefined {
  if (tc === undefined) return undefined;
  if (typeof tc === "string") return tc;
  if (tc.type === "function") {
    const name = tc.function?.name ?? tc.name;
    if (!name) return undefined;
    return { type: "function", function: { name } };
  }
  return undefined;
}

interface AssemblyState {
  pendingReasoning: string | null;
  pendingToolCalls: ChatToolCall[];
  pendingAssistantText: string | null;
}

function flushAssistant(messages: ChatMessage[], state: AssemblyState): void {
  const hasReasoning = state.pendingReasoning !== null;
  const hasTools = state.pendingToolCalls.length > 0;
  const hasText = state.pendingAssistantText !== null;
  if (!hasReasoning && !hasTools && !hasText) return;

  const msg: ChatMessage = { role: "assistant", content: hasText ? state.pendingAssistantText : null };
  if (hasTools) msg.tool_calls = state.pendingToolCalls;
  if (hasReasoning) msg.reasoning_content = state.pendingReasoning;
  messages.push(msg);

  state.pendingReasoning = null;
  state.pendingToolCalls = [];
  state.pendingAssistantText = null;
}

function inputItemsToMessages(items: ResponsesInputItem[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  const state: AssemblyState = {
    pendingReasoning: null,
    pendingToolCalls: [],
    pendingAssistantText: null,
  };

  for (const item of items) {
    switch (item.type) {
      case "message": {
        if (item.role === "assistant") {
          // Assistant message — fold into pending so reasoning_content can join it.
          const content = partsToChatContent(item.content);
          state.pendingAssistantText =
            typeof content === "string" ? content : "";
          // If assistant message comes alone (without preceding reasoning or
          // following tool_calls), flush immediately so we keep ordering.
          flushAssistant(out, state);
        } else {
          flushAssistant(out, state);
          out.push(messageItemToChat(item));
        }
        break;
      }
      case "reasoning": {
        flushAssistant(out, state);
        const text = item.summary
          .filter((s) => s.type === "summary_text")
          .map((s) => s.text)
          .join("");
        state.pendingReasoning = text;
        break;
      }
      case "function_call": {
        state.pendingToolCalls.push({
          id: item.call_id,
          type: "function",
          function: { name: item.name, arguments: item.arguments },
        });
        break;
      }
      case "function_call_output": {
        flushAssistant(out, state);
        out.push({
          role: "tool",
          tool_call_id: item.call_id,
          content: item.output,
        });
        break;
      }
    }
  }
  flushAssistant(out, state);
  return out;
}

export function reqToChat(req: ResponsesRequest): ChatRequest {
  const messages: ChatMessage[] = [];

  if (req.instructions) {
    messages.push({ role: "system", content: req.instructions });
  }

  if (typeof req.input === "string") {
    messages.push({ role: "user", content: req.input });
  } else if (Array.isArray(req.input)) {
    for (const m of inputItemsToMessages(req.input)) {
      messages.push(m);
    }
  }

  const chat: ChatRequest = {
    model: req.model,
    messages,
    stream: req.stream ?? false,
  };

  if (req.tools && req.tools.length > 0) {
    chat.tools = req.tools.map(toolToChat);
  }
  const tc = toolChoiceToChat(req.tool_choice);
  if (tc !== undefined) chat.tool_choice = tc;

  if (req.parallel_tool_calls !== undefined) {
    chat.parallel_tool_calls = req.parallel_tool_calls;
  }
  if (req.temperature !== undefined && req.temperature !== null) {
    chat.temperature = req.temperature;
  }
  if (req.top_p !== undefined && req.top_p !== null) {
    chat.top_p = req.top_p;
  }
  if (req.max_output_tokens !== undefined && req.max_output_tokens !== null) {
    chat.max_completion_tokens = req.max_output_tokens;
  }

  return chat;
}
