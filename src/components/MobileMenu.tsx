import React, { useEffect, useMemo, useState } from 'react';
import { Language, Category, translations, SUB_CATEGORIES } from '../types';
import { lockBodyScroll, unlockBodyScroll } from '../utils/scrollLock';

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  onSetLanguage: (lang: Language) => void;
  onSelectCategory: (cat: string, sub?: string) => void;
  onNavigateHome: () => void;
  onNavigateLookbook: () => void;
  onNavigateSitemap: () => void;
  onNavigateStory: () => void;
  onNavigateVote: () => void;
  onNavigateJournal: () => void;
  onNavigateAccount?: () => void;
  categories?: Category[];
}

/**
 * NULLA mobile navigation — full-screen ink menu, display-xl links,
 * masked rise, hairline structure.
 */
export const MobileMenu: React.FC<MobileMenuProps> = ({
  isOpen,
  onClose,
  language,
  onSelectCategory,
  onNavigateHome,
  onNavigateLookbook,
  onNavigateSitemap,
  onNavigateStory,
  onNavigateVote,
  onNavigateJournal,
  onNavigateAccount,
  categories = [],
}) => {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const t = translations[language] || translations.en;

  useEffect(() => {
    if (isOpen) {
      lockBodyScroll();
      setActiveCategory(null);
    } else {
      unlockBodyScroll();
    }
    return () => unlockBodyScroll();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeCategory) setActiveCategory(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, activeCategory, onClose]);

  const resolveCategoryTitle = (cat: Category | undefined): string => {
    if (!cat) return '';
    if (typeof cat.name === 'string') return cat.name;
    if (cat.name && typeof cat.name === 'object') {
      return cat.name.en || cat.name.fi || cat.slug || '';
    }
    return cat.slug || '';
  };

  const items = useMemo(() => {
    const roots = (categories || [])
      .filter((c) => c && !c.parentId && c.visible)
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    if (roots.length > 0) {
      const rootItems = roots.slice(0, 4).map((cat) => ({
        key: cat.slug || cat.id,
        label: resolveCategoryTitle(cat),
        subKey: cat.id || cat.slug || '',
        categoryId: cat.slug || cat.id,
      }));
      return [
        { key: 'new', label: 'New', subKey: null, categoryId: 'all' },
        ...rootItems,
        { key: 'lookbook', label: 'Lookbook', subKey: null, categoryId: 'lookbook' },
        { key: 'story', label: 'Studio', subKey: null, categoryId: 'story' },
        { key: 'journal', label: 'Journal', subKey: null, categoryId: 'journal' },
        { key: 'vote', label: 'Suggest', subKey: null, categoryId: 'vote' },
      ];
    }

    return [
      { key: 'new', label: 'New', subKey: null, categoryId: 'all' },
      { key: 'naiset', label: 'Women', subKey: 'naiset', categoryId: 'naiset' },
      { key: 'miehet', label: 'Men', subKey: 'miehet', categoryId: 'miehet' },
      { key: 'asusteet', label: 'Accessories', subKey: 'asusteet', categoryId: 'asusteet' },
      { key: 'lookbook', label: 'Lookbook', subKey: null, categoryId: 'lookbook' },
      { key: 'story', label: 'Studio', subKey: null, categoryId: 'story' },
      { key: 'journal', label: 'Journal', subKey: null, categoryId: 'journal' },
      { key: 'vote', label: 'Suggest', subKey: null, categoryId: 'vote' },
    ];
  }, [categories, language]);

  const activeSubcategories = useMemo(() => {
    if (!activeCategory) return [];
    if (categories && categories.length > 0) {
      const parent = categories.find((c) => c.id === activeCategory || c.slug === activeCategory);
      if (parent) {
        const subs = categories
          .filter((c) => c.parentId === parent.id && c.visible)
          .sort((a, b) => (a.order || 0) - (b.order || 0))
          .map((c) => ({ name: resolveCategoryTitle(c), slug: c.slug || c.id || '' }))
          .filter((s) => s.name);
        if (subs.length > 0) return subs;
      }
    }
    const fallback = SUB_CATEGORIES[activeCategory as keyof typeof SUB_CATEGORIES] || [];
    return fallback.map((s: any) =>
      typeof s === 'string'
        ? { name: s, slug: s.toLowerCase().replace(/\s+/g, '-') }
        : { name: typeof s.name === 'string' ? s.name : s.name.en || '', slug: s.slug }
    );
  }, [activeCategory, categories, language]);

  if (!isOpen) return null;

  const go = (item: (typeof items)[number]) => {
    if (item.key === 'journal') onNavigateJournal();
    else if (item.key === 'lookbook') onNavigateLookbook();
    else if (item.key === 'story') onNavigateStory();
    else if (item.key === 'vote') onNavigateVote();
    else if (item.subKey) {
      setActiveCategory(item.subKey);
      return;
    } else onSelectCategory(item.categoryId);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Navigation"
      className="fixed inset-0 z-[95] flex flex-col justify-between overflow-y-auto bg-paper text-ink"
      style={{
        height: '100dvh',
        paddingTop: 'calc(1.25rem + env(safe-area-inset-top, 0px))',
        paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
        paddingLeft: 'calc(1.5rem + env(safe-area-inset-left, 0px))',
        paddingRight: 'calc(1.5rem + env(safe-area-inset-right, 0px))',
      }}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-ink-a18 pb-5">
        {activeCategory ? (
          <button
            type="button"
            onClick={() => setActiveCategory(null)}
            className="flex min-h-[44px] items-center gap-3 label text-[9px]"
          >
            ← Back
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              onNavigateHome();
              onClose();
            }}
            className="flex min-h-[44px] items-center font-display text-[22px] tracking-[0.42em]"
            aria-label="Return home"
          >
            ZEJESH
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          className="flex min-h-[44px] min-w-[44px] items-center justify-end label text-[9px] text-ink/60"
          aria-label="Close navigation"
        >
          Close ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-8">
        {!activeCategory ? (
          <nav className="flex flex-col" aria-label="Mobile navigation">
            {items.map((item, i) => (
              <div
                key={item.key}
                className="flex items-center justify-between border-b border-ink-a18 py-1"
                style={{ animation: `nulla-rise 1100ms var(--ease-inout) both`, animationDelay: `${i * 70}ms` }}
              >
                <button
                  type="button"
                  onClick={() => go(item)}
                  className="min-h-[64px] flex-1 py-2 text-left font-display text-[clamp(34px,10vw,56px)] font-light leading-[1.05]"
                >
                  {item.label}
                </button>
                {item.subKey && (
                  <button
                    type="button"
                    onClick={() => setActiveCategory(item.subKey)}
                    className="flex h-11 min-w-[44px] items-center justify-end label text-[16px] text-ink/40"
                    aria-label={`View ${item.label}`}
                  >
                    →
                  </button>
                )}
              </div>
            ))}
          </nav>
        ) : (
          <div className="flex flex-col">
            <span className="label text-[9px] text-ink/40">Department</span>
            <h3 className="mt-3 font-display text-[clamp(40px,12vw,64px)] font-light leading-none">
              {items.find((i) => i.subKey === activeCategory)?.label || activeCategory}
            </h3>
            <button
              type="button"
              onClick={() => {
                onSelectCategory(activeCategory);
                onClose();
              }}
              className="mt-7 min-h-[48px] border-b border-ink-a18 py-4 text-left label text-[10px]"
            >
              View all pieces →
            </button>
            {activeSubcategories.map((sub) => (
              <button
                key={sub.slug}
                type="button"
                onClick={() => {
                  onSelectCategory(activeCategory, sub.name);
                  onClose();
                }}
                className="min-h-[48px] border-b border-ink-a18 py-4 text-left font-display text-[24px] font-light"
              >
                {sub.name}
              </button>
            ))}
          </div>
        )}

        <div className="mt-10 flex flex-col gap-1 border-t border-ink-a18 pt-6">
          <button
            type="button"
            onClick={() => {
              onNavigateAccount?.();
              onClose();
            }}
            className="flex min-h-[44px] items-center justify-between label text-[9px] text-ink/60"
          >
            Account <span>→</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onNavigateSitemap();
              onClose();
            }}
            className="flex min-h-[44px] items-center justify-between label text-[9px] text-ink/60"
          >
            Site directory <span>→</span>
          </button>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-ink-a18 pt-4 label text-[9px] text-ink/35">
        <span>ZEJESH Atelier</span>
        <span>Helsinki · Porto</span>
      </div>
    </div>
  );
};
