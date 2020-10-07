import * as core from "@actions/core";
import * as github from "@actions/github";

const repoTokenInput = core.getInput("repo-token", { required: true });
const githubClient = new github.GitHub(repoTokenInput);

const titlePrefixes: string[] = core.getInput("prefixes", {
  required: true,
}).split("|");
const titleFallback: string = core.getInput("no-ticket", {
  required: true,
});
const onFailedRegexCreateReviewInput: boolean =
    core.getInput("on-failed-regex-create-review") === "true";
const onFailedRegexCommentInput: string = core.getInput(
    "on-failed-regex-comment"
);
const onTitleCorrectedCommentInput: string = core.getInput(
    "on-title-corrected-comment"
);
const onFailedRegexFailActionInput: boolean =
    core.getInput("on-failed-regex-fail-action") === "true";
const onFailedRegexRequestChanges: boolean =
    core.getInput("on-failed-regex-request-changes") === "true";

async function run(): Promise<void> {
  const githubContext = github.context;
  const pullRequest = githubContext.issue;

  const titleRegexInput = `\\[((${titlePrefixes.join("|")})\\-\\d+|${titleFallback})] .+`;
  const titleRegex = new RegExp(titleRegexInput);
  const title: string =
      (githubContext.payload.pull_request?.title as string) ?? "";

  const comment = onFailedRegexCommentInput.replace(
      "%formats%",
      [
        ...titlePrefixes.map(prefix => `${prefix}-123`),
          titleFallback
      ].map(
          input => `1. \`[${input}] text\``
      ).join('\n')
  );

  core.debug(`Title Regex: ${titleRegex.source}`);
  core.debug(`Title: ${title}`);

  const titleMatchesRegex: boolean = titleRegex.test(title);
  if (!titleMatchesRegex) {
    if (onFailedRegexCreateReviewInput) {
      createReview(comment, pullRequest);
    }
    if (onFailedRegexFailActionInput) {
      core.setFailed(comment);
    }
  } else {
    if (onFailedRegexCreateReviewInput) {
      await dismissReview(pullRequest);
    }
  }
}

function createReview(
    comment: string,
    pullRequest: { owner: string; repo: string; number: number }
) {
  void githubClient.pulls.createReview({
    owner: pullRequest.owner,
    repo: pullRequest.repo,
    pull_number: pullRequest.number,
    body: comment,
    event: onFailedRegexRequestChanges ? "REQUEST_CHANGES" : "COMMENT",
  });
}

async function dismissReview(pullRequest: {
  owner: string;
  repo: string;
  number: number;
}) {
  const reviews = await githubClient.pulls.listReviews({
    owner: pullRequest.owner,
    repo: pullRequest.repo,
    pull_number: pullRequest.number,
  });

  reviews.data.forEach((review) => {
    if (review.user.login == "github-actions[bot]") {
      void githubClient.pulls.dismissReview({
        owner: pullRequest.owner,
        repo: pullRequest.repo,
        pull_number: pullRequest.number,
        review_id: review.id,
        message: onTitleCorrectedCommentInput,
      });
    }
  });
}

run().catch((error) => {
  core.setFailed(error);
});