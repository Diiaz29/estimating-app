# SpotOnBid working and publishing agreements

## Project

- Use this Desktop checkout: `C:/Users/brandon.diaz/Desktop/estimating-app`. The copy under Documents/GitHub is older. Preserve existing user changes.
- Repository: `Diiaz29/estimating-app`. Default branch: `main`. Hosting: existing Vercel project `estimating-app` under `zaid-millwork`; verify the configured production branch and domain before a release.
- Read `CLAUDE.md` for architecture and business rules, and `PRODUCT.md` / `DESIGN.md` when available for interface work.

## Work with the owner

- The owner is not a developer. Carry out technical steps yourself instead of giving terminal commands or asking the owner to create or merge pull requests.
- Finish requested changes, run appropriate checks, and show a working preview before asking for production approval.
- Handle commit, feature-branch push, draft pull request, and preview verification as preparation. Keep unrelated files and secrets out of release commits. Attach created pull requests to the Codex chat.
- Ask once: "Publish this version to the live app?" Give a short explanation of the changes and any actual blocker. Wait for the owner's answer before merging or promoting to production.
- "Publish this version", "push this live", "deploy to the real app", or an affirmative answer to that question authorizes completing the production release. Do not request separate confirmation for each Git or deployment step covered by that approval.
- Approval applies to the reviewed version. If materially different changes become necessary, show them before publishing.

## Release workflow

1. Inspect the actual checkout and branch; preserve uncommitted work. Run `npm.cmd run build`, `npm.cmd test`, and relevant lint/browser checks. Resolve failures caused by the changes.
2. Commit the intended source files and push a feature branch. Create or update the pull request into the confirmed production branch. Check Vercel's preview status; investigate failures rather than merging a failed build.
3. After the owner's production approval, merge using the connected GitHub tools, preserving repository protections. Do not force-push or bypass failing required checks.
4. Verify that Vercel finishes the production deployment for the merged commit, then open the confirmed live domain and check the changed flow without modifying real business records.
5. Report the live URL and verified result. Do not call a push or merge a successful deployment until the hosting result has been checked.
- Use existing connected GitHub/Vercel access. If authentication is missing, explain the exact account or team needed and guide a one-time sign-in; never ask the owner to paste tokens into chat.
- A frontend release does not deploy Supabase functions or migrations. Include backend deployment only when it is part of the reviewed change and covered by the owner's release approval; preserve existing data and access rules.

## Setup state (2026-09-30)

- Git push and the connected GitHub repository permissions are verified.
- Current frontend commit: `6256ac2eeac5075713a10db96e1874aa811807b7`, pushed on `codex/zaid-design-preview`.
- The initial Vercel build failed because `src/lib/resetPassword.test.ts` imported an untracked function handler. Include the reset-user-password source in Git so the remote type check has its dependency; function deployment remains a separate action. Check the newest preview result before production publication.
- The Vercel connector currently cannot access `zaid-millwork` (`team_KZMWXiRXOgDyIvQYmeMfOgoN`), but the owner is signed into that workspace in the Codex browser. Use the authenticated browser for deployment checks if connector access is unavailable.
- No production merge or deployment is authorized merely by requesting this setup. Wait for approval of the concrete release.
