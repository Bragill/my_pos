/**
 * WebAuthn Helper Utilities
 * Wraps browser-native PublicKeyCredential APIs and provides Base64URL binary encoders.
 */

/**
 * Check if the current browser/device supports WebAuthn platform authenticators
 * (Face ID, Touch ID, Windows Hello, Android Biometrics).
 *
 * @returns {Promise<boolean>}
 */
export async function isBiometricsAvailable() {
  try {
    if (
      typeof window !== 'undefined' &&
      window.PublicKeyCredential &&
      typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
    ) {
      return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    }
    return false;
  } catch (err) {
    console.warn('[WebAuthn] Platform authenticator check error:', err);
    return false;
  }
}

/**
 * Convert ArrayBuffer or Uint8Array to a Base64URL-encoded string.
 *
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {string}
 */
export function bufferToBase64URL(buffer) {
  if (!buffer) return '';
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Convert a Base64URL-encoded string to an ArrayBuffer.
 *
 * @param {string} base64URL
 * @returns {ArrayBuffer}
 */
export function base64URLToBuffer(base64URL) {
  if (!base64URL || typeof base64URL !== 'string') return new ArrayBuffer(0);
  let base64 = base64URL.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Invoke navigator.credentials.create() using options from POST /api/biometrics/register-options.
 *
 * @param {Object} options - Relying Party options returned by server
 * @returns {Promise<Object>} Extracted credential fields formatted for register-verify
 */
export async function startBiometricRegistration(options) {
  if (!navigator?.credentials?.create) {
    throw new Error('เบราว์เซอร์นี้ไม่รองรับการลงทะเบียนชีวมาตร (WebAuthn API unavailable)');
  }

  const publicKey = {
    ...options,
    challenge: base64URLToBuffer(options.challenge),
    user: {
      ...options.user,
      id: base64URLToBuffer(options.user.id)
    },
    ...(options.excludeCredentials && {
      excludeCredentials: options.excludeCredentials.map((c) => ({
        ...c,
        id: base64URLToBuffer(c.id)
      }))
    })
  };

  try {
    const credential = await navigator.credentials.create({ publicKey });
    if (!credential) {
      throw new Error('ไม่สามารถสร้างข้อมูลชีวมาตรได้');
    }

    const response = credential.response;
    let publicKeyBase64 = '';
    if (typeof response.getPublicKey === 'function') {
      const pkBuffer = response.getPublicKey();
      if (pkBuffer) publicKeyBase64 = bufferToBase64URL(pkBuffer);
    }
    if (!publicKeyBase64 && response.attestationObject) {
      publicKeyBase64 = bufferToBase64URL(response.attestationObject);
    }

    return {
      credential_id: bufferToBase64URL(credential.rawId) || credential.id,
      public_key: publicKeyBase64,
      attestation_object: response.attestationObject ? bufferToBase64URL(response.attestationObject) : '',
      client_data_json: response.clientDataJSON ? bufferToBase64URL(response.clientDataJSON) : ''
    };
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      throw new Error('การยืนยันตัวตนถูกยกเลิก หรือหมดเวลา');
    }
    if (err.name === 'InvalidStateError') {
      throw new Error('อุปกรณ์หรือบัญชีนี้เคยลงทะเบียนชีวมาตรไว้แล้ว');
    }
    if (err.name === 'NotSupportedError') {
      throw new Error('อุปกรณ์นี้ไม่รองรับการยืนยันตัวตนชีวมาตรประเภทนี้');
    }
    throw err;
  }
}

/**
 * Invoke navigator.credentials.get() using options from POST /api/biometrics/login-options.
 *
 * @param {Object} options - Authentication options returned by server
 * @returns {Promise<Object>} Extracted assertion fields formatted for login-verify
 */
export async function startBiometricAuthentication(options) {
  if (!navigator?.credentials?.get) {
    throw new Error('เบราว์เซอร์นี้ไม่รองรับการยืนยันตัวตนด้วยชีวมาตร');
  }

  const publicKey = {
    challenge: base64URLToBuffer(options.challenge),
    timeout: options.timeout || 60000,
    userVerification: options.userVerification || 'required',
    ...(options.rpId && { rpId: options.rpId }),
    ...(options.allowCredentials && options.allowCredentials.length > 0 && {
      allowCredentials: options.allowCredentials.map((c) => ({
        type: c.type || 'public-key',
        id: base64URLToBuffer(c.id),
        ...(c.transports && { transports: c.transports })
      }))
    })
  };

  try {
    const assertion = await navigator.credentials.get({ publicKey });
    if (!assertion) {
      throw new Error('การยืนยันตัวตนชีวมาตรไม่สำเร็จ');
    }

    const response = assertion.response;
    return {
      credential_id: bufferToBase64URL(assertion.rawId) || assertion.id,
      authenticator_data: response.authenticatorData ? bufferToBase64URL(response.authenticatorData) : '',
      client_data_json: response.clientDataJSON ? bufferToBase64URL(response.clientDataJSON) : '',
      signature: response.signature ? bufferToBase64URL(response.signature) : '',
      user_handle: response.userHandle ? bufferToBase64URL(response.userHandle) : null
    };
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      throw new Error('การสแกนถูกยกเลิก หรือหมดเวลา');
    }
    if (err.name === 'NotSupportedError') {
      throw new Error('อุปกรณ์นี้ไม่รองรับการสแกนชีวมาตร');
    }
    throw err;
  }
}
