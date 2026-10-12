# pi-pareto-model

This project builds one self-contained HTML page for choosing a model along a 3-axis Pareto efficiency frontier.

It compares each model variant (model and thinking level combo) with three measures:

- **Smart:** Higher values are better.
- **Time:** Lower values are better.
- **Cost:** Lower values are better.

The page shows a triangle of power allocations. Each hexagon is colored by the model that ranks first for that allocation. Set the allocation on the triangle by clicking or dragging, or drag a preset's pin to move it. Below the triangle, you can read the current allocation, jump to presets, and read the full ranked frontier.

The page hides any model which is Pareto-dominated by another (e.g., you should never use model X because model Y is as smart and as fast but cheaper). It computes the frontier and the ranking in the browser from an embedded copy of the catalog. It makes no network requests and needs no server.

Data is provided by DeepSWE, though you can substitute in your own source.

## Contents

- [Build the page](#build-the-page)
- [Catalog configuration](#catalog-configuration)
- [Change the text](#change-the-text)
- [Using the page](#using-the-page)
- [Ranking](#ranking)
- [Catalog requirements](#catalog-requirements)
- [Development](#development)
- [License](#license)

## Build the page

[DeepSWE Catalog Digest](https://github.com/speedshop/ds-catalog-digest) publishes a compatible, redistributable catalog. The `build` task downloads it and builds the page:

```fish
npm install
mise run build
open preset-map.html
```

Pass `--url` to build from a different catalog URL, `--output` to change the output path, `--strings` to change the page text, and `--allow-restricted` to build a private copy from a catalog that forbids redistribution:

```fish
mkdir -p tmp
mise run build --url https://example.com/model-selection-catalog.json --output tmp/example.html
```

`mise run build:aa` builds `preset-map-aa.html` from the private Artificial Analysis catalog through the active GitHub CLI account. Do not publish that page.

The same options work without mise through `npm run build:preset-map -- --url URL`. Without `--catalog` or `--url`, the build reads the catalog source from a configuration file. See [Catalog configuration](#catalog-configuration).

The build:

1. Loads the catalog from `--catalog` or `--url`, or from the configured file, GitHub, or HTTP source.
2. Validates the catalog against the schema for its `schemaVersion`.
3. Checks that the catalog allows redistribution.
4. Embeds each variant's id, display name, creator, release date when present, and metrics, plus the catalog's name, version, generation date, attribution, terms URL, and metric definitions.
5. Inlines the ranking module from `src/ranking.js`.
6. Embeds the page text from `visualization/strings/cloddish.json`, with any `--strings` overrides applied.
7. Writes `preset-map.html` and prints its path, variant count, and catalog name.

### Options

| Option | Purpose |
|---|---|
| `--catalog PATH` | Read a catalog file directly |
| `--url URL` | Download the catalog from this URL |
| `--config PATH` | Read the catalog source from this configuration file |
| `--output PATH` | Write the HTML here (default: `preset-map.html`) |
| `--template PATH` | Use a different HTML template |
| `--strings PATH` | Override page text with keys from this JSON file. See [Change the text](#change-the-text) |
| `--allow-restricted` | Build from a catalog that does not allow redistribution |
| `--help` | Show the options |

### Redistribution

The built page contains the catalog's metrics. Ship only a page built from a catalog whose `catalog.distribution.allowRedistribution` is `true`.

The build refuses a catalog whose `allowRedistribution` is `false`. It prints the catalog's attribution and terms URL instead. Pass `--allow-restricted` to build a private copy anyway, and do not publish that page.

Git ignores every `preset-map*.html` file except the template.

## Change the text

Every piece of text on the page comes from `visualization/strings/cloddish.json`, a flat JSON object of keys and strings. To change the text, copy that file, keep only the keys you want to change, edit their values, and pass the copy with `--strings`:

```fish
mkdir -p tmp
cp visualization/strings/cloddish.json tmp/my-strings.json
mise run build --strings tmp/my-strings.json
```

The build loads `cloddish.json` first and applies your file on top, so missing keys keep their default text. It fails and names the key if your file contains a key that `cloddish.json` lacks. Placeholders such as `{name}` are filled in by the page; keep them in any string you change. The explainer paragraphs are arrays of strings.

## Catalog configuration

Without `--catalog` or `--url`, the build reads a configuration file. `--config PATH` is an exclusive override: the build reads only that file and fails if it is missing. Only when `--config` is omitted does the build look for the first file that exists:

1. `.pi/pareto-model-picker.json` in this repository
2. `~/.pi/agent/pareto-model-picker.json`

The file names one catalog source.

### Use the public DeepSWE catalog

```json
{
  "source": {
    "type": "http",
    "url": "https://raw.githubusercontent.com/speedshop/ds-catalog-digest/main/catalog/model-selection-catalog.json"
  }
}
```

### Use a local file

```json
{
  "source": {
    "type": "file",
    "path": "/absolute/path/to/model-selection-catalog.json"
  }
}
```

A relative catalog path starts from the directory that contains the configuration file.

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

The build runs `gh api` with the active GitHub CLI account. Authenticate that account first:

```fish
gh auth login
gh auth status
```

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
  }
}
```

Set `PI_PARETO_GITHUB_TOKEN` to a fine-grained GitHub personal access token. Give the token read-only access to repository contents.

Do not put the token value in the configuration file. The URL and header values expand `$NAME` and `${NAME}` from the environment. Write `$$` for a literal `$`.

## Using the page

### Triangle

Each corner puts all 12 power units on one measure: Smart at the bottom left, Time at the top, and Cost at the bottom right.

Each hexagon is one whole-unit Power Allocation. Each edge runs 12 whole-unit steps from one pure pole to the next, giving 13 hexagons per edge and 91 in total. A hexagon's color names the top-ranked frontier model for its allocation. Colors follow the model family, and higher thinking effort uses a darker shade. Adjacent hexagons with the same winner form a region. The page labels regions largest first, each on an opaque backing in the region's color. A label must not overlap a larger region's label, a Preset symbol or its name label, or a corner pill. When it does not fit at the region's center, the page tries the region's hexagons nearest the center, then a smaller size, then an unrotated label. It skips a label only when nothing fits, and it skips single-hexagon regions. Hover over or focus any hexagon to name its winner.

Click or tap a hexagon to choose its allocation. Keep the pointer pressed and move it more than a few pixels to start a drag, then drag across the triangle to set the allocation continuously: the page snaps each measure to quarter units totalling 12 and updates the table as you move. Dragging past an edge clamps to the triangle. The URL hash updates once, when you release. The ring marks the current allocation, which can sit between hexagons at quarter-unit positions.

Pressing on a Preset pin acts on the pin instead of the hexagon under it. See [Presets](#presets).

To use the keyboard, tab to the triangle, move between hexagons with the arrow keys, and press Enter or Space to choose one.

### Priorities

The card below the triangle starts with **Priorities**, a line that shows the current allocation, for example `Smart 7.25 · Time 3.25 · Cost 1.5`. The three values always total 12. Change the allocation on the triangle or with a Preset; the line only reports it.

A measure with zero power does not affect Pareto domination or ranking. Its column stays visible.

### Presets

The page has these built-in Presets. The values use Smart/Time/Cost order:

| Preset | Allocation | Purpose |
|---|---:|---|
| Overall | `7.25/3.25/1.5` | Balance Smart and Time with the most power on Smart |
| Fast | `5/5.25/1.75` | Balance Smart and Time with a slight Time preference |
| Smart | `8/2.25/1.75` | Give strong priority to Smart |
| Cheap | `1.25/1/9.75` | Give the most power to Cost |

Each Preset is a pin on the triangle. Each built-in Preset has its own symbol: Overall is a circle, Fast a triangle, Smart a diamond, and Cheap a square. Saved Presets cycle through hollow versions of the same shapes in the order you saved them. Each chip shows its Preset's symbol, and the triangle shows the same symbol at the Preset's allocation with its name beside it. Click a chip, or click or tap a pin, to jump to that allocation.

To move a Preset, press on its pin and drag it more than a few pixels. The pin snaps to quarter units totalling 12 and stays inside the triangle. The current allocation moves with the pin, so the ring, the table, and the URL hash follow it. The hash updates once, when you release. Region labels move out of the way of the pin's new position after you release.

To move a pin with the keyboard, tab to it and use the arrow keys. Each press moves one quarter unit:

- **Right** moves a quarter unit from Smart to Cost, and **Left** moves it back.
- **Up** moves a quarter unit to Time from the larger of Smart and Cost, and **Down** moves a quarter unit from Time to the larger of the two.
- **Enter** or **Space** jumps the current allocation to the pin.

Moves are saved in the browser's `localStorage`, so they stay on that browser only. A moved built-in Preset keeps its new position after a reload, and its chip gains a **↺** control. Click **↺** to put that Preset back at its default allocation. The defaults in the table above never change.

Click **Save preset**, enter a name, and press Enter or click **Save** to keep the current allocation as a new pin. Press Escape or click **Cancel** to close the name field without saving. Built-in Preset names are rejected. The browser stores saved Presets in `localStorage` too. Click **×** on a saved Preset to remove it.

### URL hash

The URL hash holds the current allocation, for example `#s=7.25&t=3.25&c=1.5`. Share or bookmark the URL to return to that allocation.

The page uses Overall when the hash is missing, is malformed, uses steps other than quarter units, or does not total 12.

### Ranked table

The table lists the frontier for the current allocation in rank order. The top row is the selected model. When you click a hexagon, the page clears the search box and highlights its winner in the top row. While a search is active, the filter can hide the rank 1 row.

Each Smart, Time, and Cost cell has a bar. A longer bar is better, scaled between the shown rows' minimum and maximum. Each Time value uses seconds below 60 seconds and minutes at or above.

**Show dominated** adds the dominated variants after the frontier in grey. Each one names a model that dominates it.

The search box filters rows by model name or creator as you type.

The caption above the table counts the frontier models and names the top one.

### Explainer

Below the table, a short explainer covers how the ranking works, what regret means, how each measure is defined, and where the data comes from. It fills in the catalog's metric definitions, methodology links, attribution, and terms link.

### Small screens

At 600px wide or narrower:

- The triangle spans the full width. A key below it lists each region label in the same order, with the model's color, in place of the labels on the triangle.
- Preset symbols appear on the triangle without their names. The chips serve as the key.
- A bar fixed to the bottom of the screen shows the current allocation and the top-ranked model's name, creator, and Smart, Time, and Cost values.
- Each table row becomes a two-line card: rank, color, model, and creator, then Smart, Time, and Cost with their bars. The worst-regret column is hidden.

## Ranking

The page uses the Full Catalog and Reference Task Cost.

1. **Pareto frontier.** For the measures that have power, the page removes every variant that another variant dominates. A variant dominates another when it is no worse on every powered measure and strictly better on at least one.
2. **Regret.** For each powered measure, a frontier variant's regret is its gap from the best frontier value. The page divides that gap by the interquartile range of the frontier's distinct values for that measure. Smart and Cost use linear gaps. Time uses logarithmic gaps, so halving time counts the same at any speed.
3. **Weighting.** Each regret is multiplied by that measure's power and divided by the total power on powered measures.
4. **Minimax order.** Variants rank by their worst weighted regret, lowest first. Ties break by mean weighted regret and then by name.

Thus, a variant ranks first when it is never far behind on any measure you care about.

## Catalog requirements

[`schema/model-selection-catalog.schema.json`](schema/model-selection-catalog.schema.json) is the source-neutral, canonical catalog-v1 contract. Catalogs must use a numeric `schemaVersion`; semver strings and unknown numeric versions are rejected.

Every variant supplies Smart, Fast, and Cheap values plus an origin for each value. Smart is always measured directly by its source benchmark:

```json
"metricOrigins": {
  "smart": { "kind": "source", "benchmarkVersion": "smart-2026-01" },
  "fast": { "kind": "source", "benchmarkVersion": "tasks-2026-01" },
  "cheap": { "kind": "source", "benchmarkVersion": "tasks-2026-01" }
}
```

Fast and Cheap may instead be adjusted onto a common benchmark version. The only catalog-v1 adjustment method is `median-overlap-ratio`, and its factor must be greater than zero:

```json
"fast": {
  "kind": "adjusted",
  "benchmarkVersion": "tasks-2026-01",
  "sourceBenchmarkVersion": "tasks-2025-12",
  "method": "median-overlap-ratio",
  "factor": 1.08
}
```

Smart accepts any finite JSON number. Fast must be greater than zero because ranking uses a logarithmic scale, while Cheap may be zero. Catalog and variant `provenance` objects remain open so producers can record source-specific evidence without changing this source-neutral contract. See the schema for the complete required metadata and alias fields.

`"schemaVersion": 2` is the metric-only contract, validated by [`schema/model-metrics-catalog.schema.json`](schema/model-metrics-catalog.schema.json). It removes `aliases`, requires `metricOrigins`, and keeps `distribution` unchanged. The fields the page uses keep their names in both versions: `id`, `displayName`, `creator`, `metrics`, `provenance.releaseDate`, and `catalog.name`, `version`, `generatedAt`, and `distribution`.

Producer repositories that vendor a schema should copy the file unchanged and gate the copy byte-for-byte in local CI. When this package is installed as a development dependency, a durable offline check is:

```sh
cmp --silent schema/model-selection-catalog.schema.json \
  node_modules/pi-pareto-model/schema/model-selection-catalog.schema.json
```

The same command can point at a pinned local checkout of this repository instead of `node_modules`. A zero exit status proves the vendored bytes match the canonical schema; no network or publishing step is needed.

## Development

Install dependencies and run all checks:

```fish
npm install
npm run check
```

The page template is `visualization/preset-map.template.html`. The ranking module is `src/ranking.js`, plain JavaScript with no imports. The build inlines it into the page, and the tests import it directly.

Keep each change focused. Add or update tests when behavior changes.

## License

This project uses the MIT license.
