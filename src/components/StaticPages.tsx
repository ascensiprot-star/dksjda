import React, { useState } from 'react';
import { Language, Product, translations, formatPrice } from '../types';
import { useStorefrontData } from '../context/StorefrontDataContext';
import { supabase } from '../supabase/config';
import { FashionImage } from './FashionImage';
import { Check } from 'lucide-react';
import { editorialAt } from '../editorial';

interface StaticIntroProps {
  eyebrow: string;
  title: React.ReactNode;
  copy?: string;
  image: string;
  caption: string;
}

const StaticIntro: React.FC<StaticIntroProps> = ({ eyebrow, title, copy, image, caption }) => (
  <div className="grid gap-10 lg:grid-cols-12 lg:items-end">
    <div className="lg:col-span-7">
      <span className="label block text-ink-a45">{eyebrow}</span>
      <h1 className="mt-5 font-display display-l text-ink max-w-[17ch]">{title}</h1>
      {copy && <p className="mt-6 max-w-[48ch] body-copy text-ink-a72">{copy}</p>}
    </div>
    <figure className="relative mt-4 aspect-[2/3] overflow-hidden bg-[#111] lg:col-span-4 lg:col-start-9 lg:mt-0">
      <img
        src={image}
        alt=""
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover object-[center_18%] grayscale contrast-[1.08]"
      />
      <figcaption className="absolute bottom-5 left-5 label text-[8px] text-white/70 mix-blend-difference">
        {caption}
      </figcaption>
    </figure>
  </div>
);

interface StaticPageProps {
  slug: string;
  pageType: 'about' | 'service' | 'legal' | 'lookbook' | 'gift-cards' | 'sitemap';
  language: Language;
  onNavigate: (route: any) => void;
  onSelectProduct: (p: Product) => void;
}

export const StaticPages: React.FC<StaticPageProps> = ({
  slug,
  pageType,
  language,
  onNavigate,
  onSelectProduct,
}) => {
  const { products, content } = useStorefrontData();
  const t = translations[language] || translations.en;

  // Tracking form state — resolved against real order rows only
  const [trackingCode, setTrackingCode] = useState('');
  const [trackingResult, setTrackingResult] = useState<string | null>(null);
  const [isTracking, setIsTracking] = useState(false);

  // Gift card state
  const [giftAmount, setGiftAmount] = useState(150);
  const [giftRecipient, setGiftRecipient] = useState('');
  const [giftSubmitted, setGiftSubmitted] = useState(false);

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = trackingCode.trim();
    if (!code) return;

    setIsTracking(true);
    setTrackingResult(null);
    try {
      // Escape LIKE wildcards so the reference is matched literally.
      const pattern = code.replace(/([\\%_])/g, '\\$1');
      const { data, error } = await supabase
        .from('orders')
        .select('number, status, tracking, createdAt, updatedAt')
        .ilike('tracking', pattern)
        .limit(1)
        .maybeSingle();

      if (error) {
        setTrackingResult('Could not load tracking data right now. Please try again later.');
      } else if (!data) {
        setTrackingResult(
          `No tracking record found for ${code.toUpperCase()}. Check the reference from your dispatch notification, or contact the studio.`
        );
      } else {
        const updated = data.updatedAt || data.createdAt;
        setTrackingResult(
          `Shipment ${code.toUpperCase()} — order ${data.number}, current status: ${data.status}` +
            `${updated ? `, last updated ${new Date(updated).toLocaleString('en-US')}` : ''}.`
        );
      }
    } catch {
      setTrackingResult('Could not load tracking data right now. Please try again later.');
    } finally {
      setIsTracking(false);
    }
  };

  // Render SITEMAP (directory of the pages that actually exist)
  if (pageType === 'sitemap') {
    return (
      <div className="w-full min-h-screen bg-paper text-ink">
        <div className="page-shell page-top pb-24 sm:pb-32">
          <div className="max-w-[1440px] mx-auto">
            <StaticIntro
              eyebrow="Archive Directory"
              title={
                <>
                  Site <em className="italic">Directory</em>
                </>
              }
              copy={`Our digital archive houses ${products.length} product dossier pages, category hubs, seasonal archives, essays, and house charters.`}
              image={editorialAt(0)}
              caption="Directory · House photograph I"
            />

            <div className="mt-16 grid grid-cols-1 lg:grid-cols-12 gap-10">
              {/* Products */}
              <div className="lg:col-span-7 bg-paper p-6 sm:p-10">
                <div className="flex items-baseline justify-between border-b border-ink-a18 pb-4 mb-2">
                  <h3 className="font-display text-[30px] leading-none text-ink">
                    Product <em className="italic">Dossiers</em>
                  </h3>
                  <span className="label text-ink-a45">
                    {products.length.toString().padStart(2, '0')} Plates
                  </span>
                </div>
                <ul>
                  {products.length === 0 ? (
                    <li className="py-4 body-copy italic text-ink-a45">No published plates yet</li>
                  ) : (
                    products.map((prod) => (
                      <li key={prod.id} className="border-b border-ink-a18 last:border-b-0">
                        <button
                          type="button"
                          onClick={() => onNavigate({ type: 'product', productId: prod.id })}
                          className="group flex min-h-[44px] w-full items-center justify-between gap-4 py-2 text-left text-ink-a72 transition-colors hover:text-ink cursor-pointer"
                        >
                          <span className="truncate text-[13px] tracking-[0.02em]">
                            {prod.plateNumber || prod.nr} · {prod.name.en || prod.name[language]}
                          </span>
                          <span className="price shrink-0 text-ink-a45 group-hover:text-ink">
                            {formatPrice(prod.price)}
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>

              {/* Categories, Journal, House */}
              <div className="lg:col-span-5 bg-paper p-6 sm:p-10 space-y-12">
                <div>
                  <h3 className="font-display text-[26px] leading-none text-ink border-b border-ink-a18 pb-4 mb-2">
                    Categories & <em className="italic">Collections</em>
                  </h3>
                  <ul className="text-[13px] text-ink-a72">
                    {[
                      ['/category/women (Complete Women’s Archive)', { type: 'archive', category: 'naiset' }],
                      ['/category/men (Complete Men’s Archive)', { type: 'archive', category: 'miehet' }],
                      ['/category/accessories (Beanies, Scarves, Belts, Bags)', { type: 'archive', category: 'asusteet' }],
                      ['/category/collections (All Curations)', { type: 'archive', category: 'kokoelmat' }],
                      ['/collections/winter-2026 (Winter Solstice Archive)', { type: 'archive', category: 'kokoelmat', subcategory: 'Winter 2026' }],
                      ['/collections/essentials (Permanent Wardrobe)', { type: 'archive', category: 'kokoelmat', subcategory: 'Perusvaatteet' }],
                      ['/lookbook (Seasonal Lookbook)', { type: 'lookbook' }],
                    ].map(([label, route]) => (
                      <li key={label as string} className="border-b border-ink-a18 last:border-b-0">
                        <button
                          type="button"
                          onClick={() => onNavigate(route)}
                          className="flex min-h-[44px] w-full items-center py-2 text-left transition-colors hover:text-ink cursor-pointer"
                        >
                          {label as string}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h3 className="font-display text-[26px] leading-none text-ink border-b border-ink-a18 pb-4 mb-2">
                    Journal & <em className="italic">Monographs</em>
                  </h3>
                  <ul className="text-[13px] text-ink-a72">
                    <li className="border-b border-ink-a18">
                      <button
                        type="button"
                        onClick={() => onNavigate({ type: 'journal' })}
                        className="flex min-h-[44px] w-full items-center py-2 text-left transition-colors hover:text-ink cursor-pointer"
                      >
                        /journal (Main Journal Index)
                      </button>
                    </li>
                    {(content.journalPosts || []).map((art) => (
                      <li key={art.slug} className="border-b border-ink-a18 last:border-b-0">
                        <button
                          type="button"
                          onClick={() => onNavigate({ type: 'journal', articleSlug: art.slug })}
                          className="flex min-h-[44px] w-full items-center truncate py-2 text-left transition-colors hover:text-ink cursor-pointer"
                        >
                          /journal/{art.slug} ({art.title.en || art.title[language]})
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Inverted paper directory moment */}
            <div className="mt-16">
              <div className="flex items-baseline justify-between pb-4 mb-2">
                <h3 className="font-display text-[30px] leading-none">
                  Atelier, Service & <em className="italic">Legal</em>
                </h3>
                <span className="label text-ink/35 hidden sm:inline">05 Sections</span>
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 text-[13px]">
                {[
                  ['/about/philosophy (Philosophy & Sisu)', { type: 'about', slug: 'philosophy' }],
                  ['/about/materials (Raw Materials & Weaves)', { type: 'about', slug: 'materials' }],
                  ['/about/sustainability (Circularity & Lifetime Repair)', { type: 'about', slug: 'sustainability' }],
                  ['/about/workshops (Ateliers: Helsinki & Porto)', { type: 'about', slug: 'workshops' }],
                  ['/service/contact (Customer Service)', { type: 'service', slug: 'contact' }],
                  ['/service/shipping-returns (Shipping & Returns)', { type: 'service', slug: 'shipping-returns' }],
                  ['/service/tracking (Order Tracking)', { type: 'service', slug: 'tracking' }],
                  ['/service/size-guide (Size Guide)', { type: 'service', slug: 'size-guide' }],
                  ['/legal/terms (Terms of Service)', { type: 'legal', slug: 'terms' }],
                  ['/legal/privacy (GDPR Privacy Policy)', { type: 'legal', slug: 'privacy' }],
                  ['/legal/cookies (Cookie Preferences)', { type: 'legal', slug: 'cookies' }],
                  ['/gift-cards (Archive Gift Cards)', { type: 'gift-cards' }],
                ].map(([label, route]) => (
                  <li key={label as string} className="border-b border-paper-a14">
                    <button
                      type="button"
                      onClick={() => onNavigate(route)}
                      className="flex min-h-[44px] w-full items-center py-2 text-left transition-opacity hover:opacity-55 cursor-pointer"
                    >
                      {label as string}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render LOOKBOOK PAGE
  if (pageType === 'lookbook') {
    return (
      <div className="w-full min-h-screen bg-paper text-ink">
        <div className="page-shell page-top pb-24 sm:pb-32">
          <div className="max-w-[1440px] mx-auto">
            <div className="mb-12 sm:mb-20 border-b border-ink-a18 pb-8">
              <span className="label block text-ink-a45 mb-4">Winter Campaign 2026</span>
              <h1 className="font-display display-l text-ink max-w-[16ch]">
                Winter Light and <em className="italic">Silence</em>
              </h1>
              <p className="body-copy text-ink-a72 mt-5 max-w-[44ch]">
                Pure studio campaign on white backdrop. Sculptural silhouettes and the authentic
                weight of unblended virgin wool.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {products.length === 0 ? (
                <div className="col-span-2 bg-paper py-24 text-center">
                  <p className="label text-ink-a45">No campaign garments live yet</p>
                </div>
              ) : (
                products.slice(0, 8).map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => onSelectProduct(product)}
                    className="group bg-paper text-left cursor-pointer"
                  >
                    <div className="aspect-[2/3] overflow-hidden bg-[#111]">
                      <FashionImage
                        product={product}
                        src={product.hoverImage || product.image}
                        alt={product.name.en || product.name[language]}
                        placement="archive"
                        aspectRatio="auto"
                        className="w-full h-full"
                        imageClassName="w-full h-full object-cover grayscale contrast-[1.08] transition-transform duration-700 group-hover:scale-105"
                      />
                    </div>
                    <div className="flex items-baseline justify-between gap-4 p-4 sm:p-6">
                      <div className="min-w-0">
                        <span className="font-mono text-[10px] tracking-[0.18em] text-ink-a45 mr-2">
                          {product.plateNumber || product.nr}
                        </span>
                        <span className="font-display text-[24px] leading-none text-ink">
                          {product.name.en || product.name[language]}
                        </span>
                      </div>
                      <span className="price shrink-0 text-ink-a72">{formatPrice(product.price)}</span>
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="mt-16 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
              <p className="font-display text-[30px] leading-[1.1] max-w-[24ch]">
                Photographed in <em className="italic">silence</em>, worn for decades.
              </p>
              <span className="label text-ink/35">Winter Solstice · Plates I – VIII</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render GIFT CARDS PAGE
  if (pageType === 'gift-cards') {
    return (
      <div className="w-full min-h-screen bg-paper text-ink">
        <div className="page-shell page-top pb-24 sm:pb-32">
          <div className="max-w-[1440px] mx-auto">
            <StaticIntro
              eyebrow="Archive Gift Card"
              title={
                <>
                  Digital <em className="italic">Gift Card</em>
                </>
              }
              copy="Gift enduring Nordic craftsmanship. Delivered digitally with an exclusive accession gift certificate code."
              image={editorialAt(3)}
              caption="Gift · House photograph IV"
            />

            <div className="mt-16 max-w-[640px]">
              {!giftSubmitted ? (
                <div className="space-y-10">
                  <div>
                    <label className="field-label">Select Amount</label>
                    <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
                      {[100, 150, 250, 500].map((amt) => (
                        <button
                          type="button"
                          key={amt}
                          onClick={() => setGiftAmount(amt)}
                          className={`flex min-h-[44px] items-center font-mono text-[13px] tracking-[0.16em] transition-colors cursor-pointer ${
                            giftAmount === amt
                              ? 'text-ink'
                              : 'text-ink-a45 hover:text-ink'
                          }`}
                        >
                          {amt} €
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="gift-recipient" className="field-label">
                      Recipient Email
                    </label>
                    <input
                      id="gift-recipient"
                      type="email"
                      required
                      value={giftRecipient}
                      onChange={(e) => setGiftRecipient(e.target.value)}
                      placeholder="recipient@example.com"
                      className="field"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => giftRecipient && setGiftSubmitted(true)}
                    className="btn btn-primary btn-lg w-full justify-between"
                  >
                    <span>Order Gift Card (€{giftAmount}.00)</span>
                    <span aria-hidden="true">→</span>
                  </button>
                </div>
              ) : (
                <div className="py-16 text-center space-y-5">
                  <Check className="w-8 h-8 mx-auto" strokeWidth={1} />
                  <h2 className="font-display text-[34px] leading-none">
                    Gift <em className="italic">Dispatched</em>
                  </h2>
                  <p className="body-copy mx-auto text-ink/55">
                    Gift card (€{giftAmount}.00) dispatched to {giftRecipient}.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render TRACKING PAGE
  if (slug === 'tracking') {
    return (
      <div className="w-full min-h-screen bg-paper text-ink">
        <div className="page-shell page-top pb-24 sm:pb-32">
          <div className="max-w-[1440px] mx-auto">
            <StaticIntro
              eyebrow="Shipment Tracking"
              title={
                <>
                  Track Your <em className="italic">Shipment</em>
                </>
              }
              copy="Enter your parcel tracking reference provided in your dispatch notification."
              image={editorialAt(5)}
              caption="Dispatch · House photograph VI"
            />

            <div className="mt-16 max-w-[640px]">
              <form onSubmit={handleTrack} className="space-y-8">
                <div>
                  <label htmlFor="tracking-code" className="field-label">
                    Tracking Reference
                  </label>
                  <input
                    id="tracking-code"
                    type="text"
                    required
                    value={trackingCode}
                    onChange={(e) => setTrackingCode(e.target.value)}
                    placeholder="Tracking reference..."
                    className="field uppercase"
                  />
                </div>
                <button type="submit" disabled={isTracking} className="btn btn-primary btn-lg w-full justify-between">
                  <span>{isTracking ? 'Searching...' : 'Search Status'}</span>
                  <span aria-hidden="true">→</span>
                </button>
              </form>

              {trackingResult && (
                <div className="mt-10 flex gap-4">
                  <span className="label text-ink-a45 shrink-0 pt-1">Status</span>
                  <p className="body-copy text-ink-a72">{trackingResult}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render PHILOSOPHY & ABOUT
  if (slug === 'philosophy') {
    return (
      <div className="w-full min-h-screen bg-paper text-ink">
        <div className="page-shell page-top pb-24 sm:pb-32">
          <div className="max-w-[1440px] mx-auto">
            <StaticIntro
              eyebrow="House Philosophy"
              title={
                <>
                  Philosophy and <em className="italic">Sisu</em>
                </>
              }
              copy="A house built on restraint, northern light and the quiet authority of natural cloth."
              image={editorialAt(1)}
              caption="Philosophy · House photograph II"
            />

            <div className="mt-16 grid max-w-[880px] grid-cols-1 gap-10 pt-4 md:grid-cols-12 md:gap-16">
              <div className="md:col-span-4">
                <span className="label text-ink-a45">Chapter I</span>
                <p className="font-mono text-[11px] leading-relaxed tracking-[0.14em] text-ink-a45 mt-4">
                  HELSINKI · PORTO
                  <br />
                  60°10′N 24°56′E
                </p>
              </div>
              <div className="md:col-span-8 space-y-6">
                <p className="body-copy text-ink-a72">
                  Zejesh was established in opposition to seasonal surplus and synthetic
                  elasticity. We believe genuine luxury derives not from excessive decoration, but
                  from disciplined proportions, the innate stance of natural weaves, and
                  uncompromised comfort without petrochemical shortcuts.
                </p>
                <blockquote className="my-12 max-w-[30ch]">
                  <p className="font-display text-[34px] leading-[1.1]">
                    “Quietude, space, and honesty of material. Every cut has a deliberate purpose
                    for <em className="italic">being</em>.”
                  </p>
                </blockquote>
                <p className="body-copy text-ink-a72">
                  When entering the world of Zejesh, the experience is quiet, exclusive, and
                  meaningful. We do not chase fleeting fashion weeks; we create garments designed
                  to feel equally pristine twenty years from now.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render MATERIALS
  if (slug === 'materials') {
    return (
      <div className="w-full min-h-screen bg-paper text-ink">
        <div className="page-shell page-top pb-24 sm:pb-32">
          <div className="max-w-[1440px] mx-auto">
            <StaticIntro
              eyebrow="Craft & Integrity"
              title={
                <>
                  Honesty of <em className="italic">Material</em>
                </>
              }
              copy="Mono-materials only: certified merino, dense virgin wool, organic cotton and heritage flax."
              image={editorialAt(5)}
              caption="Material · House photograph VI"
            />

            <div className="mt-16 max-w-[880px] space-y-10 pt-4">
              <p className="body-copy text-ink-a72">
                We employ strictly 100% mono-materials: certified northern merino, dense Italian
                virgin wool, heavy Portuguese organic cotton, and heritage European flax. We never
                compromise wool with polyester or polyamide.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                <div className="bg-paper p-6 sm:p-8">
                  <span className="label text-ink-a45">Specification 01</span>
                  <span className="font-display text-[28px] leading-none text-ink block mt-4">
                    Virgin Wool
                  </span>
                  <span className="font-mono text-[11px] tracking-[0.14em] text-ink-a45 block mt-3">
                    BIELLA & YORKSHIRE · 680–750G/M²
                  </span>
                </div>
                <div className="bg-paper p-6 sm:p-8">
                  <span className="label text-ink-a45">Specification 02</span>
                  <span className="font-display text-[28px] leading-none text-ink block mt-4">
                    Merino 19.5 µm
                  </span>
                  <span className="font-mono text-[11px] tracking-[0.14em] text-ink-a45 block mt-3">
                    SPUN IN FINLAND · NON-ITCH
                  </span>
                </div>
              </div>

              <div className="mt-4 max-w-[30ch]">
                <p className="font-display text-[34px] leading-[1.1]">
                  Nothing synthetic ever enters the <em className="italic">loom</em>.
                </p>
                <span className="label mt-5 block text-ink/35">Charter · Article II</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render SUSTAINABILITY
  if (slug === 'sustainability') {
    return (
      <div className="w-full min-h-screen bg-paper text-ink">
        <div className="page-shell page-top pb-24 sm:pb-32">
          <div className="max-w-[1440px] mx-auto">
            <StaticIntro
              eyebrow="Circular Charter"
              title={
                <>
                  Circularity & Lifetime <em className="italic">Repair</em>
                </>
              }
              copy="Limited batch releases, zero surplus, and complimentary restorative stitching for the life of every piece."
              image={editorialAt(6)}
              caption="Circularity · House photograph VII"
            />

            <div className="mt-16 max-w-[880px] space-y-10 pt-4">
              <p className="body-copy text-ink-a72">
                We operate strictly in limited batch releases with zero surplus. Furthermore, all
                Zejesh archive coats and knitwear include complimentary restorative lifetime
                stitching in our Helsinki atelier.
              </p>

              <div className="max-w-[34ch]">
                <span className="label block mb-6 text-ink/35">Lifetime Guarantee</span>
                <p className="font-display text-[38px] leading-[1.05] max-w-[24ch]">
                  Garments are registered, repaired, and <em className="italic">returned</em> to the
                  archive.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render WORKSHOPS
  if (slug === 'workshops') {
    return (
      <div className="w-full min-h-screen bg-paper text-ink">
        <div className="page-shell page-top pb-24 sm:pb-32">
          <div className="max-w-[1440px] mx-auto">
            <StaticIntro
              eyebrow="Production"
              title={
                <>
                  Ateliers: Helsinki & <em className="italic">Porto</em>
                </>
              }
              copy="Pattern drafting in Punavuori. Heritage tailoring and heavy jersey in a family workshop on the Porto waterfront."
              image={editorialAt(2)}
              caption="Atelier · House photograph III"
            />

            <div className="mt-16 grid max-w-[880px] grid-cols-1 gap-10 pt-4 md:grid-cols-2 md:gap-16">
              <p className="body-copy text-ink-a72">
                Pattern drafting and artisanal finishing take place in our Punavuori studio in
                Helsinki. Tailored overcoats and heavy jerseys are executed with our heritage family
                workshop in Porto, Portugal.
              </p>
              <dl className="space-y-4 font-mono text-[11px] tracking-[0.16em] text-ink-a45">
                <div className="flex justify-between border-b border-ink-a18 pb-3">
                  <dt>HELSINKI</dt>
                  <dd className="text-ink">PURSUMIEHENKATU 12</dd>
                </div>
                <div className="flex justify-between border-b border-ink-a18 pb-3">
                  <dt>PORTO</dt>
                  <dd className="text-ink">RIBEIRA WORKSHOP</dd>
                </div>
                <div className="flex justify-between border-b border-ink-a18 pb-3">
                  <dt>EST.</dt>
                  <dd className="text-ink">2026</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render CONTACT & CUSTOMER SERVICE
  if (slug === 'contact') {
    return (
      <div className="w-full min-h-screen bg-paper text-ink">
        <div className="page-shell page-top pb-24 sm:pb-32">
          <div className="max-w-[1440px] mx-auto">
            <StaticIntro
              eyebrow="Client Concierge"
              title={
                <>
                  Contact <em className="italic">House</em>
                </>
              }
              copy="For sizing, alterations, archive enquiries and personal appointments at the Helsinki studio."
              image={editorialAt(4)}
              caption="Concierge · House photograph V"
            />

            <div className="mt-16 max-w-[720px]">
              <dl className="divide-y divide-ink-a14">
                <div className="flex flex-col sm:flex-row sm:justify-between gap-1 py-4 first:pt-0">
                  <dt className="label text-ink/35">Email</dt>
                  <dd className="body-copy">concierge@zejesh.com</dd>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between gap-1 py-4">
                  <dt className="label text-ink/35">Direct Line</dt>
                  <dd className="body-copy">+358 (0)9 4245 8920</dd>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between gap-1 py-4">
                  <dt className="label text-ink/35">Hours</dt>
                  <dd className="body-copy">Mon–Fri 10:00 – 18:00 (EET)</dd>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between gap-1 py-4 last:pb-0">
                  <dt className="label text-ink/35">Studio</dt>
                  <dd className="body-copy sm:text-right">
                    Pursimiehenkatu 12, 00150 Helsinki, Finland
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render SHIPPING & RETURNS
  if (slug === 'shipping-returns') {
    return (
      <div className="w-full min-h-screen bg-paper text-ink">
        <div className="page-shell page-top pb-24 sm:pb-32">
          <div className="max-w-[1440px] mx-auto">
            <StaticIntro
              eyebrow="Delivery Charter"
              title={
                <>
                  Shipping and <em className="italic">Returns</em>
                </>
              }
              copy="Tracked, considered delivery. Fourteen days to decide, with prepaid returns included."
              image={editorialAt(0)}
              caption="Delivery · House photograph I"
            />

            <div className="mt-16 max-w-[880px] pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 sm:gap-8 py-8">
                <span className="sm:col-span-1 font-mono text-[11px] tracking-[0.18em] text-ink-a45">
                  01
                </span>
                <div className="sm:col-span-11">
                  <h4 className="label text-ink">Complimentary Shipping Over €100</h4>
                  <p className="body-copy text-ink-a72 mt-3">
                    Tracked expedited delivery dispatched within 1–3 business days.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 sm:gap-8 py-8 border-b border-ink-a18">
                <span className="sm:col-span-1 font-mono text-[11px] tracking-[0.18em] text-ink-a45">
                  02
                </span>
                <div className="sm:col-span-11">
                  <h4 className="label text-ink">14-Day Complimentary Returns</h4>
                  <p className="body-copy text-ink-a72 mt-3">
                    All pieces may be returned within 14 days of receipt in original condition.
                    Pre-printed prepaid returns documentation included.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render TERMS, PRIVACY, COOKIES
  return (
    <div className="w-full min-h-screen bg-paper text-ink">
      <div className="page-shell page-top pb-24 sm:pb-32">
        <div className="max-w-[1440px] mx-auto">
          <StaticIntro
            eyebrow="Legal & Governance"
            title={
              slug === 'terms' ? (
                <>Terms & Conditions of <em className="italic">Sale</em></>
              ) : slug === 'privacy' ? (
                <>Privacy Policy <em className="italic">(GDPR)</em></>
              ) : (
                <>Cookie <em className="italic">Preferences</em></>
              )
            }
            copy="The clear terms behind the house: ownership, cancellation rights, privacy and the use of essential cookies."
            image={editorialAt(6)}
            caption="Governance · House document"
          />

          <div className="mt-16 max-w-[880px] space-y-6 pt-4">
            <p className="body-copy text-ink-a72">
              Zejesh Clothes Oy · Business ID: FI32918239 · Helsinki, Finland
            </p>
            <p className="body-copy text-ink-a72">
              All prices include standard VAT (24%). European consumers retain statutory 14-day
              cancellation and return rights.
            </p>
            <p className="body-copy text-ink-a72">
              We process personal data solely for fulfillment of your order and secure account
              authentication. We never sell or transfer personal records to third-party marketing
              entities.
            </p>
            <div className="mt-12 font-mono text-[11px] tracking-[0.16em] text-ink/40">
              DOCUMENT REV. 2026.01 · ZEJESH CLOTHES OY
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
