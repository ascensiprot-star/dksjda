import React, { useEffect, useRef, useState } from 'react';
import { Language, Category, translations } from '../types';
import { useAuth } from '../supabase/AuthContext';

interface HeaderProps {
  language: Language;
  onSetLanguage?: (lang: Language) => void;
  cartCount: number;
  wishlistCount: number;
  onOpenCart: () => void;
  onOpenWishlist: () => void;
  onOpenSearch: () => void;
  onOpenAccount: () => void;
  onOpenMobileMenu: () => void;
  onSelectCategory: (cat: string, sub?: string) => void;
  onNavigateHome: () => void;
  onNavigateLookbook: () => void;
  onNavigateSitemap?: () => void;
  onNavigateStory: () => void;
  onNavigateVote: () => void;
  isHeroVisible: boolean;
  currentCategory?: string;
  currentRouteType?: string;
  categories?: Category[];
}

/**
 * House navigation — a quiet white band with the mark at its centre.
 * It stays out of the opening frame and arrives with the first scroll.
 */
export const Header: React.FC<HeaderProps> = ({
  language,
  cartCount,
  wishlistCount,
  onOpenCart,
  onOpenWishlist,
  onOpenSearch,
  onOpenAccount,
  onOpenMobileMenu,
  onNavigateHome,
  isHeroVisible,
  currentRouteType,
}) => {
  const { user } = useAuth();
  const t = translations[language];
  const openingFrameRoutes = ['home', 'story', 'journal', 'lookbook', 'vote'];
  const hidden = Boolean(currentRouteType && openingFrameRoutes.includes(currentRouteType) && isHeroVisible);
  const headerRef = useRef<HTMLElement | null>(null);
  const [overMedia, setOverMedia] = useState(currentRouteType === 'home');

  useEffect(() => {
    const check = () => {
      const header = headerRef.current;
      if (!header) return;
      const line = header.offsetHeight - 4;
      const scenes = document.querySelectorAll<HTMLElement>('[data-dark-section]');
      let found = false;
      scenes.forEach((scene) => {
        const rect = scene.getBoundingClientRect();
        if (rect.top <= line && rect.bottom >= line) found = true;
      });
      setOverMedia(found);
    };
    check();
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => {
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, [currentRouteType]);

  return (
    <header
      ref={headerRef}
      className={`site-header fixed left-0 right-0 top-0 z-50 transition-[background-color,color] duration-500 ${
        overMedia
          ? 'site-header--over-media text-white'
          : 'bg-paper text-ink'
      }`}
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        transform: hidden ? 'translateY(-102%)' : 'translateY(0)',
        transition: 'transform 800ms cubic-bezier(.76,0,.24,1), background-color 500ms ease, color 500ms ease',
      }}
    >
      <div className="page-shell flex h-[var(--nav-h)] items-center justify-between gap-4">
        {/* left — menu + search */}
        <div className="flex flex-1 items-center gap-6">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="group flex min-h-[44px] items-center gap-3 label text-[9px]"
            aria-label="Open the house menu"
          >
            <span className="flex flex-col gap-[5px]">
              <span className="block h-px w-[18px] bg-current transition-all duration-500 group-hover:w-[13px]" />
              <span className="block h-px w-[18px] bg-current transition-all duration-500 group-hover:w-[22px]" />
            </span>
            <span className="hidden sm:inline">Menu</span>
          </button>
          <button
            type="button"
            onClick={onOpenSearch}
            className="hidden min-h-[44px] items-center label text-[9px] opacity-60 transition-opacity duration-300 hover:opacity-100 sm:flex"
          >
            Search
          </button>
        </div>

        {/* centre — the mark */}
        <button
          type="button"
          onClick={onNavigateHome}
          className="flex min-h-[44px] shrink-0 items-center font-display text-[19px] leading-none tracking-[0.3em] sm:text-[22px] md:text-[24px]"
          aria-label="ZEJESH — home"
        >
          ZEJESH
        </button>

        {/* right — services */}
        <div className="flex flex-1 items-center justify-end gap-5 sm:gap-7">
          <button
            type="button"
            onClick={onOpenWishlist}
            className="hidden min-h-[44px] items-center label text-[9px] opacity-60 transition-opacity duration-300 hover:opacity-100 md:flex"
          >
            Saved{wishlistCount > 0 ? ` (${wishlistCount})` : ''}
          </button>
          <button
            type="button"
            onClick={onOpenAccount}
            className="flex min-h-[44px] items-center label text-[9px] opacity-60 transition-opacity duration-300 hover:opacity-100"
          >
            {user ? 'Account' : 'Sign In'}
          </button>
          <button
            type="button"
            onClick={onOpenCart}
            className="flex min-h-[44px] items-center gap-2 label text-[9px]"
            aria-label={t.nav.bag}
          >
            <span className="hidden sm:inline">Bag</span>
            <span className="sm:hidden">Bag</span>
            <span className="ml-1 font-mono text-[8px] tracking-normal opacity-60">{cartCount}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
