import React, { useState } from 'react';
import { Discount } from '../../types';
import { useAuth } from '../../supabase/AuthContext';
import { supabase } from '../../supabase/config';
import { logAuditEvent } from '../../supabase/dbService';
import { Plus, Percent, Check, Trash2, X } from 'lucide-react';

interface AdminDiscountsViewProps {
  discounts: Discount[];
  onRefresh: () => void;
}

export const AdminDiscountsView: React.FC<AdminDiscountsViewProps> = ({ discounts, onRefresh }) => {
  const { isEditor, adminProfile } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Discount>>({
    code: '',
    type: 'percent',
    value: 15,
    minSpend: 150,
    usageLimit: 50,
    used: 0,
    active: true,
  });

  const handleToggleActive = async (discount: Discount) => {
    if (!isEditor) return;
    try {
      const { error } = await supabase
        .from('discounts')
        .update({
          active: !discount.active,
        })
        .eq('id', discount.id);
      if (error) throw error;
      await logAuditEvent(adminProfile?.name || 'admin', 'toggle_discount', discount.code, {
        active: !discount.active,
      });
      onRefresh();
    } catch (err) {
      console.warn('Discount toggle error:', err);
    }
  };

  const handleCreateDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code?.trim() || !isEditor) return;
    try {
      const codeUpper = formData.code.trim().toUpperCase();
      const id = `disc-${Date.now()}`;
      const newDiscount: Discount = {
        id,
        code: codeUpper,
        type: formData.type || 'percent',
        value: Number(formData.value) || 10,
        minSpend: Number(formData.minSpend) || 0,
        usageLimit: Number(formData.usageLimit) || 100,
        used: 0,
        active: true,
        startAt: new Date().toISOString(),
      };

      const { error } = await supabase.from('discounts').upsert({ ...newDiscount, id });
      if (error) throw error;
      await logAuditEvent(adminProfile?.name || 'admin', 'create_discount', codeUpper, {
        value: newDiscount.value,
        type: newDiscount.type,
      });

      setIsModalOpen(false);
      setFormData({
        code: '',
        type: 'percent',
        value: 15,
        minSpend: 150,
        usageLimit: 50,
        used: 0,
        active: true,
      });
      onRefresh();
    } catch (err) {
      console.warn('Discount creation error:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-paper-a18 pb-4">
        <div>
          <h1 className="font-display text-[38px] font-light leading-[1.05] tracking-[-0.01em] text-paper">Discount Codes & Privileges</h1>
          <p className="text-[13px] font-light text-paper-a45 mt-1 max-w-2xl leading-relaxed">
            Architectural coupons, private VIP campaign codes, and redemption telemetry.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="btn btn-secondary !min-h-[40px] !px-5 self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={1.4} />
          <span>New Discount Code</span>
        </button>
      </div>

      {/* Table */}
      <div className="border border-paper-a18 overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="micro-sm text-paper-a45 border-b border-paper-a18 select-none">
              <th className="px-4 py-3 font-normal">Coupon Code</th>
              <th className="px-4 py-3 font-normal">Discount Type</th>
              <th className="px-4 py-3 font-normal">Value</th>
              <th className="px-4 py-3 font-normal">Minimum Spend</th>
              <th className="px-4 py-3 font-normal">Redemptions</th>
              <th className="px-4 py-3 font-normal">Active State</th>
              <th className="px-4 py-3 font-normal text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {discounts.map((disc) => (
              <tr key={disc.id} className="group border-b border-paper-a18 last:border-b-0 transition-colors hover:bg-paper hover:text-ink">
                <td className="px-4 py-4 font-mono text-[12px] tracking-[0.12em]">{disc.code}</td>
                <td className="px-4 py-4 capitalize text-paper-a72 group-hover:text-ink-a64">{disc.type}</td>
                <td className="px-4 py-4 font-mono">
                  {disc.type === 'percent' ? `${disc.value} %` : `${disc.value} €`}
                </td>
                <td className="px-4 py-4 font-mono text-paper-a72 group-hover:text-ink-a64">{disc.minSpend ? `${disc.minSpend} €` : 'No minimum'}</td>
                <td className="px-4 py-4 font-mono">
                  <span>{disc.used}</span> <span className="text-paper-a45 group-hover:text-ink-a40">/ {disc.usageLimit || '∞'}</span>
                </td>
                <td className="px-4 py-4">
                  {disc.active ? (
                    <span className="micro-sm px-2 py-1 bg-paper text-ink group-hover:bg-ink group-hover:text-paper">● Active</span>
                  ) : (
                    <span className="micro-sm text-paper-a45 group-hover:text-ink-a40">○ Disabled</span>
                  )}
                </td>
                <td className="px-4 py-4 text-right">
                  <button
                    onClick={() => handleToggleActive(disc)}
                    className="btn-text justify-end"
                  >
                    {disc.active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {discounts.length === 0 && (
          <div className="p-14 text-center micro-sm text-paper-a45">
            No active discount codes created yet.
          </div>
        )}
      </div>

      {/* Modal: Create Discount */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div onClick={() => setIsModalOpen(false)} className="fixed inset-0 bg-ink/80" />
          <div className="relative w-full max-w-md bg-ink border border-paper-a18 p-6 z-10 text-[13px]">
            <div className="flex justify-between items-center mb-6 pb-3 border-b border-paper-a18">
              <h3 className="font-display text-[24px] font-light text-paper">Create discount code</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1 text-paper-a45 hover:text-paper transition-colors">
                <X className="w-4 h-4" strokeWidth={1.4} />
              </button>
            </div>

            <form onSubmit={handleCreateDiscount} className="space-y-6">
              <div>
                <label className="field-label">Coupon Code</label>
                <input
                  type="text"
                  required
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. VIPARCHIVE15"
                  className="field font-mono tracking-[0.14em]"
                />
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="field-label">Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                    className="field"
                  >
                    <option value="percent">Percentage (%)</option>
                    <option value="fixed">Fixed Amount (€)</option>
                    <option value="freeShipping">Free Shipping</option>
                  </select>
                </div>

                <div>
                  <label className="field-label">Value</label>
                  <input
                    type="number"
                    value={formData.value}
                    onChange={(e) => setFormData({ ...formData, value: parseFloat(e.target.value) || 0 })}
                    className="field font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="field-label">Min Spend (€)</label>
                  <input
                    type="number"
                    value={formData.minSpend}
                    onChange={(e) => setFormData({ ...formData, minSpend: parseFloat(e.target.value) || 0 })}
                    className="field font-mono"
                  />
                </div>

                <div>
                  <label className="field-label">Usage Limit</label>
                  <input
                    type="number"
                    value={formData.usageLimit}
                    onChange={(e) => setFormData({ ...formData, usageLimit: parseInt(e.target.value) || 0 })}
                    className="field font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end items-center gap-5 mt-2 pt-4 border-t border-paper-a18">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn-text"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary !min-h-[42px] !px-6"
                >
                  Save Code
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
