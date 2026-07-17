# Main branch protection

Configure GitHub so that `main` requires:

- Pull requests with at least one reviewer.
- Passing Quality, Database security, Security scanning, and CodeQL checks.
- Conversation resolution before merge.
- Dismissal of stale approvals after new commits.
- Signed commits where operationally practical.
- No force pushes or branch deletion.
- Restricted direct pushes, including administrators except during a documented incident.

Database migrations and authentication/security changes require a second reviewer with database or security responsibility.
