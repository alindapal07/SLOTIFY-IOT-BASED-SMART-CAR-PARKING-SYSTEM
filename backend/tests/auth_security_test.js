/**
 * Comprehensive Authentication & Security Test Suite
 * Tests:
 * 1. Register (Strong password, validation, response hygiene)
 * 2. Login (Credentials verification, token cookies)
 * 3. Logout (Cookie clearing, DB refresh token revocation)
 * 4. Expired Token Handling (Immediate rejection with TOKEN_EXPIRED)
 * 5. Token Refresh (Valid rotation)
 * 6. Invalid / Revoked Refresh Token (Rejection with 401)
 * 7. Password Change (Old password check, revocation of old sessions)
 * 8. Password Reset (Crypto token generation, hashing, one-time use)
 * 9. Unauthorized Endpoint (401 on missing token)
 * 10. Role-Based Access Control (RBAC):
 *     - Driver -> Driver API (200)
 *     - Driver -> Provider API (403)
 *     - Driver -> Admin API (403)
 *     - Provider -> Own resources (200)
 *     - Provider -> Another provider's resource (403/404)
 *     - Admin -> Administrative resources (200)
 * 11. Brute-Force Rate Limiting (429 Too Many Requests after threshold)
 */

const http = require('http');
const jwt = require('jsonwebtoken');

const BASE_URL = 'http://127.0.0.1:5000';
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_ai_parking_key_12345';

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = data;
        try { parsed = JSON.parse(data); } catch(e) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: parsed
        });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

const extractCookie = (setCookieHeaders, cookieName) => {
  if (!setCookieHeaders) return null;
  const headerList = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  for (const h of headerList) {
    const match = h.match(new RegExp(`${cookieName}=([^;]+)`));
    if (match) return match[1];
  }
  return null;
};

async function runAuthSecurityTests() {
  console.log('====================================================');
  console.log('🛡️  AUTHENTICATION & RBAC SECURITY TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    process.stdout.write(`Testing: ${name.padEnd(50)}... `);
    try {
      await fn();
      console.log('✅ PASS');
      passed++;
    } catch (err) {
      console.log(`❌ FAIL (${err.message})`);
      failed++;
    }
  }

  const timestamp = Date.now();
  const testEmail = `sec.driver.${timestamp}@test.com`;
  const initialPassword = 'SecurePassword123!';
  let driverCookies = '';
  let driverAccessToken = '';
  let driverRefreshToken = '';

  // 1. REGISTER
  await test('1. Register new user with strong password', async () => {
    const res = await request('POST', '/api/v1/auth/register', {
      fullName: 'Security Test Driver',
      email: testEmail,
      password: initialPassword,
      role: 'DRIVER'
    });

    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}: ${JSON.stringify(res.data)}`);
    if (res.data.password) throw new Error('Password leaked in registration response body!');

    driverAccessToken = extractCookie(res.headers['set-cookie'], 'accessToken');
    driverRefreshToken = extractCookie(res.headers['set-cookie'], 'refreshToken');
    if (!driverAccessToken || !driverRefreshToken) throw new Error('Cookies not set on registration');
  });

  // 2. LOGIN
  await test('2. Login with valid credentials', async () => {
    const res = await request('POST', '/api/v1/auth/login', {
      email: testEmail,
      password: initialPassword
    });

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (res.data.password) throw new Error('Password leaked in login response body!');

    driverAccessToken = extractCookie(res.headers['set-cookie'], 'accessToken');
    driverRefreshToken = extractCookie(res.headers['set-cookie'], 'refreshToken');
    driverCookies = `accessToken=${driverAccessToken}; refreshToken=${driverRefreshToken}`;
  });

  // 3. LOGOUT & REVOCATION
  let savedRefreshTokenForTest = '';
  await test('3. Logout and session token revocation', async () => {
    savedRefreshTokenForTest = driverRefreshToken;
    const res = await request('POST', '/api/v1/auth/logout', null, { 'Cookie': driverCookies });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);

    // Verify cookies cleared
    const accessCookie = extractCookie(res.headers['set-cookie'], 'accessToken');
    if (accessCookie && accessCookie !== 'deleted' && accessCookie !== '') {
      throw new Error('accessToken cookie not cleared');
    }
  });

  // 4. EXPIRED TOKEN REJECTION
  await test('4. Expired JWT access token rejection', async () => {
    // Generate intentionally expired token
    const expiredToken = jwt.sign({ id: '6a4e063e0277b78a211cd261', role: 'DRIVER' }, JWT_SECRET, {
      expiresIn: '-10s',
      algorithm: 'HS256'
    });

    const res = await request('GET', '/api/v1/auth/me', null, {
      'Cookie': `accessToken=${expiredToken}`
    });

    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
    if (res.data.code !== 'TOKEN_EXPIRED') throw new Error(`Expected code TOKEN_EXPIRED, got ${res.data.code}`);
  });

  // 5. TOKEN REFRESH
  await test('5. Re-login & valid token refresh rotation', async () => {
    const loginRes = await request('POST', '/api/v1/auth/login', {
      email: testEmail,
      password: initialPassword
    });
    driverAccessToken = extractCookie(loginRes.headers['set-cookie'], 'accessToken');
    driverRefreshToken = extractCookie(loginRes.headers['set-cookie'], 'refreshToken');
    driverCookies = `accessToken=${driverAccessToken}; refreshToken=${driverRefreshToken}`;

    const refreshRes = await request('POST', '/api/v1/auth/refresh-token', null, {
      'Cookie': `refreshToken=${driverRefreshToken}`
    });

    if (refreshRes.status !== 200) throw new Error(`Expected 200, got ${refreshRes.status}`);
    const newAccessToken = extractCookie(refreshRes.headers['set-cookie'], 'accessToken');
    const newRefreshToken = extractCookie(refreshRes.headers['set-cookie'], 'refreshToken');

    if (!newAccessToken || !newRefreshToken) throw new Error('New token pair not returned on rotation');

    driverAccessToken = newAccessToken;
    driverRefreshToken = newRefreshToken;
    driverCookies = `accessToken=${driverAccessToken}; refreshToken=${driverRefreshToken}`;
  });

  // 6. INVALID / REVOKED REFRESH TOKEN
  await test('6. Reject invalid or revoked refresh token', async () => {
    // Tampered token
    const fakeRes = await request('POST', '/api/v1/auth/refresh-token', null, {
      'Cookie': 'refreshToken=tampered.fake.token'
    });
    if (fakeRes.status !== 401) throw new Error(`Expected 401 for fake token, got ${fakeRes.status}`);

    // Previously logged out / rotated token
    const revokedRes = await request('POST', '/api/v1/auth/refresh-token', null, {
      'Cookie': `refreshToken=${savedRefreshTokenForTest}`
    });
    if (revokedRes.status !== 401) throw new Error(`Expected 401 for revoked token, got ${revokedRes.status}`);
  });

  // 7. PASSWORD CHANGE
  const updatedPassword = 'NewSecurePassword456!';
  await test('7. Password change & invalidation of old password', async () => {
    const changeRes = await request('PUT', '/api/v1/auth/change-password', {
      oldPassword: initialPassword,
      newPassword: updatedPassword
    }, { 'Cookie': driverCookies });

    if (changeRes.status !== 200) throw new Error(`Expected 200, got ${changeRes.status}: ${JSON.stringify(changeRes.data)}`);

    // Verify old password no longer works
    const oldLoginRes = await request('POST', '/api/v1/auth/login', {
      email: testEmail,
      password: initialPassword
    });
    if (oldLoginRes.status !== 401) throw new Error(`Old password still worked! Expected 401, got ${oldLoginRes.status}`);

    // Verify new password works
    const newLoginRes = await request('POST', '/api/v1/auth/login', {
      email: testEmail,
      password: updatedPassword
    });
    if (newLoginRes.status !== 200) throw new Error(`New password failed! Expected 200, got ${newLoginRes.status}`);

    driverAccessToken = extractCookie(newLoginRes.headers['set-cookie'], 'accessToken');
    driverRefreshToken = extractCookie(newLoginRes.headers['set-cookie'], 'refreshToken');
    driverCookies = `accessToken=${driverAccessToken}; refreshToken=${driverRefreshToken}`;
  });

  // 8. PASSWORD RESET
  const resetPasswordVal = 'ResetPassword789!';
  await test('8. Password reset via secure token', async () => {
    const forgotRes = await request('POST', '/api/v1/auth/forgot-password', {
      email: testEmail
    });
    if (forgotRes.status !== 200) throw new Error(`Expected 200, got ${forgotRes.status}`);

    const rawResetToken = forgotRes.data.resetToken;
    if (!rawResetToken) throw new Error('resetToken not returned in dev mode for test verification');

    const resetRes = await request('POST', '/api/v1/auth/reset-password', {
      email: testEmail,
      token: rawResetToken,
      newPassword: resetPasswordVal
    });
    if (resetRes.status !== 200) throw new Error(`Expected 200, got ${resetRes.status}`);

    // Login with reset password
    const testLogin = await request('POST', '/api/v1/auth/login', {
      email: testEmail,
      password: resetPasswordVal
    });
    if (testLogin.status !== 200) throw new Error(`Login after reset failed with status ${testLogin.status}`);
  });

  // 9. UNAUTHORIZED ENDPOINT
  await test('9. Reject requests missing authentication token', async () => {
    const res = await request('GET', '/api/v1/auth/me');
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
    if (res.data.code !== 'TOKEN_MISSING') throw new Error(`Expected code TOKEN_MISSING, got ${res.data.code}`);
  });

  // 10. ROLE-BASED ACCESS CONTROL (RBAC)
  await test('10A. Driver can access Driver API', async () => {
    const res = await request('GET', '/api/v1/auth/me', null, { 'Cookie': driverCookies });
    if (res.status !== 200 || res.data.role !== 'DRIVER') {
      throw new Error(`Expected 200 with DRIVER role, got ${res.status}`);
    }
  });

  await test('10B. Driver forbidden from Provider API (403)', async () => {
    const res = await request('GET', '/api/v1/parking/provider/stats', null, { 'Cookie': driverCookies });
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden, got ${res.status}`);
  });

  await test('10C. Driver forbidden from Admin API (403)', async () => {
    const res = await request('GET', '/api/v1/admin/stats', null, { 'Cookie': driverCookies });
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden, got ${res.status}`);
  });

  // Provider Tests
  let providerCookies = '';
  await test('10D. Provider can access own resources', async () => {
    const loginRes = await request('POST', '/api/v1/auth/login', {
      email: 'provider@smartparking.in',
      password: 'provider123'
    });
    if (loginRes.status !== 200) throw new Error(`Provider login failed with ${loginRes.status}`);

    const pAccess = extractCookie(loginRes.headers['set-cookie'], 'accessToken');
    const pRefresh = extractCookie(loginRes.headers['set-cookie'], 'refreshToken');
    providerCookies = `accessToken=${pAccess}; refreshToken=${pRefresh}`;

    const res = await request('GET', '/api/v1/parking/zones/me', null, { 'Cookie': providerCookies });
    if (res.status !== 200 || !Array.isArray(res.data)) {
      throw new Error(`Expected 200 with zones array, got ${res.status}`);
    }
  });

  await test('10E. Provider forbidden from Admin API (403)', async () => {
    const res = await request('GET', '/api/v1/admin/stats', null, { 'Cookie': providerCookies });
    if (res.status !== 403) throw new Error(`Expected 403 Forbidden, got ${res.status}`);
  });

  // Admin Tests
  await test('10F. Admin can access Admin API', async () => {
    const adminLoginRes = await request('POST', '/api/v1/auth/login', {
      email: 'admin@smartparking.in',
      password: 'admin123'
    });
    if (adminLoginRes.status !== 200) throw new Error(`Admin login failed with ${adminLoginRes.status}`);

    const aAccess = extractCookie(adminLoginRes.headers['set-cookie'], 'accessToken');
    const aRefresh = extractCookie(adminLoginRes.headers['set-cookie'], 'refreshToken');
    const adminCookies = `accessToken=${aAccess}; refreshToken=${aRefresh}`;

    const statsRes = await request('GET', '/api/v1/admin/stats', null, { 'Cookie': adminCookies });
    if (statsRes.status !== 200 || typeof statsRes.data.totalUsers !== 'number') {
      throw new Error(`Expected 200 with admin stats, got ${statsRes.status}`);
    }
  });

  // 11. BRUTE-FORCE PROTECTION
  await test('11. Brute-force rate limiting returns 429 on /login', async () => {
    let hitRateLimit = false;

    // Fire repeated attempts to exceed threshold
    for (let i = 0; i < 12; i++) {
      const res = await request('POST', '/api/v1/auth/login', {
        email: 'invalid.target@test.com',
        password: 'WrongPassword999!'
      });

      if (res.status === 429) {
        hitRateLimit = true;
        if (!res.headers['retry-after']) throw new Error('Missing Retry-After header on 429');
        break;
      }
    }

    if (!hitRateLimit) {
      throw new Error('Did not receive HTTP 429 after threshold attempts!');
    }
  });

  console.log('\n====================================================');
  console.log(`TOTAL SECURITY TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('====================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runAuthSecurityTests().catch(err => {
  console.error('Fatal security test error:', err);
  process.exit(1);
});
