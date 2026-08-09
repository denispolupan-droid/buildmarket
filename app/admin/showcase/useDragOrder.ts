'use client';

import { useState } from 'react';
import { reorderList } from '../../../lib/reorder';

/**
 * Перетягування рядків мишею (штатний HTML5 drag-and-drop, без бібліотек).
 * Кнопки ↑↓ навмисно лишаються поруч: HTML5-перетягування не працює на тач-
 * екранах і з клавіатури, тож без них редагування з телефона було б неможливе.
 */
export function useDragOrder(order: string[], setOrder: (next: string[]) => void) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  function rowProps(index: number) {
    return {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        setDragFrom(index);
        e.dataTransfer.effectAllowed = 'move';
        // Firefox ігнорує перетягування без даних у dataTransfer
        e.dataTransfer.setData('text/plain', String(index));
      },
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragOver !== index) setDragOver(index);
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        if (dragFrom !== null) setOrder(reorderList(order, dragFrom, index));
        setDragFrom(null);
        setDragOver(null);
      },
      onDragEnd: () => { setDragFrom(null); setDragOver(null); },
    };
  }

  /** Підсвітка: сам рядок блідне, місце вставки позначаємо лінією зверху */
  function rowStyle(index: number): React.CSSProperties {
    const isDragging = dragFrom === index;
    const isTarget   = dragOver === index && dragFrom !== null && dragFrom !== index;
    return {
      cursor: 'grab',
      opacity: isDragging ? 0.4 : 1,
      boxShadow: isTarget ? 'inset 0 2px 0 0 #4880B8' : undefined,
    };
  }

  return { rowProps, rowStyle };
}
