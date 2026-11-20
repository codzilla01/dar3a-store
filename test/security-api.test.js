const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.NODE_ENV = 'test';
process.env.ALLOW_DEMO_MODE = 'true';
process.env.ADMIN_JWT_SECRET = 'test-secret-that-is-longer-than-thirty-two-characters';
process.env.DEMO_DEVELOPER_USERNAME = 'owner';
process.env.DEMO_DEVELOPER_PASSWORD = 'StrongDemoPassword123!';

const crypto = require('node:crypto');
const { isoCBOR } = require('@simplewebauthn/server/helpers');
process.env.DEMO_ENROLLMENT_CODE = crypto.randomBytes(32).toString('hex');
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
    developerCookie = await enrollAndAuthenticateDeveloper();
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

let developerCookie;
const post = (path, body, Cookie = '') => request(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie }, body: JSON.stringify(body)
});

async function enrollAndAuthenticateDeveloper() {
    const prefix = '/api/auth/webauthn/';
    const grant = { username: 'owner', enrollmentCode: process.env.DEMO_ENROLLMENT_CODE };
    const options = await post(prefix + 'register/options', grant);
    assert.equal(options.response.status, 200);
    const ceremony = cookieFrom(options.response);
    assert.equal((await request('/api/dashboard', { headers: { Cookie: ceremony } })).response.status, 401);

    // Test authenticator: none attestation, ES256 key and locally verified user.
    const {privateKey, publicKey} = crypto.generateKeyPairSync('ec', {namedCurve: 'prime256v1'});
    const jwk = publicKey.export({format: 'jwk'});
    const key = isoCBOR.encode(new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]]));
    const id = crypto.randomBytes(32), id64 = id.toString('base64url');
    const hash = value => crypto.createHash('sha256').update(value).digest();
    const rpHash = hash(options.body.rp.id);
    const clientData = (type, challenge) => Buffer.from(JSON.stringify({ type, challenge, origin: baseUrl }));
    const credential = { id: id64, rawId: id64, type: 'public-key' };
    const register = flags => {
        const authData = Buffer.concat([rpHash, Buffer.from([flags]), Buffer.alloc(20), Buffer.from([0, id.length]), id, key]);
        const attestation = isoCBOR.encode(new Map([['fmt','none'], ['attStmt',new Map()], ['authData',authData]]));
        return post(prefix + 'register/verify', {...grant, response: {...credential, response: {
            clientDataJSON: clientData('webauthn.create', options.body.challenge).toString('base64url'),
            attestationObject: Buffer.from(attestation).toString('base64url')
        }}}, ceremony);
    };
    assert.equal((await register(0x4d)).response.status, 400); // backup-eligible key
    const enrolled = await register(0x45);
    assert.equal(enrolled.response.status, 201);
    assert.doesNotMatch(enrolled.response.headers.get('set-cookie'), /dar3a_session=/);
    assert.equal((await post(prefix + 'register/options', grant)).response.status, 401);

    const auth = await post(prefix + 'authenticate/options', {username: grant.username});
    assert.deepEqual(auth.body.allowCredentials.map(c => c.id), [id64]);
    const data = clientData('webauthn.get', auth.body.challenge);
    const authData = Buffer.concat([rpHash, Buffer.from([5,0,0,0,1])]);
    const signature = crypto.sign('sha256', Buffer.concat([authData, hash(data)]), privateKey);
    const verified = await post(prefix + 'authenticate/verify', {response: {...credential, response: {
        clientDataJSON: data.toString('base64url'), authenticatorData: authData.toString('base64url'), signature: signature.toString('base64url')
    }}}, cookieFrom(auth.response));
    assert.equal(verified.response.status, 200);
    const cookie = verified.response.headers.getSetCookie().find(c => c.startsWith('dar3a_session=')).split(';')[0];
    assert.match(verified.response.headers.get('set-cookie'), /HttpOnly/);
    assert.equal('password_hash' in verified.body.user, false);
    return cookie;
}

test('developer password and legacy sessions cannot access the dashboard', async () => {
    const login = await post('/api/auth/login', { username: 'owner', password: process.env.DEMO_DEVELOPER_PASSWORD });
    assert.equal(login.response.status, 401);
    assert.equal(cookieFrom(login.response), '');
    const {body} = await request('/api/auth/me', {headers: {Cookie: developerCookie}});
    assert.equal(body.user.role, 'developer');
    const legacyToken = require('jsonwebtoken').sign({sub: body.user.id, role: 'developer'}, process.env.ADMIN_JWT_SECRET,
        {issuer: 'dar3a-store', audience: 'dar3a-admin', expiresIn: '1h'});
    assert.equal((await request('/api/dashboard', {headers: {Cookie: `dar3a_session=${legacyToken}`}})).response.status, 401);
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

test('developer controls subscriptions while Admin manages the store and changes own password', async () => {
    const user = await request('/api/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: developerCookie },
        body: JSON.stringify({ username: 'store.admin', display_name: 'Store Admin', role: 'admin', password: 'AdminPassword123!' })
    });
    assert.equal(user.response.status, 201);

    const adminLogin = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'store.admin', password: 'AdminPassword123!' }) });
    const adminCookie = cookieFrom(adminLogin.response);
    assert.equal(adminLogin.body.user.role, 'admin');
    assert.equal((await request('/api/dashboard', { headers: { Cookie: adminCookie } })).response.status, 200);
    assert.equal((await request('/api/coupons', { headers: { Cookie: adminCookie } })).response.status, 200);
    assert.equal((await request('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ name: 'Admin managed store' }) })).response.status, 200);
    assert.equal((await request('/api/users', { headers: { Cookie: adminCookie } })).response.status, 403);
    assert.equal((await request('/api/developer/subscriptions', { headers: { Cookie: adminCookie } })).response.status, 403);
    const changed = await request('/api/auth/change-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({ currentPassword: 'AdminPassword123!', newPassword: 'NewAdminPassword123!' })
    });
    assert.equal(changed.response.status, 200);
    assert.equal((await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'store.admin', password: 'AdminPassword123!' }) })).response.status, 401);
    assert.equal((await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'store.admin', password: 'NewAdminPassword123!' }) })).response.status, 200);

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

test('WebAuthn device login is limited to Developer and issues a short-lived ceremony challenge', async () => {
    const unauthenticatedCredentials = await request('/api/auth/webauthn/credentials');
    assert.equal(unauthenticatedCredentials.response.status, 401);

    const credentials = await request('/api/auth/webauthn/credentials', { headers: { Cookie: developerCookie } });
    assert.equal(credentials.response.status, 200);
    assert.equal(credentials.body.length, 1);

    const registrationOptions = await request('/api/auth/webauthn/register/options', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: developerCookie }, body: '{}'
    });
    assert.equal(registrationOptions.response.status, 200);
    assert.equal(typeof registrationOptions.body.challenge, 'string');
    assert.equal(registrationOptions.body.authenticatorSelection.authenticatorAttachment, 'platform');
    assert.equal(registrationOptions.body.authenticatorSelection.userVerification, 'required');
    const ceremonyCookie = cookieFrom(registrationOptions.response);
    assert.match(ceremonyCookie, /^dar3a_webauthn=/);
    assert.match(registrationOptions.response.headers.get('set-cookie'), /HttpOnly/i);
    assert.match(registrationOptions.response.headers.get('set-cookie'), /SameSite=Strict/i);
    assert.match(registrationOptions.response.headers.get('set-cookie'), /Path=\/api\/auth\/webauthn/i);

    const noCeremony = await request('/api/auth/webauthn/register/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: developerCookie },
        body: JSON.stringify({ response: {} })
    });
    assert.equal(noCeremony.response.status, 401);

    const createAdmin = await request('/api/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: developerCookie },
        body: JSON.stringify({ username: 'biometric.admin', display_name: 'Biometric Admin', role: 'admin', password: 'BiometricAdminPassword123!' })
    });
    assert.equal(createAdmin.response.status, 201);
    const adminLogin = await request('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'biometric.admin', password: 'BiometricAdminPassword123!' })
    });
    const adminCookie = cookieFrom(adminLogin.response);
    const adminRegistration = await request('/api/auth/webauthn/register/options', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: '{}'
    });
    assert.equal(adminRegistration.response.status, 403);
    const adminAuthentication = await request('/api/auth/webauthn/authenticate/options', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'biometric.admin' })
    });
    assert.equal(adminAuthentication.response.status, 401);
});
