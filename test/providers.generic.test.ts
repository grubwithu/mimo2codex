import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGenericProvider, GenericProviderSpecError } from "../src/providers/generic.js";
import {
  loadGenericProviders,
  GenericLoaderError,
} from "../src/providers/genericLoader.js";
import {
  byClientModel,
  byShortcut,
  initRegistry,
  isProviderId,
  PROVIDERS,
} from "../src/providers/registry.js";

// Tests for the generic-provider factory, loader, and registry integration.
// Each test resets the registry to built-ins-only in afterEach so they don't
// leak state.

afterEach(() => {
  initRegistry([]);
});

describe("createGenericProvider", () => {
  it("builds a working provider from a minimal spec", () => {
    const p = createGenericProvider({
      id: "qwen",
      displayName: "Qwen",
      baseUrl: "https://example.com/v1",
      envKey: "QWEN_API_KEY",
      defaultModel: "qwen3-max",
    });
    expect(p.id).toBe("qwen");
    expect(p.shortcut).toBe("qwen"); // defaults to id
    expect(p.defaultModel).toBe("qwen3-max");
    expect(p.wireApi).toBe("chat");
    expect(p.envKeys).toEqual(["QWEN_API_KEY"]);
    // baseUrlEnv is derived from envKey (strip _API_KEY suffix)
    expect(p.baseUrlEnv).toBe("QWEN_BASE_URL");
  });

  it("rejects reserved built-in ids", () => {
    expect(() =>
      createGenericProvider({
        id: "mimo",
        displayName: "Conflict",
        baseUrl: "https://x.example/v1",
        envKey: "X_API_KEY",
        defaultModel: "x",
      })
    ).toThrow(GenericProviderSpecError);
    expect(() =>
      createGenericProvider({
        id: "deepseek",
        displayName: "Conflict",
        baseUrl: "https://x.example/v1",
        envKey: "X_API_KEY",
        defaultModel: "x",
      })
    ).toThrow(GenericProviderSpecError);
  });

  it("rejects ids with spaces or special chars", () => {
    expect(() =>
      createGenericProvider({
        id: "with space",
        displayName: "Bad",
        baseUrl: "https://x.example/v1",
        envKey: "X_API_KEY",
        defaultModel: "x",
      })
    ).toThrow(GenericProviderSpecError);
  });

  it("resolveModel passes through any id when no models declared", () => {
    const p = createGenericProvider({
      id: "g",
      displayName: "G",
      baseUrl: "https://x.example/v1",
      envKey: "G_API_KEY",
      defaultModel: "x",
    });
    expect(p.resolveModel("anything")?.id).toBe("anything");
    expect(p.resolveModel("unknown:tag@2")?.id).toBe("unknown:tag@2");
  });

  it("resolveModel strictly matches when models are declared", () => {
    const p = createGenericProvider({
      id: "q",
      displayName: "Q",
      baseUrl: "https://x.example/v1",
      envKey: "Q_API_KEY",
      defaultModel: "q3-max",
      models: [
        { id: "q3-max" },
        { id: "q3-flash", aliases: ["q-flash"] },
      ],
    });
    expect(p.resolveModel("q3-max")?.id).toBe("q3-max");
    expect(p.resolveModel("q3-flash")?.id).toBe("q3-flash");
    expect(p.resolveModel("q-flash")?.id).toBe("q3-flash"); // alias
    expect(p.resolveModel("random-id")).toBeNull();
  });

  it("preprocessResponses strips MiMo-specific thinking fields", () => {
    const p = createGenericProvider({
      id: "g",
      displayName: "G",
      baseUrl: "https://x.example/v1",
      envKey: "G_API_KEY",
      defaultModel: "x",
    });
    const chat = p.preprocessResponses(
      {
        model: "x",
        input: [{ type: "message", role: "user", content: "hi" }],
      },
      { runtime: { apiKey: "k", baseUrl: "u", flags: {} }, exposeReasoning: true }
    );
    expect(chat.thinking).toBeUndefined();
    expect(chat.enable_thinking).toBeUndefined();
  });
});

describe("loadGenericProviders", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "m2c-test-"));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns [] when no file and no env vars are set", () => {
    const result = loadGenericProviders({}, tmp);
    expect(result).toEqual([]);
  });

  it("loads providers from providers.json under dataDir", () => {
    writeFileSync(
      join(tmp, "providers.json"),
      JSON.stringify({
        providers: [
          {
            id: "qwen",
            displayName: "Qwen",
            baseUrl: "https://example.com/v1",
            envKey: "QWEN_API_KEY",
            defaultModel: "qwen3-max",
          },
        ],
      })
    );
    const result = loadGenericProviders({}, tmp);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("qwen");
  });

  it("MIMO2CODEX_PROVIDERS_FILE override takes precedence", () => {
    const overridePath = join(tmp, "elsewhere.json");
    writeFileSync(
      overridePath,
      JSON.stringify({
        providers: [
          {
            id: "kimi",
            displayName: "Kimi",
            baseUrl: "https://example.com/v1",
            envKey: "KIMI_API_KEY",
            defaultModel: "k",
          },
        ],
      })
    );
    // Default location does NOT exist; only the override does.
    const result = loadGenericProviders(
      { MIMO2CODEX_PROVIDERS_FILE: overridePath },
      tmp
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("kimi");
  });

  it("env-only single-instance shortcut when no file present", () => {
    const result = loadGenericProviders(
      {
        GENERIC_BASE_URL: "https://example.com/v1",
        GENERIC_DEFAULT_MODEL: "test-model",
      },
      tmp
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("generic");
    expect(result[0].defaultModel).toBe("test-model");
  });

  it("throws on duplicate ids within the file", () => {
    writeFileSync(
      join(tmp, "providers.json"),
      JSON.stringify({
        providers: [
          {
            id: "x",
            displayName: "X",
            baseUrl: "https://a.example/v1",
            envKey: "X_API_KEY",
            defaultModel: "m",
          },
          {
            id: "x",
            displayName: "X2",
            baseUrl: "https://b.example/v1",
            envKey: "X_API_KEY",
            defaultModel: "m",
          },
        ],
      })
    );
    expect(() => loadGenericProviders({}, tmp)).toThrow(GenericLoaderError);
  });

  it("throws on invalid JSON", () => {
    writeFileSync(join(tmp, "providers.json"), "not json {");
    expect(() => loadGenericProviders({}, tmp)).toThrow(GenericLoaderError);
  });

  it("throws when reserved id appears in spec", () => {
    writeFileSync(
      join(tmp, "providers.json"),
      JSON.stringify({
        providers: [
          {
            id: "mimo",
            displayName: "Collision",
            baseUrl: "https://x.example/v1",
            envKey: "X_API_KEY",
            defaultModel: "m",
          },
        ],
      })
    );
    expect(() => loadGenericProviders({}, tmp)).toThrow(GenericLoaderError);
  });
});

describe("initRegistry / runtime registration", () => {
  it("registers generics alongside built-ins", () => {
    const generic = createGenericProvider({
      id: "qwen",
      displayName: "Qwen",
      baseUrl: "https://example.com/v1",
      envKey: "QWEN_API_KEY",
      defaultModel: "qwen3-max",
      models: [{ id: "qwen3-max" }],
    });
    initRegistry([generic]);
    expect(PROVIDERS.qwen).toBe(generic);
    expect(PROVIDERS.mimo).toBeDefined();
    expect(PROVIDERS.deepseek).toBeDefined();
    expect(isProviderId("qwen")).toBe(true);
    expect(isProviderId("nonexistent")).toBe(false);
    expect(byShortcut("qwen")?.id).toBe("qwen");
  });

  it("byClientModel routes to a declared-models generic", () => {
    initRegistry([
      createGenericProvider({
        id: "qwen",
        displayName: "Qwen",
        baseUrl: "https://example.com/v1",
        envKey: "QWEN_API_KEY",
        defaultModel: "qwen3-max",
        models: [{ id: "qwen3-max", contextWindow: 262144 }],
      }),
    ]);
    expect(byClientModel("qwen3-max")?.id).toBe("qwen");
    // Existing built-in routing still works.
    expect(byClientModel("mimo-v2.5-pro")?.id).toBe("mimo");
    expect(byClientModel("deepseek-v4-pro")?.id).toBe("deepseek");
  });

  it("byClientModel skips open-catalog generics so they don't hijack routing", () => {
    // A generic with no declared models accepts any id via passthrough. It
    // must NOT win byClientModel against built-in ids — otherwise sending
    // `mimo-v2.5-pro` would route to the generic instead of mimo.
    initRegistry([
      createGenericProvider({
        id: "openrouter",
        displayName: "OpenRouter",
        baseUrl: "https://example.com/v1",
        envKey: "OPENROUTER_API_KEY",
        defaultModel: "any",
      }),
    ]);
    expect(byClientModel("mimo-v2.5-pro")?.id).toBe("mimo");
    expect(byClientModel("anything-else")).toBeUndefined();
  });

  it("rejects duplicate-id generic at init time", () => {
    const a = createGenericProvider({
      id: "dup",
      displayName: "A",
      baseUrl: "https://a.example/v1",
      envKey: "A_API_KEY",
      defaultModel: "m",
    });
    const b = createGenericProvider({
      id: "dup",
      displayName: "B",
      baseUrl: "https://b.example/v1",
      envKey: "B_API_KEY",
      defaultModel: "m",
    });
    expect(() => initRegistry([a, b])).toThrow();
  });

  it("initRegistry([]) restores built-ins-only state", () => {
    initRegistry([
      createGenericProvider({
        id: "tmp",
        displayName: "Tmp",
        baseUrl: "https://x.example/v1",
        envKey: "T_API_KEY",
        defaultModel: "m",
      }),
    ]);
    expect(PROVIDERS.tmp).toBeDefined();
    initRegistry([]);
    expect(PROVIDERS.tmp).toBeUndefined();
    expect(PROVIDERS.mimo).toBeDefined();
    expect(PROVIDERS.deepseek).toBeDefined();
  });
});
