import React, { useState } from 'react';
import { Product } from '../../types';
import { Download, AlertCircle, Check, Search, ArrowUp, ArrowDown } from 'lucide-react';
import { useAuth } from '../../supabase/AuthContext';
import { bosFetch } from '../../bos/client';

interface AdminInventoryViewProps {
  products: Product[];
  onRefresh: () => void;
}

export const AdminInventoryView: React.FC<AdminInventoryViewProps> = ({ products, onRefresh }) => {
  const { isEditor, adminProfile } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');
  const [updatingSku, setUpdatingSku] = useState<string | null>(null);
  const [stockError, setStockError] = useState<string | null>(null);
  const [stockNotice, setStockNotice] = useState<string | null>(null);

  // Flatten variants with parent product info
  const allVariants = products.flatMap((p) =>
    (p.variants || []).map((v) => ({
      productId: p.id,
      productNr: p.nr || p.plateNumber,
      productName: p.name.en || p.name.fi,
      category: p.category,
      price: p.price,
      size: v.size,
      sku: v.sku,
      stock: v.stock,
      variantsList: p.variants || [],
    }))
  );

  const filteredVariants = allVariants.filter((item) => {
    if (stockFilter === 'low' && (item.stock <= 0 || item.stock >= 4)) return false;
    if (stockFilter === 'out' && item.stock > 0) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        item.productNr.toLowerCase().includes(q) ||
        item.productName.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleAdjustStock = async (
    productId: string,
    sku: string,
    delta: number,
    currentStock: number,
    variantsList: any[]
  ) => {
    if (!isEditor) return;
    setUpdatingSku(sku);
    setStockError(null);
    setStockNotice(null);

    try {
      const result = await bosFetch<{ onHand: number; replayed: boolean }>(
        'inventory',
        'adjust',
        {
          productId,
          sku,
          delta,
          reason: 'manual_quick_adjustment',
          locationId: 'main',
          idempotencyKey: `inventory-adjust:${sku}:${delta}:${crypto.randomUUID()}`,
        }
      );
      setStockNotice(
        `${sku}: ${delta > 0 ? '+' : ''}${delta} units recorded. New on-hand: ${result.onHand}.`
      );
      onRefresh();
    } catch (err) {
      setStockError(
        err instanceof Error
          ? err.message
          : 'The stock adjustment failed. No ledger movement was recorded.'
      );
    } finally {
      setUpdatingSku(null);
    }
  };

  const handleExportCSV = () => {
    const headers = ['Nº', 'Product Name', 'Category', 'Size', 'SKU', 'Stock', 'Price (EUR)'];
    const rows = filteredVariants.map((v) => [
      v.productNr,
      `"${v.productName}"`,
      v.category,
      v.size,
      v.sku,
      v.stock,
      v.price,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `zejesh_inventory_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalStockCount = allVariants.reduce((a, b) => a + b.stock, 0);
  const lowStockCount = allVariants.filter((v) => v.stock > 0 && v.stock < 4).length;
  const outOfStockCount = allVariants.filter((v) => v.stock === 0).length;

  return (
    <div className="space-y-6">
      {/* Title Bar */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-paper-a18 pb-4">
        <div>
          <h1 className="font-display text-[38px] font-light leading-[1.05] tracking-[-0.01em] text-paper">Real-Time Inventory</h1>
          <p className="text-[13px] font-light text-paper-a45 mt-1 max-w-2xl leading-relaxed">
            Size-level SKU tracking, atomic inventory audit logs, and low-stock replenishment thresholds.
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          className="btn btn-secondary !min-h-[40px] !px-5 self-start sm:self-auto"
        >
          <Download className="w-3.5 h-3.5" strokeWidth={1.4} />
          <span>Export Inventory CSV</span>
        </button>
      </div>

      {(stockError || stockNotice) && (
        <div
          role={stockError ? 'alert' : 'status'}
          className={`border px-4 py-3 text-[12px] font-light ${
            stockError ? 'border-red-400/40 text-red-300' : 'border-paper-a18 text-paper-a45'
          }`}
        >
          {stockError || stockNotice}
        </div>
      )}

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-paper-a18 border border-paper-a18 text-[13px]">
        <div className="bg-ink p-5">
          <span className="micro-sm text-paper-a45 block mb-2">Total Garments in Stock</span>
          <span className="font-display text-[32px] font-light text-paper leading-none">{totalStockCount} <span className="font-mono text-[12px] text-paper-a45">units</span></span>
        </div>
        <div className="bg-ink p-5">
          <span className="micro-sm text-paper-a45 block mb-2">Low Stock SKUs (&lt; 4 units)</span>
          <span className="font-display text-[32px] font-light text-paper leading-none underline underline-offset-4 decoration-1">{lowStockCount} <span className="font-mono text-[12px] text-paper-a45">SKUs</span></span>
        </div>
        <div className="bg-ink p-5">
          <span className="micro-sm text-paper-a45 block mb-2">Depleted SKUs (0 units)</span>
          <span className="font-display text-[32px] font-light text-paper-a45 leading-none line-through">{outOfStockCount} <span className="font-mono text-[12px]">SKUs</span></span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 border-b border-paper-a18 pb-3 text-[13px]">
        <div className="relative sm:col-span-2">
          <Search className="w-3.5 h-3.5 absolute left-0 top-1/2 -translate-y-1/2 text-paper-a45" strokeWidth={1.4} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search SKU, product plate Nº or garment name..."
            className="field pl-7 !border-0"
          />
        </div>

        <div>
          <select
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value as any)}
            className="field cursor-pointer !border-0"
          >
            <option value="all">All stock statuses ({allVariants.length})</option>
            <option value="low">Low Stock Alert (&lt; 4)</option>
            <option value="out">Depleted / Sold Out (0)</option>
          </select>
        </div>
      </div>

      {/* Inventory Table */}
      <div className="border border-paper-a18 overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="micro-sm text-paper-a45 border-b border-paper-a18 select-none">
              <th className="px-4 py-3 w-16 font-normal">Nº</th>
              <th className="px-4 py-3 font-normal">Product Name</th>
              <th className="px-4 py-3 w-28 font-normal">Category</th>
              <th className="px-4 py-3 w-20 font-normal">Size</th>
              <th className="px-4 py-3 font-normal">SKU</th>
              <th className="px-4 py-3 w-24 font-normal">Price</th>
              <th className="px-4 py-3 w-28 font-normal">Stock Level</th>
              <th className="px-4 py-3 w-32 text-right font-normal">Quick Edit</th>
            </tr>
          </thead>
          <tbody>
            {filteredVariants.map((item) => (
              <tr key={item.sku} className="group border-b border-paper-a18 last:border-b-0 transition-colors hover:bg-paper hover:text-ink">
                <td className="px-4 py-4 font-mono text-[12px]">{item.productNr}</td>
                <td className="px-4 py-4 font-light text-paper group-hover:text-ink">{item.productName}</td>
                <td className="px-4 py-4 capitalize text-paper-a72 group-hover:text-ink-a64">{item.category}</td>
                <td className="px-4 py-4 font-mono">{item.size}</td>
                <td className="px-4 py-4 font-mono text-[12px] text-paper-a72 group-hover:text-ink-a64">{item.sku}</td>
                <td className="px-4 py-4 font-mono">{item.price} €</td>
                <td className="px-4 py-4">
                  <span
                    className={`font-mono text-[12px] ${ item.stock === 0 ? 'text-paper-a45 group-hover:text-ink-a40 line-through' : item.stock < 4 ? 'text-paper underline underline-offset-4 decoration-1' : 'text-paper group-hover:text-ink'
                    }`}
                  >
                    {item.stock} units
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <div className="flex items-center justify-end gap-4 micro-sm">
                    <button
                      onClick={() =>
                        handleAdjustStock(item.productId, item.sku, -1, item.stock, item.variantsList)
                      }
                      disabled={updatingSku === item.sku || item.stock <= 0}
                      className="hover:opacity-60 disabled:opacity-20 underline underline-offset-4 cursor-pointer disabled:cursor-not-allowed"
                    >
                      -1
                    </button>
                    <button
                      onClick={() =>
                        handleAdjustStock(item.productId, item.sku, 1, item.stock, item.variantsList)
                      }
                      disabled={updatingSku === item.sku}
                      className="hover:opacity-60 disabled:opacity-20 underline underline-offset-4 cursor-pointer disabled:cursor-not-allowed"
                    >
                      +1
                    </button>
                    <button
                      onClick={() =>
                        handleAdjustStock(item.productId, item.sku, 5, item.stock, item.variantsList)
                      }
                      disabled={updatingSku === item.sku}
                      className="hover:opacity-60 disabled:opacity-20 underline underline-offset-4 cursor-pointer disabled:cursor-not-allowed"
                    >
                      +5
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredVariants.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-14 text-center micro-sm text-paper-a45">
                  No SKUs match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
