const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, 'src', 'routes');
const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));

const allRoutes = [];

files.forEach(file => {
    const content = fs.readFileSync(path.join(routesDir, file), 'utf-8');
    const lines = content.split('\n');

    // Parse custom middleware arrays (like adminActions = [authMiddleware, ...])
    const customMiddlewares = {};
    const customMiddlewareRegex = /const\s+(\w+)\s*=\s*\[([^\]]+)\]/g;
    let match;
    while ((match = customMiddlewareRegex.exec(content)) !== null) {
        customMiddlewares[match[1]] = match[2].trim();
    }

    // Parse routes: router.(get|post|put|patch|delete)('/path', ...middlewares, handler)
    const routeRegex = /router\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]\s*,\s*(.+)\s*\)/g;

    while ((match = routeRegex.exec(content)) !== null) {
        const method = match[1].toUpperCase();
        const routePath = match[2];
        const argsStr = match[3];

        let args = argsStr;

        // Resolve custom middlewares
        for (const [key, val] of Object.entries(customMiddlewares)) {
            if (args.includes(key)) {
                args = args.replace(key, val);
            }
        }

        const hasAuth = args.includes('authMiddleware');
        const hasTenant = args.includes('belongsToSchool') || args.includes('tenantWhere');
        const hasRoleMatch = args.match(/hasRole\(\s*\[([^\]]+)\]\s*\)/);
        let allowedRoles = [];
        if (hasRoleMatch) {
            allowedRoles = hasRoleMatch[1].split(',').map(r => r.replace(/UserRole\./g, '').replace(/['"\s]/g, ''));
        }

        const fileBase = file.replace('Routes.js', '');

        let issues = [];
        if (!hasAuth && routePath !== '/login' && routePath !== '/register' && routePath !== '/health') {
            issues.push('AUTH_MISSING');
        }
        if (hasAuth && allowedRoles.length === 0) {
            issues.push('ROLE_GUARD_MISSING');
        }

        allRoutes.push({
            module: fileBase,
            method,
            path: routePath,
            hasAuth,
            hasTenant,
            allowedRoles,
            issues
        });
    }
});

fs.writeFileSync('rbac_audit.json', JSON.stringify({ routes: allRoutes }, null, 2), 'utf-8');
