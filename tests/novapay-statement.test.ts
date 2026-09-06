import { describe, it, expect } from 'vitest';
import { parseNovapayStatement, parseNovapayRegisterPayouts, extractOwnAccount } from '../lib/novapay-statement';

// Фрагмент живої виписки NovaPay (GetAccountExtract, 06.09.2026), скорочений.
const XML = `<Extract>
  <ExtractHead>
    <GetExtractForXML>
      <Date>04.09.2026</Date>
      <Account>67320000106641</Account>
      <IBAN>UA429358710000067320000106641</IBAN>
      <Docs Amount="3129.27" CurrencyTag="UAH">
        <ID>54350772</ID><OrgDate>04.09.2026</OrgDate><DayDate>04.09.2026</DayDate><Code>BO28157073</Code>
        <CreditAccount>67320000106641</CreditAccount><CreditName>Фізична особа-підприємець Полупан Денис Олександрович</CreditName>
        <DebitAccount>68603000000022</DebitAccount><DebitName>НоваПей</DebitName>
        <Purpose>Переказ коштів по платежам, прийнятим від населення за товари/послуги згідно реєстру № 16108345 від 04.09.2026  та із Заявою №2026 про приєднання</Purpose>
      </Docs>
      <Docs Amount="1300.00" CurrencyTag="UAH">
        <ID>54372474</ID><OrgDate>04.09.2026</OrgDate><DayDate>04.09.2026</DayDate><Code>iban-98P</Code>
        <CreditAccount>26001350042842</CreditAccount><CreditName>ФОП РАВЛО ГАННА ВАСИЛІВНА</CreditName>
        <DebitAccount>67320000106641</DebitAccount><DebitName>ФОП Полупан Денис Олександрович</DebitName>
        <Purpose>За консультацію</Purpose>
      </Docs>
    </GetExtractForXML>
    <GetExtractForXML>
      <Date>05.09.2026</Date>
      <Account>67320000106641</Account>
      <Docs Amount="390.04" CurrencyTag="UAH">
        <ID>54479484</ID><OrgDate>05.09.2026</OrgDate><DayDate>05.09.2026</DayDate><Code>BO28</Code>
        <CreditAccount>67320000106641</CreditAccount><CreditName>ФОП</CreditName>
        <DebitAccount>68603000000022</DebitAccount><DebitName>НоваПей</DebitName>
        <Purpose>Переказ коштів по платежам, прийнятим від населення за товари/послуги згідно реєстру № 16172242 від 05.09.2026</Purpose>
      </Docs>
    </GetExtractForXML>
  </ExtractHead>
</Extract>`;

describe('novapay-statement — розбір виписки NovaPay', () => {
  it('знаходить наш рахунок у шапці', () => {
    expect(extractOwnAccount(XML)).toBe('67320000106641');
  });

  it('усі документи з напрямком і датою YYYY-MM-DD', () => {
    const docs = parseNovapayStatement(XML);
    expect(docs).toHaveLength(3);
    expect(docs[0]).toMatchObject({ date: '2026-09-04', amount: 3129.27, direction: 'in', counterparty: 'НоваПей', docId: '54350772' });
    expect(docs[1]).toMatchObject({ date: '2026-09-04', amount: 1300, direction: 'out', counterparty: 'ФОП РАВЛО ГАННА ВАСИЛІВНА', purpose: 'За консультацію' });
    expect(docs[2].direction).toBe('in');
  });

  it('виплати за реєстрами: лише вхідні від НоваПей, з номером реєстру', () => {
    const p = parseNovapayRegisterPayouts(XML);
    expect(p).toEqual([
      { date: '2026-09-04', net: 3129.27, register: '16108345', docId: '54350772' },
      { date: '2026-09-05', net: 390.04, register: '16172242', docId: '54479484' },
    ]);
  });

  it('порожня виписка → порожньо', () => {
    expect(parseNovapayRegisterPayouts('<Extract><ExtractHead></ExtractHead></Extract>')).toEqual([]);
  });
});

import { classifyNovapayDoc, registerNumberOf } from '../lib/novapay-statement';

describe('classifyNovapayDoc / registerNumberOf', () => {
  it('виплата за реєстром від НоваПей → cod_payout', () => {
    expect(classifyNovapayDoc({ direction: 'in', counterparty: 'НоваПей', purpose: 'Переказ коштів … згідно реєстру № 16108345 від 04.09.2026' })).toBe('cod_payout');
    expect(registerNumberOf('… згідно реєстру № 16108345 від 04.09.2026')).toBe('16108345');
  });
  it('інше зарахування і списання', () => {
    expect(classifyNovapayDoc({ direction: 'in', counterparty: 'Іванов', purpose: 'Оплата за товар' })).toBe('other_in');
    expect(classifyNovapayDoc({ direction: 'out', counterparty: 'ФОП РАВЛО', purpose: 'За консультацію' })).toBe('debit');
  });
});

import { matchNpRegister } from '../lib/novapay-statement';

describe('matchNpRegister — склад реєстру НП за підбором (0,5 %, день у день)', () => {
  // Реальні реєстри 05.09.2026: 390.04 = 392×0.995; 1794.97 = (727+434+643)×0.995 з округленням по ЕН
  it('одна ЕН', () => {
    const r = matchNpRegister(390.04, [{ id: 'a', gross: 392 }, { id: 'b', gross: 2025 }, { id: 'c', gross: 727 }]);
    expect(r?.ids).toEqual(['a']);
    expect(r?.nets.a).toBe(390.04);
  });
  it('кілька ЕН з округленням по кожній', () => {
    const r = matchNpRegister(1794.97, [{ id: 'a', gross: 392 }, { id: 'b', gross: 2025 }, { id: 'c', gross: 727 }, { id: 'd', gross: 434 }, { id: 'e', gross: 643 }]);
    expect(r?.ids.sort()).toEqual(['c', 'd', 'e']);
  });
  it('нема розв’язку → null (реєстр проводиться сумою)', () => {
    expect(matchNpRegister(1000, [{ id: 'a', gross: 392 }, { id: 'b', gross: 2025 }])).toBeNull();
    expect(matchNpRegister(100, [])).toBeNull();
  });
  it('обирає найменшу підмножину, якщо рішень кілька', () => {
    const r = matchNpRegister(199, [{ id: 'x', gross: 100 }, { id: 'y', gross: 100 }, { id: 'z', gross: 200 }]);
    expect(r?.ids).toEqual(['z']);
  });
});
