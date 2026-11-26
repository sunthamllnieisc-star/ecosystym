# EcoVis Grassland

EcoVis Grassland is a 3D browser sandbox for exploring how plants, grazing animals, and dry conditions change a meadow over time.

## Play locally

Download or clone this repository, then open `index.html` in a browser with WebGL 2. No build or installation is required.

- Scatter grass seeds, then drag the rain cloud onto the seed bed. The soil darkens and shoots emerge in your current view.
- Place cattle or sheep individually and watch the grass recover after grazing.
- Follow a windblown seed, identify sea buckthorn, and move through the timeline to see how the shrubs spread and exposed soil expands.
- Uproot shrubs individually or choose the landscape burn. Watch grass return to the cleared ground.

This project bundles Three.js. See [its license](vendor/THREE-LICENSE.txt).

## Design system and color theme

Open `design-system.html` for the interactive design system, including token swatches, component states, responsive layouts, accessibility targets, and screenshots from the game.

The game and design system share `tokens.css`, `components.css`, and `theme.js`. The theme selector supports Light, Dark, and System. Both pages share the saved selection when served from the same local or hosted origin.
