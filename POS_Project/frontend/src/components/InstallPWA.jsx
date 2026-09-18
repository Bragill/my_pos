import React, { useState, useEffect } from 'react';
import { XMarkIcon, ArrowUpTrayIcon, ArrowDownTrayIcon, EllipsisVerticalIcon } from '@heroicons/react/24/outline';

const InstallPWA = () => {
  const [promptInstall, setPromptInstall] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    // Check device type
    const ua = navigator.userAgent || '';
    const isIosDevice = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    const isAndroidDevice = /Android/i.test(ua);
    setIsIOS(isIosDevice);
    setIsAndroid(isAndroidDevice);

    // Check if already running in standalone PWA mode or launched from installed shortcut
    const isStandalone = 
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.navigator.standalone === true ||
      window.location.search.includes('source=pwa') ||
      document.referrer.includes('android-app://') ||
      localStorage.getItem('pwa_installed') === 'true';

    if (isStandalone) {
      return; // Never show if already installed or running as installed PWA app
    }

    // Check if dismissed in this session
    const dismissed = sessionStorage.getItem('pwa_prompt_dismissed');
    if (dismissed === 'true') {
      return;
    }

    let hasReceivedInstallPrompt = false;

    const handleBeforeInstall = (e) => {
      e.preventDefault();
      hasReceivedInstallPrompt = true;
      setPromptInstall(e);
      // Show prompt after a short delay
      setTimeout(() => setShowPrompt(true), 1500);
    };

    const handleAppInstalled = () => {
      localStorage.setItem('pwa_installed', 'true');
      setShowPrompt(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Only fallback for iOS or Android if beforeinstallprompt is supported
    const timer = setTimeout(() => {
      if (isIosDevice) {
        setShowPrompt(true);
      } else if (isAndroidDevice && hasReceivedInstallPrompt) {
        setShowPrompt(true);
      }
    }, 3000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
      clearTimeout(timer);
    };
  }, []);

  const onClickInstall = async (e) => {
    if (e) e.preventDefault();
    if (promptInstall) {
      promptInstall.prompt();
      const choiceResult = await promptInstall.userChoice;
      if (choiceResult?.outcome === 'accepted') {
        localStorage.setItem('pwa_installed', 'true');
        setShowPrompt(false);
      }
    } else {
      // For browsers where promptInstall is not available, show guidance
      alert('แตะที่เมนูเบราว์เซอร์ (⋮) ด้านบนขวา แล้วเลือก "ติดตั้งแอป" หรือ "เพิ่มลงในหน้าจอหลัก"');
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    sessionStorage.setItem('pwa_prompt_dismissed', 'true');
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 animate-fade-in pb-[env(safe-area-inset-bottom,0px)]">
      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <img src="/icons/icon-192.png" alt="POS" className="w-12 h-12 rounded-xl shadow-md flex-shrink-0" />
          <div className="min-w-0">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm sm:text-base truncate">ติดตั้งแอป POS</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">ใช้งานสะดวกและรวดเร็วยิ่งขึ้น</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {isIOS ? (
            <div className="text-right flex flex-col items-end max-w-[180px]">
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                แตะ <ArrowUpTrayIcon className="w-3.5 h-3.5 inline text-blue-600 dark:text-blue-400 font-bold" /> แล้วเลือก <span className="font-bold text-slate-700 dark:text-slate-200">"เพิ่มไปยังหน้าจอโฮม"</span>
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={onClickInstall}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold shadow-md transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowDownTrayIcon className="w-4 h-4" />
              <span>ติดตั้ง</span>
            </button>
          )}
          <button 
            type="button"
            onClick={handleDismiss}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="ปิด"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default InstallPWA;
