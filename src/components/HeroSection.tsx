import React, { useEffect, useRef, useState } from 'react';
import { HeroSlide, Language, NEUTRAL_PLACEHOLDER_IMG } from '../types';
import { useStorefrontData } from '../context/StorefrontDataContext';
import { useMobileViewport } from '../hooks/useMediaQuery';

interface HeroSectionProps {
  onScrollCueClick?: () => void;
  language?: Language;
  slides?: HeroSlide[];
  onNavigateLookbook?: () => void;
  onNavigateStory?: () => void;
}

interface HeroFrame {
  key: string;
  url: string;
  /** Portrait cut shown only on phones. */
  mobileUrl?: string;
  isVideo: boolean;
  poster?: string;
  mobilePoster?: string;
  alt: string;
  focalX: number;
  focalY: number;
}

const HOUSE_FILMS: HeroFrame[] = [
  {
    key: 'house-01',
    url: '/media/campaign-01.mp4',
    mobileUrl: '/media/editorial/floral-mobile.mp4',
    poster: '/media/campaign-01.jpg',
    mobilePoster: '/media/editorial/floral-mobile.jpg',
    isVideo: true,
    alt: 'ZEJESH campaign film, opening frame',
    focalX: 50,
    focalY: 42,
  },
  {
    key: 'house-02',
    url: '/media/campaign-02.mp4',
    mobileUrl: '/media/editorial/blue-mobile.mp4',
    poster: '/media/campaign-02.jpg',
    mobilePoster: '/media/editorial/blue-mobile.jpg',
    isVideo: true,
    alt: 'ZEJESH campaign film, house architecture',
    focalX: 50,
    focalY: 50,
  },
  {
    key: 'house-03',
    url: '/media/campaign-03.mp4',
    mobileUrl: '/media/editorial/manphone-mobile.mp4',
    poster: '/media/campaign-03.jpg',
    mobilePoster: '/media/editorial/manphone-mobile.jpg',
    isVideo: true,
    alt: 'ZEJESH campaign film, the pool',
    focalX: 50,
    focalY: 45,
  },
  {
    key: 'house-04',
    url: '/media/campaign-05.mp4',
    mobileUrl: '/media/editorial/motus-mobile.mp4',
    poster: '/media/campaign-05.jpg',
    mobilePoster: '/media/editorial/motus-mobile.jpg',
    isVideo: true,
    alt: 'ZEJESH campaign film, the runway',
    focalX: 50,
    focalY: 50,
  },
];

const SLIDE_DURATION = 7200;

/**
 * The opening screen.
 *
 * One moving picture at a time — never a grid, always one full viewport.
 * No headlines, no captions: only cloth, light and a quiet progress line.
 */
export const HeroSection: React.FC<HeroSectionProps> = ({ slides: externalSlides }) => {
  const { content } = useStorefrontData();
  const isMobileViewport = useMobileViewport();
  const [index, setIndex] = useState(0);
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([]);

  const configured = (externalSlides || content?.heroSlides || []).filter(
    (slide) => slide && slide.enabled !== false
  );

  const frames: HeroFrame[] = configured.length
    ? configured.map((slide, i) => {
        const media = slide.desktopMedia || slide.mobileMedia;
        const url = media?.url || slide.src || NEUTRAL_PLACEHOLDER_IMG;
        const isVideo =
          media?.kind === 'video' ||
          /\.(mp4|webm|mov)(\?.*)?$/i.test(url) ||
          (slide.type === 'video' && !media);

        return {
          key: slide.id || `slide-${i}`,
          url,
          mobileUrl: slide.mobileMedia?.url,
          isVideo,
          poster: media?.poster || slide.poster,
          mobilePoster: slide.mobileMedia?.poster || slide.poster,
          alt: media?.alt || slide.caption?.en || `ZEJESH campaign film ${i + 1}`,
          focalX: media?.framing?.focalX ?? slide.focalX ?? 50,
          focalY: media?.framing?.focalY ?? slide.focalY ?? 46,
        };
      })
    : HOUSE_FILMS;

  const count = Math.max(1, frames.length);
  const active = index % count;

  const framePosition = (frame: HeroFrame) => `${frame.focalX}% ${frame.focalY}%`;

  useEffect(() => {
    if (index > count - 1) setIndex(0);
  }, [count, index]);

  // One slide at a time. The current film plays; every other film rests.
  useEffect(() => {
    videoRefs.current.forEach((video, i) => {
      if (!video) return;
      if (i === active) {
        video.currentTime = 0;
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  }, [active, frames.length, isMobileViewport]);

  // Automatic progression, restarted whenever the visitor chooses a frame.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIndex((current) => (current + 1) % count);
    }, SLIDE_DURATION);
    return () => window.clearTimeout(timer);
  }, [active, count]);

  return (
    <section
      data-hero
      data-dark-section
      className="hero-stage"
      aria-label="ZEJESH — campaign opening"
    >
      <div className="hero-stage__reel">
        {frames.map((frame, i) => {
          const isActive = i === active;
          const src = isMobileViewport && frame.mobileUrl ? frame.mobileUrl : frame.url;
          const poster =
            isMobileViewport && frame.mobilePoster ? frame.mobilePoster : frame.poster;
          return (
            <div
              key={frame.key}
              className={`hero-slide ${isActive ? 'is-active' : ''}`}
              aria-hidden={!isActive}
            >
              {frame.isVideo ? (
                <video
                  ref={(node) => {
                    videoRefs.current[i] = node;
                  }}
                  src={src}
                  poster={poster}
                  muted
                  loop
                  playsInline
                  autoPlay={i === 0}
                  preload={i <= 1 ? 'auto' : 'metadata'}
                  className="hero-slide__media"
                  style={{ objectPosition: framePosition(frame) }}
                />
              ) : (
                <img
                  src={src || NEUTRAL_PLACEHOLDER_IMG}
                  alt={frame.alt}
                  loading={i === 0 ? 'eager' : 'lazy'}
                  draggable={false}
                  className="hero-slide__media"
                  style={{ objectPosition: framePosition(frame) }}
                  onError={(event) => {
                    const el = event.currentTarget;
                    if (el.dataset.fallback !== '1') {
                      el.dataset.fallback = '1';
                      el.src = NEUTRAL_PLACEHOLDER_IMG;
                    }
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="hero-stage__veil" aria-hidden="true" />

      <div className="hero-dots" role="tablist" aria-label="Campaign films">
        {frames.map((frame, i) => (
          <button
            key={`dot-${frame.key}`}
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-label={`Campaign film ${i + 1}`}
            onClick={() => setIndex(i)}
            className={`hero-dot ${i === active ? 'is-active' : ''}`}
          >
            <span className="hero-dot__track" />
          </button>
        ))}
      </div>
    </section>
  );
};
