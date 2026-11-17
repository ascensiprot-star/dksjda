import { useEffect, useState } from 'react';

/** The storefront switches to its mobile media set below tablet width. */
export const MOBILE_QUERY = '(max-width: 767px)';

export const useMediaQuery = (query: string) => {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const update = () => setMatches(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, [query]);

  return matches;
};

export const useMobileViewport = () => useMediaQuery(MOBILE_QUERY);
