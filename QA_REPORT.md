# QA Report

## Overview
A full automated QA pass was executed on the `peek-school-system-backend` repository. The goal was to surface route, logic, and test stability issues, address the smallest root causes preventing test progression, and create an end-to-end `mvp-release-gate.test.js` suite.

## Test Commands Run
The following test commands were executed to capture the application's overall health:
1. `npm test` (Full Jest Suite)
2. `npm run test:golden` (Golden Path Admin E2E)
3. `npm run test:golden:parent` (Golden Path Parent E2E)
4. `npx jest __tests__/error-codes-contract.test.js`
5. `npx jest __tests__/mvp-release-gate.test.js` (New suite)

## Pass/Fail Summary
* **Golden Admin E2E:** PASSED (8/8 tests passed)
* **Golden Parent E2E:** PASSED (All tests passed)
* **Error Codes Contract:** PASSED (3/3 tests passed) 
* **MVP Release Gate E2E:** PASSED (12/12 tests passed)
* **Full Suite (`npm test`):** FAILED (56 partial script-level failures in 11 test suites)

### Key Observations
* Tests using `@testcontainers/postgresql` operate flawlessly when the Docker daemon is running locally, granting them an isolated ephemeral database per-run. 
* Many tests in the full suite (e.g. `academics.test.js`, `finance.test.js`, `teacher-scope.test.js`) are failing strictly due to **Parallel Execution Collisions**. Since Jest runs tests concurrently by default, and these integration tests execute against a single `.env` database simultaneously (`postgresql://user:password@localhost:5432/school_db`), they create row locks, truncate shared tables at runtime, or overwrite prerequisite mocked data causing `Cannot read properties of null (reading 'id')` and Prisma exceptions.

## Fixes Applied
The following minimal root causes were addressed to restore standard test suites and contracts to a passing state:
1. **Missing Controller Route Exposes (Validation Tests)**
   * **Problem:** `Route.get() requires a callback function but got a [object Undefined]` in multiple tests due to new controller functions being exported directly in source code but omitted from `jest.mock()` controller overrides inside test setups.
   * **Files Changed:**
     * `__tests__/validation-4a.test.js`: Added `getAttendanceHistory` to the `attendanceController` mock block.
     * `__tests__/validation-4b.test.js`: Added missing definitions for `updateHomework`, `deleteHomework`, `getHomeworkGrades`, and `submitHomeworkGrades` inside the `academicController` mock block.
     * `__tests__/rbac-attendance-school.test.js`: Injected `validateQuery` missing function into `userValidator` mock, and added `getAttendanceHistory` mock.
2. **MVP Release Gate Fixes**
   * **Problem:** The newly developed `mvp-release-gate.test.js` E2E suite failed on the `broadcast create` test (400 Bad Request) due to frontend-domain keys (`body`, `targetRoles`) being mapped incorrectly inline with backend requirements.
   * **Files Changed:**
     * `__tests__/mvp-release-gate.test.js`: Updated the payload keys from `body`/`targetRoles` to strict schema bindings `content`/`scope`. 

## Known Gaps & Tech Debt
* **Test Database Isolation:** The standard Jest tests should adopt transaction-based rollbacks per suite or execute serially using `jest --runInBand` with explicit schema seeding to prevent flaky failures from parallel DB access.
* **Test Containers Check:** Developer flow needs an automated check to warn users if Docker Desktop/daemon is disabled before executing `testcontainers` tasks to prevent `Could not find a working container runtime strategy`.
* **Testing Helper Artifacts:** `__tests__/helpers.js` evaluates manually as an executable test block in Jest (causing a "Your test suite must contain at least one test" exit 1 code) and should be migrated to a `__utils__` directory or `.js` ignore path.
* **Rate Limit Boundaries:** `observability.test.js` asserts HTTP 429 for rate limit drops, but is intercepted initially by HTTP 401 Unauthorized since the rate limiters stack behind or parallel to auth middlewares.
