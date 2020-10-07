import * as core from "@actions/core";
import * as github from "@actions/github";
import * as yaml from "js-yaml";

interface MatchConfig {
  all?: string[];
  any?: string[];
}

type StringOrMatchConfig = string | MatchConfig;

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

    if (!anyMatches) {
      throw new Error(`The title ${title} must match \`[SW-123]: text\` format`);
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

function checkGlobs(
  changedFiles: string[],
  globs: StringOrMatchConfig[]
): boolean {
  for (const glob of globs) {
    core.debug(` checking pattern ${JSON.stringify(glob)}`);
  }
  return true;
}

run();
