/* ==================================================================
   Real platform biometrics via WebAuthn.

   Calls the operating system's own authenticator — Touch ID / Face ID
   on Apple devices, Windows Hello, Android fingerprint — so the prompt
   the user sees is the system one, not a simulation.

   There is no server here, so the signature returned by the
   authenticator is not verified against anything: the app only checks
   that the OS reported a successful user verification. A production
   bank would send the assertion to a backend for validation.

   Requires a secure context (HTTPS or localhost).
   ================================================================== */
(function (global) {
  'use strict';

  var STORE_KEY = 'privatb.credential';
  var TIMEOUT = 60000;

  function supported() {
    return !!(global.isSecureContext &&
              global.PublicKeyCredential &&
              navigator.credentials &&
              navigator.credentials.create);
  }

  /* True only when the device has a built-in authenticator that can
     verify the user (fingerprint, face, or device PIN). */
  function available() {
    if (!supported()) return Promise.resolve(false);
    var probe = global.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable;
    if (!probe) return Promise.resolve(false);
    return probe.call(global.PublicKeyCredential).catch(function () { return false; });
  }

  function randomBytes(length) {
    var bytes = new Uint8Array(length);
    global.crypto.getRandomValues(bytes);
    return bytes;
  }

  function toBase64Url(buffer) {
    var bytes = new Uint8Array(buffer);
    var binary = '';
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromBase64Url(text) {
    var b64 = text.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var binary = atob(b64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function readStored() {
    try { return global.localStorage.getItem(STORE_KEY); } catch (e) { return null; }
  }

  function writeStored(id) {
    try { global.localStorage.setItem(STORE_KEY, id); } catch (e) { /* ignore */ }
  }

  /* First run on this device: create a platform credential. The OS shows
     its biometric prompt as part of this call. */
  /* Lets the app withdraw a request the user never answers. */
  var pending = null;

  function abort() {
    if (pending) {
      try { pending.abort(); } catch (e) { /* ignore */ }
      pending = null;
    }
  }

  function signal() {
    abort();
    if (typeof AbortController !== 'function') return undefined;
    pending = new AbortController();
    return pending.signal;
  }

  function enroll(displayName) {
    return navigator.credentials.create({
      signal: signal(),
      publicKey: {
        challenge: randomBytes(32),
        rp: { name: 'PrivatB' },
        user: {
          id: randomBytes(16),
          name: 'privatb',
          displayName: displayName || 'PrivatB'
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },    /* ES256 */
          { type: 'public-key', alg: -257 }   /* RS256 */
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'discouraged'
        },
        attestation: 'none',
        timeout: TIMEOUT
      }
    }).then(function (credential) {
      var id = toBase64Url(credential.rawId);
      writeStored(id);
      return id;
    });
  }

  /* Subsequent runs: assert the stored credential, which again triggers
     the system biometric prompt. */
  function assert(id) {
    return navigator.credentials.get({
      signal: signal(),
      publicKey: {
        challenge: randomBytes(32),
        allowCredentials: [{ type: 'public-key', id: fromBase64Url(id) }],
        userVerification: 'required',
        timeout: TIMEOUT
      }
    });
  }

  /**
   * Runs the system biometric check.
   * @returns {Promise<'enrolled'|'verified'>} rejects if the user cancels
   *          or the platform refuses.
   */
  function authenticate(displayName) {
    var id = readStored();
    if (!id) return enroll(displayName).then(function () { return 'enrolled'; });
    return assert(id).then(function () { return 'verified'; });
  }

  function forget() {
    try { global.localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
  }

  global.Biometrics = {
    available: available,
    authenticate: authenticate,
    abort: abort,
    isEnrolled: function () { return !!readStored(); },
    forget: forget
  };
})(window);
