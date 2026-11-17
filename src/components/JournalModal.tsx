import React from 'react';
import { JournalArticle, ImageFramingParams, Language, translations } from '../types';
import { useStorefrontData } from '../context/StorefrontDataContext';
import { FashionImage } from './FashionImage';
import { X, ArrowLeft } from 'lucide-react';
import { editorialAt } from '../editorial';

type JournalRecord = JournalArticle & { framing?: ImageFramingParams };

interface JournalModalProps {
  articleId: string | null;
  onClose: () => void;
  language: Language;
}

export const JournalModal: React.FC<JournalModalProps> = ({ articleId, onClose, language }) => {
  const { content } = useStorefrontData();
  const t = translations[language];

  if (!articleId) return null;

  const article = (content.journalPosts || []).find((a) => a.id === articleId) as
    | JournalRecord
    | undefined;
  if (!article) return null;

  const body = article.body?.[language] || article.body?.en || [];

  return (
    <div className="fixed inset-0 z-[92] flex select-none flex-col overflow-y-auto bg-paper text-ink">
      <div className="page-shell flex items-center justify-between py-6">
        <button
          onClick={onClose}
          className="flex min-h-[44px] items-center gap-3 label text-[9px] text-ink/50 transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to journal
        </button>

        <button
          onClick={onClose}
          className="flex min-h-[44px] items-center gap-3 label text-[9px] text-ink/50 transition-colors hover:text-ink"
          aria-label={t.nav.close}
        >
          Close <X className="h-4 w-4" />
        </button>
      </div>

      <article className="page-shell flex-1 pb-24 pt-8 md:pb-32 md:pt-12">
        <div className="mx-auto max-w-[1120px]">
          <div className="flex items-center gap-3 label text-[9px] text-ink/35">
            <span>{article.date}</span>
            <span>·</span>
            <span>{article.readTime}</span>
          </div>

          <h1 className="mt-7 max-w-[16ch] font-display text-[clamp(48px,7.6vw,128px)] font-light leading-[0.84] tracking-[-0.04em]">
            {article.title[language] || article.title.en}
          </h1>

          <p className="mt-8 max-w-[46ch] font-display text-[clamp(22px,2.4vw,34px)] font-light italic leading-[1.25] text-ink/60">
            {article.subtitle[language] || article.subtitle.en}
          </p>
        </div>

        <div className="mx-auto mt-14 aspect-[2/3] w-full max-w-3xl overflow-hidden bg-[#111] md:mt-20">
          <FashionImage
            src={article.image || editorialAt(2)}
            framing={article.framing}
            placement="archive"
            alt={article.title[language] || article.title.en}
            position={article.cropPosition || 'center 18%'}
            scale={1.04}
            aspectRatio="auto"
            className="h-full w-full"
            imageClassName="grayscale contrast-[1.06]"
          />
        </div>

        <div className="mx-auto mt-16 max-w-[720px] md:mt-24">
          <div className="space-y-7 body-copy-lg text-ink/70">
            {body.length > 0 ? (
              body.map((paragraph, idx) => <p key={idx}>{paragraph}</p>)
            ) : (
              <>
                <p>
                  In the North, darkness is not a void but a spatial condition, sculpted rarely and
                  profoundly by light. Low winter rays dramatise the topography of weaves: the tooth
                  of dense wool, the serene halo of combed merino, the organic slubs of raw linen.
                </p>
                <p>
                  At the core of the Zejesh ethos lies the belief in the garment as a permanent
                  archival accession. We do not design for the churn of seasonal schedules; we
                  execute numbered archive plates refined to endure across generations.
                </p>
              </>
            )}
          </div>

          <blockquote className="my-16 font-display text-[clamp(28px,3.4vw,48px)] font-light italic leading-[1.18] text-ink/85">
            “A garment should impart quietude and shelter to the wearer, never demand attention.”
          </blockquote>

          <button
            onClick={onClose}
            className="inline-flex min-h-[44px] items-center gap-3 label text-[9px] transition-opacity hover:opacity-50"
          >
            Return to the journal <span aria-hidden="true">→</span>
          </button>
        </div>
      </article>
    </div>
  );
};
