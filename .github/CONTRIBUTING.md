# Contributing to Vellum

## Changesets

We use [Changesets](https://github.com/changesets/changesets) for version management.

### Adding a Changeset

When making changes that should be released:

1. Run `pnpm changeset`
2. Select affected packages
3. Choose bump type (patch/minor/major)
4. Write a summary

### Release Process

1. PRs with changesets are automatically tracked
2. When merged to main, a "Release" PR is created
3. Merging the Release PR publishes to npm

### Package Distribution

| Method | Command |
|--------|---------|
| npm | `npm install -g vellum` |
| npx | `npx vellum` |
| pnpm | `pnpm add -g vellum` |
| Homebrew | `brew install your-org/vellum/vellum` |
