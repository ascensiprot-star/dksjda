import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Plus } from 'lucide-react';
import { NEUTRAL_PLACEHOLDER_IMG } from '../types';

interface HeroAction {
  label: string;
  onClick: () => void;
  icon?: 'arrow' | 'plus';
}

interface CinematicHeroProps {
  image: string;
  imageAlt: string;
  eyebrow: string;
  title: React.ReactNode;
  description: string;
  topLabel: string;
  backAction: () => void;
  primaryAction?: HeroAction;
  secondaryAction?: HeroAction;
  imageCaption?: string;
  titleClassName?: string;
  imagePosition?: string;
}

export const CinematicHero: React.FC<CinematicHeroProps> = ({
  image,
  imageAlt,
  eyebrow,
  title,
  description,
  topLabel,
  backAction,
  primaryAction,
  secondaryAction,
  imageCaption,
  titleClassName = 'text-[clamp(54px,7.2vw,134px)]',
  imagePosition = 'center 18%',
}) => {
  const [failed, setFailed] = useState(false);

  return (
    <section
      data-dark-section
      className="relative min-h-[100svh] w-full overflow-hidden bg-black text-white"
    >
      <img
        src={failed ? NEUTRAL_PLACEHOLDER_IMG : image}
        alt={imageAlt}
        onError={() => setFailed(true)}
        className="absolute inset-0 h-full w-full object-cover grayscale contrast-[1.08]"
        style={{ objectPosition: imagePosition }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/5 to-black/90"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-black/45 to-transparent"
      />

      <div className="relative z-10 page-shell flex min-h-[100svh] flex-col justify-between pb-10 pt-[calc(var(--nav-h)+26px)] md:pb-14">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={backAction}
            className="group flex min-h-[44px] items-center gap-3 label text-[9px] text-white/65 transition-colors hover:text-white"
            aria-label="Return to storefront"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
            Return home
          </button>
          <span className="hidden label text-[9px] text-white/50 sm:inline">{topLabel}</span>
        </div>

        <div className="grid gap-8 lg:grid-cols-12 lg:items-end lg:gap-10">
          <div className="min-w-0 lg:col-span-8">
            <span className="label mb-5 block text-[9px] text-white/55">{eyebrow}</span>
            <h1
              className={`cinematic-hero-title w-full max-w-[13ch] break-words font-display font-light leading-[0.8] tracking-[-0.05em] ${titleClassName}`}
            >
              {title}
            </h1>
          </div>

          <div className="min-w-0 lg:col-span-4 lg:pb-3">
            <p className="max-w-[38ch] body-copy text-white/70">{description}</p>

            {(primaryAction || secondaryAction) && (
              <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-3">
                {primaryAction && (
                  <button
                    type="button"
                    onClick={primaryAction.onClick}
                    className="group flex min-h-[44px] items-center gap-3 label text-[9px] text-white transition-opacity hover:opacity-55"
                  >
                    {primaryAction.icon === 'plus' ? (
                      <Plus className="h-3.5 w-3.5 transition-transform group-hover:rotate-90" />
                    ) : null}
                    {primaryAction.label}
                    {primaryAction.icon !== 'plus' ? (
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                    ) : null}
                  </button>
                )}

                {secondaryAction && (
                  <button
                    type="button"
                    onClick={secondaryAction.onClick}
                    className="label min-h-[44px] text-[9px] text-white/45 transition-colors hover:text-white"
                  >
                    {secondaryAction.label}
                  </button>
                )}
              </div>
            )}

            {imageCaption && (
              <span className="mt-8 hidden label text-[8px] text-white/40 sm:block">
                {imageCaption}
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
