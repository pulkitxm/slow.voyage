# Project workflow

- Keep development, verification, previews, and checkpoint commits local.
- Create checkpoint commits with local Git. Do not push or create remote commits.
- Do not add CI/CD workflows or deploy to external hosting.
- Use Bun for package management and project commands.
- Keep the latest development server running on port 3002.
- Retain the pre-commit checks for formatting, strict YAML, types, and tests.
- Keep browser captures and recordings in the ignored `.review/` directory.
- Use Rea for repeatable browser verification and reference comparisons.
- Resolve filesystem locations from the project, configuration, or portable discovery. Do not hardcode machine-specific paths.
- Do not add code comments or attribution to tooling.
- Do not use the Unicode em dash character.
