import React from 'react';
import { Product, Language, formatPrice } from '../types';
import { FashionImage } from './FashionImage';
import { editorialFor } from '../editorial';

interface ProductCardProps {
  product: Product;
  language: Language;
  index: number;
  wishlisted?: boolean;
  onSelectProduct: (product: Product) => void;
  onToggleWishlist?: (productId: string) => void;
  onQuickAdd?: (product: Product, size: string) => void;
  showAdd?: boolean;
}

/**
 * A piece in the edit — a full photograph with a quiet, unframed caption.
 */
export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  language,
  index,
  wishlisted = false,
  onSelectProduct,
  onToggleWishlist,
  onQuickAdd,
  showAdd = true,
}) => {
  const name = product.name?.[language] || product.name?.en || 'Piece';
  const category =
    (typeof product.category === 'string' && product.category) || 'Archive';
  const soldOut = typeof product.stock === 'number' && product.stock <= 0;
  const image = product.image || product.images?.[0]?.url || editorialFor(product.id);
  const hoverImage = product.hoverImage || product.images?.[1]?.url;
  const defaultSize = product.sizes?.[0] || 'M';

  return (
    <article className="product-card group">
      <div className="product-card__media relative aspect-[2/3] w-full">
        <button
          type="button"
          onClick={() => onSelectProduct(product)}
          className="absolute inset-0 z-[2] cursor-pointer"
          aria-label={`View ${name}`}
        />

        <FashionImage
          product={product}
          src={image}
          fallbackSrc={editorialFor(product.id)}
          alt={name}
          placement="card"
          aspectRatio="2/3"
          className="h-full w-full"
          imageClassName="grayscale"
          enableMultiply={false}
          priority={index < 3}
        />

        {hoverImage && (
          <div className="pointer-events-none absolute inset-0 z-[1] opacity-0 transition-opacity duration-[900ms] ease-out group-hover:opacity-100">
            <FashionImage
              product={product}
              src={hoverImage}
              fallbackSrc={editorialFor(product.id, 1)}
              alt=""
              placement="card"
              aspectRatio="2/3"
              className="h-full w-full"
              imageClassName="grayscale"
              enableMultiply={false}
            />
          </div>
        )}

        <span className="pointer-events-none absolute left-5 top-5 z-[3] label text-[8px] text-white/75 mix-blend-difference">
          Nº {String(index + 1).padStart(2, '0')}
        </span>

        {onToggleWishlist && (
          <button
            type="button"
            onClick={() => onToggleWishlist(product.id)}
            className="product-card__save absolute right-5 top-4 z-[3] flex min-h-[36px] items-center label text-[8px] text-white/85 mix-blend-difference transition-opacity duration-500"
            aria-label={wishlisted ? 'Remove from saved pieces' : 'Save piece'}
          >
            {wishlisted ? 'Saved' : 'Save'}
          </button>
        )}

        {soldOut && (
          <span className="pointer-events-none absolute inset-0 z-[3] flex items-center justify-center label text-[9px] text-white mix-blend-difference">
            Sold out
          </span>
        )}

        {showAdd && !soldOut && onQuickAdd && (
          <div className="product-card__quick absolute inset-x-0 bottom-0 z-[3] bg-gradient-to-t from-black/70 via-black/25 to-transparent px-5 pb-5 pt-20">
            <button
              type="button"
              onClick={() => onQuickAdd(product, defaultSize)}
              className="flex w-full items-center justify-between gap-4 label text-[8px] text-white"
            >
              <span>Quick add — {defaultSize}</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        )}
      </div>

      <div className="mt-5 flex items-baseline justify-between gap-5">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => onSelectProduct(product)}
            className="product-card__name block text-left"
          >
            {name}
          </button>
          <span className="product-card__meta mt-2 block label text-[8px]">
            {typeof category === 'string' ? category : 'Archive'}
            {product.material?.[language] ? ` — ${product.material[language]}` : ''}
          </span>
        </div>
        <span className="price shrink-0 pt-[7px] text-ink-a64">
          {soldOut ? (
            <span className="line-through opacity-50">{formatPrice(product.price)}</span>
          ) : (
            formatPrice(product.price)
          )}
        </span>
      </div>

      {showAdd && !soldOut && !onQuickAdd && (
        <button
          type="button"
          onClick={() => onSelectProduct(product)}
          className="product-card__add mt-4 label text-[8px] text-ink-a55"
        >
          View piece →
        </button>
      )}
    </article>
  );
};
