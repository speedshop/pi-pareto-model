# Preset map builder

Build the standalone visualization from the active picker configuration:

```fish
npm run build:preset-map
open preset-map.html
```

The builder:

1. Loads `.pi/pareto-model-picker.json` (or the global config).
2. Loads its file, GitHub, or HTTP catalog source.
3. Uses the project's Pareto and ranking implementation.
4. Interpolates allocations between the `smart`, `fast`, and `cheap` presets.
5. Writes a self-contained `preset-map.html`.

The generated HTML is ignored by Git because the configured catalog may restrict redistribution.

## Options

```fish
npm run build:preset-map -- --grid-size 8
npm run build:preset-map -- --catalog /path/to/model-selection-catalog.json
npm run build:preset-map -- --config /path/to/pareto-model-picker.json
npm run build:preset-map -- --output /path/to/preset-map.html
npm run build:preset-map -- --pure-poles --output preset-map-full-power.html
```

`--pure-poles` sets each corner to all 12 power units on its named axis and zero on the other two axes.

Run `npm run build:preset-map -- --help` for all options.
