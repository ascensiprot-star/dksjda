import React from 'react';
import { JournalArticle, Language } from '../types';
import { useStorefrontData } from '../context/StorefrontDataContext';
import { editorialAt } from '../editorial';
import { ArrowRight } from 'lucide-react';
import { CinematicHero } from './CinematicHero';

interface JournalPageProps {
  language: Language;
  onBackToHome: () => void;
  onSelectArticle: (id: string) => void;
  onExploreArchive: () => void;
}

export const JournalPage: React.FC<JournalPageProps> = ({
  language,
  onBackToHome,
  onSelectArticle,
  onExploreArchive,
}) => {
  const { content } = useStorefrontData();
  const posts = (content.journalPosts || []) as JournalArticle[];
  const feature = posts[0];
  const rest = posts.slice(1);
  const cover = rest[0]?.image || editorialAt(2);

  const title = (article: JournalArticle) => article.title[language] || article.title.en;
  const subtitle = (article: JournalArticle) => article.subtitle[language] || article.subtitle.en;

  return (
    <div className="w-full min-h-screen select-none bg-paper text-ink">
      <CinematicHero
        image={cover}
        imageAlt="Zejesh journal cover"
        eyebrow="The house journal · Helsinki 2026"
        title={
          <>
            Journal <em className="block italic">026</em>
          </>
        }
        description={`Notes on material, permanence and the architecture of the wardrobe. Published slowly, kept indefinitely. ${posts.length
          .toString()
          .padStart(2, '0')} entries.`}
        topLabel="Essays & Monographs · Issue 026"
        backAction={onBackToHome}
        primaryAction={
          feature
            ? { label: 'Read the cover story', onClick: () => onSelectArticle(feature.id) }
            : { label: 'Explore the archive', onClick: onExploreArchive }
        }
        imageCaption="Issue 026 · Cover study"
        titleClassName="text-[clamp(54px,6.8vw,126px)]"
        imagePosition="center 18%"
      />

      {posts.length === 0 ? (
        <section className="page-shell py-24 md:py-40">
          <div className="grid gap-12 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-8">
              <span className="label text-[9px] text-ink/35">The journal</span>
              <h2 className="mt-6 max-w-[14ch] font-display text-[clamp(44px,6.4vw,100px)] font-light leading-[0.88] tracking-[-0.035em]">
                The page is being <em className="italic">written</em>
              </h2>
              <p className="mt-8 max-w-[46ch] body-copy text-ink/55">
                Long-form notes from the atelier are being prepared. Until then, the archive holds
                the full record of the house.
              </p>
              <button
                type="button"
                onClick={onExploreArchive}
                className="mt-10 inline-flex min-h-[44px] items-center gap-3 label text-[9px] transition-opacity hover:opacity-50"
              >
                Explore the archive <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="relative aspect-[2/3] overflow-hidden bg-[#111] lg:col-span-4">
              <img
                src={editorialAt(5)}
                alt="Zejesh atelier study"
                className="h-full w-full object-cover object-[center_20%] grayscale"
              />
            </div>
          </div>
        </section>
      ) : (
        <>
          {/* Cover story */}
          <section className="page-shell py-20 md:py-32">
            <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-20">
              <button
                type="button"
                onClick={() => onSelectArticle(feature.id)}
                className="group relative aspect-[2/3] overflow-hidden bg-[#111] lg:col-span-7"
              >
                <img
                  src={feature.image || editorialAt(4)}
                  alt={title(feature)}
                  className="h-full w-full object-cover object-[center_20%] grayscale contrast-[1.08] transition-transform duration-[1200ms] group-hover:scale-[1.03]"
                />
                <span className="absolute left-5 top-5 label text-[8px] text-white/75 mix-blend-difference">
                  Cover story · 01
                </span>
              </button>

              <div className="lg:col-span-5">
                <div className="flex flex-wrap items-center gap-3 label text-[9px] text-ink/35">
                  <span>{feature.tag}</span>
                  <span>·</span>
                  <span>{feature.date}</span>
                  <span>·</span>
                  <span>{feature.readTime}</span>
                </div>
                <h2 className="mt-7 max-w-[12ch] font-display text-[clamp(46px,5.8vw,92px)] font-light leading-[0.88] tracking-[-0.04em]">
                  {title(feature)}
                </h2>
                <p className="mt-7 max-w-[38ch] body-copy text-ink/55">{subtitle(feature)}</p>
                <button
                  type="button"
                  onClick={() => onSelectArticle(feature.id)}
                  className="group mt-9 inline-flex min-h-[44px] items-center gap-3 label text-[9px] transition-opacity hover:opacity-50"
                >
                  Read the feature
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </button>
              </div>
            </div>
          </section>

          {/* Index band */}
          <section className="bg-ink text-paper">
            <div className="page-shell py-14 md:py-20">
              <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
                <div className="min-w-0 lg:col-span-3">
                  <span className="label block text-[9px] text-white/35">The index</span>
                  <p className="mt-6 max-w-full break-words font-display text-[clamp(24px,3vw,44px)] font-light leading-[1.02] lg:max-w-[22ch]">
                    Four entries from the permanent record.
                  </p>
                </div>

                <div className="min-w-0 lg:col-span-9">
                  <div className="grid gap-x-14 gap-y-5 sm:grid-cols-2">
                    {posts.map((article, idx) => (
                      <button
                        key={article.id}
                        type="button"
                        onClick={() => onSelectArticle(article.id)}
                        className="group flex w-full min-w-0 items-baseline justify-between gap-6 text-left"
                      >
                        <span className="flex min-w-0 items-baseline gap-4">
                          <span className="font-mono text-[10px] tracking-[0.18em] text-white/30">
                            {(idx + 1).toString().padStart(2, '0')}
                          </span>
                          <span className="line-clamp-2 break-words font-display text-[clamp(20px,2.2vw,30px)] font-light leading-[1.08] text-paper/85 transition-colors group-hover:text-white">
                            {title(article)}
                          </span>
                        </span>
                        <span className="label shrink-0 text-[8px] text-white/30 transition-colors group-hover:text-white/60">
                          {article.readTime}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Secondary entries */}
          <section className="page-shell py-20 md:py-32">
            <div className="grid gap-x-10 gap-y-20 md:grid-cols-12">
              {rest.map((article, idx) => {
                const wide = idx === 0;
                return (
                  <article
                    key={article.id}
                    className={
                      wide
                        ? 'grid items-center gap-10 md:col-span-12 md:grid-cols-12 md:gap-16'
                        : 'md:col-span-6'
                    }
                  >
                    <button
                      type="button"
                      onClick={() => onSelectArticle(article.id)}
                      className={`group relative overflow-hidden bg-[#111] ${
                        wide
                          ? 'aspect-[2/3] md:col-span-7'
                          : 'aspect-[2/3] w-full'
                      }`}
                    >
                      <img
                        src={article.image || editorialAt(idx + 1)}
                        alt={title(article)}
                        className="h-full w-full object-cover object-[center_20%] grayscale contrast-[1.06] transition-transform duration-[1200ms] group-hover:scale-[1.03]"
                      />
                      <span className="absolute left-5 top-5 label text-[8px] text-white/70 mix-blend-difference">
                        Entry {(idx + 2).toString().padStart(2, '0')}
                      </span>
                    </button>

                    <div className={wide ? 'md:col-span-5' : 'mt-6'}>
                      <div className="flex flex-wrap items-center gap-3 label text-[9px] text-ink/35">
                        <span>{article.tag}</span>
                        <span>·</span>
                        <span>{article.date}</span>
                        <span>·</span>
                        <span>{article.readTime}</span>
                      </div>
                      <h2
                        className={`mt-5 font-display font-light leading-[0.9] tracking-[-0.03em] ${
                          wide
                            ? 'text-[clamp(38px,4.8vw,74px)]'
                            : 'text-[clamp(32px,3.8vw,52px)]'
                        }`}
                      >
                        {title(article)}
                      </h2>
                      <p className="mt-5 max-w-[38ch] body-copy text-ink/55">
                        {subtitle(article)}
                      </p>
                      <button
                        type="button"
                        onClick={() => onSelectArticle(article.id)}
                        className="mt-7 inline-flex min-h-[44px] items-center gap-3 label text-[9px] transition-opacity hover:opacity-50"
                      >
                        Read the entry
                        <span aria-hidden="true">→</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}

      {/* Closing */}
      <section className="bg-ink text-paper">
        <div className="page-shell py-20 md:py-28">
          <div className="grid gap-10 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-8">
              <span className="label block text-[9px] text-white/35">A note from the house</span>
              <p className="mt-6 max-w-[20ch] font-display text-[clamp(34px,4.8vw,76px)] font-light leading-[0.98] tracking-[-0.03em]">
                We publish slowly. An entry is not a post; it is a page added to the permanent{' '}
                <em className="italic">record</em>.
              </p>
            </div>
            <div className="lg:col-span-4 lg:text-right">
              <button
                type="button"
                onClick={onExploreArchive}
                className="inline-flex min-h-[44px] items-center gap-3 label text-[9px] text-white/50 transition-colors hover:text-white"
              >
                Explore the archive <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
