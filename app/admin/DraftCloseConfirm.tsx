'use client';

// Спільне підтвердження закриття чернетки для всіх менеджерів документів.
// Раніше кожен ніс власну копію: три показували плашку над своєю вкладкою
// внизу зліва, а замовлення постачальнику — по центру із затемненням. Питання
// «видалити незбережене?» унизу зліва легко пропустити, тому лишили центр.
export default function DraftCloseConfirm({ onCancel, onConfirm }: {
  onCancel:  () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="doc-confirm-overlay" onClick={onCancel}>
      <div className="doc-confirm" onClick={e => e.stopPropagation()}>
        <div className="doc-confirm-title">Закрити без збереження?</div>
        <div className="doc-confirm-text">
          Незбережені дані чернетки будуть видалені назавжди.
          Щоб зберегти — натисніть «Скасувати» і збережіть як чернетку.
        </div>
        <div className="doc-confirm-btns">
          <button className="proc-btn" onClick={onCancel}>Скасувати</button>
          <button className="proc-btn danger" onClick={onConfirm}>Так, закрити</button>
        </div>
      </div>
    </div>
  );
}
