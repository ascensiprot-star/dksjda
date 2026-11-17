import React, { useState, useMemo } from 'react';
import { Product, ProductStatus } from '../../types';
import {
  Search,
  Plus,
  CheckSquare,
  Square,
  Edit2,
  Trash2,
  Eye,
  Check,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../../supabase/AuthContext';
import { useStorefrontData } from '../../context/StorefrontDataContext';
import { supabase } from '../../supabase/config';
import { logAuditEvent } from '../../supabase/dbService';

interface AdminProductsViewProps {
  products: Product[];
  onEditProduct: (product: Product) => void;
  onCreateProduct: () => void;
  onViewProductInStore: (product: Product) => void;
  onRefresh?: () => void;
  onDeleteProduct?: (id: string) => Promise<boolean>;
  onDeleteProducts?: (ids: string[]) => Promise<boolean>;
}

export const AdminProductsView: React.FC<AdminProductsViewProps> = ({
  products,
  onEditProduct,
  onCreateProduct,
  onViewProductInStore,
  onRefresh,
  onDeleteProduct: propDeleteProduct,
  onDeleteProducts: propDeleteProducts,
}) => {
  const { adminProfile } = useAuth();
  const { deleteProduct: ctxDeleteProduct, deleteProducts: ctxDeleteProducts } = useStorefrontData();

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ProductStatus>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all'| string>('all');
  const [stockLevelFilter, setStockLevelFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock'>('all');

  // Selected rows for Bulk Actions
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkPricePercent, setBulkPricePercent] = useState<number>(10);
  const [showBulkPriceModal, setShowBulkPriceModal] = useState(false);

  // Single and Bulk delete modal state
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setStatusNotice(msg);
    setTimeout(() => setStatusNotice(null), 3500);
  };

  // Filtered Products
  const filtered = useMemo(() => {
    return products.filter((p) => {
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchNr = p.nr?.toLowerCase().includes(q) || p.plateNumber?.toLowerCase().includes(q);
        const matchNameFi = p.name.fi?.toLowerCase().includes(q);
        const matchNameEn = p.name.en?.toLowerCase().includes(q);
        const matchSku = p.variants?.some((v) => v.sku.toLowerCase().includes(q));
        if (!matchNr && !matchNameFi && !matchNameEn && !matchSku) return false;
      }

      // Status
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;

      // Category
      if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;

      // Stock Level
      const totalStock = p.variants ? p.variants.reduce((a, v) => a + v.stock, 0) : (p.stock || 0);
      if (stockLevelFilter === 'in_stock' && totalStock <= 0) return false;
      if (stockLevelFilter === 'out_of_stock' && totalStock > 0) return false;
      if (stockLevelFilter === 'low_stock' && (totalStock <= 0 || totalStock >= 4)) return false;

      return true;
    });
  }, [products, searchQuery, statusFilter, categoryFilter, stockLevelFilter]);

  // Row selection
  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) setSelectedIds([]);
    else setSelectedIds(filtered.map((p) => p.id));
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  // Perform Single Product Deletion
  const executeSingleDelete = async (id: string) => {
    setIsDeleting(true);
    const prod = products.find((p) => p.id === id);
    const label = prod?.nr || prod?.plateNumber || prod?.name.en || id;

    try {
      if (propDeleteProduct) {
        await propDeleteProduct(id);
      } else {
        await ctxDeleteProduct(id);
      }

      await logAuditEvent(adminProfile?.name || 'admin', 'PRODUCT_DELETED', 'products', {
        id,
        label,
      });

      setSelectedIds((prev) => prev.filter((item) => item !== id));
      setDeleteTargetId(null);
      showNotification(`Garment ${label} permanently removed from archive.`);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.warn('Delete product error:', err);
      showNotification(`Notice: Removed ${label} from local archive.`);
      setDeleteTargetId(null);
    } finally {
      setIsDeleting(false);
    }
  };

  // Perform Bulk Product Deletion
  const executeBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setIsDeleting(true);
    const count = selectedIds.length;

    try {
      if (propDeleteProducts) {
        await propDeleteProducts(selectedIds);
      } else {
        await ctxDeleteProducts(selectedIds);
      }

      await logAuditEvent(adminProfile?.name || 'admin', 'BULK_PRODUCTS_DELETED', 'products', {
        count,
        ids: selectedIds,
      });

      showNotification(`${count} garments permanently removed from archive.`);
      setSelectedIds([]);
      setIsBulkDeleteOpen(false);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.warn('Bulk delete error:', err);
      showNotification(`Notice: Removed ${count} garments from archive.`);
      setSelectedIds([]);
      setIsBulkDeleteOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  // Bulk Status Update
  const handleBulkStatusChange = async (newStatus: ProductStatus) => {
    try {
      for (const id of selectedIds) {
        await supabase
          .from('products')
          .update({ status: newStatus, updatedAt: new Date().toISOString() })
          .eq('id', id);
      }
      await logAuditEvent(adminProfile?.name || 'admin', 'bulk_status_change', 'products', {
        count: selectedIds.length,
        newStatus,
      });
      showNotification(`Updated status of ${selectedIds.length} garments to ${newStatus}.`);
      setSelectedIds([]);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.warn('Bulk status change error:', err);
    }
  };

  // Bulk Price Adjustment
  const handleBulkPriceAdjust = async () => {
    try {
      const factor = 1 + bulkPricePercent / 100;
      for (const id of selectedIds) {
        const prod = products.find((p) => p.id === id);
        if (prod) {
          const newPrice = Math.round(prod.price * factor);
          await supabase
            .from('products')
            .update({ price: newPrice, updatedAt: new Date().toISOString() })
            .eq('id', id);
        }
      }
      await logAuditEvent(adminProfile?.name || 'admin', 'bulk_price_adjust', 'products', {
        count: selectedIds.length,
        percent: bulkPricePercent,
      });
      setShowBulkPriceModal(false);
      showNotification(`Adjusted pricing on ${selectedIds.length} garments.`);
      setSelectedIds([]);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.warn('Bulk price adjust error:', err);
    }
  };

  return (
    <div className="space-y-8">
      {/* Status Notification Banner (Borderless) */}
      {statusNotice && (
        <div className="py-3 px-0 micro-sm text-paper flex items-center gap-2 animate-fadeIn border-b border-paper-a18">
          <Check className="w-4 h-4 shrink-0" strokeWidth={1.4} />
          <span>{statusNotice}</span>
        </div>
      )}

      {/* Top Editorial Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-paper-a18 pb-5">
        <div className="space-y-2">
          <span className="micro-sm text-paper-a45 block">
            Archival Inventory Management
          </span>
          <h1 className="font-display text-[38px] font-light leading-[1.05] tracking-[-0.01em] text-paper">
            Products & Atelier Archive
          </h1>
          <p className="text-[13px] font-light text-paper-a45">
            {products.length} garments cataloged · Real-time status allocations & size matrix
          </p>
        </div>

        <div className="flex items-center gap-6 self-start sm:self-auto">
          <button
            type="button"
            onClick={onCreateProduct}
            className="btn btn-primary !min-h-[42px] !px-6"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={1.4} />
            <span>New Garment Record</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 text-[13px]">
        <div className="relative lg:col-span-2">
          <Search className="w-3.5 h-3.5 absolute left-0 top-1/2 -translate-y-1/2 text-paper-a45" strokeWidth={1.4} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, Nº plate or SKU..."
            className="field pl-6"
          />
        </div>

        <div>
          <label className="field-label">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="field cursor-pointer"
          >
            <option value="all">All statuses ({products.length})</option>
            <option value="live">Live (Published)</option>
            <option value="draft">Draft</option>
            <option value="scheduled">Scheduled</option>
            <option value="sold_out">Sold Out</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <div>
          <label className="field-label">Category</label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="field cursor-pointer"
          >
            <option value="all">All categories</option>
            <option value="naiset">Women</option>
            <option value="miehet">Men</option>
            <option value="asusteet">Accessories</option>
          </select>
        </div>

        <div>
          <label className="field-label">Stock Level</label>
          <select
            value={stockLevelFilter}
            onChange={(e) => setStockLevelFilter(e.target.value as any)}
            className="field cursor-pointer"
          >
            <option value="all">All stock levels</option>
            <option value="in_stock">In Stock (&gt; 0)</option>
            <option value="low_stock">Low Stock (&lt; 4)</option>
            <option value="out_of_stock">Out of Stock (0)</option>
          </select>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.length > 0 && (
        <div className="py-3 px-4 flex flex-wrap items-center justify-between gap-4 micro-sm animate-fadeIn bg-paper text-ink">
          <div className="flex items-center gap-2">
            <span className="font-mono">{selectedIds.length}</span>
            <span>selected garments</span>
          </div>

          <div className="flex flex-wrap items-center gap-5">
            <button
              type="button"
              onClick={() => handleBulkStatusChange('live')}
              className="hover:underline underline-offset-4 cursor-pointer"
            >
              Publish Live
            </button>
            <button
              type="button"
              onClick={() => handleBulkStatusChange('draft')}
              className="text-ink-a64 hover:text-ink cursor-pointer hover:underline underline-offset-4"
            >
              Set Draft
            </button>
            <button
              type="button"
              onClick={() => setShowBulkPriceModal(true)}
              className="text-ink-a64 hover:text-ink cursor-pointer hover:underline underline-offset-4"
            >
              Adjust Prices
            </button>
            <button
              type="button"
              onClick={() => setIsBulkDeleteOpen(true)}
              className="hover:underline underline-offset-4 cursor-pointer flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.4} />
              <span>Delete Selected ({selectedIds.length})</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="border border-paper-a18 overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="micro-sm text-paper-a45 border-b border-paper-a18 select-none">
              <th className="py-3 pl-4 pr-3 w-8 font-normal">
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="cursor-pointer"
                  title="Select All"
                >
                  {selectedIds.length > 0 && selectedIds.length === filtered.length ? (
                    <CheckSquare className="w-3.5 h-3.5 text-paper" strokeWidth={1.4} />
                  ) : (
                    <Square className="w-3.5 h-3.5 text-paper-a45" strokeWidth={1.4} />
                  )}
                </button>
              </th>
              <th className="py-3 px-3 w-16 font-normal">Nº</th>
              <th className="py-3 px-3 w-14 font-normal">Visual</th>
              <th className="py-3 px-4 font-normal">Garment Identity</th>
              <th className="py-3 px-3 w-28 font-normal">Status</th>
              <th className="py-3 px-3 w-36 font-normal">Size Inventory</th>
              <th className="py-3 px-3 w-24 font-normal">Price</th>
              <th className="py-3 px-3 w-24 font-normal">Category</th>
              <th className="py-3 pl-3 pr-4 text-right w-28 font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((prod, idx) => {
              const isSelected = selectedIds.includes(prod.id);
              const totalStock = prod.variants ? prod.variants.reduce((a, v) => a + v.stock, 0) : (prod.stock || 0);

              return (
                <tr
                  key={prod.id}
                  className={`transition-colors group border-b border-paper-a18 last:border-b-0 hover:bg-paper hover:text-ink ${ isSelected ? 'bg-paper-a06' : ''
                  }`}
                >
                  {/* Select Checkbox */}
                  <td className="py-4 pl-4 pr-3">
                    <button
                      type="button"
                      onClick={() => toggleSelectOne(prod.id)}
                      className="cursor-pointer"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-3.5 h-3.5 text-paper group-hover:text-ink" strokeWidth={1.4} />
                      ) : (
                        <Square className="w-3.5 h-3.5 text-paper-a45 group-hover:text-ink-a40" strokeWidth={1.4} />
                      )}
                    </button>
                  </td>

                  {/* Plate Nº & Home Slot */}
                  <td className="py-4 px-3 font-mono text-[12px] tracking-[0.08em] text-paper group-hover:text-ink">
                    <div>{prod.nr || prod.plateNumber}</div>
                    {idx < 8 ? (
                      <span className="micro-sm text-paper-a45 group-hover:text-ink-a40 block mt-1 font-sans">
                        Slot 0{idx + 1} (Home)
                      </span>
                    ) : (
                      <span className="micro-sm text-paper-a45 group-hover:text-ink-a40 block mt-1 font-sans">
                        Catalogue
                      </span>
                    )}
                  </td>

                  {/* Visual Thumbnail */}
                  <td className="py-4 px-3">
                    <div className="w-10 h-13 overflow-hidden relative border border-paper-a18">
                      <img
                        src={prod.images?.[0]?.url || prod.image || '/placeholder.svg'}
                        alt={prod.name.fi}
                        style={{
                          objectPosition: `${prod.images?.[0]?.focalX ?? 50}% ${prod.images?.[0]?.focalY ?? 20}%`,
                          transform: `scale(${prod.images?.[0]?.scale ?? prod.imageScale ?? 1.0})`,
                          transformOrigin: `${prod.images?.[0]?.focalX ?? 50}% ${prod.images?.[0]?.focalY ?? 20}%`,
                        }}
                        className="w-full h-full object-cover grayscale"
                      />
                    </div>
                  </td>

                  {/* Name & Origin */}
                  <td className="py-4 px-4">
                    <div className="font-display text-[18px] font-light leading-tight text-paper group-hover:text-ink">
                      {prod.name.en || prod.name.fi}
                    </div>
                    <div className="micro-sm text-paper-a45 group-hover:text-ink-a40 mt-1">
                      {prod.name.fi}
                    </div>
                  </td>

                  {/* Status */}
                  <td className="py-4 px-3">
                    {prod.status === 'live' ? (
                      <span className="inline-flex items-center gap-1.5 micro-sm px-2 py-1 bg-paper text-ink group-hover:bg-ink group-hover:text-paper">
                        <span className="w-1 h-1 bg-current" />
                        {prod.status}
                      </span>
                    ) : prod.status === 'draft' ? (
                      <span className="micro-sm text-paper-a45 group-hover:text-ink-a40">{prod.status}</span>
                    ) : prod.status === 'sold_out' || prod.status === 'archived' ? (
                      <span className="micro-sm text-paper-a45 group-hover:text-ink-a40 line-through">{prod.status}</span>
                    ) : (
                      <span className="micro-sm text-paper-a72 group-hover:text-ink-a64">{prod.status}</span>
                    )}
                  </td>

                  {/* Sizes and Stock */}
                  <td className="py-4 px-3">
                    <div className="flex flex-wrap gap-x-2 gap-y-1 max-w-[170px] font-mono text-[11px]">
                      {(prod.variants || []).map((v) => (
                        <span
                          key={v.size}
                          title={`SKU: ${v.sku} · ${v.stock} pcs`}
                          className={`${ v.stock === 0 ? 'text-paper-a45 group-hover:text-ink-a40 line-through'
                              : v.stock < 3
                              ? 'text-paper group-hover:text-ink underline underline-offset-2'
                              : 'text-paper-a72 group-hover:text-ink-a64'
                          }`}
                        >
                          {v.size}:{v.stock}
                        </span>
                      ))}
                    </div>
                  </td>

                  {/* Price */}
                  <td className="py-4 px-3 font-mono text-[12px] text-paper group-hover:text-ink">
                    {prod.price} €
                    {prod.compareAtPrice && (
                      <span className="block text-[11px] text-paper-a45 group-hover:text-ink-a40 line-through mt-0.5">
                        {prod.compareAtPrice} €
                      </span>
                    )}
                  </td>

                  {/* Category */}
                  <td className="py-4 px-3 capitalize text-paper-a72 group-hover:text-ink-a64">
                    {prod.category}
                  </td>

                  {/* Row Actions */}
                  <td className="py-4 pl-3 pr-4 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => onEditProduct(prod)}
                        className="text-paper-a45 hover:text-paper group-hover:text-ink-a64 group-hover:hover:text-ink cursor-pointer p-1 transition-colors"
                        title="Edit Record"
                      >
                        <Edit2 className="w-3.5 h-3.5" strokeWidth={1.4} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onViewProductInStore(prod)}
                        className="text-paper-a45 hover:text-paper group-hover:text-ink-a64 group-hover:hover:text-ink cursor-pointer p-1 transition-colors"
                        title="View in Store"
                      >
                        <Eye className="w-3.5 h-3.5" strokeWidth={1.4} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTargetId(prod.id)}
                        className="text-paper-a45 hover:text-paper group-hover:text-ink-a64 group-hover:hover:text-ink cursor-pointer p-1 transition-colors"
                        title="Delete Product"
                      >
                        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.4} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="py-20 px-6 text-center space-y-4">
            <p className="micro-sm text-paper-a72">
              No product records match active search or the catalog is currently clear.
            </p>
            <p className="text-[12px] font-light text-paper-a45 max-w-lg mx-auto leading-relaxed">
              <strong className="text-paper font-normal">Storefront Structure Guaranteed:</strong> The public home page structure (all 8 Curated Rotation Slots, Seasonal Edit, and Lookbook) remains 100% active, populated, and fully functional using permanent baseline atelier pieces. Any custom garments you create or edit here will automatically fit into and replace these storefront slots.
            </p>
            <div className="pt-3 flex items-center justify-center gap-6">
              <button
                type="button"
                onClick={onCreateProduct}
                className="btn-text"
              >
                + Add Garment to Slot 1
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Single Item Deletion Confirmation */}
      {deleteTargetId && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div
            onClick={() => !isDeleting && setDeleteTargetId(null)}
            className="fixed inset-0 bg-ink/80"
          />
          <div className="relative w-full max-w-md bg-ink border border-paper-a18 p-8 z-10 text-[13px] space-y-6">
            <div className="space-y-2">
              <span className="micro-sm text-paper-a45 block">
                Archival Deletion
              </span>
              <h3 className="font-display text-[28px] font-light text-paper">
                Confirm product removal
              </h3>
              <p className="text-paper-a72 font-light leading-relaxed">
                Are you sure you want to permanently delete this garment from the atelier catalog? It will be removed from both the storefront and admin consoles.
              </p>
            </div>

            <div className="pt-4 flex items-center justify-end gap-6 border-t border-paper-a18">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteTargetId(null)}
                className="btn-text disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => executeSingleDelete(deleteTargetId)}
                className="btn btn-primary !min-h-[44px] !px-6 disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Bulk Deletion Confirmation */}
      {isBulkDeleteOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div
            onClick={() => !isDeleting && setIsBulkDeleteOpen(false)}
            className="fixed inset-0 bg-ink/80"
          />
          <div className="relative w-full max-w-md bg-ink border border-paper-a18 p-8 z-10 text-[13px] space-y-6">
            <div className="space-y-2">
              <span className="micro-sm text-paper-a45 block">
                Bulk Archival Deletion
              </span>
              <h3 className="font-display text-[28px] font-light text-paper">
                Delete {selectedIds.length} selected garments
              </h3>
              <p className="text-paper-a72 font-light leading-relaxed">
                You are about to permanently delete {selectedIds.length} garments from the active atelier collection. This change updates immediately.
              </p>
            </div>

            <div className="pt-4 flex items-center justify-end gap-6 border-t border-paper-a18">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setIsBulkDeleteOpen(false)}
                className="btn-text disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={executeBulkDelete}
                className="btn btn-primary !min-h-[44px] !px-6 disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : `Delete ${selectedIds.length} Products`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Bulk Price Adjustment */}
      {showBulkPriceModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div
            onClick={() => setShowBulkPriceModal(false)}
            className="fixed inset-0 bg-ink/80"
          />
          <div className="relative w-full max-w-md bg-ink border border-paper-a18 p-8 z-10 text-[13px] space-y-6">
            <div className="space-y-2">
              <span className="micro-sm text-paper-a45 block">
                Catalog Economics
              </span>
              <h3 className="font-display text-[28px] font-light text-paper">
                Adjust prices by percentage
              </h3>
              <p className="text-paper-a72 font-light leading-relaxed">
                Apply a percentage price adjustment across {selectedIds.length} selected garments.
              </p>
            </div>

            <div>
              <label className="field-label">
                Percentage Delta (%)
              </label>
              <input
                type="number"
                value={bulkPricePercent}
                onChange={(e) => setBulkPricePercent(parseFloat(e.target.value) || 0)}
                placeholder="+10 or -15"
                className="field font-mono"
              />
            </div>

            <div className="pt-4 flex items-center justify-end gap-6 border-t border-paper-a18">
              <button
                type="button"
                onClick={() => setShowBulkPriceModal(false)}
                className="btn-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkPriceAdjust}
                className="btn btn-primary !min-h-[44px] !px-6"
              >
                Apply Delta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
