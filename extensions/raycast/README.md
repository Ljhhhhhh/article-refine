# LinkProcessingAgent Raycast Extension

Save a URL into Obsidian from Raycast by invoking the local LinkProcessingAgent CLI.

## Prerequisites

From the repository root:

```bash
pnpm install
pnpm build
pnpm dev -- doctor
```

For the default source runtime, Raycast runs:

```bash
pnpm --dir /Users/guanmo/Documents/projects/linkProcessing exec tsx src/cli/index.ts process <url> --json
```

For the dist runtime, Raycast runs:

```bash
node /Users/guanmo/Documents/projects/linkProcessing/dist/cli/index.js process <url> --json
```

## Develop Locally

```bash
cd extensions/raycast
npm install
npm run dev
```

In Raycast, run **Save URL to Obsidian**, paste a URL, and press Enter.

## Preferences

- **Project Path**: absolute path to this repository.
- **Runtime**: use `source` during development; use `dist` after `pnpm build`.
- **Duplicate Policy**: maps to `--skip-existing`, `--update-existing`, or default create behavior.
- **Mirror to OSS**: when disabled, appends `--no-oss`.
- **Timeout Seconds**: max runtime for the CLI process.

## Troubleshooting

- If Raycast says `pnpm not found`, use the `dist` runtime after running `pnpm build`.
- If processing fails with configuration errors, run `pnpm dev -- doctor` from the repository root.
- If the dist runtime cannot find `dist/cli/index.js`, run `pnpm build`.
