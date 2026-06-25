import * as core from '@actions/core';
import * as github from '@actions/github';

const API_BASE = 'https://api.previewdrop.dev';
const POLL_INTERVAL_MS = 5_000;

async function apiFetch(path: string, apiKey: string, options?: RequestInit): Promise<Response> {
  const url = `${API_BASE}${path}`;
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'previewdrop-deploy-action/1',
      ...(options?.headers as Record<string, string> | undefined),
    },
  });
}

async function triggerDeploy(
  apiKey: string,
  project: string | undefined,
  branch: string,
): Promise<{ deploymentId: string; projectId: string }> {
  const body: Record<string, string> = { branch };
  if (project) body.project = project;

  const res = await apiFetch('/v1/deployments', apiKey, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to trigger deployment (${res.status}): ${text}`);
  }

  const data = await res.json() as { deployment?: { id: string; project_id: string }; error?: string };
  if (!data.deployment?.id) {
    throw new Error(data.error ?? 'PreviewDrop API returned no deployment ID');
  }
  return { deploymentId: data.deployment.id, projectId: data.deployment.project_id };
}

async function pollDeployment(
  apiKey: string,
  deploymentId: string,
  timeoutMs: number,
): Promise<{ status: string; url: string | null }> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const res = await apiFetch(`/v1/deployments/${deploymentId}`, apiKey);
    if (res.ok) {
      const data = await res.json() as { deployment?: { status: string; url: string | null } };
      const dep = data.deployment;
      if (dep) {
        if (dep.status === 'ready') {
          return { status: 'ready', url: dep.url };
        }
        if (dep.status === 'failed') {
          return { status: 'failed', url: null };
        }
      }
    }
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  return { status: 'timeout', url: null };
}

async function run(): Promise<void> {
  const apiKey = core.getInput('api-key', { required: true });
  const project = core.getInput('project') || undefined;
  const timeoutSeconds = parseInt(core.getInput('timeout-seconds') || '300', 10);
  const shouldWait = core.getInput('wait') !== 'false';

  // Resolve branch: explicit input → PR head ref → push ref → default branch name
  let branch = core.getInput('branch');
  if (!branch) {
    const ctx = github.context;
    branch =
      ctx.payload.pull_request?.head?.ref ??
      ctx.ref.replace('refs/heads/', '') ??
      'main';
  }

  core.info(`Deploying branch "${branch}" to PreviewDrop…`);

  let deploymentId: string;
  let projectId: string;
  try {
    ({ deploymentId, projectId } = await triggerDeploy(apiKey, project, branch));
  } catch (err) {
    core.setFailed(err instanceof Error ? err.message : String(err));
    return;
  }

  core.info(`Deployment queued: ${deploymentId} (project: ${projectId})`);
  core.setOutput('deployment-id', deploymentId);

  const dashboardUrl = `https://app.previewdrop.dev/dashboard/deployments/${deploymentId}`;
  core.info(`Track progress: ${dashboardUrl}`);

  if (!shouldWait) {
    core.setOutput('status', 'queued');
    core.info('wait=false — not polling for readiness.');
    return;
  }

  core.info(`Waiting up to ${timeoutSeconds}s for deployment to become ready…`);
  const { status, url } = await pollDeployment(apiKey, deploymentId, timeoutSeconds * 1000);

  core.setOutput('status', status);

  if (status === 'ready' && url) {
    core.setOutput('url', url);
    core.info(`Preview ready: ${url}`);

    // Add a step summary so the URL is visible in the workflow run overview
    core.summary
      .addHeading('PreviewDrop Preview Ready')
      .addRaw(`**URL:** [${url}](${url})\n`)
      .addRaw(`**Branch:** \`${branch}\`\n`)
      .addRaw(`**Deployment:** [${deploymentId}](${dashboardUrl})`)
      .write()
      .catch(() => {}); // non-fatal
  } else if (status === 'failed') {
    core.setFailed(`Deployment ${deploymentId} failed. Check logs: ${dashboardUrl}`);
  } else {
    core.warning(`Deployment ${deploymentId} timed out after ${timeoutSeconds}s. Check logs: ${dashboardUrl}`);
    core.setOutput('url', '');
  }
}

run();
