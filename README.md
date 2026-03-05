# UniRTOS — VS Code Extension

UniRTOS is a small VS Code extension that provides a dedicated activity bar view with a `Commands` tree for common device workflows (Build, Flash, Monitor).

## Features
- Activity bar container **UniRTOS** with a `Commands` view
- Example commands: Build, Flash, Monitor (placeholders — wire to tooling as needed)

## Development
- The extension is authored in TypeScript under `src/` and compiled to `out/`.
- Press F5 to run the Extension Development Host — the workspace is configured so F5 runs a preLaunch `compile` task automatically.
- For continuous development, run the `watch` task (Run Task → `watch`) to rebuild on edits.

Commands / tasks configured:

- `npm run compile` — compile once
- `npm run watch` — continuous compile (background)

VS Code tasks and launch are defined in `.vscode/tasks.json` and `.vscode/launch.json`.

## License
See the `LICENSE` file.
