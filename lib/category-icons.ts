import {
  Layers, Shield, TreePine,
  Hammer, FlaskConical, Wind,
  Flame, Grid3x3, Droplet, Waves, PaintRoller, PaintBucket,
} from 'lucide-react';
import type { LucideProps } from 'lucide-react';
import type { FC } from 'react';
import { SealantSeam, TapeRoll, MushroomAnchor } from './custom-icons';

export const CATEGORY_ICONS: Record<string, FC<LucideProps>> = {
  'germetyky':          SealantSeam,
  'sylikonovi-germetyky': SealantSeam,
  'akrylovi-germetyky': SealantSeam,
  'poliuretanovi-germetyky': SealantSeam,
  'bitumni-germetyky':  SealantSeam,
  'ms-polymerni-hermetyky': SealantSeam,
  'montazhna-pina':     Wind,
  'pistoletna-pina':    Wind,
  'pobutova-pina':      Wind,
  'vohnezakhysna-pina': Flame,
  'klei':               Layers,
  'kley':               Layers,
  'montazhnyi-klei':    Layers,
  'klei-dlya-plytky':   Layers,
  'pva-ta-stolyarnyi':  Layers,
  'epoksydni-klei':     FlaskConical,
  'grunty':             PaintRoller,
  'gruntivky':          PaintRoller,
  'gruntivky-gotovi':   PaintRoller,
  'betonokontakt':      PaintRoller,
  'antygrybok':         Shield,
  'shpaklivky':         PaintRoller,
  'vologopoglinachi':   Droplet,
  'hidroizolyatsiya':   Waves,
  'hidroizolyatsiyni-mastyky': Waves,
  'bitumni-mastyky':    Waves,
  'praimery':           PaintRoller,
  'zakhyst-derevyny':   TreePine,
  'antyseptyki':        TreePine,
  'morylky':            TreePine,
  'zakhysni-pokryttya': TreePine,
  'strichky':           TapeRoll,
  'malyarna-strichka':  TapeRoll,
  'hermetyzuyucha-strichka': TapeRoll,
  'zvukoizolyatsiyna-strichka': TapeRoll,
  'kriplennya':         MushroomAnchor,
  'zamazky-dlya-shviv': Grid3x3,
  'zamazky-tsementni':  Grid3x3,
  'zamazky-epoksydni':  Grid3x3,
  'plastyfikatory':     FlaskConical,
  'instrumenty':        Hammer,
  'pistolety':          Hammer,
  'rozchynnyky':        Flame,
  'farby':                  PaintBucket,
  'alkidni-farby':          PaintBucket,
  'farby-dlya-radiatoriv':  PaintBucket,
};

/* Фірмовий акцент товарної родини — приглушені відтінки близької насиченості
   й світлоти, щоб поруч у сайдбарі нічого не «кричало». Підкатегорії
   успадковують колір родини. Ключі ті самі, що в CATEGORY_ICONS. */
export const CATEGORY_COLORS: Record<string, string> = {
  'germetyky':          '#4880B8',
  'sylikonovi-germetyky': '#4880B8',
  'akrylovi-germetyky': '#4880B8',
  'poliuretanovi-germetyky': '#4880B8',
  'bitumni-germetyky':  '#4880B8',
  'ms-polymerni-hermetyky': '#4880B8',
  'montazhna-pina':     '#7B8CC8',
  'pistoletna-pina':    '#7B8CC8',
  'pobutova-pina':      '#7B8CC8',
  'vohnezakhysna-pina': '#C06A45',
  'klei':               '#B08540',
  'kley':               '#B08540',
  'montazhnyi-klei':    '#B08540',
  'klei-dlya-plytky':   '#B08540',
  'pva-ta-stolyarnyi':  '#B08540',
  'epoksydni-klei':     '#8467B8',
  'grunty':             '#B77748',
  'gruntivky':          '#B77748',
  'gruntivky-gotovi':   '#B77748',
  'betonokontakt':      '#B77748',
  'antygrybok':         '#4E9E68',
  'shpaklivky':         '#B77748',
  'vologopoglinachi':   '#45A5B8',
  'hidroizolyatsiya':   '#35809E',
  'hidroizolyatsiyni-mastyky': '#35809E',
  'bitumni-mastyky':    '#35809E',
  'praimery':           '#B77748',
  'zakhyst-derevyny':   '#5F9150',
  'antyseptyki':        '#5F9150',
  'morylky':            '#5F9150',
  'zakhysni-pokryttya': '#5F9150',
  'strichky':           '#C68A3E',
  'malyarna-strichka':  '#C68A3E',
  'hermetyzuyucha-strichka': '#C68A3E',
  'zvukoizolyatsiyna-strichka': '#C68A3E',
  'kriplennya':         '#7183A0',
  'zamazky-dlya-shviv': '#94806B',
  'zamazky-tsementni':  '#94806B',
  'zamazky-epoksydni':  '#94806B',
  'plastyfikatory':     '#8467B8',
  'instrumenty':        '#5E7287',
  'pistolety':          '#5E7287',
  'rozchynnyky':        '#C06A45',
  'farby':                  '#B25E93',
  'alkidni-farby':          '#B25E93',
  'farby-dlya-radiatoriv':  '#B25E93',
};

/* Частини слагів (напр. gruntivky-kontsentraty) немає в мапах — тоді беремо
   родину батька, щоб заголовок і сайдбар не розійшлися в кольорах. */
export function categoryAccent(slug?: string | null, parentSlug?: string | null): string | undefined {
  if (slug && CATEGORY_COLORS[slug]) return CATEGORY_COLORS[slug];
  if (parentSlug && CATEGORY_COLORS[parentSlug]) return CATEGORY_COLORS[parentSlug];
  return undefined;
}

export function categoryIcon(slug?: string | null, parentSlug?: string | null): FC<LucideProps> | undefined {
  if (slug && CATEGORY_ICONS[slug]) return CATEGORY_ICONS[slug];
  if (parentSlug && CATEGORY_ICONS[parentSlug]) return CATEGORY_ICONS[parentSlug];
  return undefined;
}

