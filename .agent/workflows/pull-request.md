---
description: Workflow for Git and Github
---

We use a variant of the [Github Flow](https://docs.github.com/en/get-started/using-github/github-flow) workflow to manage Git for the project.

### Expectations
- The `main` branch is always deployable.
- All threads of work on the project are documented in Github issues.  Issues are created in advance to capture defects or enhancments; or created to document work done.
- Branches are named with a prefix that represents the broad theme of the branch and the primary issue number, either `feature/` or `fix/` followed the number.  (In the case that a PR resolves multiple issues, the number of the most relevant issue is adequate in the branch name.)
- All incremental work is done on feature branches named for the theme of the work and referencing.
- When work is ready for review, a pull request should be created and reference the issue or issues related to the work using the appropriate keyword.  (See [how to reference issues from a PR](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue).).

### PR Reviews and Approvals
- PR reviews will be performed either by another agent (e.g., a different AI coding agent or Github copilot) or by a human.
- Updates to address feedback on the PR may be requested by a human.
- All PR approvals will be provided by a human.