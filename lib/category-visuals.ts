import { Package, Pen, SprayCan, Paintbrush, Bolt, FlaskConical, Layers, AlignJustify, Shield, Droplets, Hammer, Grid3x3, CloudRain } from 'lucide-react';
import type { FC } from 'react';
import type { LucideProps } from 'lucide-react';
import { CATEGORY_ICONS } from './category-icons';

export const CAT_COLORS = ['#1E3A5F', '#0891B2', '#7C3AED', '#D97706', '#059669', '#DC2626', '#0EA5E9'];
export const CAT_ICONS: FC<LucideProps>[] = [Package, Pen, SprayCan, Paintbrush, FlaskConical, Layers, Bolt, AlignJustify];

// Іконка за slug категорії
const SLUG_ICON: Record<string, FC<LucideProps>> = {
  'germetyky':          Pen,
  'montazhna-pina':     SprayCan,
  'klei':               Droplets,
  'farby':              Paintbrush,
  'gruntivky':          Layers,
  'hidroizolyatsiya':   Shield,
  'kriplennya':         Bolt,
  'instrumenty':        Hammer,
  'strichky':           AlignJustify,
  'plastyfikatory':     FlaskConical,
  'vologopoglinachi':   CloudRain,
  'zamazky-dlya-shviv': Grid3x3,
  'zakhyst-derevyny':   Package,
};

// Колір за slug
const SLUG_COLOR: Record<string, string> = {
  'germetyky':          '#0891B2',
  'montazhna-pina':     '#7C3AED',
  'klei':               '#D97706',
  'farby':              '#DC2626',
  'gruntivky':          '#059669',
  'hidroizolyatsiya':   '#0EA5E9',
  'kriplennya':         '#475569',
  'instrumenty':        '#1E3A5F',
  'strichky':           '#9333EA',
  'plastyfikatory':     '#0D9488',
  'vologopoglinachi':   '#2563EB',
  'zamazky-dlya-shviv': '#B45309',
  'zakhyst-derevyny':   '#65A30D',
};

export function getCatIcon(slug: string, fallbackIdx: number): FC<LucideProps> {
  return CATEGORY_ICONS[slug] ?? SLUG_ICON[slug] ?? CAT_ICONS[fallbackIdx % CAT_ICONS.length];
}

export function getCatColor(slug: string, fallbackIdx: number): string {
  return SLUG_COLOR[slug] ?? CAT_COLORS[fallbackIdx % CAT_COLORS.length];
}

export function catDescription(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('герметик'))        return 'Силіконові, акрилові, поліуретанові, бітумні';
  if (n.includes('піна'))            return 'Під пістолет, побутова, вогнезахисна, піна-клей';
  if (n.includes('клей'))            return 'Рідкі цвяхи, монтажний, ПВА, суперклей';
  if (n.includes('фарб'))            return 'Водоемульсійні, алкідні, лаки, колоранти';
  if (n.includes('ґрунтовк'))        return 'Готові, концентрати, шпаклівки, антигрибок';
  if (n.includes('гідроізол'))       return 'Мастики, праймери, ізоляційні стрічки';
  if (n.includes('кріплен'))         return 'Дюбелі, анкери, шурупи, саморізи';
  if (n.includes('інструмент'))      return 'Пістолети, шпателі, кисті, шліфувальний';
  if (n.includes('стрічк'))          return 'Герметизуюча, малярна, для швів, звукоізоляційна';
  if (n.includes('пластифікат'))     return 'Для бетону, розчинів та підлог з підігрівом';
  if (n.includes('волого'))          return 'Поглиначі вологи для приміщень Ceresit';
  if (n.includes('замазк') || n.includes('шов')) return 'Цементні CE33/CE40, епоксидні затирки';
  if (n.includes('захист') || n.includes('дерев')) return 'Антисептики, морилки, захисні покриття';
  return 'Широкий вибір, оптові ціни';
}
