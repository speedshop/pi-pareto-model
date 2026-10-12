# Pareto Model Triangle

The Pareto Model Triangle helps a reader choose among model variants using intelligence, reference task time, and reference task cost.

## Language

**Model Variant**:
An evaluated model configuration identified by checkpoint, quantization, and reasoning level.
_Avoid_: Model, candidate

**Power Allocation**:
A fixed budget of 12 units distributed across Smart, Reference Task Time, and Reference Task Cost in quarter-unit steps. Axes with power define Pareto domination, and the allocation supplies the regret weights for ranking. An axis with no power participates in neither phase. The page does not display the allocation: the reader sets priorities on the triangle, and only the URL hash carries the numbers.
_Avoid_: Axis toggle, hidden weight

**Full Catalog**:
Every Model Variant published in the catalog artifact.
_Avoid_: All available models

**Reference Task Cost**:
The configured benchmark artifact's model-level cost-per-task metric. It supplies Cost for both Pareto domination and ranking and is not a claim about any provider bill.
_Avoid_: Provider cost, actual task cost, session cost

**Reference Task Time**:
The configured benchmark artifact's time-per-task measurement for a Model Variant. It is not a claim about comparative provider latency.
_Avoid_: Provider speed, latency
