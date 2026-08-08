/**
 * Кастомні іконки в стилі lucide (24×24, stroke, currentColor) — для категорій,
 * яким у lucide немає влучного образу. Інтерфейс сумісний із LucideProps,
 * тож у CATEGORY_ICONS вони живуть нарівні зі штатними.
 */
import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';

/** Дюбель-«грибок» для кріплення пінопласту: капелюх-тарілка і стрижень з вістрям. */
export const MushroomAnchor = forwardRef<SVGSVGElement, LucideProps>(
  function MushroomAnchor({ size = 24, color = 'currentColor', strokeWidth = 2, ...rest }, ref) {
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...rest}
      >
        <g transform="rotate(-45 12 12)">
          <ellipse cx="12" cy="6" rx="7.5" ry="2.2" />
          <path d="M12 3.8V1.8" />
          <path d="M10.5 1.8h3" />
          <path d="M10.75 8.2v11.8l1.25 2.8 1.25-2.8V8.2" />
          <path d="M10.75 11.5l-1.6 1.2" />
          <path d="M13.25 11.5l1.6 1.2" />
          <path d="M10.75 14.5l-1.6 1.2" />
          <path d="M13.25 14.5l1.6 1.2" />
          <path d="M10.75 17.5l-1.6 1.2" />
          <path d="M13.25 17.5l1.6 1.2" />
        </g>
      </svg>
    );
  },
);

/** Рулон стрічки/сітки: котушка з відмотаним хвостом. */
export const TapeRoll = forwardRef<SVGSVGElement, LucideProps>(
  function TapeRoll({ size = 24, color = 'currentColor', strokeWidth = 2, ...rest }, ref) {
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...rest}
      >
        <circle cx="16.5" cy="9.5" r="5.5" />
        <circle cx="16.5" cy="9.5" r="1.8" />
        <path d="M2 15h14.5" />
      </svg>
    );
  },
);

/** Шов герметика між двома поверхнями: пряма — хвиля — пряма
    (варіант №6, обраний власником із листа sealant-10). */
export const SealantSeam = forwardRef<SVGSVGElement, LucideProps>(
  function SealantSeam({ size = 24, color = 'currentColor', strokeWidth = 2, ...rest }, ref) {
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...rest}
      >
        <path d="M4 6.5h16" />
        <path d="M4 12c1.3-1.2 2.7-1.2 4 0s2.7 1.2 4 0 2.7-1.2 4 0 2.7 1.2 4 0" />
        <path d="M4 17.5h16" />
      </svg>
    );
  },
);
