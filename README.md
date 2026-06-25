# PreviewDrop Deploy Action

Deploy any branch to [PreviewDrop](https://previewdrop.dev) and get a live HTTPS URL in ~60 seconds — right inside your GitHub Actions workflow.

## Usage

```yaml
- name: Deploy preview
  id: preview
  uses: global-software-development-eu/previewdrop-deploy-action@v1
  with:
    api-key: ${{ secrets.PREVIEWDROP_API_KEY }}
```

That's it. The action detects the branch automatically from the pull request context.

## Full PR workflow example

```yaml
name: Preview Deploy

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  preview:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write

    steps:
      - name: Deploy preview
        id: preview
        uses: global-software-development-eu/previewdrop-deploy-action@v1
        with:
          api-key: ${{ secrets.PREVIEWDROP_API_KEY }}

      - name: Comment URL on PR
        if: steps.preview.outputs.status == 'ready'
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `### Preview ready\n\n**URL:** ${{ steps.preview.outputs.url }}\n\nDeployment: \`${{ steps.preview.outputs.deployment-id }}\``
            })
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `api-key` | Yes | — | Your PreviewDrop API key. Store as a repository secret. |
| `project` | No | auto-detected | PreviewDrop project slug. Omit if the repo has exactly one project. |
| `branch` | No | PR head / push ref | Branch to deploy. Detected automatically from the workflow context. |
| `wait` | No | `true` | Wait for the deployment to become ready before the step completes. |
| `timeout-seconds` | No | `300` | How long to wait (seconds) before giving up. |

## Outputs

| Output | Description |
|--------|-------------|
| `url` | Live HTTPS URL of the deployed preview. |
| `deployment-id` | PreviewDrop deployment ID. |
| `status` | `ready`, `failed`, or `timeout`. |

## Getting an API key

1. Sign up at [previewdrop.dev](https://previewdrop.dev)
2. Go to **Dashboard → Settings → API Keys**
3. Create a key and add it as a repository secret named `PREVIEWDROP_API_KEY`

## Step summary

When a deployment succeeds the action writes a step summary so the live URL is visible directly from the Actions run overview — no need to dig through logs.

## License

MIT
