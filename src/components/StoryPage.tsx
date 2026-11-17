import React, { useState } from 'react';
import { useStorefrontData } from '../context/StorefrontDataContext';
import { ImageFramingParams, NEUTRAL_PLACEHOLDER_IMG } from '../types';
import { imageFramingStyle } from './FashionImage';
import type { ImagePlacement } from './FashionImage';
import { ArrowRight } from 'lucide-react';
import { editorialAt } from '../editorial';
import { CinematicHero } from './CinematicHero';

interface StoryPageProps {
  onBackToHome: () => void;
  onExploreArchive: () => void;
}

interface StoryImageProps {
  src?: string;
  framing?: ImageFramingParams;
  placement: ImagePlacement;
  alt: string;
  legacyPosition?: string;
  className?: string;
}

const StoryImage: React.FC<StoryImageProps> = ({
  src,
  framing,
  placement,
  alt,
  legacyPosition,
  className,
}) => {
  const [failed, setFailed] = useState(false);

  if (!src) return null;

  let style: React.CSSProperties | undefined;
  if (!failed) {
    if (framing) style = imageFramingStyle(framing, placement, legacyPosition);
    else if (legacyPosition) style = { objectPosition: legacyPosition };
  }

  return (
    <img
      src={failed ? NEUTRAL_PLACEHOLDER_IMG : src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={className}
      style={style}
      onError={() => setFailed(true)}
    />
  );
};

const PRINCIPLES = [
  {
    index: '01',
    title: 'Unblended virgin wool',
    copy: 'High-micron pure fleece woven with intact lanolin. Naturally water-repellent, climate-regulating and immune to chemical pilling.',
  },
  {
    index: '02',
    title: 'Natural corozo fasteners',
    copy: 'Individually carved from the dense seed of the Tagua palm. Each button carries its own organic grain and patina.',
  },
  {
    index: '03',
    title: 'Permanent architecture',
    copy: 'Traditional horsehair-and-linen canvases that mould to the wearer’s frame over time rather than fused synthetic interlinings.',
  },
];

export const StoryPage: React.FC<StoryPageProps> = ({ onBackToHome, onExploreArchive }) => {
  const { content } = useStorefrontData();
  const storyContent = content?.translations || {};
  const heroImage: string | undefined = storyContent.storyHeroImage;
  const plate1: string | undefined = storyContent.storyPlate1;
  const plate1Framing: ImageFramingParams | undefined = storyContent.storyPlate1Framing;
  const plate2: string | undefined = storyContent.storyPlate2;
  const plate2Framing: ImageFramingParams | undefined = storyContent.storyPlate2Framing;

  return (
    <div className="w-full min-h-screen select-none bg-paper text-ink">
      <CinematicHero
        image={heroImage || editorialAt(0)}
        imageAlt="Zejesh campaign still"
        eyebrow="Helsinki · Porto · Est. 2026"
        title={
          <>
            The Architecture of <em className="italic">Silence</em>
          </>
        }
        description="A permanent wardrobe drafted between the cold light of Helsinki and the slow looms of Porto. No seasons. No noise. Only objects built to remain."
        topLabel="House Charter · Edition 026"
        backAction={onBackToHome}
        primaryAction={{ label: 'Explore the archive', onClick: onExploreArchive }}
        imageCaption="Plate 01 · House campaign, Helsinki"
        imagePosition="center 18%"
      />

      {/* Premise */}
      <section className="page-shell py-24 md:py-40">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-3">
            <span className="label block text-[9px] text-ink/35">01 / Premise</span>
            <p className="mt-7 max-w-[26ch] body-copy text-ink/45">
              A house built on restraint, northern light and the quiet authority of natural cloth.
            </p>
          </div>

          <div className="lg:col-span-9">
            <p className="max-w-[18ch] font-display text-[clamp(38px,5.6vw,88px)] font-light leading-[0.94] tracking-[-0.035em]">
              We do not design for a season. We draft objects that outlive the{' '}
              <em className="italic">weather</em>.
            </p>

            <div className="mt-16 grid items-end gap-10 sm:grid-cols-12">
              <div className="sm:col-span-5">
                <p className="max-w-[38ch] body-copy text-ink/55">
                  Every piece begins as an accession number, not a trend forecast. The archive grows
                  slowly — one permanent silhouette at a time.
                </p>
                <button
                  type="button"
                  onClick={onExploreArchive}
                  className="group mt-9 flex min-h-[44px] items-center gap-3 label text-[9px] transition-opacity hover:opacity-50"
                >
                  Enter the archive
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </button>
              </div>

              <div className="sm:col-span-7">
                <div className="aspect-[2/3] overflow-hidden bg-[#111]">
                  <StoryImage
                    src={editorialAt(1)}
                    placement="archive"
                    legacyPosition="center 45%"
                    alt="Zejesh house study"
                    className="h-full w-full object-cover object-[center_45%] grayscale contrast-[1.08]"
                  />
                </div>
                <span className="mt-4 block label text-[8px] text-ink/40">
                  Plate 01 · House study, Helsinki
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Chapter I — cinematic band */}
      <section
        data-dark-section
        className="relative min-h-[78svh] w-full overflow-hidden bg-black text-white"
      >
        <StoryImage
          src={editorialAt(3)}
          placement="heroDesktop"
          legacyPosition="center 24%"
          alt="Zejesh atelier geography"
          className="absolute inset-0 h-full w-full object-cover object-[center_24%] grayscale contrast-[1.1]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-black/40"
        />
        <div className="relative z-10 page-shell flex min-h-[78svh] flex-col justify-end pb-12 md:pb-16">
          <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-8">
              <span className="label block text-[9px] text-white/50">
                Chapter I · Geography
              </span>
              <h2 className="mt-5 max-w-[12ch] font-display text-[clamp(44px,7vw,116px)] font-light leading-[0.86] tracking-[-0.04em]">
                Between Helsinki and <em className="italic">Porto</em>
              </h2>
            </div>
            <div className="lg:col-span-4 lg:pb-2">
              <p className="max-w-[34ch] body-copy text-white/65">
                Conceived in the low winter light of the Finnish archipelago. Cut and finished in
                small, multi-generational ateliers on the Porto waterfront.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Chapter I — narrative + plates */}
      <section className="page-shell py-24 md:py-36">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <span className="label block text-[9px] text-ink/35">Chapter I · Continued</span>
            <h3 className="mt-6 max-w-[12ch] font-display text-[clamp(36px,4.4vw,64px)] font-light leading-[0.92] tracking-[-0.03em]">
              A geometry of cold light
            </h3>
            <div className="mt-8 max-w-[42ch] space-y-5 body-copy text-ink/55">
              <p>
                Our aesthetic geometry is conceived in Helsinki. The cold, low winter light of the
                Finnish archipelago demands high-contrast silhouettes: monolithic hemlines,
                exaggerated storm collars, total chromatic discipline.
              </p>
              <p>
                Our tailoring occurs in Porto, where heavy virgin wools are woven slowly on
                low-tension mechanical looms.
              </p>
            </div>
            <p className="mt-8 font-mono text-[10px] tracking-[0.16em] text-ink/35">
              60° 10′ N, 24° 56′ E · 41° 09′ N, 08° 37′ W
            </p>
          </div>

          <div className="lg:col-span-7">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="relative aspect-[2/3] overflow-hidden bg-[#111]">
                <StoryImage
                  src={plate1 || editorialAt(5)}
                  framing={plate1Framing}
                  placement="archive"
                  legacyPosition="center 20%"
                  alt="Atelier silhouette"
                  className="h-full w-full object-cover object-[center_20%] grayscale contrast-[1.08]"
                />
                <span className="absolute bottom-4 left-4 label text-[8px] text-white/70 mix-blend-difference">
                  Plate I · Monolithic stance
                </span>
              </div>
              <div className="relative aspect-[2/3] overflow-hidden bg-[#111] sm:translate-y-14">
                <StoryImage
                  src={plate2 || editorialAt(6)}
                  framing={plate2Framing}
                  placement="archive"
                  legacyPosition="center 26%"
                  alt="Loom tailoring"
                  className="h-full w-full object-cover object-[center_26%] grayscale contrast-[1.08]"
                />
                <span className="absolute bottom-4 left-4 label text-[8px] text-white/70 mix-blend-difference">
                  Plate II · Loom architecture
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Interlude */}
      <section
        data-dark-section
        className="relative overflow-hidden bg-black py-28 text-white md:py-48"
      >
        <StoryImage
          src={editorialAt(4)}
          placement="heroDesktop"
          legacyPosition="center 24%"
          alt="Zejesh atelier interlude"
          className="absolute inset-0 h-full w-full object-cover object-[center_24%] opacity-45 grayscale contrast-[1.15]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/45 to-black/90"
        />
        <div className="relative z-10 page-shell">
          <div className="mx-auto max-w-[68rem] text-center">
            <span className="label text-[9px] text-white/45">Interlude · Atelier note</span>
            <blockquote className="mt-8 font-display text-[clamp(38px,6.4vw,104px)] font-light leading-[0.94] tracking-[-0.04em]">
              “The cloth does not ask to be <em className="italic">noticed</em>. It asks to be kept.”
            </blockquote>
            <span className="mt-10 inline-block label text-[8px] text-white/45">
              Porto · Plate III
            </span>
          </div>
        </div>
      </section>

      {/* Chapter II — material standard */}
      <section className="page-shell py-24 md:py-36">
        <div className="grid gap-14 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-4">
            <span className="label block text-[9px] text-ink/35">
              Chapter II · Fabrication Standards
            </span>
            <h2 className="mt-6 max-w-[11ch] font-display text-[clamp(40px,5vw,76px)] font-light leading-[0.88] tracking-[-0.035em]">
              Zero synthetic <em className="italic">compromise</em>
            </h2>
            <p className="mt-8 max-w-[36ch] body-copy text-ink/55">
              Every fibre selected must decompose naturally back into the soil from which it grew.
              No polyester blends, no nylon linings, no plastic buttons.
            </p>
          </div>

          <div className="lg:col-span-8">
            <div className="space-y-12 md:space-y-16">
              {PRINCIPLES.map((item) => (
                <div key={item.index} className="grid grid-cols-[auto_1fr] gap-6 sm:gap-10">
                  <span className="font-display text-[clamp(42px,5vw,74px)] leading-none text-ink/15">
                    {item.index}
                  </span>
                  <div className="max-w-[42ch] pt-1">
                    <h3 className="font-display text-[clamp(26px,3vw,42px)] leading-none tracking-[-0.02em]">
                      {item.title}
                    </h3>
                    <p className="mt-4 body-copy text-ink/55">{item.copy}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="relative mt-16 aspect-[2/3] overflow-hidden bg-[#111] md:mt-20">
              <StoryImage
                src={editorialAt(2)}
                placement="heroDesktop"
                legacyPosition="center 18%"
                alt="Fabric study"
                className="h-full w-full object-cover object-[center_18%] grayscale contrast-[1.08]"
              />
              <span className="absolute bottom-4 left-4 label text-[8px] text-white/70 mix-blend-difference">
                Material study · Undyed virgin wool
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Chapter III — archive close */}
      <section
        data-dark-section
        className="relative overflow-hidden bg-black text-white"
      >
        <StoryImage
          src={editorialAt(6)}
          placement="heroDesktop"
          legacyPosition="center 26%"
          alt="Zejesh numbered archive"
          className="absolute inset-0 h-full w-full object-cover object-[center_26%] opacity-55 grayscale contrast-[1.1]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-black/15"
        />

        <div className="relative z-10 page-shell py-24 md:py-36">
          <div className="grid gap-12 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-8">
              <span className="label block text-[9px] text-white/50">
                Chapter III · Accession
              </span>
              <h2 className="mt-6 max-w-[12ch] font-display text-[clamp(48px,7.2vw,120px)] font-light leading-[0.84] tracking-[-0.04em]">
                The numbered <em className="italic">archive</em>
              </h2>
              <p className="mt-8 max-w-[48ch] body-copy text-white/65">
                Every garment released by the house bears an immutable accession number. We do not
                produce disposable trend collections; we register permanent plates into an ongoing
                open library.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-8">
                <button
                  type="button"
                  onClick={onExploreArchive}
                  className="group flex min-h-[44px] items-center gap-3 label text-[9px] text-white transition-opacity hover:opacity-55"
                >
                  Explore the complete archive
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </button>
                <button
                  type="button"
                  onClick={onBackToHome}
                  className="label text-[9px] text-white/40 transition-colors hover:text-white"
                >
                  Return to storefront
                </button>
              </div>
            </div>

            <div className="lg:col-span-4 lg:text-right">
              <span className="font-display text-[clamp(104px,14vw,210px)] leading-none text-white/20">
                Nº 026
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
