# Forking and Upstream Sync

This repository is set up to work as a long-lived fork of `pingdotgg/t3code`.

## Remotes

- `origin`: your fork
- `upstream`: `https://github.com/pingdotgg/t3code.git`

Current expected layout:

```bash
git remote -v
```

## Day-to-day model

- Keep your fork's `main` branch as the integration branch for your customizations.
- Branch feature work from your fork's `main`.
- Regularly merge the latest upstream `main` into your fork's `main`.

## Syncing upstream

Use the repo script:

```bash
bun run sync:upstream
```

What it does:

1. Verifies the working tree is clean.
2. Fetches `upstream` with tags and pruning.
3. Checks out `main` if needed.
4. Merges `upstream/main` into local `main`.
5. Pushes the result to `origin/main`.

If you prefer rebasing instead of merging:

```bash
node scripts/sync-upstream.mjs --rebase
```

If you want to inspect the result locally before pushing:

```bash
node scripts/sync-upstream.mjs --no-push
```

## Releases and desktop auto-update

The desktop artifact build script derives GitHub release publishing metadata from the active repository slug:

- `T3CODE_DESKTOP_UPDATE_REPOSITORY`, if set
- otherwise `GITHUB_REPOSITORY`

That means releases built from your fork publish updater metadata pointing at your fork automatically. If your fork ships releases from `owner/repo`, packaged desktop builds will check that same `owner/repo` for updates.

## GitHub setup still required on the fork

Forking preserves the workflow files, but publishing still depends on fork-specific settings and secrets.

Required items for the full release pipeline:

- GitHub Actions enabled for the fork
- npm trusted publisher configured for `.github/workflows/release.yml`
- GitHub Actions secrets for release finalization:
  - `RELEASE_APP_ID`
  - `RELEASE_APP_PRIVATE_KEY`
- Apple signing secrets for signed macOS releases:
  - `CSC_LINK`
  - `CSC_KEY_PASSWORD`
  - `APPLE_API_KEY`
  - `APPLE_API_KEY_ID`
  - `APPLE_API_ISSUER`
- Azure Trusted Signing secrets for signed Windows releases:
  - `AZURE_TENANT_ID`
  - `AZURE_CLIENT_ID`
  - `AZURE_CLIENT_SECRET`
  - `AZURE_TRUSTED_SIGNING_ENDPOINT`
  - `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`
  - `AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME`
  - `AZURE_TRUSTED_SIGNING_PUBLISHER_NAME`

Unsigned releases can still be produced without the signing secrets, but notarization and code signing will be skipped.

## Fresh fork note

On a brand-new fork, GitHub may not list workflow definitions immediately even though the files exist on `main`. If the Actions tab looks empty, push a commit to the fork's `main` branch and let GitHub re-index the workflows.
