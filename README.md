# pi-pareto-model

<img width="1245" height="699" alt="Screenshot 2026-09-03 at 7 32 42" src="https://github.com/user-attachments/assets/2f333581-d12b-40b0-9609-852b03b7b971" />

This is a model picker for Pi that allows you to quickly pick models along a 3-axis Pareto efficiency frontier.

It compares each model variant (model and thinking level combo) with three measures:

- **Smart:** Higher values are better.
- **Time:** Lower values are better.
- **Cost:** Lower values are better.

The model picker is aware of what providers you're currently logged in-to and will hide models you are unable to use. 

The model picker hides any model which is pareto-dominated by another (e.g., you should never use model X because model Y is the cost/intelligence but cheaper).

You can shift your preferences between those three criteria dynamically, or cycle through our overall/fast/smart/cheap presets. You can also provide your own presets.

The picker is **subscription aware** and will prefer "free" subscribed models when you say they are available.

Data is provided by DeepSWE, though you can substitute in your own source.

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

### Use the public DeepSWE catalog

[DeepSWE Catalog Digest](https://github.com/speedshop/ds-catalog-digest) publishes a compatible catalog. Configure its stable catalog as a public HTTP source:

```json
{
  "source": {
    "type": "http",
    "url": "https://raw.githubusercontent.com/speedshop/ds-catalog-digest/main/catalog/model-selection-catalog.json"
  },
  "cacheTtlHours": 24
}
```

The picker caches it for 24 hours and loads it once per Pi session. Start a new Pi session to pick up a newer catalog after the cache expires.

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

### Use GitHub CLI authentication

```json
{
  "source": {
    "type": "github",
    "repository": "OWNER/REPOSITORY",
    "path": "catalog/model-selection-catalog.json"
  }
}
```

The picker runs `gh api` with the active GitHub CLI account. Authenticate that account before starting Pi:

```fish
gh auth login
gh auth status
```

The catalog is loaded once per Pi session. Start a new session to load upstream changes.

### Use a private HTTP URL

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
      "smart": 6.25,
      "time": 4.25,
      "cost": 1.5
    },
    "oracle": {
      "smart": 12,
      "time": 0,
      "cost": 0
    },
    "cheap": {
      "smart": 3,
      "time": 1.5,
      "cost": 7.5,
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

The picker fills the available terminal height. Use Up or Down to move through all choices.

| Key | Action |
|---|---|
| Up/Down | Move the selection |
| Tab / Shift+Tab | Change the Preset |
| Home/End | Move to the first or last choice |
| `s` / `t` / `c` | Choose a Power Allocation target or donate to the active target |
| `r` | Reset the current Preset |
| `p` | Save the current Power Allocation as the Preset default |
| `d` | Show or hide dominated Model Variants |
| `/` | Start a search |
| `a` | Select the Available Catalog or Full Catalog |
| `u` | Enable or disable subscriptions for this Pi session |
| Enter | Select an available Model Variant |
| Escape | Clear the search, leave donor mode, or close the picker |

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

Press `s`, `t`, or `c` to choose the measure that will receive power. The picker then enters donor mode. Press either other measure to transfer one quarter-power from that donor to the target. You can use different donors for consecutive transfers.

Press the target key again, or press Escape, to leave donor mode. Four transfers move one complete power unit.

An asterisk in `power*:` means that the current allocation is not the configured default.

Press `r` to restore the configured default. Press `p` to save the current allocation as the new default.

The save operation changes only the current Preset. It writes the change to the active `pareto-model-picker.json` file.

The picker also stores Power Allocations in the Pi session. Session values override configured defaults until you reset them.

A measure with zero power does not affect Pareto domination or ranking. Its column stays visible.

### Built-in Presets

The picker uses these Presets only when the configuration has no `presets` object. The values use Smart/Time/Cost order:

| Preset | Allocation | Purpose |
|---|---:|---|
| Overall | `6.25/4.25/1.5` | Balance Smart and Time with the most power on Smart |
| Fast | `5/5.25/1.75` | Balance Smart and Time with a slight Time preference |
| Smart | `8/2.25/1.75` | Give strong priority to Smart |
| Cheap | `1.25/1/9.75` | Give the most power to Cost |

You can replace these names and allocations with any configured Presets. For example, an `oracle` Preset can use `12/0/0`.

Each allocation must use nonnegative multiples of `0.25`. The three values must total 12.

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
