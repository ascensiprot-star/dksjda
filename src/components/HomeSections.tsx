import React, { useEffect, useMemo, useRef } from 'react';
import { Language, Product, formatPrice } from '../types';
import { editorialAt } from '../editorial';
import { useMobileViewport } from '../hooks/useMediaQuery';

interface HomeSectionsProps {
  language: Language;
  onSelectProduct: (product: Product) => void;
  onSelectCategory: (category: string, sub?: string) => void;
  onOpenQuickLook: (product: Product) => void;
  onQuickAdd: (product: Product, size: string) => void;
  onToggleWishlist: (productId: string) => void;
  wishlistIds: string[];
  onNavigateStory: () => void;
  onNavigateLookbook: () => void;
  products?: Product[];
}

interface SceneSource {
  url: string;
  mobileUrl?: string;
  kind: 'video' | 'image';
  poster?: string;
  mobilePoster?: string;
  alt?: string;
  position?: string;
  positionMobile?: string;
  tone?: string;
  mobileTone?: string;
}

const SceneMedia: React.FC<{
  media: SceneSource;
  className?: string;
}> = ({ media, className }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isMobileViewport = useMobileViewport();
  const useMobileSource = isMobileViewport && Boolean(media.mobileUrl);
  const src = useMobileSource ? (media.mobileUrl as string) : media.url;
  const poster = useMobileSource ? (media.mobilePoster || media.poster) : media.poster;

  useEffect(() => {
    if (media.kind !== 'video') return;
    const node = videoRef.current;
    if (!node) return;
    node.play().catch(() => {});
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) node.play().catch(() => {});
          else node.pause();
        });
      },
      { rootMargin: '260px 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [media.kind, src]);

  const mediaStyle = {
    '--scene-pos': media.position || 'center',
    '--scene-pos-m': media.positionMobile || media.position || 'center',
    filter: useMobileSource ? media.mobileTone || media.tone : media.tone,
  } as React.CSSProperties;

  if (media.kind === 'video') {
    return (
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        className={className}
        style={mediaStyle}
        aria-label={media.alt}
      />
    );
  }

  return (
    <img
      src={src}
      alt={media.alt || ''}
      loading="lazy"
      className={className}
      style={mediaStyle}
    />
  );
};

const SceneLink: React.FC<{
  children: React.ReactNode;
  onClick: () => void;
}> = ({ children, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="label mt-8 inline-flex min-h-[44px] items-center gap-4 text-[9px] text-white/70 transition-colors duration-500 hover:text-white"
  >
    {children} <span aria-hidden="true">→</span>
  </button>
);

export const HomeSections: React.FC<HomeSectionsProps> = ({
  language,
  onSelectProduct,
  onSelectCategory,
  onNavigateLookbook,
  products = [],
}) => {
  const liveProducts = useMemo(
    () => (Array.isArray(products) ? products.filter((p) => p && p.status === 'live') : []),
    [products]
  );

  const scenes = useMemo<SceneSource[]>(
    () => [
      {
        url: '/media/campaign-03.mp4',
        mobileUrl: '/media/scenes/longview-mobile.mp4',
        kind: 'video',
        poster: '/media/campaign-03.jpg',
        mobilePoster: '/media/scenes/longview-mobile.jpg',
        alt: 'ZEJESH campaign film — the opening chapter',
        position: 'center 45%',
        positionMobile: '50% 50%',
        tone: 'grayscale(1) contrast(1.08) brightness(1.02)',
      },
      {
        url: '/media/campaign-05.mp4',
        mobileUrl: '/media/scenes/noir-mobile.mp4',
        kind: 'video',
        poster: '/media/campaign-05.jpg',
        mobilePoster: '/media/scenes/noir-mobile.jpg',
        alt: 'ZEJESH campaign film — the house film',
        position: 'center 50%',
        positionMobile: '50% 50%',
        tone: 'grayscale(1) contrast(1.12) brightness(1.3)',
        mobileTone: 'grayscale(1) contrast(1.12) brightness(0.98)',
      },
      {
        url: '/media/campaign-01.mp4',
        mobileUrl: '/media/scenes/light-mobile.mp4',
        kind: 'video',
        poster: '/media/campaign-01.jpg',
        mobilePoster: '/media/scenes/light-mobile.jpg',
        alt: 'ZEJESH campaign film — the closing chapter',
        position: 'center 38%',
        positionMobile: '50% 50%',
        tone: 'grayscale(1) contrast(1.08) brightness(0.92)',
        mobileTone: 'grayscale(1) contrast(1.06) brightness(1.04)',
      },
    ],
    []
  );

  const pieces = useMemo(() => liveProducts.slice(0, 3), [liveProducts]);

  return (
    <div className="w-full overflow-hidden bg-ink text-paper">
      {/* 01 — the opening chapter */}
      <section className="film-scene scene" data-dark-section aria-label="The opening chapter">
        <SceneMedia media={scenes[0]} className="film-scene__media scene__media" />
        <div className="film-scene__shade scene__shade" aria-hidden="true" />

        <div className="film-scene__frame">
          <div className="page-shell flex flex-1 flex-col items-center justify-end pb-20 text-center md:pb-28">
            <h2 className="max-w-[14ch] font-display text-[clamp(46px,8vw,132px)] leading-[0.88] tracking-[-0.04em] text-white">
              Clothes for the <em>long view.</em>
            </h2>
            <SceneLink onClick={() => onSelectCategory('all')}>Enter the collection</SceneLink>
          </div>
        </div>
      </section>

      {/* 02 — the pieces */}
      <section className="collection-stage" data-dark-section aria-labelledby="pieces-title">
        <div className="collection-stage__panels no-scrollbar">
          {(pieces.length > 0
            ? pieces.map((product, i) => ({
                key: product.id,
                image: product.image || product.images?.[0]?.url || editorialAt(i),
                name: product.name?.[language] || product.name?.en || 'Piece',
                meta: formatPrice(product.price),
                onClick: () => onSelectProduct(product),
              }))
            : [0, 1, 2].map((i) => ({
                key: `study-${i}`,
                image: editorialAt(i),
                name: `Study ${String(i + 1).padStart(2, '0')}`,
                meta: 'The archive',
                onClick: () => onSelectCategory('all'),
              }))
          ).map((panel) => (
            <button
              key={panel.key}
              type="button"
              onClick={panel.onClick}
              className="collection-panel group"
            >
              <img src={panel.image} alt={panel.name} loading="lazy" className="collection-panel__image" />
              <span className="collection-panel__shade" aria-hidden="true" />
              <span className="collection-panel__caption">
                <span className="font-display text-[clamp(22px,2vw,32px)] leading-none text-white">
                  {panel.name}
                </span>
                <span className="label mt-2 block text-[8px] text-white/60">{panel.meta}</span>
              </span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => onSelectCategory('all')}
          className="collection-stage__all label min-h-[44px] text-[9px] text-white/70 transition-colors hover:text-white"
        >
          All pieces <span aria-hidden="true">→</span>
        </button>
        <h2 id="pieces-title" className="sr-only">
          The pieces
        </h2>
      </section>

      {/* 03 — the house film */}
      <section className="film-scene scene" data-dark-section aria-labelledby="film-title">
        <SceneMedia media={scenes[1]} className="film-scene__media scene__media" />
        <div className="film-scene__shade scene__shade" aria-hidden="true" />

        <div className="film-scene__frame">
          <div className="page-shell flex flex-1 flex-col items-center justify-end pb-20 text-center md:pb-28">
            <h2
              id="film-title"
              className="max-w-[13ch] font-display text-[clamp(46px,7.6vw,124px)] leading-[0.88] tracking-[-0.04em] text-white"
            >
              A film <em>in black.</em>
            </h2>
            <SceneLink onClick={onNavigateLookbook}>Open the lookbook</SceneLink>
          </div>
        </div>
      </section>

      {/* 04 — the lookbook */}
      <section className="film-scene scene" data-dark-section aria-labelledby="lookbook-title">
        <SceneMedia media={scenes[2]} className="film-scene__media scene__media" />
        <div className="film-scene__shade scene__shade" aria-hidden="true" />

        <div className="film-scene__frame">
          <div className="page-shell flex flex-1 flex-col items-center justify-end pb-20 text-center md:pb-28">
            <h2
              id="lookbook-title"
              className="max-w-[13ch] font-display text-[clamp(46px,8vw,132px)] leading-[0.88] tracking-[-0.04em] text-white"
            >
              A study in <em>light.</em>
            </h2>
            <SceneLink onClick={() => onSelectCategory('all')}>Enter the collection</SceneLink>
          </div>
        </div>
      </section>
    </div>
  );
};
