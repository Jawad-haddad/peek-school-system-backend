# Production Release Checklist

Before pushing a new container tag to production or initializing a fresh environment, ensure the following steps are validated:

## 1. Environment Configuration (`.env`)
Ensure these mandatory secrets are injected (do not use default/dev values):
- [ ] **`NODE_ENV`**: Set to `production`
- [ ] **`PORT`**: Defined (typically `3000`)
- [ ] **`DATABASE_URL`**: Verified connection string to the production Postgres instance
- [ ] **`JWT_SECRET`**: Rotated cryptographically secure randomized string
- [ ] **`CORS_ORIGIN`**: Set to exact frontend domain(s) (e.g. `https://school.example.com`)

*Optional/Features:*
- [ ] **`TWILIO_*`**: Populated for SMS features
- [ ] **`SMTP_*`**: Populated for email outbound
- [ ] **`FIREBASE_SERVICE_ACCOUNT`**: Valid JSON blob for push notifications

## 2. Database & Migrations
- [ ] **Backup:** Before triggering the orchestrator, capture a snapshot:
  ```bash
  pg_dump -U postgres -h db_host school_db > pre_deploy_snapshot_vX.sql
  ```
- [ ] **Migrations:** Ensure `npx prisma migrate deploy` succeeds. The provided `entrypoint.sh` executes this automatically within the container on boot.
- [ ] **Seeding:** Ensure `SEED_ON_START=true` is **NOT** active in production unless you are explicitly building a new volatile demo environment.

## 3. Rollback Strategy
If the deployment fundamentally fails `smoke:test`:
- [ ] Switch immediately to the previous Docker image tag in the orchestrator.
- [ ] If the Prisma migration was strictly forward-only and broke backward compatibility with the reverted image code, utilize the automated `pg_dump` captured prior to restore the database to its pre-migrated state.

## 4. Security & Observability Validation
- [ ] **CORS Restricted?**: `CORS_ORIGIN` lacks trailing slashes and wildcard `*`.
- [ ] **Auth Rate Limits Enabled?**: Ensure `loginLimiter` and `apiLimiter` are not disabled globally or inadvertently set to wide windows.
- [ ] **Pino Logging Active?**: The application should cleanly emit single JSON lines. No request bodies, passwords, or explicit error stack traces should appear in the Datadog / CloudWatch streams.
- [ ] **Request Tracking Enabled?**: API responses natively return an `x-request-id` header to consumers to trace bug-reports.

## 5. Deployment Completion
- [ ] Scale orchestrator / Bring up `docker-compose.prod.yml`.
- [ ] Run the CI smoke test suite explicitly targeting your deployment:
  ```bash
  SMOKE_BASE_URL=https://api.school.example.com npm run smoke:test
  ```
