import React, { useState, useEffect } from 'react';
import { XMarkIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';

const InstallPWA = () => {
  const [supportsPWA, setSupportsPWA] = useState(false);
  const [promptInstall, setPromptInstall] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if it's iOS
    const isIosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    setIsIOS(isIosDevice);

    // Check if already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    
    if (isStandalone) {
      return; // Don't show if already installed
    }

    const handler = (e) => {
      e.preventDefault();
      setSupportsPWA(true);
      setPromptInstall(e);
      // Show prompt after a short delay
      setTimeout(() => setShowPrompt(true), 3000);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // For iOS, we can't catch an event, so we show it after a delay if it's iOS and not standalone
    if (isIosDevice) {
      setTimeout(() => setShowPrompt(true), 4000);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const onClickInstall = (e) => {
    e.preventDefault();
    if (!promptInstall) return;
    promptInstall.prompt();
    promptInstall.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        setShowPrompt(false);
      }
    });
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 animate-bounce-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-xl">
            P
          </div>
          <div>
            <h3 className="font-bold text-slate-900">ติดตั้งแอป POS</h3>
            <p className="text-xs text-slate-500">ใช้งานสะดวกและรวดเร็วยิ่งขึ้น</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isIOS ? (
            <div className="text-right flex flex-col items-end">
              <p className="text-[10px] text-slate-400 mb-1">แตะที่ปุ่มแชร์ <ArrowUpTrayIcon className="w-3 h-3 inline" /> แล้วเลือก "เพิ่มไปยังหน้าจอโฮม"</p>
            </div>
          ) : (
            <button
              onClick={onClickInstall}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              ติดตั้ง
            </button>
          )}
          <button 
            onClick={() => setShowPrompt(false)}
            className="p-1 text-slate-400 hover:text-slate-600"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default InstallPWA;
