/**
 * Категорії Google (google_product_category) для фіду Merchant Center.
 *
 * Навіщо: без цього атрибута Google сам вгадує, що за товар у картці, і для
 * будхімії вгадує погано («герметик» ↔ «клей» ↔ «фарба»). Явний ID з таксономії
 * покращує матчинг із запитами в Shopping і в ШІ-шопінгу (AI Mode читає ті
 * самі безкоштовні лістинги). Ідентифікатори — з
 * https://www.google.com/basepages/producttype/taxonomy-with-ids.en-US.txt
 * (звірено 26.09.2026); ID стабільні між мовами, тому один і той самий для
 * uk- і ru-фіду.
 *
 * Мапа — по слагу категорії; дочірня без свого запису бере батьківський.
 * Категорія без відповідника — атрибут просто не виводиться (краще ніж
 * помилковий).
 */

const IDS = {
  SEALANTS: 503744,          // Hardware > Building Consumables > Protective Coatings & Sealants
  ADHESIVES: 503742,         // Hardware > Building Consumables > Hardware Glue & Adhesives
  INSULATION: 122,           // Hardware > Building Materials > Insulation
  SOLVENTS: 503741,          // Hardware > Building Consumables > Solvents, Strippers & Thinners
  MORTAR_MIXES: 2282,        // … > Masonry Consumables > Cement, Mortar & Concrete Mixes
  MASONRY: 503743,           // Hardware > Building Consumables > Masonry Consumables
  GROUT: 499876,             // … > Masonry Consumables > Grout
  TAPE: 2212,                // Hardware > Building Consumables > Hardware Tape
  PRIMERS: 2058,             // … > Painting Consumables > Primers
  PAINT: 1361,               // … > Painting Consumables > Paint
  PAINTING: 503740,          // Hardware > Building Consumables > Painting Consumables
  STAINS: 1648,              // … > Painting Consumables > Stains
  VARNISHES: 503738,         // … > Painting Consumables > Varnishes & Finishes
  CHEMICALS: 2277,           // Hardware > Building Consumables > Chemicals
  WALL_PATCHING: 505802,     // Hardware > Building Consumables > Wall Patching Compounds & Plaster
  LUBRICANTS: 1753,          // Hardware > Building Consumables > Lubricants
  MOISTURE_ABSORBERS: 7406,  // Home & Garden > Household Supplies > Moisture Absorbers
  TOOLS_CAULKING: 1215,      // Hardware > Tools > Caulking Tools
  TOOLS_MEASURING: 1305,     // Hardware > Tools > Measuring Tools & Sensors
  TOOLS_BRUSHES: 1300,       // Hardware > Tools > Paint Tools > Paint Brushes
  TOOLS_PUTTY_KNIVES: 1202,  // Hardware > Tools > Putty Knives & Scrapers
  TOOL_ACCESSORIES: 3650,    // Hardware > Tool Accessories
  GRINDING_WHEELS: 499860,   // Hardware > Tool Accessories > Grinder Accessories > Grinding Wheels & Points
  SANDING: 4487,             // Hardware > Tool Accessories > Sanding Accessories
  DRILL_BITS: 1540,          // … > Drill & Screwdriver Accessories > Drill & Screwdriver Bits
  FASTENERS: 500054,         // Hardware > Hardware Accessories > Hardware Fasteners
  SCREWS: 2251,              // … > Hardware Fasteners > Screws
  REMESH: 503777,            // Hardware > Building Materials > Rebar & Remesh
} as const;

const BY_SLUG: Record<string, number> = {
  // Герметики
  germetyky: IDS.SEALANTS,
  // Монтажна піна
  'montazhna-pina': IDS.INSULATION,
  'pina-klei': IDS.ADHESIVES,
  ochysnyky: IDS.SOLVENTS,
  // Клеї
  klei: IDS.ADHESIVES,
  'klei-dlya-plytky': IDS.MORTAR_MIXES,
  // Гідроізоляція
  hidroizolyatsiya: IDS.SEALANTS,
  'izolyatsiyni-strichky': IDS.TAPE,
  // Ґрунтовки та шпаклівки
  gruntivky: IDS.PRIMERS,
  antygrybok: IDS.CHEMICALS,
  shpaklivky: IDS.WALL_PATCHING,
  // Фарби та покриття
  farby: IDS.PAINT,
  'farby-3v1': IDS.PAINT,   // хаб другого рівня: його діти (алкідні/акрилові/молоткові) інакше лишались би без ID
  grunty: IDS.PRIMERS,
  mastyla: IDS.LUBRICANTS,
  koloranty: IDS.PAINTING,
  laky: IDS.VARNISHES,
  rozchynnyky: IDS.SOLVENTS,
  // Захист дерева
  'zakhyst-derevyny': IDS.SEALANTS,
  'zakhysni-pokryttya': IDS.VARNISHES,
  morylky: IDS.STAINS,
  // Інше
  plastyfikatory: IDS.MASONRY,
  'zamazky-dlya-shviv': IDS.GROUT,
  vologopoglinachi: IDS.MOISTURE_ABSORBERS,
  // Інструменти
  instrumenty: IDS.TOOL_ACCESSORIES,
  'vidrizni-dysky': IDS.GRINDING_WHEELS,
  'bury-ta-sverdla': IDS.DRILL_BITS,
  'pistolety-dlya-piny': IDS.TOOLS_CAULKING,
  pistolety: IDS.TOOLS_CAULKING,
  vymiriuvalny: IDS.TOOLS_MEASURING,
  'kysti-ta-valy': IDS.TOOLS_BRUSHES,
  shlifuvalny: IDS.SANDING,
  shpateli: IDS.TOOLS_PUTTY_KNIVES,
  // Кріплення
  kriplennya: IDS.FASTENERS,
  'shurupy-ta-samorizy': IDS.SCREWS,
  // Сітки, стрічки, склополотно
  strichky: IDS.TAPE,
  sklopolotno: IDS.REMESH,
  'sitky-armuvalni': IDS.REMESH,
};

/** Повні назви гілок таксономії — для Product.category у JSON-LD (Google приймає шлях або ID; шлях читабельніший для ШІ-краулерів). */
const PATHS: Record<number, string> = {
  [IDS.SEALANTS]: 'Hardware > Building Consumables > Protective Coatings & Sealants',
  [IDS.ADHESIVES]: 'Hardware > Building Consumables > Hardware Glue & Adhesives',
  [IDS.INSULATION]: 'Hardware > Building Materials > Insulation',
  [IDS.SOLVENTS]: 'Hardware > Building Consumables > Solvents, Strippers & Thinners',
  [IDS.MORTAR_MIXES]: 'Hardware > Building Consumables > Masonry Consumables > Cement, Mortar & Concrete Mixes',
  [IDS.MASONRY]: 'Hardware > Building Consumables > Masonry Consumables',
  [IDS.GROUT]: 'Hardware > Building Consumables > Masonry Consumables > Grout',
  [IDS.TAPE]: 'Hardware > Building Consumables > Hardware Tape',
  [IDS.PRIMERS]: 'Hardware > Building Consumables > Painting Consumables > Primers',
  [IDS.PAINT]: 'Hardware > Building Consumables > Painting Consumables > Paint',
  [IDS.PAINTING]: 'Hardware > Building Consumables > Painting Consumables',
  [IDS.STAINS]: 'Hardware > Building Consumables > Painting Consumables > Stains',
  [IDS.VARNISHES]: 'Hardware > Building Consumables > Painting Consumables > Varnishes & Finishes',
  [IDS.CHEMICALS]: 'Hardware > Building Consumables > Chemicals',
  [IDS.WALL_PATCHING]: 'Hardware > Building Consumables > Wall Patching Compounds & Plaster',
  [IDS.LUBRICANTS]: 'Hardware > Building Consumables > Lubricants',
  [IDS.MOISTURE_ABSORBERS]: 'Home & Garden > Household Supplies > Moisture Absorbers',
  [IDS.TOOLS_CAULKING]: 'Hardware > Tools > Caulking Tools',
  [IDS.TOOLS_MEASURING]: 'Hardware > Tools > Measuring Tools & Sensors',
  [IDS.TOOLS_BRUSHES]: 'Hardware > Tools > Paint Tools > Paint Brushes',
  [IDS.TOOLS_PUTTY_KNIVES]: 'Hardware > Tools > Putty Knives & Scrapers',
  [IDS.TOOL_ACCESSORIES]: 'Hardware > Tool Accessories',
  [IDS.GRINDING_WHEELS]: 'Hardware > Tool Accessories > Grinder Accessories > Grinding Wheels & Points',
  [IDS.SANDING]: 'Hardware > Tool Accessories > Sanding Accessories',
  [IDS.DRILL_BITS]: 'Hardware > Tool Accessories > Drill & Screwdriver Accessories > Drill & Screwdriver Bits',
  [IDS.FASTENERS]: 'Hardware > Hardware Accessories > Hardware Fasteners',
  [IDS.SCREWS]: 'Hardware > Hardware Accessories > Hardware Fasteners > Screws',
  [IDS.REMESH]: 'Hardware > Building Materials > Rebar & Remesh',
};

/** Шлях таксономії Google для категорії магазину (Product.category у JSON-LD); null — без атрибута. */
export function googleProductCategoryPath(slug: string | null, parentSlug: string | null): string | null {
  const id = googleProductCategoryId(slug, parentSlug);
  return id ? PATHS[id] ?? null : null;
}

/** ID категорії Google для категорії магазину; дочірня без запису бере батьківську. */
export function googleProductCategoryId(slug: string | null, parentSlug: string | null): number | null {
  if (slug && BY_SLUG[slug]) return BY_SLUG[slug];
  if (parentSlug && BY_SLUG[parentSlug]) return BY_SLUG[parentSlug];
  return null;
}
