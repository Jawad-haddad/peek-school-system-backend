// jest.setup.js
const { execSync } = require('child_process');

module.exports = async () => {
    console.log("\nSetting up database for the entire test run...");
    try {
        // Give this command a longer timeout to ensure it completes
        execSync('npx prisma migrate reset --force', { timeout: 30000, stdio: 'inherit' });
        console.log("Database setup complete.");
    } catch (error) {
        console.error("Failed to setup database:", error.message);
        process.exit(1);
    }
};