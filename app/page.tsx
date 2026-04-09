export default function Home() {
  const cats = [
    "Контактні клеї",
    "Супер клеї",
    "Обойні клеї",
    "Герметики",
    "Монтажні піни",
    "Рідкі цвяхи",
    "Клейкі стрічки",
    "Скотч",
    "Побутова хімія",
    "Інструменти",
  ];

  const products = [
    { name: "Клей Момент 10 кг", pack: "1 шт / уп", price: "1 100" },
    { name: "Супер клей Момент", pack: "12 шт / уп", price: "210" },
    { name: "Герметик Sila", pack: "25 шт / уп", price: "1 500" },
    { name: "Піна Repozit 85", pack: "12 шт / уп", price: "1 100" },
  ];

  return (<div className="min-h-screen bg-white">
      <header className="border-b border-gray-100 sticky top-0 bg-white z-50">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-6">
          <div className="w-48 shrink-0">
            <div className="font-bold text-gray-900">BUILDMARKET</div>
            <div className="text-xs text-gray-400">оптові поставки</div>
          </div>
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Знайти клей, герметик..."
              className="w-full border border-gray-200 rounded px-4 py-2 pr-24 text-sm focus:outline-none"
            />
            <button className="absolute right-0 top-0 h-full px-5 bg-gray-900 text-white rounded-r text-sm">
              Знайти
            </button>
          </div>
          <div className="text-sm font-semibold text-gray-900 shrink-0">
            +38 (067) 000-00-00
          </div>
          <button className="bg-gray-900 text-white px-4 py-2 rounded text-sm shrink-0">
            Кошик 0
          </button>
        </div>
      </header><div className="max-w-7xl mx-auto px-6">
        <div className="flex gap-8 py-6">
          <aside className="w-52 shrink-0">
            <div className="bg-gray-900 text-white px-4 py-3 rounded-t text-sm font-semibold">
              Каталог
            </div>
            <nav className="border border-t-0 border-gray-100 rounded-b">
              {cats.map((cat) => (
                <a key={cat} href="#" className="flex items-center justify-between px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                  <span>{cat}</span>
                </a>
              ))}
            </nav>
          </aside>
          <div className="flex-1 min-w-0">
            <div className="bg-gray-50 rounded-xl p-8 mb-8 flex items-center gap-8">
              <div className="flex-1">
                <p className="text-xs text-amber-600 uppercase tracking-widest mb-3">
                  Оптові поставки
                </p>
                <h1 className="text-3xl font-light text-gray-900 leading-tight mb-4">
                  Клеї, герметики<br />і будівельна хімія оптом
                </h1>
                <p className="text-sm text-gray-500 mb-1">Відвантаження від 1 упаковки.</p>
                <p className="text-sm text-gray-500 mb-6">Швидка доставка по Україні.</p>
                <div className="flex gap-3">
                  <button className="bg-gray-900 text-white px-6 py-2.5 text-sm rounded">
                    Дивитись каталог
                  </button>
                  <button className="border border-gray-300 text-gray-600 px-6 py-2.5 text-sm rounded">
                    Швидке замовлення
                  </button>
                </div>
              </div>
              <div className="w-72 h-48 bg-gray-200 rounded-lg flex items-center justify-center text-gray-400 text-sm shrink-0">
                фото товарів
              </div>
            </div><section className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-light text-gray-900">Хіти продажів</h2>
                <a href="#" className="text-sm text-gray-400 hover:text-gray-900">Всі товари</a>
              </div>
              <div className="grid grid-cols-4 gap-4">
                {products.map((p) => (
                  <div key={p.name} className="border border-gray-100 rounded-lg p-4 hover:shadow-sm transition-all">
                    <div className="w-full h-32 bg-gray-100 rounded mb-3 flex items-center justify-center text-gray-300 text-xs">
                      фото
                    </div>
                    <div className="text-sm font-medium text-gray-800 mb-1">{p.name}</div>
                    <div className="text-xs text-gray-400 mb-3">{p.pack}</div>
                    <div className="text-lg font-semibold text-gray-900">₴ {p.price}</div>
                    <div className="text-xs text-gray-400 mb-3">/ упаковка</div>
                    <button className="w-full bg-gray-900 text-white py-2 text-xs rounded hover:bg-gray-700 transition-colors">
                      В кошик
                    </button>
                  </div>
                ))}
              </div>
            </section></div>
        </div>
      </div>
      <footer className="border-t border-gray-100 mt-4">
        <div className="max-w-7xl mx-auto px-6 py-8 flex justify-between items-center">
          <div className="font-bold text-gray-900">BUILDMARKET</div>
          <div className="text-xs text-gray-400">+38 (067) 000-00-00</div>
        </div>
      </footer>
    </div>
  );
}