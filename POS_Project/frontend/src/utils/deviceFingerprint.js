/**
 * Device Fingerprinting & Bot Signal Detection for POS Client Security
 * Generates a persistent unique hardware fingerprint formatted as a MAC Identifier
 */

const STORAGE_KEY = 'pos_device_mac_id';

/**
 * Generate a 32-bit hash from string
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Get Canvas Fingerprint
 */
function getCanvasFingerprint() {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no_ctx';
    ctx.textBaseline = 'top';
    ctx.font = '14px "Arial", sans-serif';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('POS_SEC_FINGERPRINT_2026', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('POS_SEC_FINGERPRINT_2026', 4, 17);
    return canvas.toDataURL();
  } catch {
    return 'canvas_err';
  }
}

/**
 * Get or compute persistent Device MAC Identifier (e.g. MAC: 4A:2F:8B:10:9C:3E)
 */
export function getDeviceMacAddress() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(saved.replace(/^MAC:\s*/i, ''))) {
      return saved.startsWith('MAC: ') ? saved : `MAC: ${saved}`;
    }
  } catch {}

  // Gather hardware attributes
  const screenInfo = `${window.screen?.width}x${window.screen?.height}x${window.screen?.colorDepth}`;
  const hardwareConcurrency = navigator.hardwareConcurrency || 4;
  const platform = navigator.platform || 'Unknown';
  const language = navigator.language || 'th-TH';
  const canvasHash = hashString(getCanvasFingerprint());
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Bangkok';

  const rawSeed = `${screenInfo}|${hardwareConcurrency}|${platform}|${language}|${canvasHash}|${tz}|${Date.now()}`;
  const fullHash = hashString(rawSeed) + hashString(rawSeed.split('').reverse().join(''));

  // Format into 6 pairs of hex digits: XX:XX:XX:XX:XX:XX
  const hexPart = fullHash.slice(0, 12).toUpperCase();
  const macPairs = [];
  for (let i = 0; i < 12; i += 2) {
    macPairs.push(hexPart.slice(i, i + 2));
  }
  const formattedMac = `MAC: ${macPairs.join(':')}`;

  try {
    localStorage.setItem(STORAGE_KEY, formattedMac);
  } catch {}

  return formattedMac;
}

/**
 * Detect Bot or Headless Browser Signals
 */
export function detectBotSignals() {
  const isWebdriver = Boolean(navigator.webdriver);
  const isHeadlessUserAgent = /HeadlessChrome|PhantomJS|Puppeteer|Selenium/i.test(navigator.userAgent);
  const isZeroDimension = window.outerWidth === 0 && window.outerHeight === 0;
  const isMissingPlugins = navigator.plugins && navigator.plugins.length === 0 && !/Mobi|Android|iPhone/i.test(navigator.userAgent);

  return {
    is_headless: Boolean(isWebdriver || isHeadlessUserAgent || isZeroDimension),
    is_webdriver: isWebdriver,
    is_suspicious: Boolean(isZeroDimension || (isMissingPlugins && isWebdriver))
  };
}

/**
 * Detect friendly device name (e.g. "Windows 10/11 · Chrome", "iPad · Safari (PWA App)")
 */
export function detectClientDeviceName() {
  const ua = navigator.userAgent || '';
  let os = 'Unknown Device';
  if (/Windows NT 10.0/i.test(ua)) os = 'Windows 10/11';
  else if (/Windows NT 6.3/i.test(ua)) os = 'Windows 8.1';
  else if (/Windows NT 6.1/i.test(ua)) os = 'Windows 7';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/iPad/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) os = 'iPad';
  else if (/iPhone/i.test(ua)) os = 'iPhone';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'Web Browser';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = 'Chrome';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  const pwaTag = isStandalone ? ' (PWA)' : '';

  return `${os} · ${browser}${pwaTag}`;
}

