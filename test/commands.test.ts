import { vi, describe, expect, it } from "vitest";
import fixture from "./fixtures/model-selection-catalog.json" with { type: "json" };
import type { ModelSelectionCatalog } from "../src/catalog/types.js";

vi.mock("../src/catalog/config.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/catalog/config.js")>(),
  loadConfig: vi.fn().mockResolvedValue({ config: { source: {} } }),
}));
vi.mock("../src/catalog/load.js", () => ({ loadCatalog: vi.fn() }));

import paretoModelPicker from "../src/index.js";
import { loadCatalog } from "../src/catalog/load.js";

const catalog = fixture as unknown as ModelSelectionCatalog;

describe("preset shortcut commands", () => {
  it("registers shortcuts and selects the top model without opening the picker", async () => {
    vi.mocked(loadCatalog).mockResolvedValue(catalog);
    const commands = new Map<string, { handler: (args: string, context: any) => Promise<void> }>();
    const setModel = vi.fn().mockResolvedValue(true);
    const setThinkingLevel = vi.fn();
    const pi = {
      on: vi.fn(),
      registerCommand: (name: string, command: { handler: (args: string, context: any) => Promise<void> }) => commands.set(name, command),
      getThinkingLevel: () => "medium",
      setModel,
      setThinkingLevel,
    };
    paretoModelPicker(pi as any);

    expect([...commands.keys()]).toEqual([
      "pareto",
      "pareto-overall",
      "pareto-fast",
      "pareto-smart",
      "pareto-cheap",
    ]);

    const models = catalog.variants.flatMap((variant) => variant.aliases.map((alias) => ({
      provider: alias.provider,
      id: alias.modelId,
      name: alias.modelId,
      cost: { input: 1, output: 1, cacheRead: 1, cacheWrite: 1 },
    })));
    const context = {
      modelRegistry: {
        getAll: () => models,
        getAvailable: () => models,
        hasConfiguredAuth: () => true,
        isUsingOAuth: () => false,
      },
      ui: { notify: vi.fn(), custom: vi.fn() },
    };

    await commands.get("pareto")!.handler("smart", context);
    await commands.get("pareto-smart")!.handler("", context);

    expect(context.ui.custom).not.toHaveBeenCalled();
    expect(setModel).toHaveBeenCalledTimes(2);
    expect(setModel).toHaveBeenCalledWith(expect.objectContaining({ provider: "baseten", id: "moonshotai/Kimi-K3" }));
    expect(setThinkingLevel).toHaveBeenCalledWith("high");
  });
});
