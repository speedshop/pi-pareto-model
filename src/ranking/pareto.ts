import { COMPARISON_AXES, type Candidate, type ComparisonAxis } from "../routes/types.js";

function metric(candidate: Candidate, axis: ComparisonAxis): number {
  return axis === "cheap" ? candidate.effectiveCost : candidate.variant.metrics[axis];
}

function noWorse(left: Candidate, right: Candidate, axis: ComparisonAxis): boolean {
  return axis === "smart" ? metric(left, axis) >= metric(right, axis) : metric(left, axis) <= metric(right, axis);
}

function better(left: Candidate, right: Candidate, axis: ComparisonAxis): boolean {
  return axis === "smart" ? metric(left, axis) > metric(right, axis) : metric(left, axis) < metric(right, axis);
}

export function dominates(
  left: Candidate,
  right: Candidate,
  axes: readonly ComparisonAxis[] = COMPARISON_AXES,
): boolean {
  return axes.every((axis) => noWorse(left, right, axis))
    && axes.some((axis) => better(left, right, axis));
}

export function paretoFront(
  candidates: readonly Candidate[],
  axes: readonly ComparisonAxis[] = COMPARISON_AXES,
): Candidate[] {
  return candidates.filter((right) => !candidates.some((left) => left !== right && dominates(left, right, axes)));
}
