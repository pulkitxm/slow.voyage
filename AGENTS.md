# Project workflow

- Keep development and verification local, with checkpoint commits published to GitHub.
- Create and publish future checkpoint commits through Pukbot, then synchronize the local branch.
- Deploy only through the `Pages` GitHub Actions workflow and verify production after publishing updates.
- Do not add other CI workflows unless requested.
- Use Bun for package management and project commands.
- Keep the latest development server running on port 3002.
- Retain the pre-commit checks for formatting, strict YAML, types, and tests.
- Keep browser captures and recordings in the ignored `.review/` directory.
- Use Rea for repeatable browser verification and reference comparisons.
- Resolve filesystem locations from the project, configuration, or portable discovery. Do not hardcode machine-specific paths.
- Do not add code comments or attribution to tooling.
- Do not use the Unicode em dash character.
