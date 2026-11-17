import React, { useState } from 'react';
import { Collection, Product } from '../../types';
import { Layers, Clock, Users, ArrowUp, ArrowDown, Send, Check, Plus, AlertCircle } from 'lucide-react';
import { useAuth } from '../../supabase/AuthContext';
import { supabase } from '../../supabase/config';
import { logAuditEvent } from '../../supabase/dbService';

interface AdminCollectionsViewProps {
  collections: Collection[];
  products: Product[];
  onRefresh: () => void;
}

export const AdminCollectionsView: React.FC<AdminCollectionsViewProps> = ({
  collections,
  products,
  onRefresh,
}) => {
  const { isEditor, adminProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<'drops' | 'seasons'>('drops');
  const [selectedColId, setSelectedColId] = useState<string>(collections.find((c) => c.type === 'drop')?.id || collections[0]?.id || '');
  const [earlyAccessSent, setEarlyAccessSent] = useState<Record<string, boolean>>({});

  const activeCollection = collections.find((c) => c.id === selectedColId) || collections[0];

  const handleSendEarlyAccess = async (colId: string) => {
    setEarlyAccessSent((prev) => ({ ...prev, [colId]: true }));
    await logAuditEvent(adminProfile?.name || 'admin', 'send_early_access', colId, {
      recipientCount: 84,
      drop: activeCollection.slug,
    });
    setTimeout(() => {
      setEarlyAccessSent((prev) => ({ ...prev, [colId]: false }));
    }, 4000);
  };

  const drops = collections.filter((c) => c.type === 'drop');
  const seasons = collections.filter((c) => c.type !== 'drop');

  const displayedList = activeTab === 'drops' ? drops : seasons;

  // Resolve products in active collection
  const colProducts = products.filter((p) => {
    return activeCollection?.productIds?.includes(p.id) || p.collectionSeason === activeCollection?.slug;
  });

  return (
    <div className="space-y-6">
      {/* Title Bar */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-paper-a18 pb-4">
        <div>
          <h1 className="font-display text-[38px] font-light leading-[1.05] tracking-[-0.01em] text-paper">Collections & Drops</h1>
          <p className="text-[13px] font-light text-paper-a45 mt-1 max-w-2xl leading-relaxed">
            Manage seasonal collections, limited edition drops, and VIP early access waitlists.
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex items-center gap-6 micro-sm">
          <button
            onClick={() => setActiveTab('drops')}
            className={`transition-colors cursor-pointer py-1 ${ activeTab === 'drops'
                ? 'text-paper underline underline-offset-[6px]'
                : 'text-paper-a45 hover:text-paper'
            }`}
          >
            Drops ({drops.length})
          </button>
          <button
            onClick={() => setActiveTab('seasons')}
            className={`transition-colors cursor-pointer py-1 ${ activeTab === 'seasons'
                ? 'text-paper underline underline-offset-[6px]'
                : 'text-paper-a45 hover:text-paper'
            }`}
          >
            Seasonal Collections ({seasons.length})
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: List of items */}
        <div className="lg:col-span-5 space-y-3">
          <div className="micro-sm text-paper-a45">
            Select item to manage
          </div>

          <div className="border-t border-paper-a18">
            {displayedList.map((col) => {
              const isSelected = col.id === selectedColId;
              const nameText = typeof col.name === 'object' ? col.name.en || col.name.fi : col.name;

              return (
                <div
                  key={col.id}
                  onClick={() => setSelectedColId(col.id)}
                  className={`p-5 border-b border-paper-a18 transition-colors cursor-pointer ${ isSelected ? 'bg-paper text-ink'
                      : 'text-paper-a72 hover:bg-paper-a06 hover:text-paper'
                  }`}
                >
                  <div className={`flex items-center justify-between mb-2 micro-sm ${isSelected ? 'text-ink-a40' : 'text-paper-a45'}`}>
                    <span className="font-mono">/{col.slug}</span>
                    <span>[{col.status}]</span>
                  </div>

                  <h3 className="font-display text-[24px] font-light leading-tight line-clamp-1">{nameText}</h3>

                  {col.type === 'drop' && (
                    <div className={`mt-4 pt-3 border-t flex justify-between micro-sm ${isSelected ? 'border-ink-a14 text-ink-a40' : 'border-paper-a18 text-paper-a45'}`}>
                      <span>Edition: {col.editionSize || 50} units</span>
                      <span>Waitlist: 84 subscribers</span>
                    </div>
                  )}
                </div>
              );
            })}

            {displayedList.length === 0 && (
              <div className="p-10 text-center micro-sm text-paper-a45 border-b border-paper-a18">
                No items in this archive.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Drop Details & Manager */}
        {activeCollection && (
          <div className="lg:col-span-7 border border-paper-a18">
            <div className="flex items-start justify-between border-b border-paper-a18 p-6">
              <div>
                <span className="micro-sm text-paper-a45 block">
                  {activeCollection.type === 'drop' ? 'Limited Drop Management' : 'Collection Overview'}
                </span>
                <h2 className="font-display text-[30px] font-light leading-tight mt-2">
                  {typeof activeCollection.name === 'object' ? activeCollection.name.en || activeCollection.name.fi : activeCollection.name}
                </h2>
                <div className="micro-sm font-mono text-paper-a45 mt-2">Slug: /{activeCollection.slug}</div>
              </div>

              <span className="micro-sm px-2 py-1 bg-paper text-ink">
                [{activeCollection.status}]
              </span>
            </div>

            {/* Drop Launchpad Widget */}
            {activeCollection.type === 'drop' && (
              <div className="p-6 space-y-6 text-[13px] border-b border-paper-a18">
                <div className="flex items-center gap-2 micro-sm text-paper">
                  <Clock className="w-4 h-4" strokeWidth={1.4} />
                  <span>Drop Timing & Readiness</span>
                </div>

                <div className="grid grid-cols-2 gap-px bg-paper-a18 border border-paper-a18">
                  <div className="bg-ink p-4">
                    <span className="micro-sm text-paper-a45 block mb-2">Scheduled release</span>
                    <span className="font-mono text-[12px] text-paper">{activeCollection.startAt ? new Date(activeCollection.startAt).toLocaleString('en-US') : 'Active Now'}</span>
                  </div>
                  <div className="bg-ink p-4">
                    <span className="micro-sm text-paper-a45 block mb-2">Edition size</span>
                    <span className="font-mono text-[12px] text-paper">{activeCollection.editionSize || 50} numbered pieces</span>
                  </div>
                </div>

                {/* Simulated waitlist notify */}
                <div className="pt-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 micro-sm text-paper-a72">
                    <Users className="w-4 h-4" strokeWidth={1.4} />
                    <span>84 waitlist subscribers</span>
                  </div>

                  <button
                    onClick={() => handleSendEarlyAccess(activeCollection.id)}
                    className="btn-text"
                  >
                    {earlyAccessSent[activeCollection.id] ? (
                      <>
                        <Check className="w-3.5 h-3.5" strokeWidth={1.4} />
                        <span>Link Dispatched to VIP List</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" strokeWidth={1.4} />
                        <span>Dispatch Early Access Link</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Associated Products with visual reorder */}
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="micro-sm text-paper">
                  Attached Garments ({colProducts.length})
                </h4>
                <span className="micro-sm text-paper-a45">Curate order for storefront display</span>
              </div>

              <div className="border-t border-paper-a18">
                {colProducts.length === 0 ? (
                  <div className="p-8 text-center micro-sm text-paper-a45">
                    No products attached. Assign this collection in Product Editor.
                  </div>
                ) : (
                  colProducts.map((p, idx) => (
                    <div key={p.id} className="p-3 border-b border-paper-a18 last:border-b-0 flex items-center justify-between text-[13px] hover:bg-paper-a06 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="font-mono micro-sm text-paper-a45 w-16">{p.nr}</span>
                        <div className="w-8 h-10 overflow-hidden border border-paper-a18">
                          <img src={p.images?.[0]?.url} alt="" className="w-full h-full object-cover grayscale" />
                        </div>
                        <span className="font-light text-paper">{p.name.en || p.name.fi}</span>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          disabled={idx === 0}
                          className="btn-text disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          Up
                        </button>
                        <button
                          disabled={idx === colProducts.length - 1}
                          className="btn-text disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          Down
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
