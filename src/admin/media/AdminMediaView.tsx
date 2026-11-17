import React, { useState, useEffect, useRef } from 'react';
import { Product, MediaAsset, ImageFramingParams, MediaTarget } from '../../types';
import {
  UploadCloud,
  Check,
  Info,
  Trash2,
  Maximize2,
  Sparkles,
  AlertTriangle,
  Loader2,
  Search,
  ExternalLink,
  Sliders,
  Copy,
} from 'lucide-react';
import {
  getMediaAssets,
  uploadMediaAsset,
  updateMediaAsset,
  deleteMediaAssetPermanently,
  findMediaUsage,
  MAX_FILE_SIZE_BYTES,
  ALLOWED_MIME_TYPES,
} from '../../supabase/mediaService';
import { UniversalImageEditorModal } from '../components/UniversalImageEditorModal';
import { UploadTargetModal } from '../components/UploadTargetModal';

interface AdminMediaViewProps {
  products: Product[];
}

export const AdminMediaView: React.FC<AdminMediaViewProps> = ({ products }) => {
  const [mediaList, setMediaList] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingUploadFiles, setPendingUploadFiles] = useState<File[]>([]);
  const [uploadTargetOpen, setUploadTargetOpen] = useState(false);
  const [targetFilter, setTargetFilter] = useState<MediaTarget | 'all'>('all');
  const [targetSaving, setTargetSaving] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);

  // Inspector & selection
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  const [assetUsage, setAssetUsage] = useState<{
    productIds: string[];
    productTitles: string[];
    heroUsage: boolean;
    contentSections: string[];
    totalUses: number;
  } | null>(null);
  const [checkingUsage, setCheckingUsage] = useState(false);

  // Deletion modal state
  const [assetToDelete, setAssetToDelete] = useState<MediaAsset | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // Image Editor
  const [editorAsset, setEditorAsset] = useState<MediaAsset | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadMedia = async () => {
    setLoading(true);
    try {
      const items = await getMediaAssets();
      setMediaList(items);
    } catch (err) {
      console.warn('Error loading media assets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMedia();
  }, []);

  // When selecting an asset, check real usage across database
  useEffect(() => {
    if (selectedAsset) {
      setCheckingUsage(true);
      findMediaUsage(selectedAsset.url).then((usage) => {
        setAssetUsage(usage);
        setCheckingUsage(false);
      });
    } else {
      setAssetUsage(null);
    }
  }, [selectedAsset]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploadError(null);
    setPendingUploadFiles(files);
    setUploadTargetOpen(true);
  };

  const handleCancelUploadTarget = () => {
    setUploadTargetOpen(false);
    setPendingUploadFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleConfirmUploadTarget = async (target: MediaTarget) => {
    if (pendingUploadFiles.length === 0) return;

    setUploadTargetOpen(false);
    setIsUploading(true);
    setUploadError(null);

    for (let i = 0; i < pendingUploadFiles.length; i++) {
      const file = pendingUploadFiles[i];
      try {
        setUploadProgress(Math.round(((i + 1) / pendingUploadFiles.length) * 100));
        await uploadMediaAsset(file, { target });
      } catch (err: any) {
        setUploadError(err.message || 'Upload failed for one or more files.');
      }
    }

    setIsUploading(false);
    setUploadProgress(null);
    setPendingUploadFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    loadMedia();
  };

  const handleChangeTarget = async (target: MediaTarget) => {
    if (!selectedAsset || target === (selectedAsset.target || 'both')) return;

    setTargetSaving(true);
    setTargetError(null);
    const result = await updateMediaAsset(selectedAsset.id, { target });
    setTargetSaving(false);

    if (!result.success) {
      setTargetError(result.error || 'Could not update the media target.');
      return;
    }

    const updated = { ...selectedAsset, target };
    setSelectedAsset(updated);
    setMediaList((prev) => prev.map((asset) => (asset.id === updated.id ? updated : asset)));
  };

  const handleConfirmDelete = async () => {
    if (!assetToDelete) return;
    setIsDeleting(true);
    setDeleteError(null);

    const res = await deleteMediaAssetPermanently(assetToDelete);
    setIsDeleting(false);

    if (res.success) {
      setMediaList((prev) => prev.filter((a) => a.id !== assetToDelete.id));
      if (selectedAsset?.id === assetToDelete.id) {
        setSelectedAsset(null);
      }
      setAssetToDelete(null);
    } else {
      setDeleteError(res.error || 'Failed to delete asset from Storage.');
    }
  };

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const filteredMedia = mediaList.filter((item) => {
    const itemTarget = item.target || 'both';
    if (targetFilter !== 'all' && itemTarget !== targetFilter) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (item.alt && item.alt.toLowerCase().includes(q)) ||
      item.path.toLowerCase().includes(q) ||
      itemTarget.includes(q)
    );
  });

  return (
    <div className="space-y-6 select-none">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-paper-a18 pb-4">
        <div>
          <h1 className="font-display text-[38px] font-light leading-[1.05] tracking-[-0.01em] text-paper">Media Storage</h1>
          <p className="text-[13px] font-light text-paper-a45 mt-1 max-w-2xl leading-relaxed">
            Direct Supabase Storage integration with client-side WebP compression and usage tracking.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="btn btn-primary !min-h-[42px] !px-6 disabled:opacity-50"
          >
            <UploadCloud className="w-3.5 h-3.5" strokeWidth={1.4} />
            <span>{isUploading ? `Uploading (${uploadProgress || 0}%)...` : 'Upload From Device'}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      </div>

      {uploadError && (
        <div className="p-3 border border-dashed border-paper-a18 micro-sm text-paper flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" strokeWidth={1.4} />
          <span>{uploadError}</span>
        </div>
      )}

      {/* Dropzone & Filter */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-6 border-b border-paper-a18 pb-3">
        <div className="flex-1 flex items-center gap-2">
          <Search className="w-3.5 h-3.5 text-paper-a45" strokeWidth={1.4} />
          <input
            type="text"
            placeholder="Search media assets by filename or tag..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="field !border-0"
          />
        </div>
        <label className="flex items-center gap-2 shrink-0 self-center">
          <span className="micro-sm text-paper-a45">Surface</span>
          <select
            value={targetFilter}
            onChange={(e) => setTargetFilter(e.target.value as MediaTarget | 'all')}
            className="field !w-auto !border-0 text-small"
            aria-label="Filter media by target surface"
          >
            <option value="all">All</option>
            <option value="desktop">Desktop</option>
            <option value="mobile">Mobile</option>
            <option value="both">Both</option>
          </select>
        </label>
        <div className="micro-sm text-paper-a45 shrink-0 self-center">
          {filteredMedia.length} / {mediaList.length} asset{mediaList.length === 1 ? '' : 's'}
        </div>
      </div>

      {/* Storage Grid */}
      {loading ? (
        <div className="py-24 text-center micro-sm text-paper-a45 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-paper" strokeWidth={1.4} />
          <span>Connecting to Supabase Storage bucket...</span>
        </div>
      ) : filteredMedia.length === 0 ? (
        <div className="py-24 text-center border border-paper-a18 space-y-4">
          <UploadCloud className="w-8 h-8 text-paper-a45 mx-auto" strokeWidth={1.2} />
          <div className="micro-sm text-paper">
            Storage bucket is clean & empty
          </div>
          <p className="text-[13px] font-light text-paper-a45 max-w-sm mx-auto">
            Upload images or campaign videos from your device to populate the media library.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-paper-a18 border border-paper-a18">
          {filteredMedia.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelectedAsset(item)}
              className="bg-ink p-3 flex flex-col justify-between group transition-colors cursor-pointer hover:bg-paper hover:text-ink"
            >
              <div className="aspect-[3/4] overflow-hidden relative mb-3 border border-paper-a18">
                {item.kind === 'video' ? (
                  <video
                    src={item.url}
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                  />
                ) : (
                  <img
                    src={item.url}
                    alt={item.alt || ''}
                    className="w-full h-full object-cover grayscale group-hover:scale-[1.02] transition-transform duration-500"
                    loading="lazy"
                  />
                )}
                <div className="absolute left-1 top-1 bg-ink text-paper micro-sm px-1.5 py-0.5 font-mono uppercase">
                  {item.target || 'both'}
                </div>
                <div className="absolute bottom-1 right-1 bg-ink text-paper micro-sm px-1.5 py-0.5 font-mono">
                  {item.width && item.height ? `${item.width}×${item.height}` : item.kind}
                </div>
              </div>

              <div className="space-y-2">
                <div className="micro-sm truncate text-paper group-hover:text-ink">
                  {item.alt || item.path.split('/').pop()}
                </div>
                <div className="flex items-center justify-between micro-sm text-paper-a45 group-hover:text-ink-a40">
                  <span className="font-mono">{item.sizeBytes ? `${Math.round(item.sizeBytes / 1024)} KB` : ''}</span>
                  <span>{item.kind}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Asset Inspector Modal */}
      {selectedAsset && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div onClick={() => setSelectedAsset(null)} className="fixed inset-0 bg-ink/80" />
          <div className="relative bg-ink border border-paper-a18 w-full max-w-2xl max-h-[90vh] flex flex-col p-6 overflow-y-auto space-y-6 z-10">
            <div className="flex items-center justify-between pb-3 border-b border-paper-a18">
              <h2 className="micro-sm text-paper">
                Asset Metadata & Calibration
              </h2>
              <button
                type="button"
                onClick={() => setSelectedAsset(null)}
                className="text-paper-a45 hover:text-paper cursor-pointer transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 items-start">
              <div className="aspect-[3/4] overflow-hidden border border-paper-a18">
                {selectedAsset.kind === 'video' ? (
                  <video
                    src={selectedAsset.url}
                    controls
                    className="w-full h-full object-cover grayscale"
                  />
                ) : (
                  <img
                    src={selectedAsset.url}
                    alt={selectedAsset.alt || ''}
                    className="w-full h-full object-cover grayscale"
                  />
                )}
              </div>

              <div className="space-y-5 text-[13px]">
                <div>
                  <div className="micro-sm text-paper-a45">Storage Path</div>
                  <div className="text-paper break-all font-mono text-[11px] mt-1.5">
                    {selectedAsset.path}
                  </div>
                </div>

                <div>
                  <div className="micro-sm text-paper-a45">Public URL</div>
                  <div className="flex items-center gap-2 mt-1.5 border-b border-paper-a18 pb-2">
                    <input
                      type="text"
                      readOnly
                      value={selectedAsset.url}
                      className="w-full bg-transparent text-[11px] font-mono text-paper-a72 select-all truncate outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleCopyUrl(selectedAsset.url)}
                      className="micro-sm text-paper hover:underline underline-offset-4 cursor-pointer shrink-0"
                    >
                      {copySuccess ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="micro-sm text-paper-a45 block mb-1">Dimensions</span>
                    <span className="font-mono text-[12px] text-paper">{selectedAsset.width && selectedAsset.height ? `${selectedAsset.width} × ${selectedAsset.height} px` : 'N/A'}</span>
                  </div>
                  <div>
                    <span className="micro-sm text-paper-a45 block mb-1">File Size</span>
                    <span className="font-mono text-[12px] text-paper">{selectedAsset.sizeBytes ? `${Math.round(selectedAsset.sizeBytes / 1024)} KB` : 'N/A'}</span>
                  </div>
                </div>

                <div>
                  <span className="micro-sm text-paper-a45 block mb-1">Media Placement</span>
                  <select
                    value={selectedAsset.target || 'both'}
                    onChange={(e) => handleChangeTarget(e.target.value as MediaTarget)}
                    disabled={targetSaving}
                    className="field text-small"
                    aria-label="Media placement target"
                  >
                    <option value="desktop">Desktop — tablet and desktop only</option>
                    <option value="mobile">Mobile — phone layouts only</option>
                    <option value="both">Both — shared across every screen</option>
                  </select>
                  {targetSaving && (
                    <span className="micro-sm text-paper-a45 mt-1 block">Saving placement…</span>
                  )}
                  {targetError && (
                    <span className="micro-sm text-paper mt-1 block">{targetError}</span>
                  )}
                </div>

                {/* Where is this used in the catalog? */}
                <div className="p-3 border border-paper-a18 space-y-2">
                  <div className="micro-sm text-paper flex items-center justify-between">
                    <span>Database References</span>
                    {checkingUsage && <Loader2 className="w-3 h-3 animate-spin text-paper" strokeWidth={1.4} />}
                  </div>

                  {assetUsage ? (
                    assetUsage.totalUses === 0 ? (
                      <p className="text-[12px] font-light text-paper-a45">
                        This file is currently unreferenced in products or hero slides.
                      </p>
                    ) : (
                      <div className="space-y-1.5 text-[12px] font-light text-paper-a72">
                        {assetUsage.productTitles.length > 0 && (
                          <div>
                            <span className="text-paper">Products ({assetUsage.productTitles.length}):</span>{' '}
                            {assetUsage.productTitles.join(', ')}
                          </div>
                        )}
                        {assetUsage.heroUsage && (
                          <div>
                            <span className="text-paper">Storefront:</span> Featured in Home Hero
                          </div>
                        )}
                        {assetUsage.contentSections.length > 0 && (
                          <div>
                            <span className="text-paper">CMS Sections:</span>{' '}
                            {assetUsage.contentSections.join(', ')}
                          </div>
                        )}
                      </div>
                    )
                  ) : null}
                </div>

                {/* Action buttons */}
                <div className="pt-2 flex flex-col gap-2">
                  {selectedAsset.kind === 'image' && (
                    <button
                      type="button"
                      onClick={() => setEditorAsset(selectedAsset)}
                      className="btn btn-secondary w-full !min-h-[42px]"
                    >
                      <Sliders className="w-3.5 h-3.5" strokeWidth={1.4} />
                      <span>Calibrate Frame & Placements</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setAssetToDelete(selectedAsset);
                    }}
                    className="w-full py-2.5 micro-sm border border-dashed border-paper-a18 text-paper hover:bg-paper hover:text-ink transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" strokeWidth={1.4} />
                    <span>Delete From Storage</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Deletion Warning Modal */}
      {assetToDelete && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div onClick={() => setAssetToDelete(null)} className="fixed inset-0 bg-ink/80" />
          <div className="relative bg-ink border border-paper-a18 w-full max-w-md p-6 space-y-5 text-[13px] z-10">
            <div className="flex items-center gap-2 text-paper pb-3 border-b border-paper-a18">
              <AlertTriangle className="w-4 h-4 shrink-0" strokeWidth={1.4} />
              <h3 className="micro-sm">
                Delete Asset Permanently
              </h3>
            </div>

            <p className="text-paper-a72 leading-relaxed font-light">
              Are you sure you want to delete <span className="font-mono text-[11px] text-paper">{assetToDelete.path}</span> from the storage bucket?
            </p>

            {assetUsage && assetUsage.totalUses > 0 && (
              <div className="p-3 border border-dashed border-paper-a18 text-[12px] text-paper-a72 space-y-1.5">
                <div className="micro-sm text-paper">Active Usage Notice</div>
                <p className="font-light leading-relaxed">
                  This asset is currently in use across {assetUsage.totalUses} place(s):{' '}
                  {assetUsage.productTitles.join(', ')}. Deleting it will remove the file from storage and replace storefront placements with the neutral placeholder.
                </p>
              </div>
            )}

            {deleteError && (
              <div className="p-2 border border-dashed border-paper-a18 micro-sm text-paper">
                {deleteError}
              </div>
            )}

            <div className="flex items-center justify-end gap-4 pt-2 border-t border-paper-a18">
              <button
                type="button"
                onClick={() => setAssetToDelete(null)}
                className="btn-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="btn btn-primary !min-h-[42px] !px-5 disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Remove Everywhere'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Universal Image Editor */}
      {editorAsset && (
        <UniversalImageEditorModal
          isOpen={Boolean(editorAsset)}
          imageUrl={editorAsset.url}
          title={`Framing Calibration · ${editorAsset.alt || editorAsset.path.split('/').pop()}`}
          initialFraming={{
            focalX: editorAsset.focalX ?? 50,
            focalY: editorAsset.focalY ?? 50,
          }}
          target={editorAsset.target}
          onClose={() => setEditorAsset(null)}
          onApply={(framing) => {
            // Apply framing parameters
            setEditorAsset(null);
          }}
          onExportCopy={() => {
            loadMedia();
          }}
        />
      )}

      <UploadTargetModal
        open={uploadTargetOpen}
        fileNames={pendingUploadFiles.map((file) => file.name)}
        busy={isUploading}
        onCancel={handleCancelUploadTarget}
        onConfirm={handleConfirmUploadTarget}
      />
    </div>
  );
};
