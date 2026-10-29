'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { resolveDeliverySubtype } from '../../../lib/np-postomat';
import type { CourierAddressResult, StreetSuggestion } from '../../../lib/np-address';
import { legalRecipientFromCustomer, taxNumberLabel, type LegalRecipient } from '../../../lib/np-legal-recipient';
import { X, Search, MapPin, Loader2, Package, CreditCard, Truck, Banknote, Building2, User } from 'lucide-react';
import SeatsStepper, { SameSeatsToggle, sameSeatsLabel, useSeats } from './SeatsStepper';

type SeatRow = { weight: string; width: string; height: string; length: string };

type Settlement = { Ref: string; Present: string; MainDescription: string; Area: string; RegionsDescription: string };
type Warehouse  = { Ref: string; Description: string; Number: string; CityRef: string };
type SenderWH   = { ref: string; cityRef: string; description: string; number: string };

type SenderInfo = {
  ref: string; cityRef: string; contactRef: string; phone: string;
  warehouses: SenderWH[];
  senderType: 'warehouse' | 'address';
  senderStreet: string;
  addressRef: string;
  addressDesc: string;
};

type WeightLine = { sku: string; volume: string | null; weightKg: number; qty: number; totalKg: number };

type OrderSnap = {
  id: string;
  mergedIds?: string[];
  contact: string;
  phone: string;
  total_price: number;
  payment_type: string;
  total_qty: number;
  items: { sku: string; qty: number; name: string }[];
  delivery_city_ref: string | null;
  delivery_city_name: string | null;
  delivery_warehouse_ref: string | null;
  delivery_subtype?: string | null;
  delivery_address?: string | null;
  /** Прив'язаний контрагент — з його картки беремо юрособу-одержувача */
  customer_id?: string | null;
  /** Рахунок на підприємство — тоді й накладну за замовчуванням на юрособу */
  invoice_as_company?: boolean | null;
};

type Props = { order: OrderSnap; onClose: () => void; onCreated: (ttn: string) => void };

async function npRequest(modelName: string, calledMethod: string, methodProperties: object) {
  const res = await fetch('/api/novaposhta', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modelName, calledMethod, methodProperties }),
  });
  const data = await res.json();
  return data.success ? data.data : [];
}

function splitContact(contact: string) {
  const parts = contact.trim().split(/\s+/);
  return { lastName: parts[0] ?? '', firstName: parts[1] ?? '', middleName: parts[2] ?? '' };
}

// Витягуємо «вулиця, будинок, квартира» з людського рядка адреси доставки для
// авто-підстановки в поле кур'єра. Рядок зазвичай має вигляд «Місто, вул. Х, 12»
// (або з областю в дужках) — прибираємо назву міста / беремо від маркера вулиці.
function streetFromAddress(address: string | null | undefined, cityName: string | null | undefined): string {
  let s = (address || '').trim();
  if (!s) return '';
  const marker = s.match(/(?:вул\.?|вулиця|просп\.?|проспект|пров\.?|провулок|бул\.?|бульвар|пл\.?|площа|наб\.?|набережна|ш\.?|шосе)\s+.*/i);
  if (marker) return marker[0].trim();
  const cn = (cityName || '').trim();
  if (cn && s.toLowerCase().startsWith(cn.toLowerCase())) {
    s = s.slice(cn.length).replace(/^[\s,:-]+/, '');
  }
  return s.trim();
}

const inp: React.CSSProperties = {
  height: '36px', padding: '0 10px',
  border: '1px solid var(--border)', borderRadius: '8px',
  fontSize: '13px', outline: 'none', boxSizing: 'border-box', width: '100%',
  color: 'var(--text-primary)', background: 'var(--bg-soft)',
};
const lbl: React.CSSProperties = {
  fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)',
  marginBottom: '4px', display: 'block',
  textTransform: 'uppercase', letterSpacing: '0.04em',
};
/** Рядок місця: № · вага · Ш · В · Д · прибрати */
const seatGrid = '16px 1.3fr 1fr 1fr 1fr 22px';
const secTitle: React.CSSProperties = {
  fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.06em',
  marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '5px',
};
const dropStyle: React.CSSProperties = {
  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 100,
  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px',
  boxShadow: '0 8px 24px rgba(0,0,0,0.22)', maxHeight: '200px', overflowY: 'auto',
};
const dropBtn: React.CSSProperties = {
  width: '100%', padding: '8px 12px', background: 'none', border: 'none',
  cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid var(--border-light)',
  fontSize: '12px', color: 'var(--text-primary)',
};

export default function CreateTTNModal({ order, onClose, onCreated }: Props) {
  const initial = splitContact(order.contact);
  const isCod = order.payment_type === 'cod';

  // У БД адресна доставка зберігається як 'address' (Prom/Rozetka) або 'courier'/'doors' —
  // усе це модалка трактує як кур'єрську доставку до дверей.
  // Тип видачі беремо не лише з поля: Prom не розрізняє поштомат і відділення —
  // обидва приїжджають як 'warehouse', а «Поштомат №8771» лишається тільки в
  // тексті адреси. Модалка через це відкривалась на вкладці «Відділення», і
  // накладну виписували не туди, куди замовляв покупець. Перевірка тексту
  // рятує і старі замовлення в базі — без переімпорту.
  const resolvedSubtype = resolveDeliverySubtype(order.delivery_subtype, order.delivery_address);
  const initialSubtype: 'warehouse' | 'postomat' | 'courier' =
    resolvedSubtype === 'postomat' ? 'postomat'
    : (resolvedSubtype === 'courier' || resolvedSubtype === 'address' || resolvedSubtype === 'doors') ? 'courier'
    : 'warehouse';
  const [deliverySubtype, setDeliverySubtype] = useState<'warehouse' | 'postomat' | 'courier'>(initialSubtype);
  const isPostomat = deliverySubtype === 'postomat';
  const isCourier  = deliverySubtype === 'courier';

  // При адресній доставці одразу підставляємо адрес зі замовлення — менеджеру лишається перевірити.
  const [recipientAddress, setRecipientAddress] = useState(
    initialSubtype === 'courier' ? streetFromAddress(order.delivery_address, order.delivery_city_name) : '',
  );
  // Перевірка адреси в довіднику НП ДО створення ЕН: менеджер бачить, яку саме
  // вулицю НП підставить (або список схожих, якщо не знайшло) і може обрати
  // з них. Раніше про «Вулицю не знайдено» дізнавались лише з помилки кнопки.
  const [addrCheck, setAddrCheck] = useState<{ status: 'idle' | 'loading' | 'done'; result: CourierAddressResult | null }>({ status: 'idle', result: null });
  const [chosenStreet, setChosenStreet] = useState<StreetSuggestion | null>(null);
  const addrDebRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addrSeq = useRef(0);

  // Sender type override — null means "use whatever senderInfo says"
  const [senderTypeOverride, setSenderTypeOverride] = useState<'warehouse' | 'address' | null>(null);

  const [lastName,   setLastName]   = useState(initial.lastName);
  const [firstName,  setFirstName]  = useState(initial.firstName);
  const [middleName, setMiddleName] = useState(initial.middleName);
  const [phone,      setPhone]      = useState(order.phone);

  // Одержувач-юрособа з картки контрагента (ЄДРПОУ/РНОКПП). НП заводить її за
  // кодом, ПІБ і телефон вище стають контактною особою. За замовчуванням
  // вмикається, коли замовлення вже йде «на підприємство» (рахунок на юрособу).
  const [legal,         setLegal]         = useState<LegalRecipient | null>(null);
  const [legalLoading,  setLegalLoading]  = useState(!!order.customer_id);
  const [recipientType, setRecipientType] = useState<'private' | 'organization'>('private');
  const isOrganization = recipientType === 'organization';

  const [cityQuery,    setCityQuery]    = useState('');
  const [settlements,  setSettlements]  = useState<Settlement[]>([]);
  const [selectedCity, setSelectedCity] = useState<Settlement | null>(null);
  const [cityDropOpen, setCityDropOpen] = useState(false);
  const [cityLoading,  setCityLoading]  = useState(false);
  const [warehouses,   setWarehouses]   = useState<Warehouse[]>([]);
  const [whQuery,      setWhQuery]      = useState('');
  const [selectedWH,   setSelectedWH]   = useState<Warehouse | null>(null);
  const [whDropOpen,   setWhDropOpen]   = useState(false);
  const [whLoading,    setWhLoading]    = useState(false);

  const [senderInfo,    setSenderInfo]    = useState<SenderInfo | null>(null);
  const [senderLoading, setSenderLoading] = useState(true);
  const [senderError,   setSenderError]   = useState('');
  const [senderWH,      setSenderWH]      = useState<SenderWH | null>(null);
  const [senderWhQ,     setSenderWhQ]     = useState('');
  const [senderWhOpen,  setSenderWhOpen]  = useState(false);

  const [weightLines,   setWeightLines]   = useState<WeightLine[]>([]);
  const [weightLoading, setWeightLoading] = useState(false);
  // Місця відправлення, як у кабінеті НП: у кожного своя вага й габарити — НП
  // рахує об'ємну вагу по кожному окремо (OptionsSeat). Одне місце — перший рядок:
  // його вага — поле «Вага», габарити — блок поштомату.
  // Однакові місця (частіше так) — один рядок на всі; різні — рядок на кожне.
  const seatsCtl = useSeats<SeatRow>({ weight: '', width: '', height: '', length: '' });
  const { seats: seatRows, editRows, same: sameSeats, setAutoWeight, setField: setSeatField } = seatsCtl;
  const seatCount = seatsCtl.count;
  const multiSeat = seatCount > 1;
  const toNum = (s: string) => parseFloat(s.replace(',', '.'));
  const seatNums = seatRows.map(r => ({ weight: toNum(r.weight), width: toNum(r.width), height: toNum(r.height), length: toNum(r.length) }));
  const totalWeight = Number(seatNums.reduce((s, r) => s + (r.weight > 0 ? r.weight : 0), 0).toFixed(3));
  const dimsOk = (r: (typeof seatNums)[number]) => [r.width, r.height, r.length].every(n => Number.isFinite(n) && n > 0);
  // Габарити місць: усі або жодного (тоді НП візьме лише вагу); для поштомату — обов'язково
  const anyDims = seatRows.some(r => r.width || r.height || r.length);
  const needSeatDims = isPostomat || (multiSeat && anyDims);
  const [cost,          setCost]          = useState(String(Math.ceil(order.total_price)));
  const [description,   setDescription]   = useState('Будівельні матеріали');

  const [payerType, setPayerType] = useState<'Sender' | 'Recipient'>('Recipient');
  const paymentMethod = 'Cash';

  const [codEnabled, setCodEnabled] = useState(isCod);
  const [codAmount,  setCodAmount]  = useState(String(Math.ceil(order.total_price)));

  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState('');

  const cityRef     = useRef<HTMLDivElement>(null);
  const whRef       = useRef<HTMLDivElement>(null);
  const senderWhRef = useRef<HTMLDivElement>(null);
  const debRef      = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch('/api/admin/np-sender').then(r => r.json()).then(d => {
      if (d.error) { setSenderError(d.error); return; }
      setSenderInfo(d);
      if (d.warehouses?.length === 1) setSenderWH(d.warehouses[0]);
    }).catch(() => setSenderError('Не вдалося завантажити дані відправника'))
      .finally(() => setSenderLoading(false));
  }, []);

  useEffect(() => {
    if (!order.customer_id) return;
    fetch(`/api/admin/customers/search?id=${encodeURIComponent(order.customer_id)}`)
      .then(r => r.json())
      .then((rows: unknown) => {
        const lr = legalRecipientFromCustomer(Array.isArray(rows) ? rows[0] : null);
        setLegal(lr);
        if (lr && order.invoice_as_company) setRecipientType('organization');
      })
      .catch(() => {})
      .finally(() => setLegalLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const ref = order.delivery_city_ref;
    const name = order.delivery_city_name ?? '';

    if (ref) {
      setSelectedCity({ Ref: ref, Present: name, MainDescription: name, Area: '', RegionsDescription: '' });
      setCityQuery(name);
      setWhLoading(true);
      npRequest('Address', 'getWarehouses', { SettlementRef: ref, Limit: 500, Page: 1 })
        .then((data: Warehouse[]) => {
          const filtered = isPostomat ? data.filter(w => w.Description.toLowerCase().includes('поштомат')) : data;
          setWarehouses(filtered);
          const wRef = order.delivery_warehouse_ref;
          if (wRef) { const m = data.find(w => w.Ref === wRef); if (m) { setSelectedWH(m); setWhQuery(m.Description); } }
        }).finally(() => setWhLoading(false));
      return;
    }

    // No stored NP ref (Rozetka/Prom orders only give us a human-readable city name, not a
    // real Nova Poshta SettlementRef — confirmed live, their own ref_id doesn't resolve via
    // getWarehouses) — resolve the city by name via a live search instead, and prefill the
    // warehouse/postomat number parsed out of the free-text delivery address so the admin only
    // has to confirm a match rather than search from scratch.
    if (!name) return;
    setCityLoading(true);
    npRequest('Address', 'searchSettlements', { CityName: name, Limit: 5, Page: 1 })
      .then((data: { Addresses: Settlement[] }[]) => {
        const match = data[0]?.Addresses?.[0];
        if (!match) return;
        setSelectedCity(match);
        setCityQuery(match.Present);
        setWhLoading(true);

        // Big cities (e.g. Kyiv has 12000+ warehouses/postomats) blow straight past a 500-item
        // page, so the target department can be missing from the general list entirely. Run a
        // server-side FindByString search for the parsed number alongside the regular browse
        // list and merge them — guarantees the exact match is found regardless of city size,
        // while still leaving the full list available for a manual override.
        const numMatch = order.delivery_address?.match(/№\s*(\d+)/);
        const num = numMatch?.[1];
        const bulkPromise = npRequest('Address', 'getWarehouses', { SettlementRef: match.Ref, Limit: 500, Page: 1 });
        const targetedPromise = num
          ? npRequest('Address', 'getWarehouses', { SettlementRef: match.Ref, FindByString: num, Limit: 5, Page: 1 })
          : Promise.resolve([] as Warehouse[]);

        return Promise.all([bulkPromise, targetedPromise])
          .then(([bulkData, targetedData]: [Warehouse[], Warehouse[]]) => {
            const merged = [...targetedData, ...bulkData.filter(w => !targetedData.some(t => t.Ref === w.Ref))];
            const filtered = isPostomat ? merged.filter(w => w.Description.toLowerCase().includes('поштомат')) : merged;
            setWarehouses(filtered);
            if (num) {
              const wh = filtered.find(w => w.Number === num);
              if (wh) { setSelectedWH(wh); setWhQuery(wh.Description); }
              else setWhQuery(num);
              return;
            }
            // У селах відділення без «№» в адресі: «Пункт приймання-видачі (до 30 кг):
            // вул. Шкільна, 1-А» — парсити нема чого, і автопідбір мовчки не спрацьовував.
            const candidates = isPostomat ? filtered : filtered.filter(w => !w.Description.toLowerCase().includes('поштомат'));
            // Пункт у населеному пункті один — вибір однозначний
            if (candidates.length === 1) { setSelectedWH(candidates[0]); setWhQuery(candidates[0].Description); return; }
            // Кілька пунктів: Prom/Rozetka вставляють опис відділення НП в адресу
            // дослівно (з точністю до пробілів) — матчимо нормалізовані рядки
            const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
            const addr = norm(order.delivery_address ?? '');
            const byDesc = candidates.filter(w => addr.includes(norm(w.Description)));
            if (byDesc.length === 1) { setSelectedWH(byDesc[0]); setWhQuery(byDesc[0].Description); }
          }).finally(() => setWhLoading(false));
      })
      .finally(() => setCityLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!order.items?.length) return;
    setWeightLoading(true);
    fetch('/api/admin/order-weight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: order.items.map(i => ({ sku: i.sku, qty: i.qty })) }),
    })
      .then(r => r.json())
      .then(d => {
        setWeightLines(d.lines ?? []);
        if (d.totalWeightKg > 0) setAutoWeight(d.totalWeightKg);
      })
      .finally(() => setWeightLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function h(e: MouseEvent) {
      if (cityRef.current     && !cityRef.current.contains(e.target as Node))     setCityDropOpen(false);
      if (whRef.current       && !whRef.current.contains(e.target as Node))       setWhDropOpen(false);
      if (senderWhRef.current && !senderWhRef.current.contains(e.target as Node)) setSenderWhOpen(false);
    }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Підказка вулиці: та сама логіка, що й у /api/admin/create-ttn, тож у
  // накладну піде рівно те, що тут показано. Дебаунс 500 мс, стара відповідь
  // (менеджер ще друкує) ігнорується за лічильником.
  useEffect(() => {
    if (addrDebRef.current) clearTimeout(addrDebRef.current);
    setChosenStreet(null);
    if (!isCourier || !selectedCity || !recipientAddress.trim()) { setAddrCheck({ status: 'idle', result: null }); return; }
    const seq = ++addrSeq.current;
    setAddrCheck(s => ({ status: 'loading', result: s.result }));
    const settlementRef = selectedCity.Ref;
    const text = recipientAddress;
    addrDebRef.current = setTimeout(() => {
      fetch('/api/admin/np-street-resolve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, settlementRef, text }),
      })
        .then(r => r.json())
        .then((d: CourierAddressResult | { error: string }) => {
          if (seq !== addrSeq.current) return;
          if (!('ok' in d)) {
            setAddrCheck({ status: 'done', result: { ok: false, reason: 'not_found', error: d.error, parsed: { street: '', streetType: null, house: '', flat: '' }, suggestions: [] } });
            return;
          }
          setAddrCheck({ status: 'done', result: d });
        })
        .catch(() => { if (seq === addrSeq.current) setAddrCheck({ status: 'idle', result: null }); });
    }, 500);
    return () => { if (addrDebRef.current) clearTimeout(addrDebRef.current); };
  }, [isCourier, selectedCity, recipientAddress, order.id]);

  const searchCities = useCallback((q: string) => {
    if (q.length < 2) { setSettlements([]); return; }
    setCityLoading(true);
    npRequest('Address', 'searchSettlements', { CityName: q, Limit: 10, Page: 1 })
      .then((data: { Addresses: Settlement[] }[]) => { setSettlements(data[0]?.Addresses ?? []); setCityDropOpen(true); })
      .finally(() => setCityLoading(false));
  }, []);

  function handleCityInput(val: string) {
    setCityQuery(val); setSelectedCity(null);
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => searchCities(val), 350);
  }

  function selectCity(s: Settlement) {
    setSelectedCity(s); setCityQuery(s.Present); setCityDropOpen(false); setSettlements([]);
    setSelectedWH(null); setWhQuery(''); setWhLoading(true);
    npRequest('Address', 'getWarehouses', { SettlementRef: s.Ref, Limit: 500, Page: 1 })
      .then((data: Warehouse[]) => {
        const filtered = deliverySubtype === 'postomat'
          ? data.filter(w => w.Description.toLowerCase().includes('поштомат'))
          : data.filter(w => !w.Description.toLowerCase().includes('поштомат'));
        setWarehouses(filtered);
      }).finally(() => setWhLoading(false));
  }

  const filteredWH       = warehouses.filter(w => w.Description.toLowerCase().includes(whQuery.toLowerCase()) || w.Number.includes(whQuery));
  const filteredSenderWH = (senderInfo?.warehouses ?? []).filter(w => w.description.toLowerCase().includes(senderWhQ.toLowerCase()) || w.number.includes(senderWhQ));

  async function handleSubmit() {
    if (!selectedCity)    { setError('Оберіть місто одержувача'); return; }
    if (!isCourier && !selectedWH) { setError('Оберіть відділення одержувача'); return; }
    if (isCourier && !recipientAddress.trim()) { setError('Вкажіть адресу доставки кур\'єром'); return; }
    if (!senderInfo)      { setError('Дані відправника не завантажені'); return; }
    if (senderInfo.senderType === 'warehouse' && !senderWH && senderInfo.warehouses.length > 0) { setError('Оберіть відділення відправника'); return; }
    if (!lastName || !firstName) { setError(isOrganization ? 'Вкажіть прізвище та ім\'я контактної особи' : 'Вкажіть прізвище та ім\'я одержувача'); return; }
    if (isOrganization && !legal) { setError('У картці контрагента немає ЄДРПОУ — оберіть одержувача «Фізособа»'); return; }
    const badWeight = seatNums.findIndex(r => !(r.weight > 0));
    if (badWeight >= 0) { setError(multiSeat && !sameSeats ? `Вкажіть вагу місця ${badWeight + 1}` : 'Вкажіть вагу відправлення'); return; }
    const badDims = needSeatDims ? seatNums.findIndex(r => !dimsOk(r)) : -1;
    if (badDims >= 0) {
      setError(multiSeat && !sameSeats
        ? `Вкажіть габарити місця ${badDims + 1} (ш × в × д) — або приберіть їх в усіх місцях`
        : 'Для поштомату вкажіть габарити посилки (ш × в × д)');
      return;
    }
    if (codEnabled && (!codAmount || parseFloat(codAmount) <= 0)) { setError('Вкажіть суму накладеного платежу'); return; }
    // Кур'єр: не відправляємо те, що НП уже не знайшла, — хай менеджер обере
    // зі схожих або виправить адресу (інакше ту саму помилку віддасть сервер).
    const addr = addrCheck.result;
    if (isCourier && addrCheck.status === 'loading') { setError('Зачекайте, адреса ще перевіряється в довіднику НП'); return; }
    if (isCourier && addr && !addr.ok && !chosenStreet) { setError(addr.error); return; }
    const recipientStreet = !isCourier ? undefined
      : chosenStreet && addr && !addr.ok
        ? { ref: chosenStreet.ref, label: chosenStreet.label, kind: chosenStreet.kind, house: addr.parsed.house, flat: addr.parsed.flat }
        : addr?.ok
          ? { ref: addr.streetRef, label: addr.streetLabel, kind: addr.kind, house: addr.house, flat: addr.flat }
          : undefined;

    setSubmitting(true); setError('');

    const effectiveSenderType = senderTypeOverride ?? senderInfo.senderType;
    const isAddress = effectiveSenderType === 'address';
    const serviceType = isCourier
      ? (isAddress ? 'DoorsDoors' : 'WarehouseDoors')
      : (isAddress ? 'DoorsWarehouse' : 'WarehouseWarehouse');

    const res = await fetch('/api/admin/create-ttn', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: order.id,
        senderRef:          senderInfo.ref,
        senderCityRef:      isAddress ? senderInfo.cityRef : (senderWH?.cityRef ?? senderInfo.warehouses[0]?.cityRef ?? senderInfo.cityRef),
        senderWarehouseRef: isAddress ? senderInfo.addressRef : (senderWH?.ref ?? senderInfo.warehouses[0]?.ref),
        senderContactRef:   senderInfo.contactRef,
        senderPhone:        senderInfo.phone,
        lastName, firstName, middleName, recipientPhone: phone,
        recipientType,
        cityRecipientRef: isCourier ? selectedCity.Ref : (selectedWH?.CityRef || selectedCity.Ref),
        recipientAddressRef: isCourier ? '' : selectedWH?.Ref,
        recipientAddress: isCourier ? recipientAddress : undefined,
        recipientStreet,
        weight: totalWeight, seatsAmount: seatCount,
        cost: parseFloat(cost) || 0, description,
        serviceType, payerType, paymentMethod,
        codEnabled, codAmount: codEnabled ? parseFloat(codAmount) : 0,
        ...(multiSeat && needSeatDims && { seatsOptions: seatNums }),
        ...(!multiSeat && isPostomat && { dimensions: { width: seatNums[0].width, height: seatNums[0].height, length: seatNums[0].length } }),
      }),
    });

    const data = await res.json();
    if (!res.ok || data.error) { setError(data.error ?? 'Помилка'); setSubmitting(false); return; }

    const idsToUpdate = order.mergedIds ?? [order.id];
    await Promise.all(idsToUpdate.map(id =>
      fetch(`/api/admin/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracking_number: data.ttn, tracking_ref: data.ref }),
      })
    ));

    onCreated(data.ttn);
  }

  const radio = (active: boolean): React.CSSProperties => ({
    flex: 1, height: '34px', borderRadius: '7px',
    border: `1.5px solid ${active ? '#1E3A5F' : 'var(--border)'}`,
    background: active ? '#1E3A5F' : 'var(--bg-soft)',
    color: active ? '#fff' : 'var(--text-secondary)',
    fontSize: '12px', fontWeight: 600, cursor: 'pointer',
  });

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
    >
      <div style={{ background: 'var(--bg-card)', borderRadius: '16px', width: '100%', maxWidth: '540px', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.4)', border: '1px solid var(--border)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 10 }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Truck size={16} color="#4880B8" /> Створити ТТН
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {isPostomat ? 'Нова Пошта — відділення → поштомат' : isCourier ? 'Нова Пошта — відділення → кур\'єр' : 'Нова Пошта — відділення → відділення'}
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', display: 'flex', borderRadius: '6px' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>

          {senderLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '13px', padding: '10px 12px', background: 'var(--bg-soft)', borderRadius: '8px' }}>
              <Loader2 size={14} className="spin" /> Завантаження даних відправника...
            </div>
          )}
          {senderError && (
            <div style={{ padding: '10px 12px', background: '#FEF2F2', borderRadius: '8px', color: '#DC2626', fontSize: '13px', border: '1px solid #FECACA' }}>
              {senderError}
            </div>
          )}

          {/* Тип доставки одержувачу */}
          <section>
            <div style={secTitle}><Truck size={11} /><span>Тип доставки одержувачу</span></div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {([
                { value: 'warehouse', label: '🏢 Відділення' },
                { value: 'postomat',  label: '📦 Поштомат' },
                { value: 'courier',   label: '🚚 Кур\'єр' },
              ] as const).map(({ value, label }) => (
                <button
                  key={value}
                  style={{
                    ...radio(deliverySubtype === value),
                    flex: 1, fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                  }}
                  onClick={() => {
                    setDeliverySubtype(value);
                    setSelectedWH(null); setWhQuery('');
                    // При переході на кур'єра підставляємо адрес зі замовлення, якщо поле ще порожнє
                    if (value === 'courier' && !recipientAddress.trim()) {
                      setRecipientAddress(streetFromAddress(order.delivery_address, order.delivery_city_name));
                    }
                    if (selectedCity) {
                      setWhLoading(true);
                      npRequest('Address', 'getWarehouses', { SettlementRef: selectedCity.Ref, Limit: 500, Page: 1 })
                        .then((data: Warehouse[]) => {
                          const filtered = value === 'postomat'
                            ? data.filter(w => w.Description.toLowerCase().includes('поштомат'))
                            : data.filter(w => !w.Description.toLowerCase().includes('поштомат'));
                          setWarehouses(filtered);
                        }).finally(() => setWhLoading(false));
                    }
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          {/* Одержувач */}
          <section>
            <div style={secTitle}><span>Одержувач</span></div>
            {/* Фізособа / юрособа — лише коли в картці контрагента є код; без
                картки або коду перемикач не потрібен, але причину кажемо */}
            {(legal || legalLoading || order.customer_id) && (
              <div style={{ marginBottom: '10px' }}>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button style={{ ...radio(!isOrganization), fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
                    onClick={() => setRecipientType('private')}>
                    <User size={12} /> Фізособа
                  </button>
                  <button
                    style={{ ...radio(isOrganization), fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', opacity: legal ? 1 : 0.5, cursor: legal ? 'pointer' : 'default' }}
                    disabled={!legal}
                    title={legal ? `${legal.legalName || 'Юрособа'} · ${taxNumberLabel(legal.taxNumber)} ${legal.taxNumber}` : legalLoading ? 'Завантаження картки контрагента…' : 'У картці контрагента немає ЄДРПОУ/РНОКПП'}
                    onClick={() => legal && setRecipientType('organization')}>
                    {legalLoading ? <Loader2 size={12} className="spin" /> : <Building2 size={12} />} Юрособа
                  </button>
                </div>
                {isOrganization && legal ? (
                  <div style={{ marginTop: '8px', padding: '9px 12px', background: '#EFF4FF', border: '1px solid #C7D7F5', borderRadius: '8px', fontSize: '12px', color: '#1E3A5F', lineHeight: 1.45 }}>
                    <div style={{ fontWeight: 700 }}>{legal.legalName || 'Юрособа з картки контрагента'}</div>
                    <div>{taxNumberLabel(legal.taxNumber)} {legal.taxNumber}{legal.legalAddress ? ` · ${legal.legalAddress}` : ''}</div>
                    <div style={{ fontSize: '11px', color: '#4880B8', marginTop: '3px' }}>
                      НП знайде підприємство за кодом у своєму реєстрі; ПІБ і телефон нижче — контактна особа одержувача.
                    </div>
                  </div>
                ) : !legal && !legalLoading ? (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '5px' }}>
                    Щоб відправляти на юрособу, заповніть ЄДРПОУ/РНОКПП у картці контрагента.
                  </div>
                ) : null}
              </div>
            )}
            {isOrganization && <div style={{ ...lbl, marginBottom: '6px' }}>Контактна особа</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
              <div>
                <label style={lbl}>Прізвище</label>
                <input style={inp} value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Іванов" />
              </div>
              <div>
                <label style={lbl}>Ім&apos;я</label>
                <input style={inp} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Іван" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <label style={lbl}>По батькові</label>
                <input style={inp} value={middleName} onChange={e => setMiddleName(e.target.value)} placeholder="Іванович" />
              </div>
              <div>
                <label style={lbl}>Телефон</label>
                <input style={inp} value={phone} onChange={e => setPhone(e.target.value)} placeholder="0671234567" />
              </div>
            </div>
          </section>

          {/* Місто + відділення / адреса */}
          <section>
            <div style={secTitle}><MapPin size={11} /><span>{isPostomat ? 'Місто та поштомат одержувача' : isCourier ? 'Місто та адреса доставки' : 'Місто та відділення одержувача'}</span></div>
            <div ref={cityRef} style={{ position: 'relative', marginBottom: '8px' }}>
              <label style={lbl}>Місто</label>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}>
                  {cityLoading ? <Loader2 size={14} className="spin" /> : <Search size={14} />}
                </div>
                <input style={{ ...inp, paddingLeft: '30px' }} placeholder="Харків, Київ, Одеса..." value={cityQuery}
                  onChange={e => handleCityInput(e.target.value)} onFocus={() => settlements.length > 0 && setCityDropOpen(true)} />
              </div>
              {cityDropOpen && settlements.length > 0 && (
                <div style={dropStyle}>
                  {settlements.map(s => (
                    <button key={s.Ref} onMouseDown={() => selectCity(s)} style={{ ...dropBtn, display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <MapPin size={13} color="var(--text-muted)" style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px' }}>{s.MainDescription}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{s.RegionsDescription ? `${s.RegionsDescription} р-н, ` : ''}{s.Area} обл.</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {isCourier ? (
              <div>
                <label style={lbl}>Адреса доставки <span style={{ color: '#EF4444' }}>*</span></label>
                <input
                  style={inp} placeholder="вул. Шевченка, 12, кв. 5"
                  value={recipientAddress} onChange={e => setRecipientAddress(e.target.value)}
                />
                {(() => {
                  const r = addrCheck.result;
                  const okStyle: React.CSSProperties = { fontSize: '11px', color: '#16A34A', marginTop: '4px', lineHeight: 1.4 };
                  const badStyle: React.CSSProperties = { fontSize: '11px', color: '#DC2626', marginTop: '4px', lineHeight: 1.4 };
                  const chip: React.CSSProperties = { fontSize: '11px', padding: '2px 8px', borderRadius: '999px', border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#991B1B', cursor: 'pointer' };
                  if (addrCheck.status === 'loading') {
                    return <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}><Loader2 size={11} className="spin" />Перевіряємо адресу в довіднику НП…</div>;
                  }
                  if (addrCheck.status === 'done' && r?.ok) {
                    return <div style={okStyle}>НП: <b>{r.label}</b>{r.kind === 'settlement' ? ' — вулиця лише в довіднику населеного пункту, НП може не прийняти її кур\'єром' : ''}</div>;
                  }
                  if (addrCheck.status === 'done' && r && !r.ok && chosenStreet) {
                    return <div style={okStyle}>НП: <b>{chosenStreet.label}, {r.parsed.house}{r.parsed.flat ? `, кв. ${r.parsed.flat}` : ''}</b></div>;
                  }
                  if (addrCheck.status === 'done' && r && !r.ok) {
                    return (
                      <div style={badStyle}>
                        {r.reason === 'parse' || !r.parsed.street ? r.error : <>Вулицю «{r.parsed.street}» не знайдено в НП для цього міста.{r.suggestions.length ? ' Схожі — оберіть:' : ' Перевірте місто й назву вулиці.'}</>}
                        {r.suggestions.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '5px' }}>
                            {r.suggestions.map(s => (
                              <button key={s.ref} type="button" onClick={() => setChosenStreet(s)} style={chip}>{s.label}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }
                  return <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Вкажіть вулицю, номер будинку та квартиру. НП узгодить деталі з одержувачем.</div>;
                })()}
              </div>
            ) : null}
            {!isCourier && <div ref={whRef} style={{ position: 'relative' }}>
              <label style={lbl}>{isPostomat ? 'Поштомат' : 'Відділення'}</label>
              {whLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', ...inp, paddingLeft: '10px' }}>
                  <Loader2 size={13} className="spin" /><span style={{ color: 'var(--text-muted)' }}>Завантаження відділень...</span>
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}><Search size={14} /></div>
                  <input style={{ ...inp, paddingLeft: '30px' }}
                    placeholder={selectedCity ? (isPostomat ? 'Номер або адреса поштомату' : 'Номер або адреса відділення') : 'Спочатку оберіть місто'}
                    value={whQuery} disabled={!selectedCity}
                    onChange={e => { setWhQuery(e.target.value); setWhDropOpen(true); setSelectedWH(null); }}
                    onFocus={() => filteredWH.length > 0 && setWhDropOpen(true)} />
                </div>
              )}
              {whDropOpen && filteredWH.length > 0 && (
                <div style={dropStyle}>
                  {filteredWH.slice(0, 50).map(w => (
                    <button key={w.Ref} onMouseDown={() => { setSelectedWH(w); setWhQuery(w.Description); setWhDropOpen(false); }} style={dropBtn}>{w.Description}</button>
                  ))}
                </div>
              )}
            </div>}
          </section>

          {/* ── Відправник: спосіб забору ── */}
          {senderInfo && (
            <section>
              <div style={secTitle}><Package size={11} /><span>Спосіб відправки (звідки)</span></div>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                {([
                  { value: 'warehouse' as const, label: '🏢 Я несу у відділення НП' },
                  { value: 'address'   as const, label: '🚚 Кур\'єр забирає зі складу' },
                ] as const).map(({ value, label }) => {
                  const active = (senderTypeOverride ?? senderInfo.senderType) === value;
                  return (
                    <button
                      key={value}
                      style={{ ...radio(active), flex: 1, fontSize: '11px' }}
                      onClick={() => setSenderTypeOverride(value)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Показуємо інфо залежно від ефективного типу */}
              {(senderTypeOverride ?? senderInfo.senderType) === 'address' ? (
                senderInfo.addressRef ? (
                  <div style={{ padding: '10px 14px', background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: '8px', fontSize: '13px', color: '#15803D' }}>
                    🏭 Забір зі складу: <strong>{senderInfo.addressDesc || senderInfo.addressRef}</strong>
                    <div style={{ fontSize: '11px', color: '#16A34A', marginTop: '2px' }}>НП приїде за товаром на зареєстровану адресу</div>
                  </div>
                ) : (
                  <div style={{ padding: '10px 14px', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '8px', fontSize: '13px', color: '#92400E' }}>
                    ⚠ Адреса забору не налаштована. Перейдіть у Налаштування → НП Відправник.
                  </div>
                )
              ) : null}
            </section>
          )}

          {/* Вибір відділення відправника (якщо warehouse і кілька відділень) */}
          {senderInfo && (senderTypeOverride ?? senderInfo.senderType) === 'warehouse' && senderInfo.warehouses.length > 1 && (
            <section>
              <div style={secTitle}><Package size={11} /><span>Відділення відправника</span></div>
              <div ref={senderWhRef} style={{ position: 'relative' }}>
                <label style={lbl}>Відправляємо з відділення</label>
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}><Search size={14} /></div>
                  <input style={{ ...inp, paddingLeft: '30px' }} placeholder="Оберіть відділення відправки..."
                    value={senderWH ? senderWH.description : senderWhQ}
                    onChange={e => { setSenderWhQ(e.target.value); setSenderWH(null); setSenderWhOpen(true); }}
                    onFocus={() => setSenderWhOpen(true)} />
                </div>
                {senderWhOpen && filteredSenderWH.length > 0 && (
                  <div style={dropStyle}>
                    {filteredSenderWH.slice(0, 50).map(w => (
                      <button key={w.ref} onMouseDown={() => { setSenderWH(w); setSenderWhOpen(false); setSenderWhQ(''); }} style={dropBtn}>{w.description}</button>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Вантаж */}
          <section>
            <div style={secTitle}><Package size={11} /><span>Вантаж</span></div>

            {/* Вага + місць в одному рядку; кілька місць — загальна вага рахується з рядків */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 104px', gap: '8px', marginBottom: '8px' }}>
              <div>
                <label style={lbl}>
                  {multiSeat ? 'Загальна вага, кг' : <>Вага, кг <span style={{ color: '#EF4444' }}>*</span></>}
                  {weightLoading && <Loader2 size={11} className="spin" style={{ marginLeft: '6px', verticalAlign: 'middle' }} />}
                </label>
                {multiSeat ? (
                  <div style={{ ...inp, display: 'flex', alignItems: 'center', background: 'transparent', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                    {totalWeight || '—'}
                  </div>
                ) : (
                  <input
                    style={{ ...inp, borderColor: !seatRows[0].weight ? '#FCA5A5' : undefined, background: !seatRows[0].weight ? 'rgba(239,68,68,0.06)' : undefined }}
                    type="number" min="0.1" step="0.1" value={seatRows[0].weight}
                    onChange={e => setSeatField(0, 'weight', e.target.value)}
                    placeholder="кг"
                  />
                )}
              </div>
              <div>
                <label style={lbl}>Місць</label>
                <SeatsStepper value={seatCount} onChange={seatsCtl.setCount} style={{ ...inp, padding: 0 }} />
              </div>
            </div>

            {/* Кілька місць: однакові — один рядок «кожне місце»; різні — рядок на
                кожне, як у накладній НП, зі своєю вагою й габаритами */}
            {multiSeat && (
              <div style={{ marginBottom: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <SameSeatsToggle checked={sameSeats} onChange={seatsCtl.setSame} />
                <div style={{ display: 'grid', gridTemplateColumns: seatGrid, gap: '6px' }}>
                  <span />
                  <span style={{ ...lbl, marginBottom: 0 }}>{sameSeats ? 'Вага 1 місця' : 'Вага, кг'}</span>
                  <span style={{ ...lbl, marginBottom: 0 }}>Ш</span>
                  <span style={{ ...lbl, marginBottom: 0 }}>В</span>
                  <span style={{ ...lbl, marginBottom: 0 }}>Д, см</span>
                  <span />
                </div>
                {editRows.map((r, i) => {
                  const n = seatNums[i];
                  const redIf = (bad: boolean): React.CSSProperties => (bad ? { borderColor: '#FCA5A5', background: 'rgba(239,68,68,0.06)' } : {});
                  const dimBad = (v: number) => needSeatDims && !(v > 0);
                  return (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: seatGrid, gap: '6px', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{sameSeats ? `×${seatCount}` : i + 1}</span>
                      <input style={{ ...inp, ...redIf(!(n.weight > 0)) }} type="number" min="0.1" step="0.1" placeholder="кг" aria-label={`Вага місця ${i + 1}, кг`}
                        value={r.weight} onChange={e => setSeatField(i, 'weight', e.target.value)} />
                      <input style={{ ...inp, ...redIf(dimBad(n.width)) }} type="number" min="1" step="1" placeholder="см" aria-label={`Ширина місця ${i + 1}, см`}
                        value={r.width} onChange={e => setSeatField(i, 'width', e.target.value)} />
                      <input style={{ ...inp, ...redIf(dimBad(n.height)) }} type="number" min="1" step="1" placeholder="см" aria-label={`Висота місця ${i + 1}, см`}
                        value={r.height} onChange={e => setSeatField(i, 'height', e.target.value)} />
                      <input style={{ ...inp, ...redIf(dimBad(n.length)) }} type="number" min="1" step="1" placeholder="см" aria-label={`Довжина місця ${i + 1}, см`}
                        value={r.length} onChange={e => setSeatField(i, 'length', e.target.value)} />
                      {sameSeats ? <span /> : (
                        <button type="button" onClick={() => seatsCtl.remove(i)} aria-label={`Прибрати місце ${i + 1}`} title="Прибрати місце"
                          style={{ width: '22px', height: '22px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}>
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  );
                })}
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                  {sameSeats
                    ? `${sameSeatsLabel(seatCount)} з цією вагою й габаритами${isPostomat ? '' : ' (габарити можна не вказувати)'} — зніміть галочку, щоб вказати кожне окремо`
                    : isPostomat
                      ? 'Поштомат вимагає габарити кожного місця'
                      : 'Габарити — для всіх місць або для жодного: без них НП рахує лише за вагою'}
                </div>
              </div>
            )}

            {/* Breakdown ваги по товарам */}
            {weightLines.length > 0 && (
              <div style={{ marginBottom: '8px', background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
                {weightLines.map(l => (
                  <div key={l.sku} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', borderBottom: '1px solid var(--border-light)', fontSize: '11px' }}>
                    <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
                      {order.items.find(i => i.sku === l.sku)?.name ?? l.sku}
                    </span>
                    <span style={{ color: l.weightKg > 0 ? 'var(--text-primary)' : '#FCA5A5', flexShrink: 0, marginLeft: '6px', fontWeight: 600 }}>
                      {l.weightKg > 0 ? `${l.qty}×${l.volume} = ${l.totalKg} кг` : `${l.qty} шт — вага невідома`}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Вартість + опис. Колонки — flex до низу: на вузькому екрані лейбл
                «Оголошена вартість» переноситься на два рядки, і без вирівнювання
                поля стояли на різній висоті */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                <label style={lbl}>Оголошена вартість, грн</label>
                <input style={inp} type="number" min="0" value={cost} onChange={e => setCost(e.target.value)} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                <label style={lbl}>Опис вантажу</label>
                <input style={inp} value={description} onChange={e => setDescription(e.target.value)} />
              </div>
            </div>

            {/* Габарити для поштомату */}
            {isPostomat && !multiSeat && (
              <div style={{ marginTop: '10px', padding: '10px 12px', background: 'var(--brand-blue-light)', border: '1.5px solid var(--border)', borderRadius: '8px' }}>
                <div style={{ ...lbl, color: 'var(--brand-blue)', marginBottom: '8px' }}>📐 Габарити, см <span style={{ color: '#EF4444' }}>*</span></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  <div><label style={lbl}>Ширина</label><input style={inp} type="number" min="1" step="1" placeholder="см" value={seatRows[0].width}  onChange={e => setSeatField(0, 'width', e.target.value)} /></div>
                  <div><label style={lbl}>Висота</label> <input style={inp} type="number" min="1" step="1" placeholder="см" value={seatRows[0].height} onChange={e => setSeatField(0, 'height', e.target.value)} /></div>
                  <div><label style={lbl}>Довжина</label><input style={inp} type="number" min="1" step="1" placeholder="см" value={seatRows[0].length} onChange={e => setSeatField(0, 'length', e.target.value)} /></div>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>Поштомат вимагає габарити для створення ТТН</div>
              </div>
            )}
          </section>

          {/* Накладений платіж (COD) */}
          <section>
            <div
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '11px 14px', borderRadius: '10px', cursor: 'pointer',
                border: `1.5px solid ${codEnabled ? '#F59E0B' : 'var(--border)'}`,
                background: codEnabled ? '#FFFBEB' : 'var(--bg-soft)',
              }}
              onClick={() => setCodEnabled(v => !v)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Banknote size={15} color={codEnabled ? '#D97706' : 'var(--text-muted)'} />
                <span style={{ fontSize: '13px', fontWeight: 600, color: codEnabled ? '#92400E' : 'var(--text-secondary)' }}>
                  Накладений платіж (COD)
                </span>
                {isCod && <span style={{ fontSize: '11px', background: '#FDE68A', color: '#92400E', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>з замовлення</span>}
              </div>
              <div style={{
                width: '34px', height: '18px', borderRadius: '9px', position: 'relative', transition: 'background 0.2s',
                background: codEnabled ? '#F59E0B' : 'var(--border)',
              }}>
                <div style={{
                  position: 'absolute', top: '2px', width: '14px', height: '14px', borderRadius: '50%', background: '#fff',
                  transition: 'left 0.2s', left: codEnabled ? '18px' : '2px',
                }} />
              </div>
            </div>
            {codEnabled && (
              <div style={{ marginTop: '8px', padding: '12px 14px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px' }}>
                <label style={{ ...lbl, color: '#92400E' }}>Сума до стягнення з одержувача, грн</label>
                <input
                  style={{ ...inp, borderColor: '#FCD34D' }}
                  type="number" min="1" step="0.01" value={codAmount}
                  onChange={e => setCodAmount(e.target.value)}
                />
                <div style={{ fontSize: '11px', color: '#A16207', marginTop: '4px' }}>
                  Одержувач сплачує цю суму готівкою при отриманні. Кошти повертаються вам через НП.
                </div>
              </div>
            )}
          </section>

          {/* Оплата доставки */}
          <section>
            <div style={secTitle}><CreditCard size={11} /><span>Оплата доставки</span></div>
            <label style={lbl}>Платник за пересилку</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button style={radio(payerType === 'Sender')}    onClick={() => setPayerType('Sender')}>Відправник</button>
              <button style={radio(payerType === 'Recipient')} onClick={() => setPayerType('Recipient')}>Одержувач</button>
            </div>
          </section>

          {error && (
            <div style={{ padding: '10px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', color: '#DC2626', fontSize: '13px' }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: '10px', justifyContent: 'flex-end', position: 'sticky', bottom: 0, background: 'var(--bg-card)' }}>
          <button onClick={onClose} style={{ height: '38px', padding: '0 18px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            Скасувати
          </button>
          <button onClick={handleSubmit} disabled={submitting || senderLoading || !!senderError}
            style={{ height: '38px', padding: '0 20px', borderRadius: '8px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '7px', opacity: (submitting || senderLoading || !!senderError) ? 0.5 : 1 }}>
            {submitting ? <><Loader2 size={14} className="spin" />Створення...</> : <><Truck size={14} />Створити ТТН</>}
          </button>
        </div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}.spin{animation:spin 1s linear infinite}`}</style>
    </div>
  );
}
