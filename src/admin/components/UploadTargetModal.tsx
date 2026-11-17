import React, { useEffect, useState } from 'react';
import { Check, Layers, Monitor, Smartphone, X } from 'lucide-react';
import { MediaTarget } from '../../types';

const TARGET_OPTIONS: Array<{
  value: MediaTarget;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}> = [
  {
    value: 'desktop',
    label: 'Desktop',
    description: 'Tablet and desktop layouts only.',
    icon: Monitor,
  },
  {
    value: 'mobile',
    label: 'Mobile',
    description: 'Phone layouts only, including dedicated 9:16 cuts.',
    icon: Smartphone,
  },
  {
    value: 'both',
    label: 'Both',
    description: 'Shared across every screen.',
    icon: Layers,
  },
];

interface UploadTargetModalProps {
  open: boolean;
  fileNames?: string[];
  defaultTarget?: MediaTarget;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (target: MediaTarget) => void;
}

export const UploadTargetModal: React.FC<UploadTargetModalProps> = ({
  open,
  fileNames = [],
  defaultTarget = 'both',
  busy = false,
  onCancel,
  onConfirm,
}) => {
  const [target, setTarget] = useState<MediaTarget>(defaultTarget);

  useEffect(() => {
    if (open) setTarget(defaultTarget);
  }, [open, defaultTarget]);

  if (!open) return null;

  const visibleFiles = fileNames.slice(0, 3);
  const extraFiles = Math.max(0, fileNames.length - visibleFiles.length);

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-target-title"
    >
      <div className="fixed inset-0 bg-ink/85" onClick={busy ? undefined : onCancel} />
      <div className="relative z-10 w-full max-w-xl border border-paper-a18 bg-ink p-5 text-paper sm:p-7">
        <div className="flex items-start justify-between gap-4 border-b border-paper-a18 pb-4">
          <div>
            <span className="micro-sm text-paper-a45">Media placement</span>
            <h2
              id="upload-target-title"
              className="mt-1 font-display text-[28px] font-light leading-tight"
            >
              Where does this media belong?
            </h2>
            <p className="mt-2 max-w-md text-[13px] font-light leading-relaxed text-paper-a45">
              Choose the surface this upload is authored for. You can change it later from Media
              Storage.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="p-1 text-paper-a45 transition-colors hover:text-paper disabled:opacity-40"
            aria-label="Cancel upload"
          >
            <X className="h-5 w-5" strokeWidth={1.4} />
          </button>
        </div>

        {fileNames.length > 0 && (
          <div className="mt-4 space-y-1 border border-paper-a18 p-3">
            <div className="micro-sm text-paper-a45">
              {fileNames.length === 1 ? 'Selected file' : `${fileNames.length} selected files`}
            </div>
            {visibleFiles.map((name) => (
              <div key={name} className="truncate font-mono text-[11px] text-paper-a72">
                {name}
              </div>
            ))}
            {extraFiles > 0 && (
              <div className="text-[11px] text-paper-a45">+ {extraFiles} more</div>
            )}
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {TARGET_OPTIONS.map((option) => {
            const Icon = option.icon;
            const selected = target === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setTarget(option.value)}
                disabled={busy}
                className={`flex min-h-[132px] flex-col items-start gap-3 border p-4 text-left transition-colors disabled:opacity-50 ${
                  selected
                    ? 'border-paper bg-paper text-ink'
                    : 'border-paper-a18 bg-transparent text-paper hover:border-paper-a45'
                }`}
              >
                <span className="flex w-full items-center justify-between">
                  <Icon className="h-5 w-5" strokeWidth={1.3} />
                  {selected && <Check className="h-4 w-4" strokeWidth={1.6} />}
                </span>
                <span className="block text-[13px] font-normal">{option.label}</span>
                <span
                  className={`block text-[11px] font-light leading-relaxed ${
                    selected ? 'text-ink/65' : 'text-paper-a45'
                  }`}
                >
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-paper-a18 pt-4">
          <button type="button" onClick={onCancel} disabled={busy} className="btn-text">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(target)}
            disabled={busy}
            className="btn btn-primary !min-h-[42px] !px-6 disabled:opacity-50"
          >
            {busy ? 'Uploading…' : `Upload to ${target === 'both' ? 'both' : target}`}
          </button>
        </div>
      </div>
    </div>
  );
};
