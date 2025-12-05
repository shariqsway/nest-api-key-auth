# GitHub Actions Workflows

## CI Workflow
Runs on every push and pull request to main/develop branches:
- Linting
- Testing
- Building

## Release Workflow
Publishes the package to npm with provenance attestation.

### Publishing via GitHub Release
1. Create a new release on GitHub
2. Tag the release (e.g., `v0.1.1`)
3. The workflow will automatically publish to npm with provenance

### Publishing via Workflow Dispatch
1. Go to Actions → Release → Run workflow
2. Enter the version number (e.g., `0.1.1`)
3. The workflow will:
   - Update package.json version
   - Commit and push the change
   - Publish to npm with provenance

### Required Secrets
Add `NPM_TOKEN` to your GitHub repository secrets:
1. Go to Settings → Secrets and variables → Actions
2. Add a new secret named `NPM_TOKEN`
3. Get your token from: https://www.npmjs.com/settings/YOUR_USERNAME/tokens
4. Create a token with "Automation" type for publishing

