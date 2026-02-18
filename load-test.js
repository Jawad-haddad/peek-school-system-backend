
// load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

// --- Static IDs from a clean seed ---
// IMPORTANT: You MUST update these after running `npx prisma migrate reset --force`
const STUDENT_ID = "db12867f-3d95-470b-89ad-2135ffed8aa1";
const SANDWICH_ID = "a90e3cfb-2af6-4fe2-9788-c88b475a12cf";

export const options = {
  stages: [
    { duration: '1m', target: 100 },  // Ramp-up to 100 users
    { duration: '2m', target: 100 },  // Stay at 100 users
    { duration: '1m', target: 300 },  // Ramp-up to 300 users
    { duration: '2m', target: 300 },  // Stay at 300 users
    { duration: '30s', target: 0 },    // Ramp-down
  ],
  thresholds: {
    'http_req_failed': ['rate<0.05'], // http errors should be less than 5%
    'http_req_duration': ['p(95)<1000'], // 95% of requests must complete below 1 second
  },
};

// --- Setup Stage: Runs ONCE before all tests ---
export function setup() {
  console.log('Setup stage: Logging in user types...');
  const parentToken = login('jawad.parent@email.com', 'parentpassword');
  const adminToken = login('principal@almustaqbal.com', 'principalpassword');
  if(parentToken) {
    http.post('http://app:3000/api/finance/wallet/topup', JSON.stringify({ studentId: STUDENT_ID, amount: 5000 }), { headers: { 'Authorization': `Bearer ${parentToken}`, 'Content-Type': 'application/json' } });
  }
  console.log('Setup stage: Tokens acquired and wallet funded.');
  return { parentToken, adminToken };
}

function login(email, password) {
  const res = http.post('http://app:3000/api/users/login', JSON.stringify({ email, password }), { headers: { 'Content-Type': 'application/json' } });
  check(res, { 'setup login successful': (r) => r.status === 200 });
  return res.json('token');
}

// --- Main Scenario ---
export default function (data) {
    if (!data.adminToken) { sleep(1); return; }
    const headers = { 'Authorization': `Bearer ${data.adminToken}`, 'Content-Type': 'application/json' };

    const posRes = http.post('http://app:3000/api/pos/orders', JSON.stringify({ studentId: STUDENT_ID, itemIds: [{ id: SANDWICH_ID, quantity: 1 }] }), { headers });
    check(posRes, { 'admin creates POS order': (r) => r.status === 201 || r.status === 402 });
    sleep(1);
}