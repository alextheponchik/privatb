/* ------------------------------------------------------------------
 * Static demo dataset. Nothing here talks to a server.
 *
 * Transactions are stored newest-first without balances: the running
 * balance is derived backwards from CARD.balance so the most recent
 * transaction always leaves the account at exactly 511 000,00 UAH.
 * ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var USER = {
    firstName: { ua: 'Анастасія', en: 'Anastasiia' },
    fullName: {
      ua: 'Ковальчук Анастасія Ігорівна',
      en: 'Kovalchuk Anastasiia Ihorivna'
    },
    initials: 'АК',
    phone: '+380 67 ••• 41 20',
    since: 2018
  };

  var CARD = {
    type: 'Universal',
    system: 'PrivatB Pay',
    mask: '6330',
    masked: '•••• 6330',
    maskedFull: '•••• •••• •••• 6330',
    /* Deliberately starts with 9 — a range no card network issues, so the
       number cannot collide with a real payment card. */
    number: '9720 4417 2085 6330',
    cvv: '204',
    valid: '09/29',
    balance: 511000.00,
    currency: 'UAH',
    iban: 'UA76 9999 9900 0002 6001 2345 6789 0',
    ibanMasked: 'UA76 9999 99•• •••• •••• •••• 6789 0'
  };

  var DEPOSIT = {
    id: 'deposit',
    nameKey: 'deposit.name',
    rateKey: 'deposit.rate',
    amount: 180000.00,
    ratePct: 14,
    accrued: 25666.64,
    nextPayout: '2026-08-06'
  };

  var CREDIT = {
    id: 'credit',
    nameKey: 'credit.name',
    limit: 300000.00,
    monthlyExample: 8420.00
  };

  var OFFERS = [
    { id: 'kids',      icon: 'kids',      nameKey: 'products.kids.name',      descKey: 'products.kids.desc' },
    { id: 'mortgage',  icon: 'home',      nameKey: 'products.mortgage.name',  descKey: 'products.mortgage.desc' },
    { id: 'auto',      icon: 'car',       nameKey: 'products.auto.name',      descKey: 'products.auto.desc' },
    { id: 'insurance', icon: 'shield',    nameKey: 'products.insurance.name', descKey: 'products.insurance.desc' }
  ];

  /* Notification feed. `at` is an ISO timestamp, `unread` drives the badge. */
  var NOTIFICATIONS = [
    {
      id: 'n1', icon: 'card', unread: true, at: '2026-08-02T09:14:00',
      title: { ua: 'Оплата 389,00 ₴', en: 'Payment ₴389.00' },
      text: {
        ua: 'Аромат Кави. Доступно 511 000,00 ₴',
        en: 'Aroma Kava. Available ₴511 000.00'
      }
    },
    {
      id: 'n2', icon: 'percent', unread: true, at: '2026-08-01T08:00:00',
      title: { ua: 'Нараховано кешбек', en: 'Cashback credited' },
      text: {
        ua: '47,80 ₴ за операції в липні зараховано на картку',
        en: '₴47.80 for July transactions credited to your card'
      }
    },
    {
      id: 'n3', icon: 'piggy', unread: true, at: '2026-07-31T10:30:00',
      title: { ua: 'Вклад «Стабільний»', en: 'Deposit “Stabilnyi”' },
      text: {
        ua: 'Наступна виплата відсотків — 06.08.2026, 6 416,66 ₴',
        en: 'Next interest payout — 06.08.2026, ₴6 416.66'
      }
    },
    {
      id: 'n4', icon: 'wallet', unread: false, at: '2026-07-30T11:05:00',
      title: { ua: 'Зарахування 62 450,00 ₴', en: 'Credit ₴62 450.00' },
      text: { ua: 'Заробітна плата, ТОВ «Нордік Софт»', en: 'Salary, Nordic Soft LLC' }
    },
    {
      id: 'n5', icon: 'shield', unread: false, at: '2026-07-28T19:42:00',
      title: { ua: 'Новий вхід у застосунок', en: 'New sign-in to the app' },
      text: {
        ua: 'iPhone 16 Pro, Київ. Якщо це не ви — зверніться в підтримку',
        en: 'iPhone 16 Pro, Kyiv. If this was not you, contact support'
      }
    },
    {
      id: 'n6', icon: 'doc', unread: false, at: '2026-07-05T12:00:00',
      title: { ua: 'Виписка за червень', en: 'June statement' },
      text: {
        ua: 'Щомісячна виписка сформована та доступна для завантаження',
        en: 'Your monthly statement is ready to download'
      }
    }
  ];

  /* Merchant/counterparty labels reused across transactions. */
  var M = {
    silpo:    { ua: 'Сільпо',             en: 'Silpo' },
    atb:      { ua: 'АТБ',                en: 'ATB' },
    novus:    { ua: 'Novus',              en: 'Novus' },
    employer: { ua: 'ТОВ «Нордік Софт»',  en: 'Nordic Soft LLC' },
    advance:  { ua: 'ТОВ «Нордік Софт», аванс', en: 'Nordic Soft LLC, advance' },
    wog:      { ua: 'WOG',                en: 'WOG' },
    okko:     { ua: 'ОККО',               en: 'OKKO' },
    uz:       { ua: 'Укрзалізниця',       en: 'Ukrzaliznytsia' },
    busfor:   { ua: 'Busfor',             en: 'Busfor' },
    uklon:    { ua: 'Uklon',              en: 'Uklon' },
    bolt:     { ua: 'Bolt',               en: 'Bolt' },
    rozetka:  { ua: 'Rozetka',            en: 'Rozetka' },
    prom:     { ua: 'Prom.ua',            en: 'Prom.ua' },
    makeup:   { ua: 'Makeup',             en: 'Makeup' },
    comfy:    { ua: 'Comfy',              en: 'Comfy' },
    foxtrot:  { ua: 'Фокстрот',           en: 'Foxtrot' },
    intertop: { ua: 'Intertop',           en: 'Intertop' },
    zara:     { ua: 'Zara',               en: 'Zara' },
    glovo:    { ua: 'Glovo',              en: 'Glovo' },
    netflix:  { ua: 'Netflix',            en: 'Netflix' },
    sportlife:{ ua: 'Sport Life',         en: 'Sport Life' },
    dobrobut: { ua: 'Медичний центр «Добробут»', en: 'Dobrobut Medical Centre' },
    apt911:   { ua: '911',                en: '911' },
    aptDobro: { ua: 'Доброго дня',        en: 'Dobroho Dnia' },
    coffee:   { ua: 'Аромат Кави',        en: 'Aroma Kava' },
    puzata:   { ua: 'Пузата Хата',        en: 'Puzata Hata' },
    chocolate:{ ua: 'Львівська майстерня шоколаду', en: 'Lviv Handmade Chocolate' },
    ribas:    { ua: 'Ribas Hotel, Одеса', en: 'Ribas Hotel, Odesa' },
    osbb:     { ua: 'ОСББ «Липки»',       en: 'HOA “Lypky”' },
    kpt:      { ua: 'КП «Київпастранс»',  en: 'Kyivpastrans' },
    guliver:  { ua: 'ТРЦ «Гулівер»',      en: 'Gulliver Mall' },
    khresh:   { ua: 'вул. Хрещатик, 22',  en: '22 Khreshchatyk St.' },
    ocean:    { ua: 'ТРЦ «Ocean Plaza»',  en: 'Ocean Plaza Mall' },
    deposit:  { ua: 'Стабільний',         en: 'Stabilnyi' },
    mobileNo: { ua: '+380 67 ••• 41 20',  en: '+380 67 ••• 41 20' },
    cardIn:   { ua: '•••• 5678',          en: '•••• 5678' },
    cardOut1: { ua: '•••• 4412',          en: '•••• 4412' },
    cardOut2: { ua: '•••• 9021',          en: '•••• 9021' },
    cardOut3: { ua: '•••• 3388',          en: '•••• 3388' },
    july:     { ua: 'операції у липні',   en: 'July transactions' }
  };

  /* d — ISO date, a — signed amount in UAH, c — category (icon + tx.<c> label). */
  var TRANSACTIONS = [
    { d: '2026-08-02', a:   -389.00, c: 'cafe',        m: M.coffee },
    { d: '2026-08-01', a:  -2148.35, c: 'grocery',     m: M.silpo },
    { d: '2026-08-01', a:  -1500.00, c: 'transferOut', m: M.cardOut1 },
    { d: '2026-07-31', a:     47.80, c: 'cashback',    m: M.july },
    { d: '2026-07-31', a:   -899.00, c: 'subscription',m: M.netflix },
    { d: '2026-07-30', a:  62450.00, c: 'salary',      m: M.employer },
    { d: '2026-07-30', a:  -6000.00, c: 'depositIn',   m: M.deposit },
    { d: '2026-07-29', a:  -1120.50, c: 'fuel',        m: M.wog },
    { d: '2026-07-28', a:  -3450.00, c: 'online',      m: M.rozetka },
    { d: '2026-07-28', a:   -250.00, c: 'mobile',      m: M.mobileNo },
    { d: '2026-07-27', a:   -684.20, c: 'grocery',     m: M.atb },
    { d: '2026-07-26', a:  -1890.00, c: 'tickets',     m: M.uz },
    { d: '2026-07-25', a:   -420.00, c: 'taxi',        m: M.uklon },
    { d: '2026-07-24', a:  -2760.00, c: 'utilities',   m: M.osbb },
    { d: '2026-07-23', a:  -1345.90, c: 'grocery',     m: M.novus },
    { d: '2026-07-22', a:   3200.00, c: 'transferIn',  m: M.cardIn },
    { d: '2026-07-21', a:   -560.00, c: 'pharmacy',    m: M.aptDobro },
    { d: '2026-07-20', a:  -7800.00, c: 'electronics', m: M.comfy },
    { d: '2026-07-19', a:   -318.00, c: 'delivery',    m: M.glovo },
    { d: '2026-07-18', a:  -2400.00, c: 'atm',         m: M.guliver },
    { d: '2026-07-17', a:   -975.00, c: 'clothes',     m: M.intertop },
    { d: '2026-07-16', a:  -1487.25, c: 'grocery',     m: M.silpo },
    { d: '2026-07-15', a:  28000.00, c: 'salary',      m: M.advance },
    { d: '2026-07-14', a:  -1250.00, c: 'sport',       m: M.sportlife },
    { d: '2026-07-12', a:  -8940.00, c: 'hotel',       m: M.ribas },
    { d: '2026-07-10', a:   -639.00, c: 'cafe',        m: M.puzata },
    { d: '2026-07-08', a:  -4100.00, c: 'transferOut', m: M.cardOut2 },
    { d: '2026-07-06', a:   6416.66, c: 'depositPct',  m: M.deposit },
    { d: '2026-07-05', a:  -2183.40, c: 'grocery',     m: M.novus },
    { d: '2026-07-03', a:  -1780.00, c: 'medical',     m: M.dobrobut },
    { d: '2026-07-01', a:   -300.00, c: 'transport',   m: M.kpt },

    { d: '2026-06-30', a:  62450.00, c: 'salary',      m: M.employer },
    { d: '2026-06-30', a:  -6000.00, c: 'depositIn',   m: M.deposit },
    { d: '2026-06-28', a:  -2340.75, c: 'grocery',     m: M.silpo },
    { d: '2026-06-26', a:  -1590.00, c: 'fuel',        m: M.okko },
    { d: '2026-06-24', a:   -430.00, c: 'taxi',        m: M.bolt },
    { d: '2026-06-22', a:  -5200.00, c: 'online',      m: M.prom },
    { d: '2026-06-20', a:  -3000.00, c: 'atm',         m: M.khresh },
    { d: '2026-06-18', a:   1250.00, c: 'refund',      m: M.rozetka },
    { d: '2026-06-17', a:  -1120.00, c: 'pharmacy',    m: M.apt911 },
    { d: '2026-06-15', a:  28000.00, c: 'salary',      m: M.advance },
    { d: '2026-06-14', a:  -2870.30, c: 'grocery',     m: M.atb },
    { d: '2026-06-12', a:  -1690.00, c: 'tickets',     m: M.busfor },
    { d: '2026-06-10', a:   -899.00, c: 'subscription',m: M.netflix },
    { d: '2026-06-08', a:   -250.00, c: 'mobile',      m: M.mobileNo },
    { d: '2026-06-06', a:   6416.66, c: 'depositPct',  m: M.deposit },
    { d: '2026-06-04', a:  -3560.00, c: 'clothes',     m: M.zara },
    { d: '2026-06-02', a:  -2650.00, c: 'utilities',   m: M.osbb },

    { d: '2026-05-30', a:  62450.00, c: 'salary',      m: M.employer },
    { d: '2026-05-30', a:  -6000.00, c: 'depositIn',   m: M.deposit },
    { d: '2026-05-27', a:  -1980.45, c: 'grocery',     m: M.novus },
    { d: '2026-05-24', a:  -1340.00, c: 'fuel',        m: M.wog },
    { d: '2026-05-21', a: -12500.00, c: 'transferOut', m: M.cardOut3 },
    { d: '2026-05-18', a:   -640.00, c: 'cafe',        m: M.chocolate },
    { d: '2026-05-15', a:  28000.00, c: 'salary',      m: M.advance },
    { d: '2026-05-12', a:  -4300.00, c: 'electronics', m: M.foxtrot },
    { d: '2026-05-09', a:  -2210.60, c: 'grocery',     m: M.silpo },
    { d: '2026-05-06', a:   6416.66, c: 'depositPct',  m: M.deposit },
    { d: '2026-05-04', a:  -2650.00, c: 'utilities',   m: M.osbb },
    { d: '2026-05-02', a:   -318.00, c: 'delivery',    m: M.glovo },

    { d: '2026-04-30', a:  62450.00, c: 'salary',      m: M.employer },
    { d: '2026-04-30', a:  -6000.00, c: 'depositIn',   m: M.deposit },
    { d: '2026-04-25', a:  -3400.00, c: 'atm',         m: M.ocean },
    { d: '2026-04-20', a:  -1875.20, c: 'grocery',     m: M.atb },
    { d: '2026-04-15', a:  28000.00, c: 'salary',      m: M.advance },
    { d: '2026-04-12', a:  -9600.00, c: 'online',      m: M.makeup },
    { d: '2026-04-08', a:  -2650.00, c: 'utilities',   m: M.osbb },
    { d: '2026-04-06', a:   6416.66, c: 'depositPct',  m: M.deposit },
    { d: '2026-04-03', a:  -1450.00, c: 'sport',       m: M.sportlife },

    { d: '2026-03-31', a:  62450.00, c: 'salary',      m: M.employer },
    { d: '2026-03-30', a:  -6000.00, c: 'depositIn',   m: M.deposit },
    { d: '2026-03-22', a:  -2980.00, c: 'clothes',     m: M.intertop },
    { d: '2026-03-15', a:  28000.00, c: 'salary',      m: M.advance },
    { d: '2026-03-12', a:  -2100.00, c: 'grocery',     m: M.silpo },
    { d: '2026-03-06', a:   6416.66, c: 'depositPct',  m: M.deposit },
    { d: '2026-03-05', a:  -2650.00, c: 'utilities',   m: M.osbb },

    { d: '2026-02-27', a:  62450.00, c: 'salary',      m: M.employer },
    { d: '2026-02-20', a:  -3120.00, c: 'grocery',     m: M.novus },
    { d: '2026-02-14', a:  28000.00, c: 'salary',      m: M.advance },
    { d: '2026-02-10', a:  -1890.00, c: 'tickets',     m: M.uz },
    { d: '2026-02-06', a:   6416.66, c: 'depositPct',  m: M.deposit },
    { d: '2026-02-05', a:  -2650.00, c: 'utilities',   m: M.osbb }
  ];

  /* Round to cents — repeated float subtraction otherwise drifts. */
  function cents(value) {
    return Math.round(value * 100) / 100;
  }

  /* Walk newest -> oldest, assigning the balance left after each entry. */
  var running = CARD.balance;
  TRANSACTIONS.forEach(function (tx, index) {
    tx.id = 'tx' + (index + 1);
    tx.balanceAfter = cents(running);
    running = cents(running - tx.a);
  });

  /* Balance the account held before the very first stored transaction. */
  var OPENING_BALANCE = cents(running);

  global.DATA = {
    user: USER,
    card: CARD,
    deposit: DEPOSIT,
    credit: CREDIT,
    offers: OFFERS,
    notifications: NOTIFICATIONS,
    transactions: TRANSACTIONS,
    openingBalance: OPENING_BALANCE,
    /* "Now" for the prototype — keeps relative periods aligned with the data. */
    today: '2026-08-02'
  };
})(window);
