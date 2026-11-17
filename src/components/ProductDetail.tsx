import React, { useState } from 'react';
import { Product, Language, translations, formatPrice } from '../types';
import { useStorefrontData } from '../context/StorefrontDataContext';
import { FashionImage } from './FashionImage';
import { SizeGuideModal } from './SizeGuideModal';
import { ProductCard } from './ProductCard';
import { Heart, X, ArrowLeft } from 'lucide-react';
import { editorialAt, editorialFor } from '../editorial';

interface ProductDetailProps {
  product: Product;
  language: Language;
  onBackToArchive: () => void;
  onAddToCart: (product: Product, size: string) => void;
  onSelectProduct: (product: Product) => void;
  onToggleWishlist: (productId: string) => void;
  isWishlisted: boolean;
}

export const ProductDetail: React.FC<ProductDetailProps> = ({
  product,
  language,
  onBackToArchive,
  onAddToCart,
  onSelectProduct,
  onToggleWishlist,
  isWishlisted,
}) => {
  const { products } = useStorefrontData();
  const t = translations[language];

  const [selectedSize, setSelectedSize] = useState<string>(product.sizes[0] || 'M');
  const [isSizeGuideOpen, setIsSizeGuideOpen] = useState(false);
  const [zoomedImageIndex, setZoomedImageIndex] = useState<number | null>(null);
  const [activeMobileImageIdx, setActiveMobileImageIdx] = useState(0);
  const [isAddedFeedback, setIsAddedFeedback] = useState(false);
  const [openAccordion, setOpenAccordion] = useState<string>('details');

  const handleAdd = () => {
    onAddToCart(product, selectedSize);
    setIsAddedFeedback(true);
    window.setTimeout(() => setIsAddedFeedback(false), 2000);
  };

  const galleryEntries = (() => {
    const images = (product.images || [])
      .filter((img) => img && img.url)
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    if (images.length === 0) {
      return [
        { src: product.image || editorialAt(0), pos: 'center 45%', scale: 1, framing: product.framing, alt: undefined, label: '01 — Full silhouette' },
        { src: product.hoverImage || product.image || editorialAt(1), pos: 'center 45%', scale: 1.02, framing: product.framing, alt: undefined, label: '02 — Atelier model' },
        { src: editorialAt(2), pos: 'center 30%', scale: 1.2, framing: undefined, alt: undefined, label: '03 — Detail' },
        { src: editorialAt(3), pos: 'center 40%', scale: 1.3, framing: undefined, alt: undefined, label: '04 — Fabric' },
      ];
    }

    return images.map((img, idx) => ({
      src: img.url as string | undefined,
      pos: img.position,
      scale: img.scale,
      framing: img.framing || product.framing,
      alt: img.alt?.[language] || img.alt?.en || undefined,
      label: `${String(idx + 1).padStart(2, '0')} — ${img.alt?.[language] || img.alt?.en || product.name[language]}`,
    }));
  })();

  const completeTheLook = (products || [])
    .filter((p) => p.id !== product.id && p.category !== product.category)
    .slice(0, 4);

  const mobileTouchStartX = React.useRef<number | null>(null);

  const accordions = [
    { key: 'details', label: 'Details', content: product.description[language] || product.description.en },
    {
      key: 'composition',
      label: 'Composition',
      content: `${product.material[language] || product.material.en} — woven ${product.origin[language] || product.origin.en}.`,
    },
    { key: 'care', label: 'Care', content: product.care[language] || product.care.en },
    { key: 'shipping', label: 'Shipping', content: t.pdp.shippingInfo },
  ];

  return (
    <article className="w-full bg-paper pb-24 text-ink md:pb-32">
      <div className="page-shell pt-[calc(var(--nav-h)+26px)]">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onBackToArchive}
            className="group flex min-h-[44px] items-center gap-3 label text-[9px] text-ink/45 transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
            Archive
          </button>
          <div className="flex items-center gap-3 label text-[9px] text-ink/35">
            <span>Plate {product.plateNumber}</span>
            <span>·</span>
            <span className="uppercase">{product.category}</span>
          </div>
        </div>
      </div>

      <div className="page-shell mt-8 md:mt-12">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-14">
          {/* Gallery — desktop */}
          <div className="hidden flex-col gap-2 lg:col-span-7 lg:flex">
            {galleryEntries.map((crop, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setZoomedImageIndex(idx)}
                className="group relative block aspect-[2/3] w-full cursor-zoom-in overflow-hidden bg-[#111]"
              >
                <FashionImage
                  product={product}
                  src={crop.src ?? (idx % 2 === 1 ? product.hoverImage || product.image : product.image)}
                  fallbackSrc={editorialFor(product.id, idx)}
                  alt={crop.alt || `${product.name[language]} — image ${idx + 1}`}
                  framing={crop.framing}
                  placement="productPage"
                  position={crop.pos}
                  scale={crop.scale}
                  aspectRatio="auto"
                  className="h-full w-full"
                  imageClassName="grayscale transition-transform duration-[1200ms] ease-out group-hover:scale-[1.025]"
                  enableMultiply={false}
                />
                <span className="absolute left-5 top-5 label text-[9px] text-white/65 mix-blend-difference">
                  {crop.label}
                </span>
              </button>
            ))}
          </div>

          {/* Gallery — mobile */}
          <div
            className="relative select-none lg:hidden"
            onTouchStart={(e) => {
              mobileTouchStartX.current = e.touches[0].clientX;
            }}
            onTouchEnd={(e) => {
              if (mobileTouchStartX.current === null) return;
              const delta = e.changedTouches[0].clientX - mobileTouchStartX.current;
              if (delta < -35) setActiveMobileImageIdx((prev) => (prev + 1) % galleryEntries.length);
              else if (delta > 35)
                setActiveMobileImageIdx((prev) => (prev - 1 + galleryEntries.length) % galleryEntries.length);
              mobileTouchStartX.current = null;
            }}
          >
            <div className="relative aspect-[2/3] w-full overflow-hidden bg-[#111]">
              <FashionImage
                product={product}
                src={galleryEntries[activeMobileImageIdx].src ?? product.image}
                fallbackSrc={editorialFor(product.id, activeMobileImageIdx)}
                alt={galleryEntries[activeMobileImageIdx].alt || product.name[language]}
                framing={galleryEntries[activeMobileImageIdx].framing}
                placement="productPage"
                position={galleryEntries[activeMobileImageIdx].pos}
                scale={galleryEntries[activeMobileImageIdx].scale}
                aspectRatio="auto"
                className="h-full w-full"
                imageClassName="grayscale"
                enableMultiply={false}
              />
              <span className="absolute left-4 top-4 label text-[9px] text-white/65 mix-blend-difference">
                {String(activeMobileImageIdx + 1).padStart(2, '0')} /{' '}
                {String(galleryEntries.length).padStart(2, '0')}
              </span>
            </div>
            <div className="mt-5 flex items-center justify-between gap-4">
              <span className="label text-[8px] text-ink/30">Swipe to view the piece</span>
              <div className="flex items-center gap-3">
                {galleryEntries.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActiveMobileImageIdx(i)}
                    className="h-2 w-2 rounded-full transition-colors"
                    style={{ background: activeMobileImageIdx === i ? 'var(--ink)' : 'var(--ink-a20)' }}
                    aria-label={`View image ${i + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Purchase panel */}
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-[calc(var(--nav-h)+40px)]">
              <div className="flex items-center justify-between gap-4">
                <span className="label text-[9px] text-ink/45">{product.category || 'Garment'}</span>
                <button
                  type="button"
                  onClick={() => onToggleWishlist(product.id)}
                  className="flex min-h-[44px] items-center gap-2 label text-[9px] text-ink/55 transition-colors hover:text-ink"
                  aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
                >
                  <Heart className={`h-3.5 w-3.5 ${isWishlisted ? 'fill-ink' : ''}`} />
                  {isWishlisted ? 'Saved' : 'Save'}
                </button>
              </div>

              <h1 className="mt-7 font-display text-[clamp(52px,5.6vw,96px)] font-light leading-[0.84] tracking-[-0.035em]">
                {product.name[language].split(' ').map((word, i, arr) => (
                  <React.Fragment key={`${word}-${i}`}>
                    {i === arr.length - 1 && arr.length > 1 ? <em className="italic">{word}</em> : word}
                    {i < arr.length - 1 ? ' ' : ''}
                  </React.Fragment>
                ))}
              </h1>

              <div className="mt-7 flex items-baseline gap-4">
                <span className="price text-[17px]">{formatPrice(product.price)}</span>
                <span className="label text-[9px] text-ink/35">VAT included</span>
              </div>

              <p className="mt-4 label text-[9px] leading-relaxed text-ink/45">
                {product.material[language]} · {product.origin[language]}
              </p>

              <p className="mt-8 max-w-[40ch] body-copy text-ink/55">
                {product.description[language] || product.description.en}
              </p>

              <div className="mt-12">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="label text-[9px] text-ink/50">
                    Select size — {selectedSize}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsSizeGuideOpen(true)}
                    className="label text-[9px] text-ink/45 transition-colors hover:text-ink"
                  >
                    Size guide
                  </button>
                </div>
                <div className="mt-4 flex flex-wrap gap-1">
                  {product.sizes.map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setSelectedSize(sz)}
                      className="size-option"
                      data-selected={selectedSize === sz}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleAdd}
                className="group mt-10 flex w-full items-end justify-between gap-6 text-left"
              >
                <span className="font-display text-[clamp(34px,3.8vw,58px)] font-light leading-none tracking-[-0.02em] transition-opacity duration-300 group-hover:opacity-50">
                  {isAddedFeedback ? (
                    <>Added to <em className="italic">bag</em></>
                  ) : (
                    <>Add to <em className="italic">bag</em></>
                  )}
                </span>
                <span className="label pb-2 text-[9px] text-ink/45">→</span>
              </button>

              <div className="mt-14">
                {accordions.map((item) => (
                  <div key={item.key}>
                    <button
                      type="button"
                      onClick={() => setOpenAccordion(openAccordion === item.key ? '' : item.key)}
                      className="flex min-h-[58px] w-full items-baseline justify-between gap-6 py-3 text-left"
                    >
                      <span className="font-display text-[25px] leading-none">{item.label}</span>
                      <span className="label text-[10px] text-ink/40" aria-hidden="true">
                        {openAccordion === item.key ? '−' : '+'}
                      </span>
                    </button>
                    {openAccordion === item.key && (
                      <div className="pb-7">
                        <p className="max-w-[38ch] body-copy text-[14px] text-ink/55">{item.content}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-12 grid grid-cols-2 gap-8">
                <div>
                  <span className="label block text-[9px] text-ink/35">Delivery</span>
                  <p className="mt-2 font-display text-[20px]">2—5 days</p>
                </div>
                <div>
                  <span className="label block text-[9px] text-ink/35">Returns</span>
                  <p className="mt-2 font-display text-[20px]">14 days</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {completeTheLook.length > 0 && (
        <section className="page-shell mt-32 md:mt-48">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="font-display text-[clamp(44px,6vw,92px)] font-light leading-[0.88] tracking-[-0.03em]">
              Complete the <em className="italic">look</em>
            </h2>
            <span className="label text-[9px] text-ink/35">Selected pairings</span>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-x-8 gap-y-16 sm:grid-cols-2 lg:grid-cols-4">
            {completeTheLook.map((p, i) => (
              <ProductCard
                key={p.id}
                product={p}
                language={language}
                index={i}
                onSelectProduct={onSelectProduct}
              />
            ))}
          </div>
        </section>
      )}

      {zoomedImageIndex !== null && (
        <div className="fixed inset-0 z-[99] flex items-center justify-center bg-black p-4 md:p-10">
          <button
            type="button"
            onClick={() => setZoomedImageIndex(null)}
            className="absolute right-6 top-6 flex min-h-[44px] items-center gap-3 label text-[9px] text-white"
            aria-label="Close image"
          >
            Close <X className="h-4 w-4" />
          </button>
          <div className="aspect-[2/3] max-h-[88vh] max-w-2xl overflow-hidden md:max-w-4xl">
            <FashionImage
              product={product}
              src={
                galleryEntries[zoomedImageIndex].src ??
                (zoomedImageIndex % 2 === 1 ? product.hoverImage || product.image : product.image)
              }
              fallbackSrc={editorialFor(product.id, zoomedImageIndex)}
              alt={galleryEntries[zoomedImageIndex].alt || product.name[language]}
              framing={galleryEntries[zoomedImageIndex].framing}
              placement="productPage"
              position={galleryEntries[zoomedImageIndex].pos}
              scale={(galleryEntries[zoomedImageIndex].scale || 1) * 1.3}
              aspectRatio="auto"
              className="h-full w-full"
              imageClassName="grayscale"
              enableMultiply={false}
            />
          </div>
        </div>
      )}

      <SizeGuideModal isOpen={isSizeGuideOpen} onClose={() => setIsSizeGuideOpen(false)} language={language} />
    </article>
  );
};
