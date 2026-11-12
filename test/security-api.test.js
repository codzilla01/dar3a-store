const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.NODE_ENV = 'test';
process.env.ALLOW_DEMO_MODE = 'true';
process.env.ADMIN_JWT_SECRET = 'test-secret-that-is-longer-than-thirty-two-characters';
process.env.DEMO_SUPER_ADMIN_USERNAME = 'owner';
process.env.DEMO_SUPER_ADMIN_PASSWORD = 'StrongDemoPassword123!';

const app = require('../index');
let server;
let baseUrl;

function cookieFrom(response) {
    const raw = response.headers.get('set-cookie');
    return raw ? raw.split(';')[0] : '';
}

async function request(path, options = {}) {
    const response = await fetch(baseUrl + path, options);
    const body = await response.json().catch(() => ({}));
    return { response, body };
}

test.before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

test('sensitive administration endpoints reject unauthenticated requests', async () => {
    for (const [method, path, body] of [
        ['GET', '/api/orders'], ['GET', '/api/newsletter'], ['GET', '/api/coupons'],
        ['POST', '/api/settings', {}], ['POST', '/api/products', { products: [] }]
    ]) {
        const { response } = await request(path, {
            method,
            headers: body ? { 'Content-Type': 'application/json' } : undefined,
            body: body ? JSON.stringify(body) : undefined
        });
        assert.equal(response.status, 401, `${method} ${path}`);
    }
});

test('login uses an HttpOnly cookie and exposes no password hash', async () => {
    const { response, body } = await request('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'owner', password: 'StrongDemoPassword123!' })
    });
    assert.equal(response.status, 200);
    assert.equal(body.user.role, 'super_admin');
    assert.equal('password_hash' in body.user, false);
    const cookie = cookieFrom(response);
    assert.match(cookie, /^dar3a_session=/);
    assert.match(response.headers.get('set-cookie'), /HttpOnly/i);
    assert.match(response.headers.get('set-cookie'), /SameSite=Strict/i);
    const me = await request('/api/auth/me', { headers: { Cookie: cookie } });
    assert.equal(me.response.status, 200);
    assert.equal(me.body.user.username, 'owner');
});

test('server calculates order total and ignores client supplied prices', async () => {
    const { response, body } = await request('/api/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            customer_name: 'عميل اختبار', customer_phone: '0912345678', payment_method: 'cash',
            total: 0, items: [{ id: 'demo_movie_1', price: 0, quantity: 2 }]
        })
    });
    assert.equal(response.status, 201);
    assert.equal(body.order.total, 10000);
    assert.equal(body.order.items[0].price, 5000);
});

test('developer can create, activate and verify an annual subscription', async () => {
    const login = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'owner', password: 'StrongDemoPassword123!' }) });
    const ownerCookie = cookieFrom(login.response);
    const user = await request('/api/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
        body: JSON.stringify({ username: 'dev.user', display_name: 'Developer', role: 'developer', password: 'DeveloperPassword123!' })
    });
    assert.equal(user.response.status, 201);
    const developerLogin = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'dev.user', password: 'DeveloperPassword123!' }) });
    const developerCookie = cookieFrom(developerLogin.response);
    const subscription = await request('/api/developer/subscriptions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: developerCookie },
        body: JSON.stringify({ client_name: 'Client Co', domain: 'store.example.com', contact_email: 'owner@example.com' })
    });
    assert.equal(subscription.response.status, 201);
    const activate = await request(`/api/developer/subscriptions/${subscription.body.subscription.id}/action`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: developerCookie }, body: JSON.stringify({ action: 'activate' })
    });
    assert.equal(activate.response.status, 200);
    assert.match(activate.body.activationKey, /^DAR3A-/);
    const verified = await request('/api/license/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activationKey: activate.body.activationKey, domain: 'store.example.com' })
    });
    assert.equal(verified.response.status, 200);
    assert.equal(verified.body.valid, true);
});

test('security response headers do not enable arbitrary-origin CORS', async () => {
    const { response } = await request('/api/products', { headers: { Origin: 'https://attacker.example' } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});
