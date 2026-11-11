# Contributing

Use Node 22.18 or newer and pnpm 10. Run the same checks as CI before sending a change.

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm exec playwright install chromium --only-shell
corepack pnpm test:ui
```

The browser suite launches the built viewer and the traced notes app. The notes traffic generator runs for 60 seconds by default. Set `TRAFFIC_SECONDS` for a shorter local run.

Pack workspace packages with pnpm before checking an npm release. pnpm replaces workspace dependency references with versions in the tarball.

```sh
output="$(mktemp -d)"
for package in core analyzer tracer server viewer cli; do
  corepack pnpm --dir "packages/$package" pack --pack-destination "$output"
done
for archive in "$output"/*.tgz; do
  npm publish --dry-run "$archive"
done
```

Read [AGENTS.md](AGENTS.md) for workspace conventions and [docs/SPEC.md](docs/SPEC.md) for expected behavior.

## Stage an npm release

Run [Stage npm release](https://github.com/nahomkasa999/Graph-ai/actions/workflows/npm-stage.yml) on `main` after setting the `NPM_STAGE_TOKEN` repository secret. Use a granular npm token with stage-only write access to the `@nazs` scope. The workflow builds, tests, packs, and uploads all six packages for review. If it stops midway, use `start_at` to resume from the failed package.

In npm, open **Staged Packages** and approve the five support packages before approving `@nazs/flowlens`. Once the CLI version is public, run `npx @nazs/flowlens --version` to verify the release.
