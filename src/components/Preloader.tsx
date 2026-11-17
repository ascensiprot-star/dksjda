import React, { useEffect, useState } from 'react';

interface PreloaderProps {
  onComplete: () => void;
}

/**
 * The curtain.
 *
 * The house opens in black for a breath, then lifts to white.
 */
export const Preloader: React.FC<PreloaderProps> = ({ onComplete }) => {
  const [progress, setProgress] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [done, setDone] = useState(false);
  const completeRef = React.useRef(onComplete);
  completeRef.current = onComplete;

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDone(true);
      completeRef.current();
      return;
    }

    const start = performance.now();
    const duration = 1100;
    let frame = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setProgress(t);
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        setLeaving(true);
        window.setTimeout(() => {
          setDone(true);
          completeRef.current();
        }, 820);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  if (done) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-[100] flex flex-col justify-between bg-black p-6 text-white md:p-9"
      style={{
        transform: leaving ? 'translateY(-101%)' : 'translateY(0)',
        transition: 'transform 820ms cubic-bezier(.76,0,.24,1)',
      }}
    >
      <div className="flex items-center justify-between">
        <span className="label text-[8px] text-white/45">House of modern clothing</span>
        <span className="label text-[8px] text-white/45">Est. 2026</span>
      </div>

      <div className="relative flex flex-1 items-center justify-center">
        <span
          className="font-display text-[clamp(38px,6.4vw,96px)] leading-none tracking-[0.24em]"
          style={{
            opacity: 0.2 + progress * 0.8,
            letterSpacing: `${0.24 + (1 - progress) * 0.1}em`,
            transition: 'opacity 200ms linear, letter-spacing 600ms ease-out',
          }}
        >
          ZEJESH
        </span>
      </div>

      <div className="flex items-end justify-between gap-6">
        <span className="label text-[8px] text-white/45">Helsinki — Porto</span>
        <span className="font-mono text-[9px] tracking-[0.2em] text-white/60">
          {String(Math.round(progress * 100)).padStart(3, '0')}
        </span>
      </div>
    </div>
  );
};
