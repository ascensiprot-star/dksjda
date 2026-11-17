/**
 * House editorial imagery.
 *
 * These are the studio photographs supplied for the ZEJESH archive. They are
 * used as the current campaign set until the content library is populated
 * through the admin console.
 */
export const EDITORIAL_IMAGES = [
  '/editorial/look-01.jpg',
  '/editorial/look-02.jpg',
  '/editorial/look-03.jpg',
  '/editorial/look-04.jpg',
  '/editorial/look-05.jpg',
  '/editorial/look-06.jpg',
  '/editorial/look-07.jpg',
] as const;

export const HERO_EDITORIAL_IMAGES = [
  EDITORIAL_IMAGES[0],
  EDITORIAL_IMAGES[1],
  EDITORIAL_IMAGES[2],
  EDITORIAL_IMAGES[3],
] as const;

/** Stable image selection so a given product always keeps the same fallback. */
export const editorialFor = (key: string, offset = 0): string => {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return EDITORIAL_IMAGES[(hash + offset) % EDITORIAL_IMAGES.length];
};

export const editorialAt = (index: number): string =>
  EDITORIAL_IMAGES[((index % EDITORIAL_IMAGES.length) + EDITORIAL_IMAGES.length) % EDITORIAL_IMAGES.length];
