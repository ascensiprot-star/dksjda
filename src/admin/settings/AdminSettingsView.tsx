import React, { useState, useEffect } from 'react';
import { StoreSettings, AuditLog, SocialPlatformLink } from '../../types';
import { useAuth } from '../../supabase/AuthContext';
import { supabase } from '../../supabase/config';
import { logAuditEvent } from '../../supabase/dbService';
import { testStorageBucket } from '../../supabase/mediaService';

interface AdminSettingsViewProps {
  settings: StoreSettings;
  onRefresh: () => void;
}

export const AdminSettingsView: React.FC<AdminSettingsViewProps> = ({
  settings,
  onRefresh,
}) => {
  const { isOwner, adminProfile } = useAuth();
  const [formData, setFormData] = useState<StoreSettings>(() => {
    const existing = { ...settings };
    if (!existing.storeInfo) {
      existing.storeInfo = {
        name: 'ZEJESH',
        email: 'huxaifa0fficial@gmail.com',
        dispatchEmail: 'dispatch@zejesh.com',
        conciergeEmail: 'concierge@zejesh.com',
        address: 'Aleksanterinkatu 17, 00100 Helsinki, Finland',
        currency: 'EUR (€)',
        platforms: [],
      };
    }
    return existing;
  });

  const [ownerEmail, setOwnerEmail] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('zejesh_admin_owner_email') || 'huxaifa0fficial@gmail.com';
    }
    return 'huxaifa0fficial@gmail.com';
  });

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [storageStatus, setStorageStatus] = useState<string>('Testing...');

  useEffect(() => {
    testStorageBucket().then((ok) => {
      setStorageStatus(ok ? 'Connected' : 'Not found');
    });
  }, []);

  useEffect(() => {
    const loadAuditLogs = async () => {
      try {
        const { data: rows } = await supabase
          .from('auditLog')
          .select('*')
          .order('at', { ascending: false })
          .limit(15);
        const logs: AuditLog[] = [];
        (rows || []).forEach((row) => logs.push({ ...(row as AuditLog), id: row.id }));
        setAuditLogs(logs);
      } catch (err) {
        console.warn('Audit logs load warning:', err);
      }
    };
    loadAuditLogs();
  }, []);

  const handleSaveSettings = async () => {
    if (!isOwner) return;
    setIsSaving(true);
    setSaveSuccessMsg(null);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('zejesh_admin_owner_email', ownerEmail.trim().toLowerCase());
        sessionStorage.setItem('zejesh_admin_session_email', ownerEmail.trim().toLowerCase());
      }

      const updatedSettings = {
        ...formData,
        storeInfo: {
          ...formData.storeInfo,
          email: formData.storeInfo?.email || ownerEmail.trim().toLowerCase(),
        },
      };

      await supabase.from('settings').upsert({ ...updatedSettings, id: 'global-settings' });

      try {
        await supabase.from('admins').upsert({
          email: ownerEmail.trim().toLowerCase(),
          role: 'owner',
          name: 'Huxaifa (Owner)',
          updatedAt: new Date().toISOString(),
          id: 'admin-owner',
        });
      } catch {}

      await logAuditEvent(adminProfile?.name || 'admin', 'update_store_settings', 'settings', {
        storeName: formData.storeInfo?.name,
        ownerEmail: ownerEmail.trim().toLowerCase(),
      });

      setSaveSuccessMsg('Configuration saved.');
      setTimeout(() => setSaveSuccessMsg(null), 4000);
      onRefresh();
    } catch (err: any) {
      console.warn('Settings save error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportAllData = () => {
    const data = {
      settings: formData,
      ownerEmail,
      exportedAt: new Date().toISOString(),
    };
    const jsonStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', jsonStr);
    dlAnchor.setAttribute('download', `zejesh_backup_${Date.now()}.json`);
    dlAnchor.click();
  };

  return (
    <div className="space-y-12 max-w-4xl">
      <div className="flex items-end justify-between border-b border-paper-a18 pb-4">
        <div>
          <span className="micro-sm text-paper-a45 block mb-2">Console Configuration</span>
          <h1 className="font-display text-[38px] font-light leading-[1.05] tracking-[-0.01em] text-paper">Settings</h1>
        </div>
        {isOwner && (
          <button
            onClick={handleSaveSettings}
            disabled={isSaving}
            className="btn btn-primary !min-h-[42px] !px-6 disabled:opacity-40"
          >
            {isSaving ? 'Saving...' : 'Save →'}
          </button>
        )}
      </div>

      {saveSuccessMsg && (
        <p className="micro-sm text-paper border-b border-paper-a18 pb-3">
          {saveSuccessMsg}
        </p>
      )}

      {/* STORAGE STATUS */}
      <div className="space-y-2 border-b border-paper-a18 pb-6">
        <span className="micro-sm text-paper-a45 block">Storage</span>
        <p className="text-[13px] font-light text-paper flex items-center gap-2">
          <span className={`inline-block w-1.5 h-1.5 ${storageStatus === 'Connected' ? 'bg-paper' : 'border border-paper-a18'}`} />
          {storageStatus}
        </p>
      </div>

      {/* ADMIN & CONTACT */}
      <div className="space-y-6 border-b border-paper-a18 pb-8">
        <span className="micro-sm text-paper-a45 block">Identity & Access</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-6">
          <div className="space-y-1">
            <label className="field-label">Owner Email</label>
            <input
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              className="field"
            />
          </div>

          <div className="space-y-1">
            <label className="field-label">Store Email</label>
            <input
              type="email"
              value={formData.storeInfo?.email || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  storeInfo: { ...formData.storeInfo, email: e.target.value },
                })
              }
              className="field"
            />
          </div>
        </div>
      </div>

      {/* BRAND & COMMERCE */}
      <div className="space-y-6 border-b border-paper-a18 pb-8">
        <span className="micro-sm text-paper-a45 block">Brand & Commerce</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-6">
          <div className="space-y-1">
            <label className="field-label">Brand Name</label>
            <input
              type="text"
              value={formData.storeInfo?.name || 'ZEJESH'}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  storeInfo: { ...formData.storeInfo, name: e.target.value },
                })
              }
              className="field"
            />
          </div>

          <div className="space-y-1">
            <label className="field-label">Address</label>
            <input
              type="text"
              value={formData.storeInfo?.address || 'Helsinki'}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  storeInfo: { ...formData.storeInfo, address: e.target.value },
                })
              }
              className="field"
            />
          </div>

          <div className="space-y-1">
            <label className="field-label">VAT (%)</label>
            <input
              type="number"
              value={formData.vatRate || 24}
              onChange={(e) => setFormData({ ...formData, vatRate: parseFloat(e.target.value) || 24 })}
              className="field font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="field-label">Free Shipping Threshold (€)</label>
            <input
              type="number"
              value={formData.freeShippingThreshold || 100}
              onChange={(e) =>
                setFormData({ ...formData, freeShippingThreshold: parseFloat(e.target.value) || 100 })
              }
              className="field font-mono"
            />
          </div>
        </div>
      </div>

      {/* BACKUP */}
      <div className="space-y-3">
        <span className="micro-sm text-paper-a45 block">Data</span>
        <button
          onClick={handleExportAllData}
          className="btn-text"
        >
          Export Backup (JSON) →
        </button>
      </div>

      {/* AUDIT LOG */}
      <div className="space-y-4">
        <span className="micro-sm text-paper-a45 block">Audit Log</span>
        {auditLogs.length === 0 ? (
          <p className="text-[13px] font-light text-paper-a45">No audit events recorded</p>
        ) : (
          <table className="w-full text-left text-[13px] border border-paper-a18">
            <thead>
              <tr className="micro-sm text-paper-a45 border-b border-paper-a18">
                <th className="py-3 px-4 font-normal">Time</th>
                <th className="py-3 px-4 font-normal">User</th>
                <th className="py-3 px-4 font-normal">Action</th>
                <th className="py-3 px-4 font-normal">Target</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.id} className="border-b border-paper-a18 last:border-b-0 hover:bg-paper-a06 transition-colors">
                  <td className="py-3 px-4 font-mono text-[11px] text-paper-a45">
                    {log.at?.substring(0, 16).replace('T', ' ')}
                  </td>
                  <td className="py-3 px-4 text-paper font-light">{log.who}</td>
                  <td className="py-3 px-4 text-paper font-light">{log.action}</td>
                  <td className="py-3 px-4 text-paper-a72 font-light">{log.target}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
