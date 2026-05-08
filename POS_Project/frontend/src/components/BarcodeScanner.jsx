import { useEffect, useRef, useState, useCallback } from "react";
import { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } from "@zxing/library";
import ScanIcon from "./ScanIcon";

// Utility: play a short beep sound on successful scan
function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = 1200;
    gain.gain.value = 0.3;
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {}
}

export default function BarcodeScanner({ onDetected, onClose, isContinuous = false }) {
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const cooldownRef = useRef(false);

  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [lastScanned, setLastScanned] = useState(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [devices, setDevices] = useState([]);
  const [currentDeviceId, setCurrentDeviceId] = useState(null);

  const hasFiredRef = useRef(false);
  const lastScannedCodeRef = useRef("");
  const lastScanTimeRef = useRef(0);

  // ── Stop camera & reader ──
  const stopCamera = useCallback(() => {
    if (readerRef.current) {
      try { readerRef.current.reset(); } catch {}
      readerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  }, []);

  // ── Toggle torch (flashlight) ──
  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()?.[0];
    if (!track) return;
    try {
      const caps = track.getCapabilities?.();
      if (caps?.torch) {
        await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
        setTorchOn(prev => !prev);
      }
    } catch {}
  }, [torchOn]);

  // ── Start camera & live scanning ──
  const startCamera = useCallback(async (deviceId = null) => {
    stopCamera();
    setError(null);
    setLastScanned(null);
    hasFiredRef.current = false;
    lastScannedCodeRef.current = "";
    lastScanTimeRef.current = 0;

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("กรุณาเปิดผ่าน HTTPS เพื่อใช้งานกล้อง");
      return;
    }

    try {
      const reader = new BrowserMultiFormatReader();
      
      // Configure reader with supported barcode formats
      const hints = new Map();
      hints.set(DecodeHintType.TRY_HARDER, true);
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.QR_CODE,
        BarcodeFormat.DATA_MATRIX,
        BarcodeFormat.ITF,
        BarcodeFormat.RSS_14,
        BarcodeFormat.RSS_EXPANDED,
      ]);
      reader.hints = hints;
      readerRef.current = reader;

      // List devices for manual switching
      const videoDevices = await reader.listVideoInputDevices();
      setDevices(videoDevices);

      // Camera constraints
      const constraints = {
        video: deviceId ? { deviceId: { exact: deviceId } } : { 
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
          focusMode: "continuous"
        }
      };

      setScanning(true);

      // Use decodeFromConstraints for better control
      await reader.decodeFromConstraints(constraints, videoRef.current, (result, err) => {
        if (result && !hasFiredRef.current) {
          const text = result.getText();
          const now = Date.now();
          
          // Logic: 
          // 1. If it's the exact same code, wait at least 2 seconds (to prevent accidental double scans)
          // 2. For any code, wait at least 500ms between scans (debounce)
          const isSameCode = text === lastScannedCodeRef.current;
          const timeSinceLastScan = now - lastScanTimeRef.current;
          
          if (isSameCode && timeSinceLastScan < 2000) return;
          if (timeSinceLastScan < 500) return;

          hasFiredRef.current = true; // LOCK
          lastScannedCodeRef.current = text;
          lastScanTimeRef.current = now;
          
          setLastScanned(text);
          playBeep();
          onDetected(text);
          
          if (isContinuous) {
            // In continuous mode, unlock after a short delay to allow NEXT different scan
            // But we keep the lastScannedCodeRef to prevent RE-scanning the same one too quickly
            setTimeout(() => {
              hasFiredRef.current = false;
              setLastScanned(null);
            }, 1000);
          } else {
            // In one-shot mode, stop completely
            try { reader.reset(); } catch {}
          }
        }
      });

      // Update current device ID and check capabilities
      const videoEl = videoRef.current;
      if (videoEl?.srcObject) {
        streamRef.current = videoEl.srcObject;
        const track = videoEl.srcObject.getVideoTracks()[0];
        if (track) {
          setCurrentDeviceId(track.getSettings()?.deviceId);
          const caps = track.getCapabilities?.();
          setHasTorch(!!caps?.torch);
          
          // Attempt to enable continuous focus if supported
          try {
            if (caps?.focusMode?.includes("continuous")) {
              await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error("Scanner Error:", err);
      setError("ไม่สามารถเปิดกล้องได้: " + (err.message || String(err)));
      setScanning(false);
    }
  }, [stopCamera, onDetected]);

  // Switch camera handler
  const switchCamera = () => {
    if (devices.length < 2) return;
    const currentIndex = devices.findIndex(d => d.deviceId === currentDeviceId);
    const nextIndex = (currentIndex + 1) % devices.length;
    startCamera(devices[nextIndex].deviceId);
  };

  // Auto-start camera on mount
  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handle image file capture fallback ──
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProcessing(true);
    setError(null);
    try {
      const hints = new Map();
      hints.set(DecodeHintType.TRY_HARDER, true);
      const reader = new BrowserMultiFormatReader(hints);
      const url = URL.createObjectURL(file);
      const result = await reader.decodeFromImageUrl(url);
      URL.revokeObjectURL(url);
      playBeep();
      onDetected(result.getText());
    } catch {
      setError("ไม่พบบาร์โค้ดในภาพ กรุณาลองใหม่");
    } finally {
      setProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ── Close handler ──
  const handleClose = () => {
    stopCamera();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/90 flex flex-col items-center justify-center z-[200] p-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ScanIcon size={22} color="white" strokeWidth={2} />
            <h3 className="text-white font-bold text-lg">สแกนบาร์โค้ด</h3>
          </div>
          <div className="flex items-center gap-2">
            {/* Switch Camera */}
            {devices.length > 1 && (
              <button
                onClick={switchCamera}
                className="w-9 h-9 rounded-full bg-white/20 text-white flex items-center justify-center text-lg hover:bg-white/30 transition-all"
                title="สลับกล้อง"
              >
                🔄
              </button>
            )}
            {/* Torch toggle */}
            {hasTorch && (
              <button
                onClick={toggleTorch}
                className={`w-9 h-9 rounded-full flex items-center justify-center text-lg transition-all ${
                  torchOn ? "bg-yellow-400 text-black shadow-lg shadow-yellow-400/30" : "bg-white/20 text-white"
                }`}
                title={torchOn ? "ปิดไฟฉาย" : "เปิดไฟฉาย"}
              >
                {torchOn ? "🔦" : "💡"}
              </button>
            )}
            {/* Close button */}
            <button
              onClick={handleClose}
              className="w-9 h-9 rounded-full bg-white/20 text-white flex items-center justify-center text-lg hover:bg-white/30 transition-all"
            >
              ✕
            </button>
          </div>
        </div>

        {error ? (
          /* Error State */
          <div className="bg-white rounded-2xl p-6 text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-red-50 rounded-full flex items-center justify-center text-3xl">
              ⚠️
            </div>
            <p className="text-red-500 font-semibold text-sm">{error}</p>
            <button
              onClick={startCamera}
              className="w-full py-2.5 rounded-xl text-white text-sm font-semibold"
              style={{ backgroundImage: "linear-gradient(to left,#3300FC,#95008A,#EB0000)" }}
            >
              🔄 ลองใหม่
            </button>
            <div className="border-t pt-4">
              <p className="text-gray-500 text-xs mb-3">หรือถ่ายภาพบาร์โค้ด</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
                id="barcode-capture"
              />
              <label
                htmlFor="barcode-capture"
                className="block w-full py-2.5 rounded-xl text-white text-sm font-semibold cursor-pointer text-center"
                style={{
                  backgroundImage: "linear-gradient(to left,#3300FC,#95008A,#EB0000)",
                  opacity: processing ? 0.7 : 1,
                }}
              >
                {processing ? "⏳ กำลังอ่าน..." : "📸 ถ่ายภาพแทน"}
              </label>
            </div>
          </div>
        ) : (
          <>
            {/* Camera Viewfinder */}
            <div className="relative rounded-2xl overflow-hidden bg-black w-full" style={{ aspectRatio: "1" }}>
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />

              {/* Scanning frame overlay */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-64 h-40 relative">
                  {/* Corner brackets */}
                  {[
                    "top-0 left-0 border-t-4 border-l-4 rounded-tl-xl",
                    "top-0 right-0 border-t-4 border-r-4 rounded-tr-xl",
                    "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-xl",
                    "bottom-0 right-0 border-b-4 border-r-4 rounded-br-xl",
                  ].map((cls, i) => (
                    <div key={i} className={"absolute w-8 h-8 border-white " + cls} />
                  ))}

                  {/* Animated scan line */}
                  <div
                    className={`absolute inset-x-2 h-0.5 animate-scan top-1/2 transition-colors ${
                      lastScanned ? "bg-green-400" : "bg-green-400/80"
                    }`}
                  />
                </div>
              </div>

              {/* Success flash overlay */}
              {lastScanned && (
                <div className="absolute inset-0 bg-green-400/20 flex items-center justify-center pointer-events-none animate-pulse">
                  <div className="bg-green-500 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg">
                    ✅ {lastScanned}
                  </div>
                </div>
              )}

              {/* Bottom status */}
              <div className="absolute bottom-3 left-0 right-0 text-center">
                <span className="text-white/80 text-xs bg-black/40 px-3 py-1 rounded-full">
                  {lastScanned
                    ? "✅ สแกนสำเร็จ!"
                    : scanning
                    ? "🔍 กำลังสแกน..."
                    : "⏳ เปิดกล้อง..."}
                </span>
              </div>
            </div>

            {/* Bottom info & actions */}
            <div className="mt-3 space-y-2">
              <p className="text-white/60 text-xs text-center">
                วางบาร์โค้ดในกรอบ — รองรับ EAN-13, Code-128, QR Code
              </p>

              {/* Image capture fallback */}
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileChange}
                  className="hidden"
                  id="barcode-capture-bottom"
                />
                <label
                  htmlFor="barcode-capture-bottom"
                  className="flex-1 py-2.5 rounded-xl text-white text-xs font-semibold cursor-pointer text-center bg-white/10 hover:bg-white/20 transition-all"
                  style={{ opacity: processing ? 0.7 : 1 }}
                >
                  {processing ? "⏳ กำลังอ่าน..." : "📸 ถ่ายภาพแทน"}
                </label>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}