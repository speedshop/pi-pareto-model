import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import type { ErrorObject, ValidateFunction } from "ajv";
import type { ModelSelectionCatalog } from "./types.js";

const require = createRequire(import.meta.url);
const Ajv = require("ajv") as typeof import("ajv").default;
const addFormats = require("ajv-formats") as typeof import("ajv-formats").default;

let validatorPromise: Promise<ValidateFunction<ModelSelectionCatalog>> | undefined;

async function getValidator(): Promise<ValidateFunction<ModelSelectionCatalog>> {
  validatorPromise ??= readFile(new URL("../../schema/model-selection-catalog.schema.json", import.meta.url), "utf8")
    .then((contents) => JSON.parse(contents) as object)
    .then((schema) => {
      const ajv = new Ajv({ allErrors: true, strict: false });
      addFormats(ajv);
      return ajv.compile<ModelSelectionCatalog>(schema);
    });
  return validatorPromise;
}

function formatErrors(errors: ErrorObject[] | null | undefined): string {
  return (errors ?? [])
    .slice(0, 8)
    .map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`)
    .join("; ");
}

export async function validateCatalog(value: unknown): Promise<ModelSelectionCatalog> {
  const validate = await getValidator();
  if (!validate(value)) {
    throw new Error(`Invalid model-selection catalog: ${formatErrors(validate.errors)}`);
  }

  const ids = new Set<string>();
  for (const variant of value.variants) {
    if (ids.has(variant.id)) throw new Error(`Invalid model-selection catalog: duplicate variant id ${variant.id}`);
    ids.add(variant.id);
  }

  return value;
}
