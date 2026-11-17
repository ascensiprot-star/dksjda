import React, { useState, useMemo } from 'react';
import { Product, Language, translations, formatPrice } from '../types';
import { useStorefrontData } from '../context/StorefrontDataContext';
import { FashionImage } from './FashionImage';
import { X, Search } from 'lucide-react';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  onSelectProduct: (product: Product) => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
  language,
  onSelectProduct,
}) => {
  const { products } = useStorefrontData();
  const [query, setQuery] = useState('');
  const t = translations[language];

  const suggestedQueries = [
    'Wool',
    'Overcoat',
    'Cashmere',
    'Linen',
    'Leather',
    'Tailored Trousers',
    'Winter',
  ];

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase().trim();
    return (products || []).filter(
      (p) =>
        ((p.name?.en || p.name?.fi || '').toLowerCase().includes(q)) ||
        ((p.plateNumber || p.nr || '').toLowerCase().includes(q)) ||
        ((p.material?.en || p.material?.fi || '').toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q)) ||
        (p.subcategory && p.subcategory.toLowerCase().includes(q))
    );
  }, [query, products]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] bg-paper text-ink flex flex-col overflow-y-auto animate-fadeIn select-none">
      {/* Top Search Bar */}
      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-4 sm:py-6 flex items-center justify-between gap-3 sm:gap-4 border-b border-ink-a18">
        <div className="flex-1 flex items-center gap-2.5 sm:gap-3">
          <Search className="w-5 h-5 text-ink/45 shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pieces, materials, plate numbers..."
            className="w-full font-display text-[clamp(22px,3vw,34px)] font-light tracking-wide bg-transparent outline-none placeholder:text-ink/30"
          />
        </div>

        <button
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center border border-ink-a18 text-ink/60 hover:text-ink hover:border-ink transition-colors cursor-pointer"
          aria-label={t.nav.close}
        >
          <X className="w-5 h-5 sm:w-6 sm:h-6 stroke-[1.25]" />
        </button>
      </div>

      {/* Results / Suggestions Container */}
      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 flex-1">
        {query.trim() === '' ? (
          <div>
            <p className="label text-[9px] text-ink/40 mb-3 sm:mb-4">
              Suggested inquiries
            </p>
            <div className="flex flex-wrap gap-4 sm:gap-6 mb-8 sm:mb-12">
              {suggestedQueries.map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => setQuery(item)}
                  className="label text-[10px] text-ink/60 hover:text-ink hover:underline underline-offset-4 transition-colors cursor-pointer"
                >
                  {item}
                </button>
              ))}
            </div>

            {products.length > 0 && (
              <>
                <p className="label text-[9px] text-ink/40 mb-4 sm:mb-6">
                  Archive highlights
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  {products.slice(0, 4).map((product) => (
                    <div
                      key={product.id}
                      onClick={() => {
                        onSelectProduct(product);
                        onClose();
                      }}
                      className="group cursor-pointer bg-paper p-3 sm:p-4"
                    >
                      <FashionImage
                        product={product}
                        src={product.image}
                        alt={product.name.en || product.name.fi}
                        aspectRatio="2/3"
                        placement="card"
                        className="mb-2 sm:mb-3"
                      />
                      <span className="label text-[9px] text-ink/40 block">
                        {product.plateNumber || product.nr}
                      </span>
                      <h4 className="mt-1 font-display text-[22px] font-light leading-tight text-ink truncate">
                        {product.name.en || product.name.fi}
                      </h4>
                      <span className="price text-ink/60 block mt-1">
                        {formatPrice(product.price)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : results.length === 0 ? (
          <div className="py-20 text-center">
            <p className="label text-[10px] text-ink/50 mb-3">
              No matching archive pieces found
            </p>
            <p className="body-copy text-ink/40 mx-auto">
              Try a broader term, material, or category inquiry.
            </p>
          </div>
        ) : (
          <div>
            <p className="label text-[9px] text-ink/50 mb-6">
              Found {results.length} piece{results.length === 1 ? '' : 's'}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {results.map((product) => (
                <div
                  key={product.id}
                  onClick={() => {
                    onSelectProduct(product);
                    onClose();
                  }}
                  className="group cursor-pointer bg-paper p-3 sm:p-4"
                >
                  <FashionImage
                    product={product}
                    src={product.image}
                    alt={product.name.en || product.name.fi}
                    aspectRatio="2/3"
                    placement="card"
                    className="mb-3"
                  />
                  <span className="label text-[9px] text-ink/40 block">
                    {product.plateNumber || product.nr}
                  </span>
                  <h4 className="mt-1 font-display text-[22px] font-light leading-tight text-ink group-hover:underline underline-offset-4 truncate">
                    {product.name.en || product.name.fi}
                  </h4>
                  <span className="price text-ink/60 block mt-1">
                    {formatPrice(product.price)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
