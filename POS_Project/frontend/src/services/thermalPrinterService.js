/**
 * Thermal receipt printer — ESC/POS over multiple transports.
 *
 * Priority order:
 *  1. Sunmi JS bridge  (window.SunmiPrinter or window.printer)
 *  2. PAX JS bridge    (window.PAXPrinter)
 *  3. iMin JS bridge   (window.iMinPrinter)
 *  4. WebUSB           (ESC/POS over USB, Chrome/Edge on Android/Desktop)
 *  5. WebBluetooth     (ESC/POS BT thermal printer)
 *
 * All paths share the same printReceipt(data) public API so POSPage
 * never needs to know which transport is active.
 */

// ─── ESC/POS byte constants ───────────────────────────────────────────────────
const ESC = 0x1b;
const GS  = 0x1d;
const LF  = 0x0a;

const CMD = {
  INIT:          [ESC, 0x40],
  ALIGN_LEFT:    [ESC, 0x61, 0x00],
  ALIGN_CENTER:  [ESC, 0x61, 0x01],
  ALIGN_RIGHT:   [ESC, 0x61, 0x02],
  BOLD_ON:       [ESC, 0x45, 0x01],
  BOLD_OFF:      [ESC, 0x45, 0x00],
  FONT_NORMAL:   [GS,  0x21, 0x00],
  FONT_DOUBLE_H: [GS,  0x21, 0x01],
  FONT_DOUBLE:   [GS,  0x21, 0x11],
  CUT_FULL:      [GS,  0x56, 0x00],
  CUT_PARTIAL:   [GS,  0x56, 0x01],
  FEED_3:        [ESC, 0x64, 0x03],
};

function bytes(...cmds) {
  return new Uint8Array(cmds.flat());
}

function text(str) {
  return new TextEncoder().encode(str);
}

function line(str = '') {
  return new Uint8Array([...text(str), LF]);
}

function dashedLine(width = 32) {
  return line('-'.repeat(width));
}

function rpad(str, width) {
  return str.toString().padEnd(width);
}

function lpad(str, width) {
  return str.toString().padStart(width);
}

/**
 * Build a full ESC/POS Uint8Array receipt from order data.
 * @param {Object} data
 * @param {string} data.storeName
 * @param {string} [data.storeAddress]
 * @param {string} [data.storePhone]
 * @param {Array}  data.items          — [{name, quantity, unit_price}]
 * @param {number} data.subTotal
 * @param {number} data.discount
 * @param {number} data.tax
 * @param {number} data.total
 * @param {number} [data.cashReceived]
 * @param {string} data.paymentMethod
 * @param {string} [data.vatRate]
 */
export function buildEscPosReceipt(data) {
  const W = 32;
  const parts = [];

  const push = (...chunks) => chunks.forEach((c) => parts.push(c));

  const fmt = (n) =>
    Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  push(
    bytes(CMD.INIT),
    bytes(CMD.ALIGN_CENTER),
    bytes(CMD.BOLD_ON),
    bytes(CMD.FONT_DOUBLE_H),
    line(data.storeName || 'ร้านค้า'),
    bytes(CMD.FONT_NORMAL),
    bytes(CMD.BOLD_OFF),
  );

  if (data.storeAddress) push(line(data.storeAddress));
  if (data.storePhone)   push(line(`โทร: ${data.storePhone}`));

  push(
    line(`วันที่: ${new Date().toLocaleString('th-TH')}`),
    bytes(CMD.ALIGN_LEFT),
    dashedLine(W),
    bytes(CMD.BOLD_ON),
    line(`${'รายการ'.padEnd(W - 12)}${'จำนวน'.padStart(5)}${'รวม'.padStart(7)}`),
    bytes(CMD.BOLD_OFF),
    dashedLine(W),
  );

  for (const item of data.items) {
    const name  = (item.name || '').substring(0, W - 13);
    const qty   = lpad(item.quantity, 5);
    const total = lpad(fmt(item.unit_price * item.quantity), 7);
    push(line(`${rpad(name, W - 12)}${qty}${total}`));
    push(line(`  @ ${fmt(item.unit_price)} x ${item.quantity}`));
  }

  push(dashedLine(W));

  const summaryLine = (label, value) =>
    line(`${rpad(label, W - 9)}${lpad(fmt(value), 9)}`);

  push(summaryLine('ยอดรวม', data.subTotal));

  if (data.discount > 0) push(summaryLine('ส่วนลด', -data.discount));

  push(summaryLine(`VAT ${data.vatRate || 7}%`, data.tax));

  push(
    bytes(CMD.BOLD_ON),
    bytes(CMD.FONT_DOUBLE_H),
    summaryLine('รวมทั้งสิ้น', data.total),
    bytes(CMD.FONT_NORMAL),
    bytes(CMD.BOLD_OFF),
  );

  if (data.paymentMethod === 'cash' && data.cashReceived != null) {
    push(
      dashedLine(W),
      summaryLine('รับเงิน', data.cashReceived),
      summaryLine('เงินทอน', Math.max(0, data.cashReceived - data.total)),
    );
  }

  push(
    dashedLine(W),
    bytes(CMD.ALIGN_CENTER),
    line('ขอบคุณที่ใช้บริการ'),
    line(''),
    bytes(CMD.FEED_3),
    bytes(CMD.CUT_PARTIAL),
  );

  const total = parts.reduce((s, a) => s + a.length, 0);
  const out   = new Uint8Array(total);
  let offset  = 0;
  for (const p of parts) { out.set(p, offset); offset += p.length; }
  return out;
}

// ─── Transport detection ───────────────────────────────────────────────────────

function getSunmiBridge() {
  return window.SunmiPrinter ?? window.printer ?? null;
}

function getPaxBridge() {
  return window.PAXPrinter ?? null;
}

function getIMinBridge() {
  return window.iMinPrinter ?? null;
}

// ─── Print via native JS bridge (Sunmi / PAX / iMin) ─────────────────────────

async function printViaBridge(bridge, escposBytes) {
  if (typeof bridge.sendRAWData === 'function') {
    bridge.sendRAWData(Array.from(escposBytes));
    return;
  }
  if (typeof bridge.printRawData === 'function') {
    bridge.printRawData(Array.from(escposBytes));
    return;
  }
  if (typeof bridge.write === 'function') {
    bridge.write(btoa(String.fromCharCode(...escposBytes)));
    return;
  }
  throw new Error('ไม่พบ method สำหรับ bridge นี้');
}

// ─── WebUSB ───────────────────────────────────────────────────────────────────

let usbDevice = null;
let usbEndpoint = null;

export async function connectUsb() {
  if (!navigator.usb) throw new Error('เบราว์เซอร์นี้ไม่รองรับ WebUSB');
  usbDevice = await navigator.usb.requestDevice({ filters: [] });
  await usbDevice.open();
  if (usbDevice.configuration === null) await usbDevice.selectConfiguration(1);
  await usbDevice.claimInterface(0);
  const iface = usbDevice.configuration.interfaces[0];
  const alt   = iface.alternates[0];
  const ep    = alt.endpoints.find((e) => e.direction === 'out');
  if (!ep) throw new Error('ไม่พบ USB endpoint สำหรับส่งข้อมูล');
  usbEndpoint = ep.endpointNumber;
}

async function printViaUsb(escposBytes) {
  if (!usbDevice || !usbEndpoint) throw new Error('กรุณาเชื่อมต่อเครื่องพิมพ์ USB ก่อน');
  await usbDevice.transferOut(usbEndpoint, escposBytes);
}

// ─── WebBluetooth ─────────────────────────────────────────────────────────────

// Standard BT serial (SPP) service UUIDs used by most ESC/POS BT printers
const BT_SERVICE_UUID   = '000018f0-0000-1000-8000-00805f9b34fb';
const BT_CHAR_UUID      = '00002af1-0000-1000-8000-00805f9b34fb';
const BT_SERVICE_UUID_2 = '0000ff00-0000-1000-8000-00805f9b34fb';
const BT_CHAR_UUID_2    = '0000ff02-0000-1000-8000-00805f9b34fb';

let btDevice = null;
let btChar   = null;

export async function connectBluetooth() {
  if (!navigator.bluetooth) throw new Error('เบราว์เซอร์นี้ไม่รองรับ WebBluetooth');
  btDevice = await navigator.bluetooth.requestDevice({
    filters: [{ services: [BT_SERVICE_UUID] }, { services: [BT_SERVICE_UUID_2] }],
    optionalServices: [BT_SERVICE_UUID, BT_SERVICE_UUID_2],
  });
  const server = await btDevice.gatt.connect();
  let service, char;
  try {
    service = await server.getPrimaryService(BT_SERVICE_UUID);
    char    = await service.getCharacteristic(BT_CHAR_UUID);
  } catch {
    service = await server.getPrimaryService(BT_SERVICE_UUID_2);
    char    = await service.getCharacteristic(BT_CHAR_UUID_2);
  }
  btChar = char;
}

async function printViaBluetooth(escposBytes) {
  if (!btChar) throw new Error('กรุณาเชื่อมต่อเครื่องพิมพ์ Bluetooth ก่อน');
  const CHUNK = 512;
  for (let i = 0; i < escposBytes.length; i += CHUNK) {
    await btChar.writeValueWithoutResponse(escposBytes.slice(i, i + CHUNK));
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getTransportType() {
  if (getSunmiBridge()) return 'sunmi';
  if (getPaxBridge())   return 'pax';
  if (getIMinBridge())  return 'imin';
  if (usbDevice)        return 'usb';
  if (btChar)           return 'bluetooth';
  return null;
}

/**
 * Print a receipt.
 * @param {Object} receiptData  — same shape as buildEscPosReceipt()
 * @returns {Promise<string>}   — transport used ('sunmi' | 'pax' | 'imin' | 'usb' | 'bluetooth')
 */
export async function printReceipt(receiptData) {
  const escpos = buildEscPosReceipt(receiptData);

  const sunmi = getSunmiBridge();
  if (sunmi) { await printViaBridge(sunmi, escpos); return 'sunmi'; }

  const pax = getPaxBridge();
  if (pax) { await printViaBridge(pax, escpos); return 'pax'; }

  const imin = getIMinBridge();
  if (imin) { await printViaBridge(imin, escpos); return 'imin'; }

  if (usbDevice) { await printViaUsb(escpos); return 'usb'; }

  if (btChar) { await printViaBluetooth(escpos); return 'bluetooth'; }

  throw new Error('ไม่พบเครื่องพิมพ์ — กรุณาเชื่อมต่อ USB หรือ Bluetooth');
}

export function isPrinterAvailable() {
  return !!(
    getSunmiBridge() ||
    getPaxBridge()   ||
    getIMinBridge()  ||
    usbDevice        ||
    btChar
  );
}
