import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  bufferToBase64URL,
  base64URLToBuffer,
  isBiometricsAvailable,
  startBiometricRegistration,
  startBiometricAuthentication
} from './webAuthnHelper.js';

describe('BIO-104: Frontend WebAuthn Helper Utilities', () => {
  test('1. bufferToBase64URL and base64URLToBuffer round-trip accurately', () => {
    const rawData = new Uint8Array([0, 1, 255, 128, 42, 64, 18, 99, 137, 240]);
    const base64url = bufferToBase64URL(rawData);

    assert.ok(typeof base64url === 'string');
    assert.ok(!base64url.includes('+'), 'Base64URL must not contain +');
    assert.ok(!base64url.includes('/'), 'Base64URL must not contain /');
    assert.ok(!base64url.includes('='), 'Base64URL must not contain = padding');

    const decodedBuffer = base64URLToBuffer(base64url);
    const decodedBytes = new Uint8Array(decodedBuffer);

    assert.equal(decodedBytes.length, rawData.length);
    for (let i = 0; i < rawData.length; i++) {
      assert.equal(decodedBytes[i], rawData[i]);
    }
  });

  test('2. Handles empty/null/undefined buffer and strings gracefully without crashing', () => {
    assert.equal(bufferToBase64URL(null), '');
    assert.equal(bufferToBase64URL(undefined), '');
    assert.equal(bufferToBase64URL(new ArrayBuffer(0)), '');

    assert.equal(base64URLToBuffer('').byteLength, 0);
    assert.equal(base64URLToBuffer(null).byteLength, 0);
    assert.equal(base64URLToBuffer(undefined).byteLength, 0);
  });

  test('3. isBiometricsAvailable returns false when window.PublicKeyCredential is not present', async () => {
    const available = await isBiometricsAvailable();
    // In Node.js environment without DOM, it should safely return false without throwing
    assert.equal(available, false);
  });

  test('4. startBiometricRegistration throws user-friendly error when API unavailable in environment', async () => {
    await assert.rejects(
      async () => {
        await startBiometricRegistration({
          challenge: 'dGVzdF9jaGFsbGVuZ2U',
          user: { id: 'dXNyXzAwMQ' }
        });
      },
      (err) => {
        return /WebAuthn API unavailable|ไม่รองรับ/.test(err.message);
      }
    );
  });

  test('5. startBiometricAuthentication throws user-friendly error when API unavailable in environment', async () => {
    await assert.rejects(
      async () => {
        await startBiometricAuthentication({
          challenge: 'dGVzdF9jaGFsbGVuZ2U'
        });
      },
      (err) => {
        return /ไม่รองรับ/.test(err.message);
      }
    );
  });
});
