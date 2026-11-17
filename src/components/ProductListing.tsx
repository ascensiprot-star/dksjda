import React, { useMemo, useState } from 'react';
import { Product, Language, Category } from '../types';
import { ProductCard } from './ProductCard';
import { ProductCardSkeleton } from './ProductCardSkeleton';
import { X } from 'lucide-react';
import { editorialAt } from '../editorial';

interface ProductListingProps {
  language: Language;
  selectedCategory: string;
  selectedSubcategory?: string;
  onSelectCategory: (cat: string, sub?: string) => void;
  onSelectProduct: (product: Product) => void;
  onOpenQuickLook: (product: Product) => void;
  onQuickAdd: (product: Product, size: string) => void;
  onToggleWishlist: (productId: string) => void;
  wishlistIds: string[];
  products?: Product[];
  categories?: Category[];
  loading?: boolean;
  isLiveFromFirestore?: boolean;
}

const FALLBACK_DEPARTMENTS = [
  { slug: 'naiset', label: 'Women' },
  { slug: 'miehet', label: 'Men' },
  { slug: 'asusteet', label: 'Accessories' },
];

/**
 * The archive — an unframed editorial catalogue.
 * Photography, scale and air. No cards, no rules, no boxes.
 */
export const ProductListing: React.FC<ProductListingProps> = ({
  language,
  selectedCategory,
  selectedSubcategory,
  onSelectCategory,
  onSelectProduct,
  onQuickAdd,
  onToggleWishlist,
  wishlistIds,
  products,
  categories = [],
  loading = false,
}) => {
  const sourceProducts = useMemo(() => (Array.isArray(products) ? products : []), [products]);

  const [selectedSizeFilter, setSelectedSizeFilter] = useState<string | null>(null);
  const [selectedMaterialFilter, setSelectedMaterialFilter] = useState<string | null>(null);
  const [onlyInStockFilter, setOnlyInStockFilter] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'priceAsc' | 'priceDesc'>('newest');
  const [visibleCount, setVisibleCount] = useState(12);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const departmentTabs = useMemo(() => {
    const parents = (categories || [])
      .filter((c) => c && !c.parentId && c.visible)
      .map((c) => {
        const label = language === 'fi' ? c.name?.fi : language === 'sv' ? c.name?.sv || c.name?.en : c.name?.en;
        return { slug: c.slug || c.id, label: label || c.slug || c.id };
      })
      .filter((c) => Boolean(c.slug && c.label));

    return parents.length > 0 ? parents : FALLBACK_DEPARTMENTS;
  }, [categories, language]);

  const resolveDepartmentName = (slug: string) => {
    if (slug === 'all') return 'All pieces';
    return departmentTabs.find((d) => d.slug === slug)?.label || slug;
  };

  const filteredProducts = useMemo(() => {
    return sourceProducts
      .filter((product) => {
        if (product.status && product.status !== 'live') {
          if (product.status === 'scheduled' && product.publishAt) {
            const pubTime =
              typeof product.publishAt === 'number'
                ? product.publishAt
                : new Date(product.publishAt).getTime();
            if (pubTime > Date.now()) return false;
          } else {
            return false;
          }
        }

        if (selectedCategory !== 'all' && product.category !== selectedCategory) return false;

        if (
          selectedSubcategory &&
          !selectedSubcategory.startsWith('All') &&
          product.subcategory !== selectedSubcategory
        ) {
          return false;
        }

        if (selectedSizeFilter && !product.sizes.includes(selectedSizeFilter)) return false;

        if (selectedMaterialFilter) {
          const mat = (product.material[language] || product.material.fi || '').toLowerCase();
          if (!mat.includes(selectedMaterialFilter.toLowerCase())) return false;
        }

        if (onlyInStockFilter && product.stock <= 0) return false;

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'priceAsc') return a.price - b.price;
        if (sortBy === 'priceDesc') return b.price - a.price;
        return 0;
      });
  }, [
    sourceProducts,
    selectedCategory,
    selectedSubcategory,
    selectedSizeFilter,
    selectedMaterialFilter,
    onlyInStockFilter,
    sortBy,
    language,
  ]);

  const displayedProducts = useMemo(
    () => filteredProducts.slice(0, visibleCount),
    [filteredProducts, visibleCount]
  );

  const allSizes = useMemo(() => {
    const set = new Set<string>();
    sourceProducts.forEach((p) => p.sizes.forEach((s) => set.add(s)));
    return Array.from(set);
  }, [sourceProducts]);

  const allMaterials = useMemo(() => {
    const set = new Set<string>();
    sourceProducts.forEach((p) => {
      const mat = p.material[language] || p.material.fi;
      if (mat) set.add(mat);
    });
    return Array.from(set).slice(0, 8);
  }, [sourceProducts, language]);

  const activeFiltersCount =
    (selectedSizeFilter ? 1 : 0) + (selectedMaterialFilter ? 1 : 0) + (onlyInStockFilter ? 1 : 0);

  const clearAllFilters = () => {
    setSelectedSizeFilter(null);
    setSelectedMaterialFilter(null);
    setOnlyInStockFilter(false);
  };

  const cycleSort = () => {
    setSortBy((prev) => (prev === 'newest' ? 'priceAsc' : prev === 'priceAsc' ? 'priceDesc' : 'newest'));
  };

  const sortLabel =
    sortBy === 'newest' ? 'Newest' : sortBy === 'priceAsc' ? 'Price — low' : 'Price — high';

  const departmentTitle = resolveDepartmentName(selectedCategory);

  return (
    <section id="archive" className="w-full bg-paper text-ink">
      <div className="page-shell page-top">
        <div className="flex flex-wrap items-center gap-3 label text-[9px] text-ink/40">
          <button type="button" onClick={() => onSelectCategory('all')} className="hover:text-ink">
            Archive
          </button>
          <span>/</span>
          <span className="text-ink/70">{departmentTitle}</span>
          {selectedSubcategory && (
            <>
              <span>/</span>
              <span className="text-ink/70">{selectedSubcategory}</span>
            </>
          )}
        </div>

        <div className="mt-12 grid gap-10 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-8">
            <h1 className="font-display text-[clamp(64px,10vw,176px)] font-light leading-[0.8] tracking-[-0.045em]">
              {departmentTitle.split(' ').map((word, i, arr) => (
                <React.Fragment key={`${word}-${i}`}>
                  {i === arr.length - 1 && arr.length > 1 ? <em className="italic">{word}</em> : word}
                  {i < arr.length - 1 ? ' ' : ''}
                </React.Fragment>
              ))}
            </h1>
          </div>
          <div className="flex flex-col gap-5 lg:col-span-4 lg:items-end lg:pb-2 lg:text-right">
            <p className="body-copy max-w-[32ch] text-ink/55 lg:ml-auto">
              Numbered pieces cut in the Helsinki studio. Made in small runs, kept for years.
            </p>
            <span className="label text-[9px] text-ink/40">
              {filteredProducts.length} pieces · N° 026
            </span>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between md:mt-20">
          <div className="no-scrollbar flex items-center gap-7 overflow-x-auto">
            <button
              type="button"
              onClick={() => onSelectCategory('all')}
              className="label whitespace-nowrap text-[10px] transition-opacity"
              style={{ opacity: selectedCategory === 'all' ? 1 : 0.35 }}
            >
              All
            </button>
            {departmentTabs.map((d) => (
              <button
                key={d.slug}
                type="button"
                onClick={() => onSelectCategory(d.slug)}
                className="label whitespace-nowrap text-[10px] transition-opacity"
                style={{ opacity: selectedCategory === d.slug ? 1 : 0.35 }}
              >
                {d.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-7">
            <button
              type="button"
              onClick={cycleSort}
              className="label text-[9px] text-ink/50 transition-colors hover:text-ink"
            >
              Sort — {sortLabel}
            </button>
            <button
              type="button"
              onClick={() => setIsFilterOpen(true)}
              className="label text-[9px]"
            >
              Refine{activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ''}
            </button>
          </div>
        </div>
      </div>

      <div className="page-shell pb-24 pt-12 md:pb-32 md:pt-20">
        {loading ? (
          <div className="catalogue-grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <ProductCardSkeleton key={`skel-${i}`} />
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="grid grid-cols-1 gap-12 py-10 md:grid-cols-12 md:items-center">
            <div className="relative aspect-[2/3] md:col-span-5">
              <img
                src={editorialAt(3)}
                alt="ZEJESH archive study"
                className="h-full w-full object-cover object-[center_20%] grayscale"
              />
              <span className="absolute left-5 top-5 label text-[9px] text-white mix-blend-difference">
                The archive is being prepared
              </span>
            </div>
            <div className="md:col-span-6 md:col-start-7">
              <span className="label text-[9px] text-ink/45">No pieces in this selection</span>
              <h2 className="mt-5 font-display text-[clamp(48px,6vw,88px)] font-light leading-[0.88]">
                The archive
                <br />
                <em className="italic">is quiet</em>
              </h2>
              <p className="body-copy mt-6 max-w-[38ch] text-ink/55">
                New pieces are added in small numbered runs. Try another department, or return to the
                full catalogue.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-8">
                <button type="button" onClick={() => onSelectCategory('all')} className="btn">
                  All pieces <span aria-hidden="true">→</span>
                </button>
                {activeFiltersCount > 0 && (
                  <button type="button" onClick={clearAllFilters} className="btn opacity-50">
                    Clear filters
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="catalogue-grid">
            {displayedProducts.map((product, index) => (
              <ProductCard
                key={product.id}
                product={product}
                language={language}
                index={index}
                wishlisted={wishlistIds.includes(product.id)}
                onSelectProduct={onSelectProduct}
                onToggleWishlist={onToggleWishlist}
                onQuickAdd={onQuickAdd}
              />
            ))}
          </div>
        )}

        {visibleCount < filteredProducts.length && (
          <div className="mt-20 flex flex-col items-start gap-3">
            <button
              type="button"
              onClick={() => setVisibleCount((prev) => prev + 8)}
              className="btn"
            >
              Load more <span aria-hidden="true">↓</span>
            </button>
            <span className="label text-[9px] text-ink/30">
              {Math.min(visibleCount, filteredProducts.length)} / {filteredProducts.length}
            </span>
          </div>
        )}

        <div className="mt-24 flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
          <p className="max-w-md label text-[9px] leading-relaxed text-ink/30">
            Each piece is numbered and produced in a small run. Garments are made to be kept,
            repaired and worn for years.
          </p>
          <span className="label text-[9px] text-ink/35">Archive 026 — Helsinki</span>
        </div>
      </div>

      {isFilterOpen && (
        <div className="fixed inset-0 z-[80] overflow-y-auto bg-paper text-ink">
          <div className="page-shell min-h-screen py-8 md:py-12">
            <div className="flex items-center justify-between">
              <span className="label text-[9px] text-ink/40">Archive 026</span>
              <button
                type="button"
                onClick={() => setIsFilterOpen(false)}
                className="flex min-h-[44px] items-center gap-3 label text-[10px]"
              >
                Close <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-16 grid gap-16 lg:grid-cols-12 lg:gap-10">
              <div className="lg:col-span-5">
                <h2 className="font-display text-[clamp(64px,9vw,150px)] font-light leading-[0.82] tracking-[-0.045em]">
                  Refine
                  <br />
                  <em className="italic">the edit</em>
                </h2>
                <p className="mt-8 max-w-[30ch] body-copy text-ink/50">
                  Narrow the archive by silhouette, fabric and availability. Every piece is produced
                  in a numbered run.
                </p>
              </div>

              <div className="lg:col-span-6 lg:col-start-7">
                <div>
                  <span className="label text-[9px] text-ink/40">Size</span>
                  <div className="mt-4 flex flex-wrap gap-1">
                    {allSizes.map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => setSelectedSizeFilter(selectedSizeFilter === sz ? null : sz)}
                        className="size-option"
                        data-selected={selectedSizeFilter === sz}
                      >
                        {sz}
                      </button>
                    ))}
                    {allSizes.length === 0 && (
                      <span className="label text-[9px] text-ink/35">No sizes yet</span>
                    )}
                  </div>
                </div>

                {allMaterials.length > 0 && (
                  <div className="mt-12">
                    <span className="label text-[9px] text-ink/40">Material</span>
                    <div className="mt-3 flex flex-wrap gap-x-8 gap-y-3">
                      {allMaterials.map((mat) => {
                        const active = selectedMaterialFilter === mat;
                        return (
                          <button
                            key={mat}
                            type="button"
                            onClick={() => setSelectedMaterialFilter(active ? null : mat)}
                            className="label text-[10px] transition-opacity"
                            style={{ opacity: active ? 1 : 0.4 }}
                          >
                            {mat}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="mt-12 flex items-center justify-between gap-6">
                  <span className="label text-[9px] text-ink/40">Availability</span>
                  <button
                    type="button"
                    onClick={() => setOnlyInStockFilter(!onlyInStockFilter)}
                    className="label text-[10px] transition-opacity"
                    style={{ opacity: onlyInStockFilter ? 1 : 0.4 }}
                  >
                    In stock only
                  </button>
                </div>

                <div className="mt-12">
                  <span className="label text-[9px] text-ink/40">Order</span>
                  <div className="mt-3 flex flex-wrap gap-x-8 gap-y-3">
                    {[
                      { key: 'newest', label: 'Newest' },
                      { key: 'priceAsc', label: 'Price — low' },
                      { key: 'priceDesc', label: 'Price — high' },
                    ].map((s) => (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => setSortBy(s.key as typeof sortBy)}
                        className="label text-[10px] transition-opacity"
                        style={{ opacity: sortBy === s.key ? 1 : 0.4 }}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-16 flex flex-wrap items-center gap-8">
                  <button
                    type="button"
                    onClick={() => setIsFilterOpen(false)}
                    className="font-display text-[clamp(30px,4vw,52px)] leading-none"
                  >
                    View {filteredProducts.length} pieces <span aria-hidden="true">→</span>
                  </button>
                  {activeFiltersCount > 0 && (
                    <button
                      type="button"
                      onClick={clearAllFilters}
                      className="label text-[9px] text-ink/40 hover:text-ink"
                    >
                      Clear all
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
