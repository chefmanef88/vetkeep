# Backup and restore runbook

## Managed production requirements

Before launch, enable the chosen Supabase backup/PITR capability and document the recovery point objective (RPO) and recovery time objective (RTO). A backup is not accepted until a restore drill succeeds.

## Local restore drill

1. Start local Supabase.
2. Reset and migrate the database.
3. Create synthetic fixtures.
4. Run `scripts/backup-local.sh`.
5. Stop the local project and remove the database volume only in a disposable environment.
6. Start a clean local project.
7. Run `scripts/restore-local.sh <backup-file>`.
8. Run database tests and fixture checks.
9. Record date, operator, duration, failures, and corrective actions.

## Production rules

- Never download production backups to personal devices.
- Encrypt exported backups with a managed key.
- Limit restore permission to named operators.
- Audit every backup export and restore.
- Restore to an isolated recovery project before any production cutover.
