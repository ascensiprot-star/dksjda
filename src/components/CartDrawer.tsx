import React, { useState } from 'react';
import { CartItem, Language, translations, formatPrice } from '../types';
import { FashionImage } from './FashionImage';
import { X } from 'lucide-react';
import { lockBodyScroll, unlockBodyScroll } from '../utils/scrollLock';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onUpdateQuantity: (productId: string, size: string, delta: number) => void;
  onRemoveItem: (productId: string, size: string) => void;
  onProceedToCheckout: () => void;
  onExploreArchive: () => void;
  language: Language;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  items,
  onUpdateQuantity,
  onRemoveItem,
  onProceedToCheckout,
  onExploreArchive,
  language,
}) => {
  const t = translations[language].cart;
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);

  React.useEffect(() => {
    if (isOpen) lockBodyScroll();
    else unlockBodyScroll();
    return () => unlockBodyScroll();
  }, [isOpen]);

  if (!isOpen) return null;

  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const freeShippingThreshold = 100;
  const remainingForFreeShipping = Math.max(0, freeShippingThreshold - subtotal);
  const count = items.reduce((acc, i) => acc + i.quantity, 0);

  return (
    <div className="fixed inset-0 z-[90] flex justify-end">
      <div className="overlay-backdrop" onClick={onClose} />

      <aside className="drawer-panel relative z-10 flex h-full w-full max-w-[480px] animate-slideIn flex-col">
        {/* header */}
        <div className="flex items-center justify-between border-b border-ink-a18 px-6 py-5">
          <div className="flex items-baseline gap-3">
            <h2 className="font-display text-[30px] font-light leading-none">Bag</h2>
            <span className="label text-[9px] text-ink/45">({count})</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center border border-ink-a18 transition-colors hover:border-ink"
            aria-label="Close bag"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* free shipping */}
        <div className="border-b border-ink-a18 px-6 py-4">
          <div className="flex items-center justify-between label text-[9px] text-ink/50">
            {remainingForFreeShipping === 0 ? (
              <span>Complimentary shipping</span>
            ) : (
              <span>€{remainingForFreeShipping.toFixed(0)} to complimentary shipping</span>
            )}
            <span>{formatPrice(100)}</span>
          </div>
        </div>

        {/* items */}
        <div className="flex-1 overflow-y-auto px-6">
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-start justify-center py-16">
              <span className="label text-[9px] text-ink/40">The bag is empty</span>
              <h3 className="mt-5 font-display text-[48px] font-light leading-[0.9]">
                Nothing <em className="italic">yet.</em>
              </h3>
              <p className="body-copy mt-5 text-ink/55">
                Select archival pieces by exploring the collection.
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onExploreArchive();
                }}
                className="btn btn-secondary mt-8"
              >
                Explore the archive <span aria-hidden="true">→</span>
              </button>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={`${item.product.id}-${item.size}`}
                className="flex gap-4 border-b border-ink-a18 py-6"
              >
                <div className="w-20 shrink-0 overflow-hidden bg-[#111]">
                  <FashionImage
                    product={item.product}
                    src={item.product.image}
                    alt={item.product.name[language]}
                    position={item.product.cropVariation?.packshot?.position}
                    scale={item.product.cropVariation?.packshot?.scale}
                    aspectRatio="2/3"
                    className="w-full"
                    imageClassName="grayscale"
                    enableMultiply={false}
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <span className="label text-[9px] text-ink/35">
                      {item.product.plateNumber || 'N° 026'}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemoveItem(item.product.id, item.size)}
                      className="label text-[9px] text-ink/40 underline underline-offset-4 hover:text-ink"
                    >
                      Remove
                    </button>
                  </div>

                  <h3 className="mt-1 font-display text-[22px] leading-tight">
                    {item.product.name[language]}
                  </h3>
                  <p className="label mt-2 text-[9px] text-ink/45">Size {item.size}</p>

                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(item.product.id, item.size, -1)}
                        className="label text-[13px] text-ink/50 hover:text-ink"
                        aria-label="Decrease quantity"
                      >
                        −
                      </button>
                      <span className="label min-w-[16px] text-center text-[10px]">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(item.product.id, item.size, 1)}
                        className="label text-[13px] text-ink/50 hover:text-ink"
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>
                    <span className="price">{formatPrice(item.product.price * item.quantity)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* footer */}
        {items.length > 0 && (
          <div className="border-t border-ink-a18 px-6 py-6">
            <div className="flex items-center gap-4">
              <input
                type="text"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                placeholder="Promo code"
                className="field flex-1"
                aria-label="Promo code"
              />
              <button
                type="button"
                onClick={() => setPromoApplied(true)}
                className="label shrink-0 text-[9px] text-ink/60 underline underline-offset-4 hover:text-ink"
              >
                Apply
              </button>
            </div>
            {promoApplied && (
              <p className="label mt-3 text-[9px] text-ink/40">Code accepted — discount applied at checkout.</p>
            )}

            <div className="mt-7 flex items-baseline justify-between">
              <span className="label text-[10px] text-ink/50">{t.subtotal}</span>
              <span className="font-display text-[clamp(40px,5vw,64px)] font-light leading-none">
                {formatPrice(subtotal)}
              </span>
            </div>
            <p className="mt-2 text-right label text-[9px] text-ink/35">Incl. 24% VAT</p>

            <button
              type="button"
              onClick={() => {
                onClose();
                onProceedToCheckout();
              }}
              className="btn btn-primary btn-lg mt-6 w-full justify-between"
            >
              <span>{t.checkout}</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        )}
      </aside>
    </div>
  );
};
