import React, { useState, useEffect } from 'react';
import { translations, Language } from '../types';
import { tracker } from '../tracker/trackingService';

interface CookieBannerProps {
  language: Language;
}

export const CookieBanner: React.FC<CookieBannerProps> = ({ language }) => {
  const [isOpen, setIsOpen] = useState(false);
  const t = translations[language].cookie;

  useEffect(() => {
    const accepted = localStorage.getItem('zejesh_cookies_accepted');
    if (accepted) return;

    const overHero = () => {
      const hero = document.querySelector('[data-hero]');
      return Boolean(hero && window.scrollY < window.innerHeight - 120);
    };

    const timer = setTimeout(() => {
      if (!overHero()) setIsOpen(true);
    }, 1600);

    const onScroll = () => {
      if (localStorage.getItem('zejesh_cookies_accepted')) return;
      setIsOpen(!overHero());
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  const handleAccept = () => {
    localStorage.setItem('zejesh_cookies_accepted', 'true');
    tracker.setConsent(true);
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div
      role="region"
      aria-label="Privacy and Cookie Preferences"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-ink-a14 bg-paper/95 backdrop-blur-sm"
    >
      <div className="page-shell flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-10">
        <p className="max-w-[62ch] font-light text-[11px] leading-relaxed tracking-[0.01em] text-ink-a64">
          {t.text}
        </p>
        <div className="flex shrink-0 items-center gap-6">
          <button
            type="button"
            onClick={handleAccept}
            className="min-h-[32px] label text-[8px] text-ink underline underline-offset-4 transition-opacity hover:opacity-55"
          >
            {t.accept}
          </button>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="min-h-[32px] label text-[8px] text-ink-a45 transition-colors hover:text-ink"
          >
            {t.settings}
          </button>
        </div>
      </div>
    </div>
  );
};
