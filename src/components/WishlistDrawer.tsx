import React from 'react';
import { Product, Language, translations, formatPrice } from '../types';
import { useStorefrontData } from '../context/StorefrontDataContext';
import { FashionImage } from './FashionImage';
import { X, Heart, Trash2 } from 'lucide-react';

interface WishlistDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  wishlistIds: string[];
  onRemoveWishlist: (id: string) => void;
  onSelectProduct: (product: Product) => void;
  onQuickAdd: (product: Product, size: string) => void;
  language: Language;
}

export const WishlistDrawer: React.FC<WishlistDrawerProps> = ({
  isOpen,
  onClose,
  wishlistIds,
  onRemoveWishlist,
  onSelectProduct,
  onQuickAdd,
  language,
}) => {
  const { products } = useStorefrontData();
  const t = translations[language];

  if (!isOpen) return null;

  const wishlistedProducts = (products || []).filter((p) =>
    wishlistIds.includes(p.id)
  );

  return (
    <div className="fixed inset-0 z-[90] flex justify-end">
      {/* Backdrop */}
      <div onClick={onClose} className="overlay-backdrop" />

      {/* Drawer */}
      <aside className="drawer-panel relative w-full max-w-md h-full z-10 flex flex-col justify-between overflow-hidden animate-slideIn">
        <div className="flex items-center justify-between border-b border-ink-a18 px-6 py-5">
          <div className="flex items-baseline gap-3">
            <Heart className="w-4 h-4 stroke-[1.25] self-center" />
            <h3 className="font-display text-[30px] font-light leading-none">
              {t.nav.wishlist}
            </h3>
            <span className="label text-[9px] text-ink/45">
              ({wishlistedProducts.length})
            </span>
          </div>

          <button
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center border border-ink-a18 text-ink/60 hover:text-ink hover:border-ink transition-colors cursor-pointer"
            aria-label={t.nav.close}
          >
            <X className="w-5 h-5 stroke-[1.5]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6">
          {wishlistedProducts.length === 0 ? (
            <div className="h-full flex flex-col items-start justify-center text-left py-16">
              <Heart className="w-10 h-10 stroke-[1] text-ink/25 mb-5" />
              <p className="label text-[9px] text-ink/40">The list is empty</p>
              <h4 className="mt-4 font-display text-[40px] font-light leading-[0.95]">
                Nothing <em className="italic">saved.</em>
              </h4>
              <p className="body-copy mt-4 text-ink/50">
                Select the heart icon on any plate to curate your private wishlist.
              </p>
            </div>
          ) : (
            wishlistedProducts.map((product) => (
              <div key={product.id} className="py-6 flex gap-4 items-start border-b border-ink-a18">
                <div
                  onClick={() => {
                    onClose();
                    onSelectProduct(product);
                  }}
                  className="w-20 aspect-[2/3] overflow-hidden flex-shrink-0 bg-[#111] cursor-pointer"
                >
                  <FashionImage
                    product={product}
                    src={product.image}
                    alt={product.name[language]}
                    position={product.cropVariation.packshot.position}
                    scale={product.cropVariation.packshot.scale}
                    aspectRatio="auto"
                    className="w-full h-full"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <span className="label text-[9px] text-ink/35">
                      {product.plateNumber}
                    </span>
                    <button
                      onClick={() => onRemoveWishlist(product.id)}
                      className="flex h-9 w-9 items-center justify-center -mr-1 -mt-1 text-ink/40 hover:text-ink transition-colors"
                      title="Poista suosikeista"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <h5
                    onClick={() => {
                      onClose();
                      onSelectProduct(product);
                    }}
                    className="mt-1 font-display text-[22px] leading-tight truncate cursor-pointer hover:underline underline-offset-4"
                  >
                    {product.name[language]}
                  </h5>

                  <p className="price mt-2 text-ink/90">
                    {formatPrice(product.price)}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
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
                </div>
              </div>
            ))
          )}
        </div>

        {wishlistedProducts.length > 0 && (
          <div className="border-t border-ink-a18 px-6 py-6">
            <button
              onClick={onClose}
              className="btn btn-secondary w-full"
            >
              Continue Browsing
            </button>
          </div>
        )}
      </aside>
    </div>
  );
};
