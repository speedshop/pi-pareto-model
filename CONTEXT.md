# Pareto Model Picker

The Pareto Model Picker helps a Pi user choose among model and provider combinations using intelligence, reference task time, and marginal task cost.

## Language

**Model Variant**:
An evaluated model configuration identified by checkpoint, quantization, and reasoning level. Equivalent provider offerings share one Model Variant.
_Avoid_: Model, candidate

**Provider Route**:
A way to access a Model Variant through a specific authenticated provider or subscription. A Provider Route supplies availability and Pi catalog billing information, but not a distinct intelligence score or reference task time.
_Avoid_: Provider model, endpoint

**Preset**:
A user-configured name for a Power Allocation, subscription-route policy, and Pareto Cost policy. A configuration can replace all built-in Presets or add domain-specific names such as advisor, oracle, or planner.
_Avoid_: Mode, profile

**Power Allocation**:
A fixed budget distributed across Smart, Reference Task Time, and Cost for one Preset. The allocation supplies regret weights. The Preset selects Effective Cost or Reference Task Cost for Pareto domination. Ranking always uses Reference Task Cost. An axis with no power participates in neither phase.
_Avoid_: Axis toggle, hidden weight

**Available Catalog**:
Model Variants reachable through the user's current API credentials, logins, and enabled subscriptions.
_Avoid_: Logged-in models

**Full Catalog**:
Every Model Variant published in the artifact, including variants Pi cannot select and variants for which the user has no usable Provider Route. Session-disabled subscriptions remain excluded as routes, not as Model Variants.
_Avoid_: All available models

**Subscription Route**:
A Provider Route whose usage is included in a fee the user has already paid, giving it zero marginal monetary cost while enabled for the current session.
_Avoid_: Free model

**Reference Task Cost**:
The configured benchmark artifact's model-level cost-per-task metric. It supplies the subscription-neutral Cost regret used to rank Pareto-efficient Model Variants and is not a claim about the user's provider bill.
_Avoid_: Provider cost, actual task cost, session cost

**Effective Cost**:
Zero for an enabled Subscription Route; otherwise, the Model Variant's Reference Task Cost. A Preset can use it for Pareto domination. It changes which Model Variants survive but not their preference order.
_Avoid_: Actual cost, billed cost

**Route Price Vector**:
A Provider Route's input, output, cache-read, and cache-write rates from Pi's model catalog. It eliminates an equivalent route only when every rate is no higher and at least one is lower.
_Avoid_: Cost per task

**Reference Task Time**:
The configured benchmark artifact's time-per-task measurement for a Model Variant. It is shared by equivalent Provider Routes and is not a claim about comparative provider latency.
_Avoid_: Provider speed, latency
