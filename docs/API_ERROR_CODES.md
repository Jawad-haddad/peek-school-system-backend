# API Error Codes

Canonical error codes returned by the API. All error responses follow the envelope:

```json
{ "success": false, "error": { "message": "...", "code": "CODE" } }
```

## Authentication (401)

| Code | Meaning |
|------|---------|
| `UNAUTHORIZED` | Missing, invalid, or expired token |
| `INVALID_CREDENTIALS` | Wrong email or password |
| `INVALID_2FA_CODE` | Wrong or expired 2FA code |

## Authorization (403)

| Code | Meaning |
|------|---------|
| `FORBIDDEN_ROLE` | User role not in the allowed list |
| `FORBIDDEN_NO_SCHOOL` | User is not assigned to any school |
| `FORBIDDEN_PARENT` | Parent tried to access another parent's child |
| `TENANT_FORBIDDEN` | Resource belongs to a different school |
| `TEACHER_NOT_ASSIGNED` | Teacher not assigned to the target class/homework |
| `USER_DISABLED` | Account is deactivated |

## Validation (400)

| Code | Meaning |
|------|---------|
| `VALIDATION_ERROR` | Request body/query failed schema validation |

## Not Found (404)

| Code | Meaning |
|------|---------|
| `NOT_FOUND` | Requested resource does not exist |

## Conflict (409)

| Code | Meaning |
|------|---------|
| `CONFLICT` | Business-rule conflict (e.g. invoice already paid) |
| `EMAIL_ALREADY_EXISTS` | Duplicate email on registration |
| `UNIQUE_CONSTRAINT` | Generic unique constraint violation |

## Server (500)

| Code | Meaning |
|------|---------|
| `SERVER_ERROR` | Unexpected server-side failure |
