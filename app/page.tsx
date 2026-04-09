export default function Home() {
  return (
    <main className="min-h-screen bg-white">

      {/* Шапка */}
      <header className="border-b border-gray-100 px-8 py-4 flex items-center justify-between">
        <div className="text-xl font-semibold tracking-wide text-gray-900">
          BUILDMARKET
        </div>
        <nav className="flex gap-8 text-sm text-gray-500">
          <a href="#" className="hover:text-gray-900">Каталог</a>
          <a href="#" className="hover:text-gray-900">О компании</a>
          <a href="#" className="hover:text-gray-900">Контакты</a>
        </nav>
        <button className="text-sm border border-gray-900 px-4 py-2 hover:bg-gray-900 hover:text-white transition-colors">
          Войти
        </button>
      </header>

      {/* Герой-блок */}
      <section className="px-8 py-24 max-w-4xl">
        <p className="text-sm text-amber-700 tracking-widest uppercase mb-4">
          Оптовые поставки
        </p>
        <h1 className="text-5xl font-light text-gray-900 leading-tight mb-6">
          Строительные материалы<br />
          для профессионалов
        </h1>
        <p className="text-lg text-gray-400 mb-10 max-w-xl">
          Продажа от 1 упаковки. Только для юридических лиц и ФЛП.
          Доставка Новой Поштой по всей Украине.
        </p>
        <div className="flex gap-4">
          <button className="bg-gray-900 text-white px-8 py-3 text-sm hover:bg-gray-700 transition-colors">
            Смотреть каталог
          </button>
          <button className="border border-gray-300 text-gray-600 px-8 py-3 text-sm hover:border-gray-900 transition-colors">
            Зарегистрироваться
          </button>
        </div>
      </section>

      {/* Преимущества */}
      <section className="px-8 py-16 border-t border-gray-100">
        <div className="grid grid-cols-3 gap-12 max-w-4xl">
          <div>
            <div className="text-2xl font-light text-gray-900 mb-2">От 1 упаковки</div>
            <div className="text-sm text-gray-400">Минимальный заказ — одна упаковка товара, без ограничений по сумме</div>
          </div>
          <div>
            <div className="text-2xl font-light text-gray-900 mb-2">Оптовые цены</div>
            <div className="text-sm text-gray-400">Цены доступны только после регистрации. Скидки при увеличении объёма</div>
          </div>
          <div>
            <div className="text-2xl font-light text-gray-900 mb-2">Нова Пошта</div>
            <div className="text-sm text-gray-400">Доставка по всей Украине. Расчёт стоимости автоматически при заказе</div>
          </div>
        </div>
      </section>

    </main>
  );
}