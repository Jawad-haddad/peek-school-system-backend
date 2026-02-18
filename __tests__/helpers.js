// __tests__/helpers.js
const request = require('supertest');
const app = require('../index');

// This helper function logs in a user and returns their token
async function getAuthToken(email, password) {
    const response = await request(app)
        .post('/api/users/login')
        .send({ email, password });
    return response.body.token;
}

module.exports = { getAuthToken };