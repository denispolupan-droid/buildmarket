'use client';

import { useSyncExternalStore } from 'react';
import type { CategoryMeta } from './category-descriptions';

/**
 * Місток між ShopClient і серверно-відрендереними шапкою категорії
 * (CategoryHeader) та блоком «Про категорію» (CategoryAbout).
 *
 * Навіщо. Вибір категорії в сайдбарі — миттєвий клієнтський фільтр з
 * history.pushState, БЕЗ навігації: справжня навігація на кожен клік
 * перевантажувала всю сторінку (повний RSC-своп на ~150 КБ і перерендер
 * сотень карток) — пів секунди «завмирання», яке читалось як смикання.
 * Але шапка і «Про категорію» рендеряться сервером і про pushState не
 * знають — саме так у шапці колись зависала попередня категорія.
 *
 * Рішення: ShopClient при перемиканні публікує сюди готові дані, а
 * CategoryHeader/CategoryAbout (клієнтські компоненти з серверним
 * первинним рендером) підписані і показують живі дані замість пропсів.
 *
 * targetPath захищає від протухання: опубліковане діє лише поки адреса
 * збігається. Після справжньої навігації (хлібні крихти, «назад»)
 * pathname інший → компоненти повертаються до свіжих серверних пропсів.
 *
 * SEO це не зачіпає: при прямому заході сторінка віддається сервером із
 * пропсами — увесь текст у HTML; стор порожній до першої взаємодії.
 */

export type CategoryHeaderData = {
  lang: 'uk' | 'ru';
  name: string;
  parent: { name: string; slug: string } | null;
  description: string | null;
  count: number;
};

export type CategoryAboutData = {
  lang: 'uk' | 'ru';
  name: string;
  meta: CategoryMeta;
};

export type CategoryView = {
  targetPath: string;
  header: CategoryHeaderData | null;
  about: CategoryAboutData | null;
};

let view: CategoryView | null = null;
const subs = new Set<() => void>();

export function publishCategoryView(next: CategoryView | null) {
  view = next;
  subs.forEach(f => f());
}

function subscribe(f: () => void) {
  subs.add(f);
  return () => { subs.delete(f); };
}

// Звіряємось із location.pathname, а НЕ з usePathname: ручний pushState повз
// роутер usePathname не оновлює, і перевірка по ньому забракувала б щойно
// опубліковані дані. location — джерело правди про поточну адресу.
const getSnapshot = () => (view && view.targetPath === window.location.pathname ? view : null);
// На сервері стора немає — компоненти рендерять пропси
const getServerSnapshot = () => null;

/** Живі дані, якщо вони опубліковані для поточної адреси; інакше null. */
export function useCategoryView(): CategoryView | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
