import React from 'react';

export const ProductCardSkeleton: React.FC<{ density?: 'comfortable' | 'compact' | 'dense' }> = () => {
  return (
    <div className="bg-paper space-y-4 p-3 sm:p-4">
      <div
        className="aspect-[2/3] w-full overflow-hidden bg-[#111] animate-pulse"
      />
      <div className="space-y-2">
        <div className="h-3 w-3/4 bg-[#111] animate-pulse" />
        <div className="h-3 w-1/4 bg-[#111] animate-pulse" />
      </div>
    </div>
  );
};
