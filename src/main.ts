import * as core from "@actions/core";
import * as github from "@actions/github";
import * as yaml from "js-yaml";
import {create} from "domain";

async function run() {
  try {
    const token = core.getInput("repo-token", { required: true });
    const configPath = core.getInput("configuration-path", { required: true });

    const prNumber = getPrNumber();
    if (!prNumber) {
      console.log("Could not get pull request number from context, exiting");
      return;
    }

    const client = new github.GitHub(token);

    const { data: pullRequest } = await client.pulls.get({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      pull_number: prNumber
    });

    const title = pullRequest.title;
    core.debug(`pr title ${title}`);

    const allowedFormats: string[] = await getAllowedFormats(
      client,
      configPath
    );

    core.debug(`allowed formats ${JSON.stringify(allowedFormats)}`);
    const anyMatches = allowedFormats.some(format => {
      return (new RegExp(format)).test(title);
    });

    // if (!anyMatches) {
    //   core.debug(`Running adding of check`);
    //   await createCheck(client,{
    //     status: 'in_progress',
    //     title: 'Title in invalid format',
    //     summary: `The title ${title} must match \`[SW-123]: text\` format.`,
    //     text: 'Additional text is always cool.',
    //   });
    // } else {
    //   await createCheck(client,{
    //     status: 'completed',
    //     title: 'Ready for review',
    //     summary: `The title ${title} is in appropriate format.`,
    //   });
    // }

    if (!anyMatches) {
      core.setFailed(`The title ${title} must match \`[SW-123]: text\` format`);
    }
  } catch (error) {
    core.error(error);
    core.setFailed(error.message);
  }
}

function getPrNumber(): number | undefined {
  const pullRequest = github.context.payload.pull_request;
  if (!pullRequest) {
    return undefined;
  }

  return pullRequest.number;
}

async function getAllowedFormats(
  client: github.GitHub,
  configurationPath: string
): Promise<string[]> {
  const configurationContent: string = await fetchContent(
    client,
    configurationPath
  );

  // loads (hopefully) a `{[label:string]: string | StringOrMatchConfig[]}`, but is `any`:
  const configObject: any = yaml.safeLoad(configurationContent);

  // transform `any` => `Map<string,StringOrMatchConfig[]>` or throw if yaml is malformed:
  return getAllowedFormatsFromObject(configObject);
}

async function fetchContent(
  client: github.GitHub,
  repoPath: string
): Promise<string> {
  const response: any = await client.repos.getContents({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    path: repoPath,
    ref: github.context.sha
  });

  return Buffer.from(response.data.content, response.data.encoding).toString();
}

function getAllowedFormatsFromObject(
  configObject: any
): string[] {
  const allowedFormats: string[] = []
  for (const label in configObject) {
    if (typeof configObject[label] === "string") {
      allowedFormats.push(configObject[label]);
    } else if (configObject[label] instanceof Array) {
      configObject[label].forEach(value => allowedFormats.push(value));
    } else {
      throw Error(
        `found unexpected type for label ${label} (should be string or array of globs)`
      );
    }
  }

  return allowedFormats;
}

async function createCheck(client: github.GitHub, values: any) {
  const ownership = {
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
  };
  let sha = github.context.sha;
  const { data } = await client.checks.create({
    ...ownership,
    head_sha: sha,
    name: 'PR Naming Checker',
    started_at: new Date().toISOString(),
    ...values,
  });
  core.debug(`Ran the check with ${JSON.stringify(values)}`);
  return data.id;
}

run();
