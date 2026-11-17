import React from 'react';
import { Language, translations } from '../types';
import { X } from 'lucide-react';

interface SizeGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
}

export const SizeGuideModal: React.FC<SizeGuideModalProps> = ({
  isOpen,
  onClose,
  language,
}) => {
  const t = translations[language];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div onClick={onClose} className="overlay-backdrop" />

      {/* Modal */}
      <div className="modal-panel relative w-full max-w-2xl p-6 sm:p-10 z-10 max-h-[90vh] overflow-y-auto animate-fadeIn">
        <div className="flex items-center justify-between border-b border-ink-a18 pb-4 mb-6">
          <h3 className="font-display text-[clamp(28px,4vw,38px)] font-light leading-none">
            {t.pdp.sizeGuide}
          </h3>
          <button
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center border border-ink-a18 text-ink/60 hover:text-ink hover:border-ink transition-colors cursor-pointer"
            aria-label={t.nav.close}
          >
            <X className="w-5 h-5 stroke-[1.5]" />
          </button>
        </div>

        <p className="body-copy text-ink/70 mb-8">
          All dimensions are body measurements in centimetres (cm). If your measurements fall between two sizes, we recommend opting for the larger size for a relaxed Nordic silhouette.
        </p>

        {/* Women's Table */}
        <div className="mb-10">
          <h4 className="label text-[9px] text-ink/50 mb-3">
            Women (XS – XL)
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-[12px] tracking-[0.08em]">
              <thead>
                <tr className="label text-[9px] text-ink/45 border-b border-ink-a18">
                  <th className="py-3 pr-4 font-normal">Size / EU</th>
                  <th className="py-3 pr-4 font-normal">Bust (cm)</th>
                  <th className="py-3 pr-4 font-normal">Waist (cm)</th>
                  <th className="py-3 font-normal">Hips (cm)</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-ink-a18">
                  <td className="py-3 pr-4 text-ink">XS / 34</td>
                  <td className="py-3 pr-4 text-ink/70">80–84</td>
                  <td className="py-3 pr-4 text-ink/70">62–66</td>
                  <td className="py-3 text-ink/70">88–92</td>
                </tr>
                <tr className="border-b border-ink-a18">
                  <td className="py-3 pr-4 text-ink">S / 36</td>
                  <td className="py-3 pr-4 text-ink/70">84–88</td>
                  <td className="py-3 pr-4 text-ink/70">66–70</td>
                  <td className="py-3 text-ink/70">92–96</td>
                </tr>
                <tr className="border-b border-ink-a18">
                  <td className="py-3 pr-4 text-ink">M / 38</td>
                  <td className="py-3 pr-4 text-ink/70">88–92</td>
                  <td className="py-3 pr-4 text-ink/70">70–74</td>
                  <td className="py-3 text-ink/70">96–100</td>
                </tr>
                <tr className="border-b border-ink-a18">
                  <td className="py-3 pr-4 text-ink">L / 40</td>
                  <td className="py-3 pr-4 text-ink/70">92–96</td>
                  <td className="py-3 pr-4 text-ink/70">74–78</td>
                  <td className="py-3 text-ink/70">100–104</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 text-ink">XL / 42</td>
                  <td className="py-3 pr-4 text-ink/70">96–102</td>
                  <td className="py-3 pr-4 text-ink/70">78–84</td>
                  <td className="py-3 text-ink/70">104–110</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Men's Table */}
        <div>
          <h4 className="label text-[9px] text-ink/50 mb-3">
            Men (S – XL / 46 – 54)
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-[12px] tracking-[0.08em]">
              <thead>
                <tr className="label text-[9px] text-ink/45 border-b border-ink-a18">
                  <th className="py-3 pr-4 font-normal">Size / EU</th>
                  <th className="py-3 pr-4 font-normal">Chest (cm)</th>
                  <th className="py-3 pr-4 font-normal">Waist (cm)</th>
                  <th className="py-3 font-normal">Inseam (cm)</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-ink-a18">
                  <td className="py-3 pr-4 text-ink">S / 46</td>
                  <td className="py-3 pr-4 text-ink/70">90–94</td>
                  <td className="py-3 pr-4 text-ink/70">78–82</td>
                  <td className="py-3 text-ink/70">81</td>
                </tr>
                <tr className="border-b border-ink-a18">
                  <td className="py-3 pr-4 text-ink">M / 48–50</td>
                  <td className="py-3 pr-4 text-ink/70">96–102</td>
                  <td className="py-3 pr-4 text-ink/70">84–88</td>
                  <td className="py-3 text-ink/70">82</td>
                </tr>
                <tr className="border-b border-ink-a18">
                  <td className="py-3 pr-4 text-ink">L / 52</td>
                  <td className="py-3 pr-4 text-ink/70">104–108</td>
                  <td className="py-3 pr-4 text-ink/70">90–94</td>
                  <td className="py-3 text-ink/70">83</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 text-ink">XL / 54</td>
                  <td className="py-3 pr-4 text-ink/70">110–116</td>
                  <td className="py-3 pr-4 text-ink/70">96–102</td>
                  <td className="py-3 text-ink/70">84</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-ink-a18">
          <button
            onClick={onClose}
            className="btn btn-secondary w-full"
          >
            Close Size Guide
          </button>
        </div>
      </div>
    </div>
  );
};
