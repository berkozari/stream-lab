import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authSubmitErrorMessage,
  validateAuthFields,
} from '../src/features/auth/utils/auth-form.utils.ts';
import {
  authPageLink,
  authReturnTo,
  protectedLoginLink,
} from '../src/features/auth/utils/auth-navigation.utils.ts';

const valid = {
  email: 'someone@example.com',
  password: 'validPassword123!',
  displayName: 'Someone',
};

test('login validates email and non-empty password using shared API contracts', () => {
  assert.deepEqual(validateAuthFields('login', valid), {});
  assert.equal(
    validateAuthFields('login', { ...valid, email: 'invalid-email' }).email,
    'Geçerli bir e-posta adresi gir.',
  );
  assert.ok(validateAuthFields('login', { ...valid, password: '' }).password);
  assert.deepEqual(validateAuthFields('login', { ...valid, displayName: '' }), {});
});

test('register validates displayName, password length, and trims visible name', () => {
  assert.deepEqual(validateAuthFields('register', { ...valid, displayName: '  Someone  ' }), {});
  assert.equal(
    validateAuthFields('register', { ...valid, displayName: '  ' }).displayName,
    'Görünen adını gir.',
  );
  assert.equal(
    validateAuthFields('register', { ...valid, password: 'short' }).password,
    'Şifre 12–128 karakter arasında olmalı.',
  );
  assert.ok(validateAuthFields('register', { ...valid, displayName: 'x'.repeat(101) }).displayName);
});

test('server errors remain understandable without account enumeration', () => {
  assert.equal(
    authSubmitErrorMessage('login', 401, 'INVALID_CREDENTIALS'),
    'E-posta veya şifre hatalı.',
  );
  assert.equal(
    authSubmitErrorMessage('register', 409, 'EMAIL_ALREADY_EXISTS'),
    'Bu e-posta adresi zaten kayıtlı.',
  );
  assert.match(authSubmitErrorMessage('login', 429), /Çok fazla deneme/u);
  assert.match(authSubmitErrorMessage('register', 403), /Güvenlik doğrulaması/u);
  assert.match(authSubmitErrorMessage('login', undefined), /bağlanılamadı/u);
});

test('auth redirect allows internal routes but never auth-form loops or external URLs', () => {
  assert.equal(authReturnTo('/creator?tab=uploads#recent'), '/creator?tab=uploads#recent');
  for (const value of [
    null,
    '',
    'https://malicious.invalid',
    '//malicious.invalid',
    '/\\malicious.invalid',
    '/login',
    '/register?next=/creator',
    '/%2e%2e/login',
  ]) {
    assert.equal(authReturnTo(value), '/creator');
  }
});

test('login/register link preserves the safe requested page', () => {
  assert.equal(
    authPageLink('register', '/creator?tab=uploads'),
    '/register?returnTo=%2Fcreator%3Ftab%3Duploads',
  );
  assert.equal(authPageLink('login', '/creator'), '/login');
  assert.equal(
    protectedLoginLink('/creator', '?tab=uploads'),
    '/login?returnTo=%2Fcreator%3Ftab%3Duploads',
  );
});
