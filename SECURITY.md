# Security Policy

## Supported Versions

slow.voyage is a continuously deployed static site. Security fixes are applied
to the `main` branch, which is what <https://slow.voyage> serves.

| Version                  | Supported |
| ------------------------ | --------- |
| `main` and the live site | Yes       |
| Older commits and forks  | No        |

## Reporting a Vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's
[private vulnerability reporting form](https://github.com/pulkitxm/slow.voyage/security/advisories/new)
so the report and any follow-up remain confidential.

Include the affected commit or page, browser and platform, reproduction steps,
expected and observed behavior, potential impact, and any suggested mitigation.
Remove credentials and personal data from the report.

The maintainer aims to acknowledge a complete report within three business days
and provide an initial assessment within seven business days. Remediation and
disclosure timing depend on severity and complexity. The reporter will receive
updates when the assessment changes materially.

Please allow time for a fix and coordinated disclosure before publishing
details.

## Safe Harbor

Good-faith research that follows this policy is considered authorized. Avoid
privacy violations, service disruption, destructive testing, social engineering,
and access beyond what is necessary to demonstrate the issue. The project will
not pursue action against researchers who follow these rules and make a
reasonable effort to avoid harm.

## Security Model

slow.voyage runs entirely in the browser. There is no application server,
account system, or backend storage. Preferences are kept in the browser's local
storage, and a service worker caches the bundled assets for offline play.

Reports are especially useful when they demonstrate script injection through
shared journey links or other URL parameters, a service worker that serves or
caches content it should not, cross-origin data exposure, or a weakness in the
build and deployment pipeline.
