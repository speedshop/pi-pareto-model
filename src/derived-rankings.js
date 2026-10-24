import { readFile } from "node:fs/promises";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { AXES, POWER_STEP, TOTAL_POWER, dominatorOf, paretoFront, rankVariants } from "./ranking.js";

export const DERIVED_KIND = "derived-rankings-v2";

export function deriveRankings(data) {
  const indexes = new Map(data.variants.map((variant, index) => [variant.id, index]));
  const frontiers = new Map();
  const dominators = {};
  for (let mask = 1; mask < 2 ** AXES.length; mask += 1) {
    const axes = AXES.filter((_axis, index) => mask & (1 << index));
    const key = axes.join(",");
    frontiers.set(key, paretoFront(data.variants, axes));
    dominators[key] = data.variants.map((variant) => data.variants.flatMap((other, index) =>
      dominatorOf(variant, [other], axes) ? [index] : []));
  }
  const orders = {};
  const steps = TOTAL_POWER / POWER_STEP;
  for (let smart = 0; smart <= steps; smart += 1) {
    for (let fast = 0; fast <= steps - smart; fast += 1) {
      const allocation = { smart: smart * POWER_STEP, fast: fast * POWER_STEP, cheap: (steps - smart - fast) * POWER_STEP };
      const axes = AXES.filter((axis) => allocation[axis] > 0);
      const frontier = frontiers.get(axes.join(","));
      orders[`${allocation.smart},${allocation.fast}`] = rankVariants(data.variants, allocation, axes, frontier)
        .map((variant) => indexes.get(variant.id));
    }
  }
  return {
    kind: DERIVED_KIND,
    catalog: data.catalog,
    variants: data.variants.map(({ id, name, creator, reasoning }) => ({ id, name, creator, ...(reasoning ? { reasoning } : {}) })),
    orders,
    dominators,
  };
}

export async function validateDerivedRankings(data) {
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  const schema = JSON.parse(await readFile(new URL("../schema/derived-rankings.schema.json", import.meta.url), "utf8"));
  const validate = ajv.compile(schema);
  if (!validate(data)) throw new Error(`Invalid derived rankings: ${ajv.errorsText(validate.errors)}`);
  checkDerivedIndexes(data);
}

function checkDerivedIndexes(data) {
  const count = data.variants.length;
  const ids = new Set(data.variants.map((variant) => variant.id));
  if (ids.size !== count) throw new Error("Derived rankings contain duplicate variant ids.");
  const validIndex = (index) => Number.isInteger(index) && index >= 0 && index < count;
  const expectedOrders = new Set();
  const steps = TOTAL_POWER / POWER_STEP;
  for (let smart = 0; smart <= steps; smart += 1) {
    for (let fast = 0; fast <= steps - smart; fast += 1) {
      const key = `${smart * POWER_STEP},${fast * POWER_STEP}`;
      expectedOrders.add(key);
      const order = data.orders[key];
      if (!order || order.length !== count || new Set(order).size !== count || !order.every(validIndex)) {
        throw new Error(`Invalid derived ranking order at ${key}.`);
      }
    }
  }
  if (Object.keys(data.orders).some((key) => !expectedOrders.has(key))) throw new Error("Unexpected derived ranking allocation.");
  const expectedAxes = new Set();
  for (let mask = 1; mask < 2 ** AXES.length; mask += 1) {
    const key = AXES.filter((_axis, index) => mask & (1 << index)).join(",");
    expectedAxes.add(key);
    const relations = data.dominators[key];
    if (!relations || relations.length !== count || relations.some((indexes, index) =>
      new Set(indexes).size !== indexes.length || !indexes.every(validIndex) || indexes.includes(index))) {
      throw new Error(`Invalid derived dominators at ${key}.`);
    }
  }
  if (Object.keys(data.dominators).some((key) => !expectedAxes.has(key))) throw new Error("Unexpected derived dominance axes.");
}
