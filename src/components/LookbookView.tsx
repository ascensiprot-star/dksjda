import React, { useState } from 'react';
import { Product, Language, formatPrice } from '../types';
import { FashionImage } from './FashionImage';
import { ArrowRight } from 'lucide-react';
import { editorialAt, editorialFor } from '../editorial';
import { CinematicHero } from './CinematicHero';

interface LookbookViewProps {
  products: Product[];
  language: Language;
  onBackToHome: () => void;
  onSelectProduct: (p: Product) => void;
}

const lookName = (look: Product, language: Language) =>
  look.name?.[language] || look.name?.en || 'Untitled look';

const lookDescription = (look: Product, language: Language) =>
  look.description?.[language] || look.description?.en || '';

const lookMaterial = (look: Product, language: Language) =>
  look.material?.[language] || look.material?.en || 'Natural fibre';

const lookOrigin = (look: Product, language: Language) =>
  look.origin?.[language] || look.origin?.en || 'Helsinki atelier';

export const LookbookView: React.FC<LookbookViewProps> = ({
  products,
  language,
  onBackToHome,
  onSelectProduct,
}) => {
  const [layoutMode, setLayoutMode] = useState<'spread' | 'grid'>('spread');

  const looks: Product[] = React.useMemo(() => (products || []).slice(0, 16), [products]);
  const heroLook = looks[0];
  const heroSrc = heroLook?.hoverImage || heroLook?.image || editorialAt(1);
  const premiseLook = looks[2] || heroLook;
  const editorialLooks = looks.slice(1);

  return (
    <div className="w-full min-h-screen select-none bg-paper text-ink">
      <CinematicHero
        image={heroSrc}
        imageAlt="Zejesh lookbook cover"
        eyebrow="A study in proportion and shadow"
        title={
          <>
            Winter Light and <em className="italic">Silence</em>
          </>
        }
        description="Sculptural silhouettes photographed against a pure studio horizon. Restraint, unblended wool, permanence."
        topLabel="Winter Solstice 2026 · Lookbook N° 026"
        backAction={onBackToHome}
        primaryAction={
          heroLook
            ? { label: 'View look 01', onClick: () => onSelectProduct(heroLook) }
            : undefined
        }
        imageCaption={`${looks.length.toString().padStart(2, '0')} looks · Black / White only`}
        titleClassName="text-[clamp(52px,6.8vw,128px)]"
        imagePosition="center 16%"
      />

      {/* Premise */}
      <section className="page-shell py-24 md:py-36">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-3">
            <span className="label block text-[9px] text-ink/35">01 / The lookbook</span>
            <p className="mt-7 max-w-[26ch] body-copy text-ink/45">
              Twelve looks photographed as a single winter study. No colour, no season, only
              structure.
            </p>
          </div>

          <div className="lg:col-span-9">
            <p className="max-w-[18ch] font-display text-[clamp(38px,5.6vw,88px)] font-light leading-[0.94] tracking-[-0.035em]">
              A study in proportion, shadow and the weight of <em className="italic">cloth</em>.
            </p>

            <div className="mt-16 grid items-end gap-10 sm:grid-cols-12">
              <div className="sm:col-span-5">
                <p className="max-w-[38ch] body-copy text-ink/55">
                  Every look is built from the same permanent vocabulary: a long line, a heavy hem,
                  a quiet shoulder. Photographed against the studio horizon.
                </p>

                <div className="mt-9 flex items-center gap-8">
                  <button
                    type="button"
                    onClick={() => setLayoutMode('spread')}
                    className="label text-[10px] transition-opacity"
                    style={{ opacity: layoutMode === 'spread' ? 1 : 0.32 }}
                  >
                    Editorial
                  </button>
                  <button
                    type="button"
                    onClick={() => setLayoutMode('grid')}
                    className="label text-[10px] transition-opacity"
                    style={{ opacity: layoutMode === 'grid' ? 1 : 0.32 }}
                  >
                    Index
                  </button>
                </div>
              </div>

              <div className="sm:col-span-7">
                <div className="relative aspect-[2/3] overflow-hidden bg-[#111]">
                  {premiseLook ? (
                    <FashionImage
                      product={premiseLook}
                      src={premiseLook.image}
                      fallbackSrc={editorialFor(premiseLook.id)}
                      alt={lookName(premiseLook, language)}
                      position="center 45%"
                      scale={1.02}
                      aspectRatio="auto"
                      className="h-full w-full"
                      imageClassName="h-full w-full object-cover object-[center_18%] grayscale contrast-[1.08]"
                    />
                  ) : (
                    <img
                      src={editorialAt(3)}
                      alt="Zejesh lookbook study"
                      className="h-full w-full object-cover object-[center_18%] grayscale contrast-[1.08]"
                    />
                  )}
                  <span className="absolute bottom-4 left-4 label text-[8px] text-white/70 mix-blend-difference">
                    Plate 01 · Winter studio
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {looks.length === 0 ? (
        <div className="mx-auto max-w-md px-4 py-24 text-center">
          <p className="label mb-6 text-[9px] text-ink/40">Lookbook in curation</p>
          <p className="body-copy mx-auto text-ink/55">
            The atelier is preparing the latest lookbook series. Explore the permanent catalogue in
            the meantime.
          </p>
          <button
            type="button"
            onClick={onBackToHome}
            className="mt-10 inline-flex min-h-[44px] items-center gap-3 label text-[9px] transition-opacity hover:opacity-50"
          >
            Explore storefront <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : layoutMode === 'spread' ? (
        <div className="pb-24 md:pb-36">
          {editorialLooks.map((look, idx) => {
            const lookNumber = (idx + 2).toString().padStart(2, '0');
            const isFullBleed = idx % 4 === 0;
            const isEven = idx % 2 === 0;

            if (isFullBleed) {
              return (
                <section
                  key={look.id}
                  data-dark-section
                  className="relative min-h-[82svh] w-full overflow-hidden bg-black text-white"
                >
                  <FashionImage
                    product={look}
                    src={look.hoverImage || look.image}
                    fallbackSrc={editorialFor(look.id)}
                    alt={lookName(look, language)}
                    position={look.imagePosition || 'center 22%'}
                    scale={look.imageScale || 1.04}
                    aspectRatio="auto"
                    className="absolute inset-0 h-full w-full"
                    imageClassName="h-full w-full object-cover grayscale contrast-[1.1]"
                  />
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-black/35"
                  />
                  <div className="relative z-10 page-shell flex min-h-[82svh] items-end pb-12 md:pb-16">
                    <div className="grid w-full gap-8 lg:grid-cols-12 lg:items-end">
                      <div className="lg:col-span-8">
                        <span className="label block text-[9px] text-white/50">
                          Look {lookNumber} · Accession {look.plateNumber || look.nr || '026'}
                        </span>
                        <h2 className="mt-5 max-w-[12ch] font-display text-[clamp(44px,7vw,116px)] font-light leading-[0.84] tracking-[-0.04em]">
                          {lookName(look, language)}
                        </h2>
                      </div>
                      <div className="lg:col-span-4 lg:pb-2">
                        <p className="max-w-[34ch] body-copy text-white/65">
                          {lookDescription(look, language)}
                        </p>
                        <button
                          type="button"
                          onClick={() => onSelectProduct(look)}
                          className="group mt-8 inline-flex min-h-[44px] items-center gap-3 label text-[9px] text-white transition-opacity hover:opacity-55"
                        >
                          View piece
                          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                        </button>
                      </div>
                    </div>
                  </div>
                </section>
              );
            }

            return (
              <div key={look.id} className="page-shell py-14 md:py-20">
                <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-20">
                  <button
                    type="button"
                    onClick={() => onSelectProduct(look)}
                    className={`group relative block aspect-[2/3] w-full overflow-hidden bg-[#111] ${
                      isEven ? 'lg:order-1 lg:col-span-7' : 'lg:order-2 lg:col-span-7'
                    }`}
                  >
                    <FashionImage
                      product={look}
                      src={look.image}
                      fallbackSrc={editorialFor(look.id)}
                      alt={lookName(look, language)}
                      position={look.imagePosition || 'center 45%'}
                      scale={look.imageScale || 1.04}
                      aspectRatio="auto"
                      className="h-full w-full"
                      imageClassName="h-full w-full object-cover grayscale contrast-[1.08] transition-transform duration-700 group-hover:scale-105"
                    />
                    <span className="absolute left-5 top-5 label text-[8px] text-white/70 mix-blend-difference">
                      Look {lookNumber}
                    </span>
                  </button>

                  <div
                    className={`w-full ${
                      isEven ? 'lg:order-2 lg:col-span-5' : 'lg:order-1 lg:col-span-5'
                    }`}
                  >
                    <div className="flex items-center gap-4 label text-[9px] text-ink/35">
                      <span>Look {lookNumber}</span>
                      <span>·</span>
                      <span>{look.plateNumber || look.nr || 'Nº 026'}</span>
                    </div>
                    <h2 className="mt-5 font-display text-[clamp(40px,5vw,76px)] font-light leading-[0.88] tracking-[-0.035em]">
                      {lookName(look, language)}
                    </h2>
                    <div className="price mt-4 text-ink/60">{formatPrice(look.price)}</div>

                    <p className="mt-7 max-w-[42ch] body-copy text-ink/55">
                      {lookDescription(look, language)}
                    </p>

                    <dl className="mt-9 space-y-4 font-mono text-[10px] tracking-[0.12em] text-ink/35">
                      <div className="flex justify-between gap-6">
                        <dt className="uppercase">Fabrication</dt>
                        <dd className="max-w-[220px] truncate text-right text-ink/70">
                          {lookMaterial(look, language)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-6">
                        <dt className="uppercase">Provenance</dt>
                        <dd className="max-w-[220px] truncate text-right text-ink/70">
                          {lookOrigin(look, language)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-6">
                        <dt className="uppercase">Edition</dt>
                        <dd className="text-right text-ink/70">
                          {look.limitedEdition?.isLimited
                            ? `${look.limitedEdition.editionSize || 0} pieces`
                            : 'Permanent archive'}
                        </dd>
                      </div>
                    </dl>

                    <button
                      type="button"
                      onClick={() => onSelectProduct(look)}
                      className="group mt-9 inline-flex min-h-[44px] items-center gap-3 label text-[9px] transition-opacity hover:opacity-50"
                    >
                      View piece
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="page-shell pb-28 md:pb-40">
          <div className="grid grid-cols-1 gap-x-6 gap-y-16 sm:grid-cols-2 lg:grid-cols-3">
            {looks.map((look, idx) => {
              const lookNumber = (idx + 1).toString().padStart(2, '0');
              return (
                <button
                  key={look.id}
                  type="button"
                  onClick={() => onSelectProduct(look)}
                  className="group text-left"
                >
                  <div className="relative aspect-[2/3] w-full overflow-hidden bg-[#111]">
                    <FashionImage
                      product={look}
                      src={look.image}
                      fallbackSrc={editorialFor(look.id)}
                      alt={lookName(look, language)}
                      position={look.imagePosition || 'center 45%'}
                      scale={look.imageScale || 1.04}
                      aspectRatio="auto"
                      className="h-full w-full"
                      imageClassName="h-full w-full object-cover grayscale contrast-[1.08] transition-transform duration-700 group-hover:scale-105"
                    />
                    <span className="absolute left-4 top-4 label text-[8px] text-white/65 mix-blend-difference">
                      Look {lookNumber}
                    </span>
                  </div>

                  <div className="mt-5 flex items-baseline justify-between gap-4">
                    <div className="min-w-0">
                      <span className="font-display text-[clamp(22px,2.2vw,30px)] leading-none">
                        {lookName(look, language)}
                      </span>
                      <span className="mt-2 block label text-[8px] text-ink/35">
                        {look.plateNumber || look.nr || `№ ${lookNumber}`}
                      </span>
                    </div>
                    <span className="price shrink-0 text-ink/55">{formatPrice(look.price)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <section className="bg-ink text-paper">
        <div className="page-shell py-24 md:py-36">
          <div className="mx-auto flex max-w-[1600px] flex-col justify-between gap-10 sm:flex-row sm:items-end">
            <p className="max-w-[20ch] font-display text-[clamp(34px,4.8vw,76px)] font-light leading-[1.02]">
              Twelve looks. No colour. Only <em className="italic">structure</em>.
            </p>
            <button
              type="button"
              onClick={onBackToHome}
              className="label text-[9px] text-white/50 transition-colors hover:text-white"
            >
              Return home →
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
