# pi-pareto-model

This project builds one self-contained HTML page for choosing a model along a 3-axis Pareto efficiency frontier.

It compares each model variant (model and thinking level combo) with three measures:

- **Smart:** Higher values are better.
- **Time:** Lower values are better.
- **Cost:** Lower values are better.

The page shows a triangle of priorities. Each corner stands for caring about one measure only, and each hexagon is a mix of the three, colored by the model that ranks first for that mix. Set your priorities on the triangle by clicking or dragging. Below the triangle, you can read the top model's actual Smart, Time, and Cost values, choose which creators' models may compete, and read the ranked frontier with an explanation for each row.

The page hides any model which is Pareto-dominated by another (e.g., you should never use model X because model Y is as smart and as fast but cheaper). It computes the frontier and the ranking in the browser from an embedded copy of the catalog. It makes no network requests and needs no server.

Data is provided by DeepSWE, though you can substitute in your own source.

## Contents

- [Build the page](#build-the-page)
- [Published page](#published-page)
- [AA-derived edition](#aa-derived-edition)
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

`mise run build:aa` builds the measurement-free AA-derived edition from the committed ranking snapshot. See [AA-derived edition](#aa-derived-edition).

The same options work without mise through `npm run build:preset-map -- --url URL`. Without `--catalog` or `--url`, the build reads the catalog source from a configuration file. See [Catalog configuration](#catalog-configuration).

The build:

1. Loads the catalog from `--catalog` or `--url`, or from the configured file, GitHub, or HTTP source.
2. Validates the catalog against the schema for its `schemaVersion`.
3. Checks that the catalog allows redistribution.
4. Embeds each variant's id, display name, creator, reasoning label and release date when present, and metrics, plus the catalog's name, version, generation date, attribution, terms URL, and metric definitions.
5. Inlines the ranking module from `src/ranking.js`.
6. Embeds the page text from `visualization/strings/claudish.json`, with any `--strings` overrides applied.
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
| `--allow-restricted` | Build a private measured page from a restricted catalog; do not publish it |
| `--derived` | Precompute frontier rank orders without publishing measurements |
| `--export-rankings PATH` | With `--derived`, write the validated measurement-free snapshot |
| `--rankings PATH` | Build from a validated measurement-free snapshot instead of a raw catalog |
| `--help` | Show the options |

### Redistribution

The default built page contains the catalog's metrics. Ship that measured page only when the catalog's `catalog.distribution.allowRedistribution` is `true`.

The build refuses a catalog whose `allowRedistribution` is `false`. It prints the catalog's attribution and terms URL instead. Pass `--allow-restricted` to build a private copy anyway, and do not publish that page.

Git ignores every `preset-map*.html` file except the template.

## Published page

The [Pages workflow](.github/workflows/pages.yml) publishes the measured DeepSWE edition at <https://speedshop.github.io/pi-pareto-model/> and the AA-derived rankings-only edition at <https://speedshop.github.io/pi-pareto-model/aa/>. The public runner reads the redistributable DeepSWE catalog and a committed, measurement-free AA ranking snapshot. It never reads the private AA catalog or passes `--allow-restricted`. Both pages carry source attribution and terms links.

The workflow runs only on `main`:

- **Push.** Every push to `main` checks, builds, and deploys the page. A push that skips CI, such as one marked `[ci skip]`, deploys at the next daily run instead.
- **Manual.** Running the workflow by hand on `main` always deploys.
- **Daily.** At 08:43 UTC, the workflow downloads the catalog and reads `deployment.json` from the published site. That file records the SHA-256 of the catalog bytes and the source commit that built the page. When both match, the run skips installing, checking, building, and deploying. Otherwise it deploys.

The workflow downloads the catalog once and builds from those same bytes, so the recorded hash always matches the published page. A run that fails before deploying leaves the published `deployment.json` unchanged, so the next daily run tries again. A missing or unreadable `deployment.json` triggers a deploy. Any other failure to download the catalog or `deployment.json` fails the run instead of deploying stale data.

The site holds only `index.html`, `aa/index.html`, and `deployment.json`. The generated pages are not committed.

Before the first deploy, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. The workflow does not enable Pages itself.

## AA-derived edition

The AA edition uses Speedshop's privately computed frontier rank orders, not a copy of AA's leaderboard rankings. It retains triangle selection at quarter-step resolution, creator filtering, and search. It publishes model names and reasoning labels, frontier orderings for all 1,225 priority mixes, and source metadata. It does not publish AA measurements, adjustment factors, metric provenance, normalization constants, numeric regret scores, or full-catalog single-axis comparisons. The top-model card and table omit measurement columns, including on mobile and in expanded explanations.

In this edition, creator filters only narrow the published Full Catalog frontier rankings. They do not recalculate a frontier from the checked creators, and models dominated in the Full Catalog remain excluded. The triangle follows the filtered published ranking. The AA edition does not offer **Show dominated**.

Build the current snapshot without accessing the private source:

```fish
mise run build:aa
open preset-map-aa.html
```

To refresh it, first obtain the private catalog locally and keep it in a gitignored location. Then run:

```fish
mise run refresh:aa --catalog tmp/aa-catalog.json
```

This privately computes rankings, writes `data/aa-rankings.json`, and builds and verifies `preset-map-aa.html`. Commit only the derived snapshot, never the raw catalog or a page built with `--allow-restricted`. The public Pages workflow rebuilds from the committed snapshot and verifies its embedded data against an allowlist schema before uploading. Unknown fields, including a `metrics` object, fail the build. Daily publishing still refreshes DeepSWE automatically; AA updates require a newly generated snapshot and a commit.

The AA chart includes the logo reproduced from [AA's website](https://artificialanalysis.ai/). Visible attribution says "Based on data from Artificial Analysis," identifies Speedshop as the author of the visualization and rankings, and disclaims AA endorsement. The source terms remain linked. Publishing this edition relies on the chart/Derived Data permissions in [AA's Data Platform Terms](https://artificialanalysiscdn.com/legal/ProDataPlatformTerms.pdf); removing measurements is not a waiver of those terms or a claim that AA has approved an interactive selection service. The interaction with the competitive-use restriction remains unresolved.

## Change the text

Every piece of text on the page comes from `visualization/strings/claudish.json`, a flat JSON object of keys and strings. To change the text, copy that file, keep only the keys you want to change, edit their values, and pass the copy with `--strings`:

```fish
mkdir -p tmp
cp visualization/strings/claudish.json tmp/my-strings.json
mise run build --strings tmp/my-strings.json
```

The build loads `claudish.json` first and applies your file on top, so missing keys keep their default text. It fails and names the key if your file contains a key that `claudish.json` lacks. Placeholders such as `{name}` are filled in by the page; keep them in any string you change. The explainer paragraphs are arrays of strings.

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

The corners are labeled **Smarter** at the bottom left, **Faster** at the top, and **Cheaper** at the bottom right. Each corner puts all of the weight on one measure: Smart, Time, or Cost. A spot on the triangle is a mix of priorities, not a target score, time, or cost.

Internally, each position is a Power Allocation of 12 units across the three measures. The page itself never shows those numbers; only the URL hash carries them. Each hexagon is one whole-unit allocation. Each edge runs 12 whole-unit steps from one pure pole to the next, giving 13 hexagons per edge and 91 in total. A hexagon's color names the top-ranked frontier model for its mix. See [Colors](#colors). Adjacent hexagons with the same winner form a region. The page labels regions largest first, each on an opaque backing in the region's color. A label must not overlap a larger region's label or a corner pill. When it does not fit at the region's center, the page tries the region's hexagons nearest the center, then a smaller size, then an unrotated label. It skips a label only when nothing fits, and it skips single-hexagon regions. Hover over or focus any hexagon to read its priorities in words, for example `Smart, then Time, then Cost`, and its winner.

Click or tap a hexagon to choose its mix. Keep the pointer pressed and move it more than a few pixels to start a drag, then drag across the triangle to set your priorities continuously: the page snaps to quarter units internally and updates the table as you move. Dragging past an edge clamps to the triangle. The URL hash updates once, when you release. The ring marks your current priorities, which can sit between hexagons. Press on the ring itself and drag to move it from where it is; pressing the ring without dragging changes nothing.

To use the keyboard, tab to the triangle, move between hexagons with the arrow keys, and press Enter or Space to choose one.

### Colors

Every model keeps one color, used for its hexagons, region label backing, key entry, table swatch, top model, and summary bar. The page assigns colors once from the Full Catalog, so checking creators, searching, or moving on the triangle never changes them.

- **Creator.** Each creator has a hue. xAI and SpaceXAI, Anthropic, Z AI and Z.ai, Alibaba, OpenAI, Moonshot AI and Kimi, Google, Meta, and DeepSeek each have a fixed hue spaced around the color wheel, so they keep their hue in every catalog. Other creators get one of the hues between those, chosen from the creator's name, so two smaller creators can share a hue.
- **Model family.** A family is the display name without the parenthetical that names its thinking level, so `GPT-5.6 Sol (high)` and `GPT-5.6 Sol (low)` share the family `GPT-5.6 Sol`, while `GPT-5.5 Instant (June 2026)` stays its own family. Each family gets one of 32 nearby shades of its creator's hue, which differ in hue, saturation, and lightness. The page visits every family in the Full Catalog in creator and name order and gives each the shade farthest from all the colors it has already handed out, so related families and creators that share a hue stay apart.
- **Thinking level.** The page reads the level from the catalog's `reasoning.label`, and from the display name when the catalog has none. It orders Off (also None or Non-reasoning) < Minimal < Low < Medium < High < Xhigh < Max. Within one family, a higher level is always darker. Reasoning, a level the catalog reports without an effort, is darker than Off. Reasoning and unrecognized or missing levels use the family's middle shade and are not ordered against the effort levels.

The page picks black or white text for each color, whichever reads better, and every color keeps at least a 4.5:1 contrast with its text. Colors are not globally unique: in a crowded catalog, some families can still look alike, and adding models to the catalog can change other families' shades.

### Top model

The card below the triangle starts with the top-ranked model for your current priorities: its name, creator, and actual Smart, Time, and Cost values from the catalog, each with the catalog's unit for that measure. It is the same model as the table's first row and follows the triangle as you click or drag. With no creator checked, it says so and shows no values.

A measure at zero weight, on the triangle's edge opposite its corner, does not affect Pareto domination or ranking. Its column stays visible.

### Creators

Below the top model, a collapsed **Creators** section lists every creator in the catalog alphabetically, each with a checkbox. All start checked. Its heading shows how many are checked, for example `3 of 9 selected`, so an active creator filter stays visible while the section is closed. **Select all** checks every creator and **Clear** unchecks them all.

Only checked creators' models compete. Unchecking a creator recomputes every hexagon's winner, the region colors, labels and key, the top model, the table, its caption, and the small-screen summary bar. A model from an unchecked creator never wins a hexagon and never appears in the table, even among dominated rows. Domination is judged among the checked creators' models only, so a model whose only dominators are unchecked joins the frontier.

The regret yardstick does not change. See [Ranking](#ranking).

With no creator checked, the hexagons turn a neutral grey, the key is empty, and the top model and the table say that no creators are checked instead of naming a model. The hash and dragging keep working.

The browser stores the selection in `localStorage` under `pareto-model-creators` as `{"selected": [...], "known": [...]}`: the checked creators and every creator the page knew when it saved. On load:

- With nothing stored, or anything unreadable, every creator is checked.
- A stored empty `selected` list stays empty.
- Stored creators that are no longer in the catalog are ignored.
- A creator missing from `known`, such as one added by a newer catalog, starts checked. A creator you unchecked stays unchecked.

### URL hash

The URL hash holds the internal allocation for the current priorities, for example `#s=7.25&t=3.25&c=1.5`. Share or bookmark the URL to return to those priorities.

The page starts at `7.25/3.25/1.5` (Smart/Time/Cost) when the hash is missing, is malformed, uses steps other than quarter units, or does not total 12.

### Ranked table

The table lists the frontier of the checked creators' models for the current priorities in rank order. The top row is the selected model. When you click a hexagon, the page clears the search box and highlights its winner in the top row. While a search is active, the filter can hide the rank 1 row.

Each Smart, Time, and Cost cell has a bar. A longer bar is better, scaled between the shown rows' minimum and maximum. Each Time value uses seconds below 60 seconds and minutes at or above.

**Show dominated** adds the checked creators' dominated variants after the frontier in grey. Each one names a checked creator's model that dominates it.

The search box filters rows by model name or creator as you type. It only hides table rows: unlike Creators, it never changes the triangle, the ranking, the top model, or the summary bar.

The caption above the table counts the frontier models and names the top one.

### Why this model?

Each row, on wide and small screens, has a **Why this model?** button that opens a detail row beneath it. The detail lists the row's weighted regret on Smart, Time, and Cost, the same numbers the ranking used. Regret has no units, and lower is better. The largest weighted regret is marked as the limiting trade-off, because it alone sets the rank. When two or three axes share that exact value, each is marked as tied. A measure the current priorities leave out is marked as not considered. A model with zero regret on every considered measure has no limiting trade-off.

A dominated row also names its dominator among the checked creators and lists how the dominator differs on each measure: the amount, the catalog's unit for that measure, whether it is higher or lower, and whether that is better or worse.

An open detail stays open by variant while you change your priorities or drag, and its numbers follow them. Unchecking a variant's creator closes its detail.

### Explainer

Below the table, a short explainer covers how the ranking works, what regret means, how each measure is defined, and where the data comes from. It fills in the catalog's metric definitions, methodology links, attribution, and terms link.

### Small screens

At 600px wide or narrower:

- The triangle spans the full width. A key below it lists each region label in the same order, with the model's color, in place of the labels on the triangle.
- A bar fixed to the bottom of the screen repeats the top-ranked model's name, creator, and Smart, Time, and Cost values, or says that no creators are checked.
- Each table row becomes a two-line card: rank, color, model, creator, and the Why this model? button, then Smart, Time, and Cost with their bars. The worst-regret column is hidden, but the detail still shows each weighted regret.

## Ranking

The page uses Reference Task Cost. The candidates are the checked creators' variants, and the regret reference is the Full Catalog.

1. **Pareto frontier.** For the measures that have power, the page removes every candidate that another candidate dominates. A variant dominates another when it is no worse on every powered measure and strictly better on at least one.
2. **Regret.** For each powered measure, a variant's regret is its gap from the best value on the Full Catalog frontier for the powered measures, whichever creators are checked. The page divides that gap by the interquartile range of that frontier's distinct values for that measure. Because this reference never depends on the creator selection, unchecking a creator removes rivals but leaves every remaining variant's regret unchanged. Dominated rows use the same reference. Smart and Cost use linear gaps. Time uses logarithmic gaps, so halving time counts the same at any speed.
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

The project code uses the MIT license. Benchmark data, derived AA rankings, and the Artificial Analysis logo are not relicensed under MIT; their source terms and attribution requirements continue to apply.
