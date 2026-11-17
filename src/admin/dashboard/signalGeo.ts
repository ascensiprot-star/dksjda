import type { Order } from '../../types';

export interface CountryCoordinate {
  label: string;
  x: number;
  y: number;
}

export interface CountryPoint extends CountryCoordinate {
  count: number;
}

/**
 * A deliberately small, stylised coordinate system for the shipping field.
 * It is a data plot, not a real projection: coordinates are chosen so the
 * dotted land silhouette and plotted countries stay legible at dashboard size.
 */
export const COUNTRY_COORDINATES: Record<string, CountryCoordinate> = {
  finland: { label: 'Finland', x: 55.2, y: 12.2 },
  sweden: { label: 'Sweden', x: 53.2, y: 13.5 },
  norway: { label: 'Norway', x: 51, y: 11 },
  denmark: { label: 'Denmark', x: 52.4, y: 16 },
  estonia: { label: 'Estonia', x: 55.8, y: 15 },
  latvia: { label: 'Latvia', x: 56.4, y: 15.6 },
  lithuania: { label: 'Lithuania', x: 55.8, y: 16.8 },
  poland: { label: 'Poland', x: 53.2, y: 18 },
  germany: { label: 'Germany', x: 50.8, y: 18.8 },
  netherlands: { label: 'Netherlands', x: 48.8, y: 18 },
  belgium: { label: 'Belgium', x: 48.6, y: 19.4 },
  luxembourg: { label: 'Luxembourg', x: 49.2, y: 19.8 },
  france: { label: 'France', x: 47, y: 20.8 },
  'united kingdom': { label: 'United Kingdom', x: 43.3, y: 17.3 },
  ireland: { label: 'Ireland', x: 40.6, y: 17 },
  spain: { label: 'Spain', x: 45.3, y: 24.2 },
  portugal: { label: 'Portugal', x: 43.2, y: 23.6 },
  italy: { label: 'Italy', x: 51, y: 23 },
  switzerland: { label: 'Switzerland', x: 49.6, y: 21 },
  austria: { label: 'Austria', x: 52, y: 21.2 },
  czechia: { label: 'Czechia', x: 52, y: 19.4 },
  'czech republic': { label: 'Czechia', x: 52, y: 19.4 },
  slovakia: { label: 'Slovakia', x: 53.4, y: 20.4 },
  hungary: { label: 'Hungary', x: 53.8, y: 21.8 },
  slovenia: { label: 'Slovenia', x: 51.2, y: 22 },
  croatia: { label: 'Croatia', x: 52, y: 23 },
  bosnia: { label: 'Bosnia', x: 52.6, y: 23.6 },
  'bosnia and herzegovina': { label: 'Bosnia', x: 52.6, y: 23.6 },
  serbia: { label: 'Serbia', x: 54.2, y: 23.4 },
  montenegro: { label: 'Montenegro', x: 53.6, y: 24.6 },
  albania: { label: 'Albania', x: 54.4, y: 25.2 },
  'north macedonia': { label: 'North Macedonia', x: 55.2, y: 25 },
  greece: { label: 'Greece', x: 55.4, y: 27 },
  bulgaria: { label: 'Bulgaria', x: 56.2, y: 24.4 },
  romania: { label: 'Romania', x: 55.6, y: 22.6 },
  moldova: { label: 'Moldova', x: 57.2, y: 21.6 },
  ukraine: { label: 'Ukraine', x: 58.2, y: 19.8 },
  belarus: { label: 'Belarus', x: 56.8, y: 18 },
  russia: { label: 'Russia', x: 68, y: 13 },
  iceland: { label: 'Iceland', x: 38.8, y: 10 },
  malta: { label: 'Malta', x: 51.2, y: 26 },
  cyprus: { label: 'Cyprus', x: 60, y: 27 },
  turkey: { label: 'Türkiye', x: 59.2, y: 25.6 },
  georgia: { label: 'Georgia', x: 60.8, y: 22.8 },
  armenia: { label: 'Armenia', x: 62, y: 23.2 },
  azerbaijan: { label: 'Azerbaijan', x: 63.2, y: 23 },
  kazakhstan: { label: 'Kazakhstan', x: 67, y: 20 },
  'united arab emirates': { label: 'United Arab Emirates', x: 66.4, y: 29.6 },
  'saudi arabia': { label: 'Saudi Arabia', x: 62, y: 30 },
  qatar: { label: 'Qatar', x: 65, y: 30.8 },
  kuwait: { label: 'Kuwait', x: 64, y: 28.8 },
  israel: { label: 'Israel', x: 59.4, y: 28.4 },
  egypt: { label: 'Egypt', x: 54.4, y: 27 },
  morocco: { label: 'Morocco', x: 46, y: 25 },
  'south africa': { label: 'South Africa', x: 52, y: 45.5 },
  nigeria: { label: 'Nigeria', x: 49, y: 35 },
  kenya: { label: 'Kenya', x: 56, y: 37 },
  'united states': { label: 'United States', x: 16, y: 22 },
  'united states of america': { label: 'United States', x: 16, y: 22 },
  canada: { label: 'Canada', x: 14, y: 14 },
  mexico: { label: 'Mexico', x: 18, y: 29 },
  brazil: { label: 'Brazil', x: 27, y: 40 },
  argentina: { label: 'Argentina', x: 24, y: 49 },
  chile: { label: 'Chile', x: 23, y: 47 },
  colombia: { label: 'Colombia', x: 23, y: 33 },
  peru: { label: 'Peru', x: 23, y: 38 },
  japan: { label: 'Japan', x: 91, y: 23 },
  china: { label: 'China', x: 78, y: 21 },
  'south korea': { label: 'South Korea', x: 85, y: 23 },
  india: { label: 'India', x: 71.5, y: 33 },
  pakistan: { label: 'Pakistan', x: 68.5, y: 30 },
  bangladesh: { label: 'Bangladesh', x: 72, y: 32.6 },
  'sri lanka': { label: 'Sri Lanka', x: 72, y: 36.6 },
  nepal: { label: 'Nepal', x: 70.6, y: 31.2 },
  singapore: { label: 'Singapore', x: 79.6, y: 38.2 },
  malaysia: { label: 'Malaysia', x: 79, y: 37.4 },
  thailand: { label: 'Thailand', x: 76.8, y: 34 },
  vietnam: { label: 'Vietnam', x: 79.2, y: 33.8 },
  indonesia: { label: 'Indonesia', x: 81, y: 40 },
  philippines: { label: 'Philippines', x: 84.2, y: 33.8 },
  australia: { label: 'Australia', x: 84, y: 48 },
  'new zealand': { label: 'New Zealand', x: 93.8, y: 53.2 },
};

const ALIASES: Record<string, string> = {
  suomi: 'finland',
  ruotsi: 'sweden',
  norja: 'norway',
  tanska: 'denmark',
  viro: 'estonia',
  liettua: 'lithuania',
  puola: 'poland',
  saksa: 'germany',
  alankomaat: 'netherlands',
  hollanti: 'netherlands',
  belgia: 'belgium',
  ranska: 'france',
  espanja: 'spain',
  portugali: 'portugal',
  italia: 'italy',
  sveitsi: 'switzerland',
  itavalta: 'austria',
  tsekki: 'czechia',
  unkari: 'hungary',
  kroatia: 'croatia',
  kreikka: 'greece',
  bulgaria: 'bulgaria',
  romania: 'romania',
  ukraina: 'ukraine',
  venaja: 'russia',
  islanti: 'iceland',
  turkki: 'turkey',
  turkiye: 'turkey',
  yhdysvallat: 'united states',
  usa: 'united states',
  us: 'united states',
  kanada: 'canada',
  meksiko: 'mexico',
  brasilia: 'brazil',
  argentiina: 'argentina',
  kolumbia: 'colombia',
  japani: 'japan',
  kiina: 'china',
  intia: 'india',
  malesia: 'malaysia',
  thaimaa: 'thailand',
  filippiinit: 'philippines',
  'uusi-seelanti': 'new zealand',
  'etela-korea': 'south korea',
  'sri-lanka': 'sri lanka',
};

const stripAccents = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export const normaliseCountry = (raw: string) => {
  const cleaned = stripAccents(String(raw || ''))
    .toLowerCase()
    .replace(/[._/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return ALIASES[cleaned] || cleaned;
};

export const countryPointsFromOrders = (orders: Order[]): CountryPoint[] => {
  const counts = new Map<string, CountryPoint>();
  for (const order of orders) {
    const rawCountry = order.customer?.address?.country;
    if (!rawCountry) continue;
    const key = normaliseCountry(rawCountry);
    const coordinate = COUNTRY_COORDINATES[key];
    if (!coordinate) continue;
    const current = counts.get(key);
    if (current) {
      current.count += 1;
    } else {
      counts.set(key, { ...coordinate, count: 1 });
    }
  }
  return Array.from(counts.values()).sort((a, b) => b.count - a.count);
};
