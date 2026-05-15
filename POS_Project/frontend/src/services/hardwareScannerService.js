/**
 * Hardware barcode scanner (HID keyboard-wedge) detection.
 *
 * Android POS terminals (Sunmi, PAX, iMin) expose their built-in scanner as a
 * keyboard device — it types the barcode then sends Enter very fast (< 50 ms
 * between characters).  We distinguish scanner input from human typing by timing.
 *
 * Usage:
 *   hardwareScanner.subscribe(callback)  → receive scanned codes
 *   hardwareScanner.unsubscribe(callback)
 */

const SCANNER_CHAR_INTERVAL_MS = 50;  // max ms between scanner keystrokes
const MIN_BARCODE_LENGTH = 4;

const listeners = new Set();
let buffer = '';
let lastKeyTime = 0;
let timeoutId = null;

function flush() {
  const code = buffer.trim();
  buffer = '';
  timeoutId = null;
  if (code.length >= MIN_BARCODE_LENGTH) {
    listeners.forEach((cb) => cb(code));
  }
}

function handleKeydown(e) {
  if (listeners.size === 0) return;

  // Ignore modifier-only keys and function keys
  if (e.key.length > 1 && e.key !== 'Enter') return;

  // If focus is on a text input (manual typing), ignore
  const tag = document.activeElement?.tagName;
  const isEditable = document.activeElement?.isContentEditable;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || isEditable) return;

  const now = Date.now();

  if (e.key === 'Enter') {
    if (timeoutId) clearTimeout(timeoutId);
    flush();
    e.preventDefault();
    return;
  }

  const gap = now - lastKeyTime;
  if (buffer.length > 0 && gap > SCANNER_CHAR_INTERVAL_MS * 3) {
    buffer = '';
    if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
  }

  buffer += e.key;
  lastKeyTime = now;

  if (timeoutId) clearTimeout(timeoutId);
  timeoutId = setTimeout(flush, SCANNER_CHAR_INTERVAL_MS * 4);
}

let attached = false;

function ensureAttached() {
  if (!attached) {
    window.addEventListener('keydown', handleKeydown, true);
    attached = true;
  }
}

function ensureDetached() {
  if (attached && listeners.size === 0) {
    window.removeEventListener('keydown', handleKeydown, true);
    attached = false;
  }
}

const hardwareScanner = {
  subscribe(callback) {
    listeners.add(callback);
    ensureAttached();
  },
  unsubscribe(callback) {
    listeners.delete(callback);
    ensureDetached();
  },
  isAvailable() {
    // Sunmi / PAX / iMin embed a WebView that exposes a scanner bridge object,
    // or at minimum behave as a keyboard device.  We treat Android POS browsers
    // as scanner-capable; the caller can still fall back to camera if desired.
    const ua = navigator.userAgent || '';
    return /SunmiWebView|PAXWebView|iMin|Android/i.test(ua);
  },
};

export default hardwareScanner;
