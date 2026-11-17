import React from 'react';

interface BrandLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'hero';
  invert?: boolean;
}

const sizeStyles = {
  sm: 'text-[16px] sm:text-[19px] tracking-[0.42em]',
  md: 'text-[22px] sm:text-[28px] md:text-[32px] tracking-[0.44em]',
  lg: 'text-[36px] sm:text-[48px] md:text-[56px] tracking-[0.4em]',
  hero: 'text-[48px] sm:text-[72px] md:text-[96px] tracking-[0.34em]',
} as const;

/**
 * NULLA wordmark — Instrument Serif, widely tracked, no weight above 400.
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({
  className = '',
  size = 'md',
  invert = false,
}) => (
  <div
    className={`inline-flex select-none items-center justify-center text-center transition-colors duration-300 ${
      invert ? 'text-paper' : 'text-ink'
    } ${className}`}
    aria-label="ZEJESH"
  >
    <span
      className={`whitespace-nowrap pl-[0.44em] font-display font-light leading-none ${sizeStyles[size]}`}
    >
      ZEJESH
    </span>
  </div>
);
