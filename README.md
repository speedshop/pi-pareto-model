# Pi Pareto Model Picker

Pi Pareto Model Picker helps you select a Model Variant in Pi.

It compares each Model Variant with three measures:

- **Smart:** Higher values are better.
- **Time:** Lower values are better.
- **Cost:** Lower values are better.

The picker shows the Pareto frontier first. A Model Variant is on this frontier when no other variant is better without a trade-off.

The picker uses Pi authentication data, subscription data, and provider prices. It does not send benchmark data to Pi providers.

## Features

- Compare Model Variants with Smart, Time, and Cost.
- Show Pareto-efficient choices first.
- Use all authenticated Pi Provider Routes.
- Support subscriptions without changing the preferred order of reasoning levels.
- Load a catalog from a local file or private HTTP URL.
- Save a different Power Allocation for each Preset.

## Contents

- [Installation](#installation)
- [Catalog configuration](#catalog-configuration)
- [Usage](#usage)
- [Power Allocation](#power-allocation)
- [Ranking](#ranking)
- [Catalogs and Provider Routes](#catalogs-and-provider-routes)
- [Catalog requirements](#catalog-requirements)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Installation

Install the extension from this source directory:

```fish
pi install /absolute/path/to/pi-pareto-model
```

Use this command for a temporary test:

```fish
pi -e /absolute/path/to/pi-pareto-model
```

## Catalog configuration

Create `~/.pi/agent/pareto-model-picker.json`.

### Use a local file

```json
{
  "source": {
    "type": "file",
    "path": "/absolute/path/to/model-selection-catalog.json"
  }
}
```

The repository includes a test catalog at `test/fixtures/model-selection-catalog.json`. Its benchmark values are fabricated.

### Use a private GitHub repository

```json
{
  "source": {
    "type": "http",
    "url": "https://api.github.com/repos/OWNER/REPOSITORY/contents/catalog/model-selection-catalog.json",
    "headers": {
      "Authorization": "Bearer $PI_PARETO_GITHUB_TOKEN",
      "Accept": "application/vnd.github.raw+json"
    }
  },
  "cacheTtlHours": 24
}
```

Set `PI_PARETO_GITHUB_TOKEN` to a fine-grained GitHub personal access token. Give the token read-only access to repository contents.

Do not put the token value in the configuration file.

A trusted project can use `.pi/pareto-model-picker.json` instead. This project file overrides the global file.

A relative catalog path starts from the directory that contains the configuration file.

### Configure Presets

Add a `presets` object to define the complete Preset list. The picker shows Presets in the same order as this object.

```json
{
  "source": {
    "type": "file",
    "path": "/absolute/path/to/model-selection-catalog.json"
  },
  "presets": {
    "overall": {
      "smart": 6,
      "time": 3,
      "cost": 3
    },
    "oracle": {
      "smart": 12,
      "time": 0,
      "cost": 0
    },
    "cheap": {
      "smart": 3,
      "time": 2,
      "cost": 7,
      "subscriptionRoutes": "only",
      "paretoCost": "reference"
    }
  }
}
```

If you omit `presets`, the picker uses its built-in Presets. If you add `presets`, your list replaces all built-in Presets.

Each Preset name must start with a letter. The remaining characters can use letters, numbers, `_`, or `-`. Each allocation must total 12.

The optional `subscriptionRoutes` value controls route eligibility:

- `compete`: Let Included and metered routes compete. This is the default.
- `only`: Exclude metered routes when an Included route exists.

The optional `paretoCost` value controls the Cost value for Pareto domination:

- `effective`: Use zero Cost for an Included route. This is the default.
- `reference`: Always use Reference Task Cost.

## Usage

Run this Pi command:

```text
/pareto
```

The picker shows five choices at one time. Use Up or Down to move through all choices.

| Key | Action |
|---|---|
| Up/Down | Move the selection |
| Tab / Shift+Tab | Change the Preset |
| Home/End | Move to the first or last choice |
| `s` / `t` / `c` | Move one power unit to Smart, Time, or Cost |
| `r` | Reset the current Preset |
| `p` | Save the current Power Allocation as the Preset default |
| `d` | Show or hide dominated Model Variants |
| `/` | Start a search |
| `a` | Select the Available Catalog or Full Catalog |
| `u` | Enable or disable subscriptions for this Pi session |
| Enter | Select an available Model Variant |
| Escape | Clear the search or close the picker |

The search updates after each character. It searches these fields:

- Model name
- Creator
- Checkpoint
- Provider
- Exact Pi model ID

The picker hides dominated Model Variants by default. Press `d` to show them after the Pareto frontier.

The Full Catalog also shows unavailable Model Variants. You can move to an unavailable row, but you cannot select it.

### Use a shortcut command

Pass a Preset name to select its first available choice without opening the picker:

```text
/pareto PRESET
```

For example:

```text
/pareto oracle
```

The built-in Presets also have short compatibility commands:

```text
/pareto-overall
/pareto-fast
/pareto-smart
/pareto-cheap
```

The command uses the current Power Allocation, authentication data, and subscription settings. A compatibility command reports an unknown Preset if the active configuration removed that built-in name.

## Power Allocation

Each Preset has 12 power units. The picker distributes these units across Smart, Time, and Cost.

Press `s`, `t`, or `c` to move one unit to that measure. The unit comes from the strongest other measure.

An asterisk in `power*:` means that the current allocation is not the configured default.

Press `r` to restore the configured default. Press `p` to save the current allocation as the new default.

The save operation changes only the current Preset. It writes the change to the active `pareto-model-picker.json` file.

The picker also stores Power Allocations in the Pi session. Session values override configured defaults until you reset them.

A measure with zero power does not affect Pareto domination or ranking. Its column stays visible.

### Built-in Presets

The picker uses these Presets only when the configuration has no `presets` object. The values use Smart/Time/Cost order:

| Preset | Allocation | Purpose |
|---|---:|---|
| Overall | `6/3/3` | Give the most power to Smart |
| Fast | `4/6/2` | Give the most power to Time |
| Smart | `8/2/2` | Give strong priority to Smart |
| Cheap | `3/2/7` | Give the most power to Cost |

You can replace these names and allocations with any configured Presets. For example, an `oracle` Preset can use `12/0/0`.

Each allocation must use nonnegative integers. The three values must total 12.

## Ranking

The picker uses percentile ranks. This method prevents metric units from giving one measure too much influence.

For each measure, the best value has zero regret. A worse percentile has more regret.

The picker multiplies each regret by its power value. It first minimizes the largest weighted regret. It then uses mean weighted regret to resolve a tie.

The Presets do not use a simple sort on one column.

### Subscription behavior

A subscription changes Pareto domination. It does not change the preference order of the surviving Model Variants.

The picker uses two cost values:

- **Reference Task Cost:** The catalog cost for a benchmark task.
- **Effective Cost:** Zero for an enabled Subscription Route. Otherwise, it equals Reference Task Cost.

A Preset with `paretoCost: "effective"` uses Effective Cost for Pareto domination. Thus, an Included Model Variant can dominate a similar metered Model Variant.

The picker uses Reference Task Cost to rank the Model Variants that survive. Thus, a subscription does not change the preferred order of reasoning levels.

A Preset with `subscriptionRoutes: "only"` excludes all metered routes when an Included route exists. With `paretoCost: "reference"`, it uses Reference Task Cost as a proxy for subscription usage.

For example, a Preset can remove a similar metered model from its frontier. It does not make a high reasoning level more efficient than a medium level.

The Cost column keeps the Reference Task Cost visible and adds `·incl` for an enabled Subscription Route. Press `u` to disable that route for the current Pi session.

### Metric display

Each metric uses a linear scale over the candidates in the current result list. Narrow layouts show a `▁`–`▇` position glyph; wider layouts show a four-cell microbar with fractional blocks. Taller or fuller means better on every axis. The scale remains stable while paging and recomputes when the Preset, search, catalog scope, or Pareto filter changes.

Dominated rows appear below a rule and identify a dominating Model Variant.

## Catalogs and Provider Routes

The catalog supplies these items:

- Model Variants
- Smart, Time, and Reference Task Cost values
- Manually verified Pi aliases

The public catalog schema is `schema/model-selection-catalog.schema.json`.

Pi supplies these Provider Route facts:

- Authentication and availability
- Provider identity and authentication type
- Input, output, cache-read, and cache-write prices

The picker uses only exact, verified aliases. It does not use fuzzy model-name matching.

For equivalent metered routes, a route can eliminate another route only when all its Pi prices are no higher. At least one price must also be lower.

The picker keeps both routes when their prices cross. The catalog does not contain enough token-use data to select one route safely.

The picker prefers an Included route over an equivalent metered route. Disable the subscription to test the metered route.

The picker never compares provider speed. Equivalent Provider Routes share the same Smart and Reference Task Time values.

### Available Catalog

The Available Catalog contains Provider Routes that Pi can use with current authentication data.

It ignores `enabledModels` and `--models`. Those settings control Pi model cycling, not Provider Route availability.

### Full Catalog

The Full Catalog contains all catalog Model Variants. It also contains variants with no usable Provider Route.

An unavailable row shows verified catalog provider names when they exist. It shows `—` when the variant has no verified provider alias.

### Subscription policy

The built-in policy recognizes these OAuth subscriptions:

- OpenAI Codex
- GitHub Copilot
- xAI

It also recognizes these plan providers:

- Kimi Coding
- Z.AI Coding Plan
- OpenCode Go
- Qwen Token Plan
- Xiaomi MiMo Token Plan

The policy does not treat Anthropic OAuth as included usage. Pi can bill Claude Pro or Max use as extra usage.

The policy also excludes OpenRouter, Radius, MiniMax, and other ambiguous or metered providers.

## Catalog requirements

Each Model Variant must have finite Smart, Time, and Cost values. These values cannot be null.

Each selectable route must have an exact, manually verified Pi alias.

The catalog Cost is a benchmark reference value. It is not the user invoice from a provider.

## Development

Install dependencies and run all checks:

```fish
npm install
npm run check
```

## Contributing

Keep each change focused. Add or update tests when behavior changes.

Run `npm run check` before you submit a change.

## License

This project uses the MIT license.
