# npm Publishing and GitHub Actions Release Guide

This repository is set up to publish the package to npm using GitHub Actions and npm trusted publishing.

Current package name:

```json
"name": "@jatin_iyer09/agenthandoff"
```

Current publish workflow:

- Workflow file: `.github/workflows/publish.yml`
- Publish trigger: git tags matching `v*`
- Publish method: npm trusted publishing via GitHub Actions OIDC

## How the release flow works

1. Push code to `main`
2. Create a version tag such as `v0.1.2`
3. GitHub Actions runs the `test` job
4. If the ref is a tag starting with `v`, GitHub Actions runs the `publish` job
5. npm publishes the package from GitHub Actions

The workflow does not publish on every push to `main`. It only publishes on version tags.

## Why the publish job is skipped on GitHub

If you push only commits to `main`, GitHub Actions will show:

- `test`: ran
- `publish`: skipped

That is expected.

Reason:

The workflow contains this condition:

```yml
if: startsWith(github.ref, 'refs/tags/v')
```

So:

- push to `main` -> publish job is skipped
- push tag `v0.1.2` -> publish job runs

To trigger a real publish run:

```bash
npm version patch
git push origin main --follow-tags
```

That creates a new version commit and a tag like `v0.1.2`, which is what the workflow is waiting for.

## Why this setup uses trusted publishing

This repo is configured for npm trusted publishing instead of a long-lived `NPM_TOKEN`.

Benefits:

- No permanent publish token stored in GitHub secrets
- npm verifies the GitHub Actions workflow identity via OIDC
- Better security than token-based publishing
- Provenance support for public packages from public repositories

## One-time setup

### 1. Create and verify your npm account

If you have not used npm as a publisher before:

```bash
npm login
npm whoami
```

Make sure the npm account you log into is the one that should own `@jatin_iyer09/agenthandoff`.

### 2. First publish must be done manually

For a brand-new package, do the first publish from your machine:

```bash
npm ci
npm test
npm publish --access public
```

Why:

- The package must exist on npm before you can manage its package settings cleanly
- Trusted publisher setup is package-specific on npmjs.com

### 3. Configure trusted publishing on npmjs.com

After the first publish succeeds:

1. Open the package page on npmjs.com
2. Go to `Settings`
3. Find `Trusted publishing`
4. Add a GitHub Actions trusted publisher with:

```text
Organization or user: aceandro2812
Repository: AgentHandoff
Workflow filename: publish.yml
```

Notes:

- Enter only the workflow filename, not the full path
- The filename must match exactly: `publish.yml`
- The repository must remain a GitHub-hosted Actions workflow, not a self-hosted runner setup

### 4. Remove old token-based publishing

This workflow no longer uses `NPM_TOKEN`.

After trusted publishing is confirmed working:

- Delete the `NPM_TOKEN` repository secret if it exists
- Do not add token-based npm auth back into the workflow unless you intentionally want to revert

## Release process

Once the package exists on npm and trusted publishing is configured, release like this:

```bash
npm version patch
git push origin main --follow-tags
```

Examples:

```bash
npm version patch   # 0.1.1 -> 0.1.2
npm version minor   # 0.1.1 -> 0.2.0
npm version major   # 0.1.1 -> 1.0.0
git push origin main --follow-tags
```

What this does:

- Updates `package.json`
- Updates `package-lock.json`
- Creates a git commit
- Creates a git tag like `v0.1.2`
- Pushes the branch and tag
- Triggers the publish workflow

## Current GitHub Actions behavior

The publish workflow currently does this:

1. Runs on pushes to `main`, `master`, and tags matching `v*`
2. Always runs the `test` job
3. Only runs the `publish` job when `github.ref` starts with `refs/tags/v`
4. Uses Node `24`
5. Runs:

```bash
npm ci
npm run build
npm test
npm publish --access public
```

## Important constraints

### The package version must be new

npm will reject publishing if the exact package name and version already exist.

That means every release must have a new version in `package.json`.

### Do not tag before npm is ready

Do not create a `v*` tag until both of these are true:

- The package has already been published manually at least once
- Trusted publishing has been configured on npmjs.com

If you tag earlier, GitHub Actions will try to publish and the job will fail.

### Scoped public package needs `--access public`

Because the package is scoped:

```json
"name": "@jatin_iyer09/agenthandoff"
```

publishing should use:

```bash
npm publish --access public
```

That is already reflected in the workflow.

## Troubleshooting

### Publish job was skipped

Cause:

- You pushed to `main` without creating a `v*` tag

Fix:

```bash
npm version patch
git push origin main --follow-tags
```

### Publish job ran but npm rejected authentication

Cause:

- Trusted publisher is not configured correctly on npmjs.com
- Workflow filename does not exactly match `publish.yml`

Fix:

- Recheck npm package settings
- Recheck GitHub user/org, repository, and workflow filename

### Publish job ran but npm rejected the version

Cause:

- That package version was already published

Fix:

```bash
npm version patch
git push origin main --follow-tags
```

### First publish failed

Possible causes:

- npm account not logged in
- package name unavailable
- package scope/account mismatch

Checks:

```bash
npm whoami
npm view @jatin_iyer09/agenthandoff version
```

## Recommended manual verification after a release

After a successful publish:

1. Open the GitHub Actions run and confirm `publish` passed
2. Open the npm package page and confirm the new version appears
3. Verify install from a fresh shell:

```bash
npm view @jatin_iyer09/agenthandoff version
```

## Files involved

- `.github/workflows/publish.yml`
- `package.json`
- `package-lock.json`

## Current status

This repository is already prepared for trusted publishing in GitHub Actions.

What still must be done manually outside the repo:

1. First npm publish
2. Trusted publisher configuration on npmjs.com
3. First tag-based release after trusted publishing is connected
