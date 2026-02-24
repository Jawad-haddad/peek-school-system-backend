#!/usr/bin/env node
/**
 * scripts/check-mvp-contract.js
 *
 * MVP Contract Drift Detector.
 * Loads the swagger-jsdoc spec from route annotations and asserts that
 * every MVP endpoint exists with the required request/response fields.
 *
 * Usage:  node scripts/check-mvp-contract.js
 * Exit:   0 = pass, 1 = drift detected
 */

// Load env so PORT resolves in swaggerConfig
require('dotenv').config();

const swaggerSpec = require('../src/config/swaggerConfig');

// ── MVP Endpoint Manifest ─────────────────────────
// Each entry: [path, method, { requiredFields }]
const MVP_ENDPOINTS = [
    {
        path: '/api/auth/login',
        method: 'post',
        tag: 'Auth',
        requestRequired: ['email', 'password'],
        responseProperties: ['message', 'token', 'user'],
    },
    {
        path: '/api/auth/login/verify',
        method: 'post',
        tag: 'Auth',
        requestRequired: ['email', 'code'],
        responseProperties: ['message', 'token', 'user'],
    },
    {
        path: '/api/school/classes',
        method: 'get',
        tag: 'Classes',
        requestRequired: [],
        responseProperties: null, // array response — check items
        responseItemProperties: ['id', 'name', 'academicYearId', 'academicYear', 'defaultFee', '_count'],
    },
    {
        path: '/api/school/classes',
        method: 'post',
        tag: 'Classes',
        requestRequired: ['name', 'academicYearId'],
        responseProperties: ['id', 'name', 'academicYearId', 'academicYear', 'defaultFee', '_count'],
    },
    {
        path: '/api/school/classes/{classId}',
        method: 'put',
        tag: 'Classes',
        requestRequired: [], // all optional for update
        responseProperties: ['id', 'name', 'academicYearId', 'academicYear', 'defaultFee', '_count'],
    },
    {
        path: '/api/school/classes/{classId}',
        method: 'delete',
        tag: 'Classes',
        requestRequired: [],
        responseProperties: null, // 204 no content
    },
    {
        path: '/api/academics/classes/{classId}/students',
        method: 'get',
        tag: 'Academics',
        requestRequired: [],
        responseProperties: null,
        responseItemProperties: ['id', 'fullName'],
    },
    {
        path: '/api/attendance/bulk',
        method: 'post',
        tag: 'Attendance',
        requestRequired: ['classId', 'date', 'records'],
        responseProperties: ['savedCount', 'date', 'classId'],
    },
    {
        path: '/api/attendance/{classId}',
        method: 'get',
        tag: 'Attendance',
        requestRequired: [],
        responseProperties: null,
        responseItemProperties: ['studentId', 'fullName', 'status'],
    },
];

// ── Checks ────────────────────────────────────────
let errors = 0;
let passed = 0;

function fail(msg) {
    console.error(`  ❌ ${msg}`);
    errors++;
}

function pass(msg) {
    console.log(`  ✅ ${msg}`);
    passed++;
}

console.log('╔═══════════════════════════════════════════════╗');
console.log('║   PEEK MVP Contract Drift Check              ║');
console.log('╚═══════════════════════════════════════════════╝\n');

for (const ep of MVP_ENDPOINTS) {
    const label = `${ep.method.toUpperCase()} ${ep.path}`;
    console.log(`\n── ${label} ──`);

    // 1. Endpoint exists in spec
    const pathSpec = swaggerSpec.paths?.[ep.path];
    if (!pathSpec) {
        fail(`Path ${ep.path} not found in OpenAPI spec`);
        continue;
    }

    const methodSpec = pathSpec[ep.method];
    if (!methodSpec) {
        fail(`Method ${ep.method} not found for ${ep.path}`);
        continue;
    }
    pass('Endpoint documented');

    // 2. Check request body required fields
    if (ep.requestRequired.length > 0) {
        const reqBody = methodSpec.requestBody;
        if (!reqBody) {
            fail('Missing requestBody definition');
        } else {
            const schema = reqBody.content?.['application/json']?.schema;
            if (!schema) {
                fail('Missing request body schema');
            } else {
                const schemaRequired = schema.required || [];
                const schemaProps = Object.keys(schema.properties || {});
                for (const field of ep.requestRequired) {
                    if (!schemaProps.includes(field)) {
                        fail(`Request property "${field}" not documented`);
                    } else if (!schemaRequired.includes(field)) {
                        fail(`Request property "${field}" documented but not marked required`);
                    } else {
                        pass(`Request field "${field}" documented + required`);
                    }
                }
            }
        }
    }

    // 3. Check response schema (200 or 201)
    const successCode = ep.method === 'post' && ep.path.includes('/classes') && !ep.path.includes('students') && !ep.path.includes('bulk') && !ep.path.includes('login')
        ? '201'
        : ep.method === 'delete' ? '204' : '200';

    const responseSpec = methodSpec.responses?.[successCode];
    if (!responseSpec) {
        if (ep.responseProperties || ep.responseItemProperties) {
            fail(`Missing ${successCode} response definition`);
        }
        continue;
    }

    // For 204, no body expected
    if (successCode === '204') {
        pass(`${successCode} response documented`);
        continue;
    }

    // Check response properties
    if (ep.responseProperties) {
        const resSchema = responseSpec.content?.['application/json']?.schema;
        if (!resSchema) {
            fail(`Missing ${successCode} response schema`);
        } else {
            const resProps = Object.keys(resSchema.properties || {});
            for (const field of ep.responseProperties) {
                if (resProps.includes(field)) {
                    pass(`Response field "${field}" documented`);
                } else {
                    fail(`Response field "${field}" missing from ${successCode} schema`);
                }
            }
        }
    }

    // Check array item properties
    if (ep.responseItemProperties) {
        const resSchema = responseSpec.content?.['application/json']?.schema;
        if (!resSchema) {
            fail(`Missing ${successCode} response schema`);
        } else {
            const itemProps = Object.keys(resSchema.items?.properties || {});
            for (const field of ep.responseItemProperties) {
                if (itemProps.includes(field)) {
                    pass(`Response item field "${field}" documented`);
                } else {
                    fail(`Response item field "${field}" missing from array items schema`);
                }
            }
        }
    }
}

// ── Summary ──────────────────────────────────────
console.log('\n══════════════════════════════════════════════');
console.log(`  Passed: ${passed}  |  Failed: ${errors}`);
console.log('══════════════════════════════════════════════');

if (errors > 0) {
    console.error(`\n⚠️  ${errors} drift issue(s) detected. Fix before merging.\n`);
    process.exit(1);
} else {
    console.log('\n🎉 All MVP endpoints documented correctly. No drift.\n');
    process.exit(0);
}
