// scripts/smoke-test.js
const http = require('http');
const https = require('https');

// Configurable base URL for CI environments
const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const adapter = BASE_URL.startsWith('https') ? https : http;

console.log(`\n🚀 Starting Production Smoke Tests against: ${BASE_URL}\n`);

// Helper to wrap native HTTP requests into Promises
function request(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
            }
        };

        const req = adapter.request(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null, headers: res.headers });
                } catch (e) {
                    resolve({ status: res.statusCode, body: data, headers: res.headers });
                }
            });
        });

        req.on('error', (e) => reject(e));

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function runSmokeSuite() {
    let passed = 0;
    let failed = 0;

    function assert(condition, message) {
        if (condition) {
            console.log(`✅ PASS: ${message}`);
            passed++;
        } else {
            console.error(`❌ FAIL: ${message}`);
            failed++;
        }
    }

    try {
        // ---------------------------------------------------------
        // 1. Healthcheck Endpoint
        // ---------------------------------------------------------
        const health = await request('GET', '/api/health');
        assert(health.status === 200, `Health endpoint returned ${health.status}`);
        assert(health.body?.success === true || health.body?.status === 'ok' || health.body?.data?.status === 'ok', 'Health endpoint payload confirms status: ok');

        // ---------------------------------------------------------
        // 2. Auth Endpoint / Validation Integrity
        // ---------------------------------------------------------
        // Intentional bad payload (missing password)
        const loginFail = await request('POST', '/api/auth/login', { email: "notanemail" });
        assert(loginFail.status === 400, `Login validation correctly blocked payload with status ${loginFail.status}`);
        assert(loginFail.body?.error?.code === 'VALIDATION_ERROR', 'Error payload cleanly formatted Zod VALIDATION_ERROR');

        // Ensure production stack traces are hidden from the user
        assert(!loginFail.body?.error?.details?.stack, 'Stack traces are successfully truncated from client visibility');

        // Ensure Request-ID tracing works
        assert(loginFail.headers['x-request-id'] !== undefined, `x-request-id header found: ${loginFail.headers['x-request-id']}`);

        // ---------------------------------------------------------
        // 3. Optional Seed Testing
        // ---------------------------------------------------------
        if (process.env.SEED_ON_START === 'true') {
            const loginSeed = await request('POST', '/api/auth/login', { email: 'admin@school.com', password: 'password123' });
            assert(loginSeed.status === 200, `Seed admin authenticated successfully with 200 OK`);
            assert(loginSeed.body?.data?.token !== undefined, 'Admin login provided a JWT token');
        } else {
            console.log(`⚠️ SKIP: Seed verification bypassed (SEED_ON_START != true)`);
        }

        // ---------------------------------------------------------
        // Summary
        // ---------------------------------------------------------
        console.log(`\n============================`);
        console.log(`Smoke Test Results: ${passed} Passed | ${failed} Failed`);
        console.log(`============================\n`);

        if (failed > 0) {
            process.exit(1);
        }

        process.exit(0);

    } catch (error) {
        console.error(`\n🔥 FATAL: Smoke test pipeline crashed completely. Is the server running at ${BASE_URL}?`);
        console.error(`Error: ${error.message}\n`);
        process.exit(1);
    }
}

runSmokeSuite();
