import React, { useEffect } from 'react';
import { Product, Language, translations, formatPrice } from '../types';
import { useStorefrontData } from '../context/StorefrontDataContext';
import { FashionImage } from './FashionImage';
import { X, ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';

interface QuickLookModalProps {
  product: Product | null;
  onClose: () => void;
  onSelectProduct: (product: Product) => void;
  onQuickAdd: (product: Product, size: string) => void;
  language: Language;
}

export const QuickLookModal: React.FC<QuickLookModalProps> = ({
  product,
  onClose,
  onSelectProduct,
  onQuickAdd,
  language,
}) => {
  const { products } = useStorefrontData();
  const t = translations[language];

  if (!product) return null;

  const currentIndex = products.findIndex((p) => p.id === product.id);

  const goToNextPlate = () => {
    if (products.length === 0) return;
    const nextIndex = (currentIndex + 1) % products.length;
    onSelectProduct(products[nextIndex]);
  };

  const goToPrevPlate = () => {
    if (products.length === 0) return;
    const prevIndex = (currentIndex - 1 + products.length) % products.length;
    onSelectProduct(products[prevIndex]);
  };

  return (
    <div className="fixed inset-0 z-[85] bg-paper text-ink flex flex-col justify-between overflow-y-auto animate-fadeIn select-none">
      {/* Top Header */}
      <div className="max-w-[1720px] w-full mx-auto px-4 sm:px-6 md:px-10 py-4 sm:py-6 flex items-center justify-between border-b border-ink-a18">
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="label text-[9px] text-ink/50">
            {product.plateNumber || product.nr}
          </span>
          <span className="text-ink/20">/</span>
          <span className="label text-[9px] text-ink/50">
            {currentIndex >= 0 ? currentIndex + 1 : 1} OF {Math.max(1, products.length)}
          </span>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center border border-ink-a18 text-ink/60 hover:text-ink hover:border-ink transition-colors cursor-pointer"
          aria-label={t.nav.close}
        >
          <X className="w-5 h-5 sm:w-6 sm:h-6 stroke-[1.25]" />
        </button>
      </div>

      {/* Main Editorial Presentation (Mobile stacked, Tablet & Desktop split) */}
      <div className="max-w-[1720px] w-full mx-auto px-4 sm:px-6 md:px-10 py-6 sm:py-8 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-10 items-center">
        {/* Left: Previous Plate Affordance (Desktop) */}
        <div className="hidden lg:flex lg:col-span-1 justify-start">
          <button
            type="button"
            onClick={goToPrevPlate}
            className="flex h-11 w-11 items-center justify-center text-ink/50 hover:text-ink transition-colors cursor-pointer"
            title="Previous plate"
          >
            <ChevronLeft className="w-8 h-8 stroke-[1.2]" />
          </button>
        </div>

        {/* Center: Large High-Fashion Image Viewport */}
        <div className="lg:col-span-6 flex justify-center">
          <div className="w-full max-w-sm sm:max-w-md lg:max-w-lg aspect-[2/3] overflow-hidden relative bg-[#111]">
            <FashionImage
              product={product}
              src={product.hoverImage || product.image}
              alt={product.name.en || product.name.fi}
              placement="productPage"
              position={product?.cropVariation?.onModel?.position || 'center 45%'}
              scale={product?.cropVariation?.onModel?.scale || 1.02}
              aspectRatio="auto"
              className="w-full h-full"
            />
            {product.isLimited && (
              <div className="absolute top-3 left-3 sm:top-4 sm:left-4 label text-[9px] text-ink/70">
                {t.archive.limited}
              </div>
            )}
          </div>
        </div>

        {/* Right: Plate Dossier */}
        <div className="lg:col-span-4 flex flex-col justify-between space-y-6 sm:space-y-8">
          <div className="space-y-3 sm:space-y-4">
            <span className="label text-[9px] text-ink/40 block">
              {product.category.toUpperCase()} · {product.subcategory}
            </span>
            <h2 className="font-display text-[clamp(34px,4.6vw,56px)] font-light leading-[1.02] tracking-[-0.02em]">
              {product.name.en || product.name.fi}
            </h2>
            <p className="price text-ink">
              {formatPrice(product.price)}
            </p>
            <p className="body-copy text-ink/50">
              {product.material.en || product.material.fi} · {product.origin.en || product.origin.fi}
            </p>
            <p className="body-copy text-ink/70 pt-1 sm:pt-2">
              {product.description.en || product.description.fi}
            </p>
          </div>

          {/* Quick size selection and actions */}
          <div>
            <span className="label text-[9px] text-ink/50 block mb-3">
              Select size for direct acquisition
            </span>
            <div className="flex flex-wrap gap-2.5 sm:gap-3 mb-4 sm:mb-6">
              {product.sizes.map((sz) => (
                <button
                  type="button"
                  key={sz}
                  onClick={() => onQuickAdd(product, sz)}
                  className="size-option text-ink/60 hover:text-ink cursor-pointer"
                >
                  {sz}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                onClose();
                onSelectProduct(product);
              }}
              className="btn btn-primary w-full justify-between cursor-pointer"
            >
              <span>Open Product Page</span>
              <ArrowRight className="w-4 h-4 stroke-[1.5]" />
            </button>
          </div>
        </div>

        {/* Right: Next Plate Affordance (Desktop) */}
        <div className="hidden lg:flex lg:col-span-1 justify-end">
          <button
            type="button"
            onClick={goToNextPlate}
            className="flex h-11 w-11 items-center justify-center text-ink/50 hover:text-ink transition-colors cursor-pointer"
            title="Next plate"
          >
            <ChevronRight className="w-8 h-8 stroke-[1.2]" />
          </button>
        </div>
      </div>

      {/* Bottom Footer bar with Next / Prev Plate affordances (Mobile & Desktop) */}
      <div className="max-w-[1720px] w-full mx-auto px-4 sm:px-6 md:px-10 py-3.5 sm:py-4 flex items-center justify-between border-t border-ink-a18 label text-[9px] text-ink/60">
        <button
          type="button"
          onClick={goToPrevPlate}
          className="lg:hidden flex items-center gap-1 min-h-[44px] hover:text-ink cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Prev</span>
        </button>

        <span className="hidden sm:inline text-ink/40">
          Archival Plate Dossier · Est. 2026
        </span>

        <button
          type="button"
          onClick={goToNextPlate}
          className="flex items-center gap-1 min-h-[44px] text-ink/80 hover:text-ink cursor-pointer ml-auto"
        >
          <span>Next Plate</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
