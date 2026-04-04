# GitHub and npm Release Skill

Use this guide when an AI agent needs to safely publish this repository to GitHub and npm.

This is not a generic release guide. It is tailored to this repository's current setup.

## Purpose

This repository publishes to npm through GitHub Actions.

Current assumptions:

- default branch: `main`
- publish workflow: `.github/workflows/publish.yml`
- publish trigger: git tags matching `v*`
- npm package name: `@jatin_iyer09/agenthandoff`
- publish mode: npm trusted publishing via GitHub Actions
- known-good published tag: `v0.1.4`

## Core rule

Pushing code to `main` is not enough to publish.

The GitHub Actions `publish` job runs only when:

- the ref is a tag
- the tag starts with `v`

Examples:

- `v0.1.2` -> publish runs
- `0.1.2` -> publish does not run
- `release-0.1.2` -> publish does not run
- plain push to `main` -> publish is skipped

## Preconditions before any release

Before creating a release, verify all of these:

1. The package has already been published manually at least once on npm
2. npm trusted publisher has been configured on npmjs.com for:
   - GitHub user/org: `aceandro2812`
   - Repository: `AgentHandoff`
   - Workflow filename: `publish.yml`
3. The working tree is clean except for intentional release files
4. `package.json` and `package-lock.json` are in sync
5. Tests pass
6. `package.json` includes repository metadata for provenance verification

Required metadata:

```json
"repository": {
  "type": "git",
  "url": "https://github.com/aceandro2812/AgentHandoff"
}
```

## Safe release workflow

Preferred release flow:

```bash
npm ci
npm test
npm version patch
git push origin main --follow-tags
```

This is the default release path unless there is a specific reason to do a manual version bump.

## What `npm version patch` does

`npm version patch`:

- increments the version in `package.json`
- updates `package-lock.json`
- creates a git commit
- creates a matching git tag like `v0.1.2`

After that, the push command:

```bash
git push origin main --follow-tags
```

pushes:

- the commit to `main`
- the new tag to GitHub

That tag is what triggers the npm publish workflow.

## Manual release workflow

Use this only if `npm version` cannot be used.

```bash
git add package.json package-lock.json
git commit -m "chore: release v0.1.2"
git tag v0.1.2
git push origin main
git push origin v0.1.2
```

Rules:

- The package version must be `0.1.2`
- The tag must be `v0.1.2`
- The commit and tag must describe the same release

## Verification checklist before pushing

Run these checks:

```bash
git status --short
npm ci
npm test
node -p "require('./package.json').version"
```

Confirm:

- no unrelated files are staged
- test suite passes
- package version is the one you intend to release

## Verification checklist after pushing

After `git push origin main --follow-tags`:

1. Open GitHub Actions
2. Confirm the `test` job passed
3. Confirm the `publish` job ran and was not skipped
4. Confirm the `publish` job passed
5. Verify npm shows the new version:

```bash
npm view @jatin_iyer09/agenthandoff version
```

## Common mistakes to avoid

### Mistake 1: pushing only `main`

Example:

```bash
git push origin main
```

Result:

- `test` runs
- `publish` is skipped

Why:

- no `v*` tag was pushed

### Mistake 2: changing version without tagging

Example:

- `package.json` says `0.1.2`
- no `v0.1.2` tag exists

Result:

- no npm publish trigger

### Mistake 3: tag and version do not match

Example:

- `package.json` version: `0.1.2`
- tag: `v0.1.3`

Result:

- confusing release state
- hard to audit

Always keep these aligned.

### Mistake 4: tagging before npm trusted publisher is configured

Result:

- workflow runs
- npm publish fails

Do not create release tags until npm setup is complete.

### Mistake 5: missing repository metadata in `package.json`

Result:

- GitHub Actions publish runs
- npm rejects the publish during provenance verification

Typical error:

```text
Error verifying sigstore provenance bundle
Failed to validate repository information
```

Fix:

- add a correct `repository.url` pointing at `https://github.com/aceandro2812/AgentHandoff`
- create a new patch release
- push the new `v*` tag

## When publish is skipped

If GitHub shows `publish` skipped, check:

1. Was the workflow triggered by a normal push to `main`?
2. Was a tag created locally but never pushed?
3. Does the tag begin with `v`?

Useful commands:

```bash
git tag
git show v0.1.2
git push origin v0.1.2
```

## When publish fails

Check these in order:

1. trusted publisher exists on npmjs.com
2. workflow filename in npm matches `publish.yml`
3. package version is new
4. package name is correct
5. `package.json` contains correct repository metadata
6. GitHub Actions run is on the tag ref, not just `main`

## Repository-specific files involved

- `.github/workflows/publish.yml`
- `package.json`
- `package-lock.json`
- `docs/NPM_PUBLISHING.md`

## Recommended agent behavior

If asked to release:

1. Inspect `git status`
2. Inspect `package.json` version
3. Verify npm/publish prerequisites are satisfied
4. Prefer `npm version patch`
5. Push with `git push origin main --follow-tags`
6. Report whether the publish job should run or be skipped

If asked why publishing did not happen:

1. Check whether a `v*` tag was pushed
2. Check whether GitHub Actions ran on `refs/tags/...`
3. Explain that pushes to `main` alone do not publish
