/* ==================================================================
   PrivatB — application controller.
   Screens are plain sections toggled by class; there is no framework.
   ================================================================== */
(function (global) {
  'use strict';

  var D = global.DATA;
  var fmt = global.fmt;
  var i18n = global.i18n;
  var t = i18n.t;

  var $  = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  /* Category -> sprite symbol. */
  var TX_ICON = {
    grocery: 'cart',      transferIn: 'arrow-down-left', transferOut: 'arrow-up-right',
    atm: 'banknote',      salary: 'wallet',              tickets: 'ticket',
    mobile: 'phone',      cafe: 'coffee',                pharmacy: 'medkit',
    fuel: 'fuel',         utilities: 'home',             online: 'globe',
    taxi: 'car',          transport: 'bus',              depositIn: 'piggy',
    depositPct: 'percent',cashback: 'gift',              subscription: 'play',
    clothes: 'bag',       delivery: 'box',               hotel: 'bed',
    sport: 'dumbbell',    medical: 'heart',              electronics: 'monitor',
    refund: 'rotate-left',fee: 'percent'
  };

  var TAB_SCREENS = ['dashboard', 'products', 'notifications', 'more'];
  var state = {
    screen: 'login',
    history: [],
    period: 'week',
    sheet: null,
    busyMin: 1100,
    loadTimers: [],
    cardTimer: null,
    cardLoading: false,
    revealed: false,
    revealTimer: null,
    stream: null,
    scanMode: null,
    scanOpen: false,
    autoBioTried: false,
    suppressAutoBio: false,
    leaving: false
  };

  var SCAN_MODES = {
    transfer: { title: 'scan.transfer.title', hint: 'scan.transfer.hint' },
    topup:    { title: 'scan.topup.title',    hint: 'scan.topup.hint' },
    payments: { title: 'scan.payments.title', hint: 'scan.payments.hint' },
    qr:       { title: 'scan.qr.title',       hint: 'scan.qr.hint' }
  };

  /* ---------------------------------------------------------------- utils */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function icon(name, className) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ico' + (className ? ' ' + className : ''));
    svg.setAttribute('viewBox', '0 0 24 24');
    var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#i-' + name);
    svg.appendChild(use);
    return svg;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  /* ---------------------------------------------------------------- i18n */

  function applyTranslations() {
    document.documentElement.lang = i18n.lang === 'ua' ? 'uk' : 'en';

    $$('[data-i18n]').forEach(function (node) {
      node.textContent = t(node.getAttribute('data-i18n'));
    });

    $$('[data-lang-toggle] span').forEach(function (node) {
      node.textContent = i18n.other().toUpperCase();
    });

    $$('.lang-switch__btn').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.lang === i18n.lang);
    });
  }

  function setLanguage(lang) {
    if (!i18n.set(lang)) return;
    applyTranslations();
    renderAll();
    /* Module screens build their own markup, so redraw the visible one. */
    global.Modules.refresh(state.screen);
    toast(t('toast.langChanged'));
  }

  /* -------------------------------------------------------------- toasts */

  function toast(message, variant) {
    var host = $('#toasts');
    var node = el('div', 'toast' + (variant ? ' toast--' + variant : ''));
    var badge = el('span', 'toast__ico');
    badge.appendChild(icon(variant === 'info' ? 'info' : 'check'));
    node.appendChild(badge);
    node.appendChild(el('span', null, message));
    host.appendChild(node);

    setTimeout(function () {
      node.classList.add('is-hiding');
      node.addEventListener('animationend', function () { node.remove(); }, { once: true });
    }, 3000);
  }

  /* ------------------------------------------------------------- routing */

  function screenNode(name) { return $('#screen-' + name); }

  function go(name, mode) {
    if (name === state.screen) return;

    var from = screenNode(state.screen);
    var to = screenNode(name);
    if (!to) return;

    ['anim-in', 'anim-push', 'anim-pop'].forEach(function (c) {
      from.classList.remove(c);
      to.classList.remove(c);
    });

    from.classList.remove('is-active');
    to.classList.add('is-active');
    to.classList.add(mode === 'push' ? 'anim-push' : mode === 'pop' ? 'anim-pop' : 'anim-in');

    /* Reset scroll so a re-entered screen starts at the top. */
    var body = $('.screen__body', to);
    if (body) body.scrollTop = 0;

    state.screen = name;
    updateChrome();
  }

  /* ---------------------------------------------------------------------
   * Navigation is mirrored into the browser history so that the platform
   * back gesture — Android's back, iOS's swipe from the screen edge —
   * moves inside the app instead of leaving it. There is always one spare
   * history entry, so the last back is intercepted and confirmed rather
   * than closing the app outright.
   * ------------------------------------------------------------------- */

  function guardHistory() {
    try { history.pushState({ app: true }, ''); } catch (e) { /* ignore */ }
  }

  function resetNavigation() {
    state.history = [];
    try {
      history.replaceState({ app: true }, '');
      guardHistory();
    } catch (e) { /* ignore */ }
  }

  function push(name, mode) {
    if (name === state.screen) return;
    state.history.push(state.screen);
    guardHistory();
    go(name, mode || 'push');
  }

  /* Hands control to the browser; the popstate handler does the work, so
     the in-app back button and the system gesture share one code path. */
  function back() {
    history.back();
  }

  function onPopState() {
    /* Anything layered on top is dismissed first. */
    if (state.scanOpen) { closeScanner(); guardHistory(); return; }
    if (state.sheet) { closeSheet(); guardHistory(); return; }

    if (state.history.length) {
      go(state.history.pop(), 'pop');
      return;
    }

    /* Nothing left to go back to — ask before letting go. */
    guardHistory();
    if (state.screen !== 'loading') openSheet('sheet-exit');
  }

  function leaveApp() {
    state.leaving = true;
    closeSheet(true);
    try { window.close(); } catch (e) { /* not script-opened */ }
    /* window.close() only works for windows opened by script, so in a tab
       or an installed PWA the OS stays in charge — say so plainly. */
    setTimeout(function () {
      state.leaving = false;
      toast(t('exit.manual'), 'info');
    }, 400);
  }

  function updateChrome() {
    var isApp = state.screen !== 'login' && state.screen !== 'loading';
    $('#tabbar').hidden = !isApp;

    /* Drill-downs and quick-action modules all hang off Home. */
    var activeTab = TAB_SCREENS.indexOf(state.screen) === -1 ? 'dashboard' : state.screen;
    $$('.tabbar__item').forEach(function (item) {
      item.classList.toggle('is-active', item.dataset.tab === activeTab);
    });
  }

  /* ------------------------------------------------------------ rendering */

  function renderIdentity() {
    var lang = i18n.lang;
    $('#user-name').textContent = D.user.firstName[lang];
    $('#profile-name').textContent = D.user.fullName[lang];
    $('#avatar').textContent = D.user.initials;
    $('#avatar-lg').textContent = D.user.initials;

    $('#card-number').textContent = D.card.masked;
    $('#card-balance').textContent = fmt.withCurrency(D.card.balance);
    $('#card-valid').textContent = D.card.valid;

    $$('[data-card-number]').forEach(function (n) {
      n.textContent = state.revealed ? D.card.number : D.card.masked;
    });
    $('#card-cvv').textContent = state.revealed ? D.card.cvv : '•••';
    $$('[data-card-balance]').forEach(function (n) {
      n.textContent = fmt.withCurrency(D.card.balance);
    });
    $$('[data-card-valid]').forEach(function (n) { n.textContent = D.card.valid; });
  }

  /* One transaction row. */
  function txRow(tx, index) {
    var row = el('li', 'tx');
    row.style.animationDelay = Math.min(index, 12) * 35 + 'ms';

    var incoming = tx.a >= 0;
    var box = el('span', 'tx__ico' + (incoming ? ' tx__ico--in' : ''));
    box.appendChild(icon(TX_ICON[tx.c] || 'card'));
    row.appendChild(box);

    var body = el('span', 'tx__body');
    body.appendChild(el('span', 'tx__title', t('tx.' + tx.c, { m: tx.m[i18n.lang] })));
    body.appendChild(el('span', 'tx__meta', fmt.dateShort(tx.d)));
    row.appendChild(body);

    row.appendChild(el('span', 'tx__amount ' + (incoming ? 'tx__amount--in' : 'tx__amount--out'),
      fmt.signedWithCurrency(tx.a)));

    return row;
  }

  function renderRecent() {
    var host = $('#dash-recent');
    clear(host);
    D.transactions.slice(0, 4).forEach(function (tx, i) { host.appendChild(txRow(tx, i)); });
  }

  /* Placeholder shown while the card's spending history "loads". */
  function renderHistoryLoader() {
    var host = $('#tx-history');
    clear(host);

    var head = el('div', 'loading-row');
    var spinner = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    spinner.setAttribute('class', 'spinner spinner--xs');
    spinner.setAttribute('viewBox', '0 0 50 50');
    ['spinner__track', 'spinner__bar'].forEach(function (cls) {
      var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('class', cls);
      c.setAttribute('cx', '25'); c.setAttribute('cy', '25'); c.setAttribute('r', '20');
      spinner.appendChild(c);
    });
    head.appendChild(spinner);
    head.appendChild(el('span', null, t('card.loading')));
    host.appendChild(head);

    var list = el('ul', 'tx-list');
    for (var i = 0; i < 6; i++) {
      var row = el('li', 'tx tx--skeleton');
      row.style.animationDelay = i * 60 + 'ms';
      row.appendChild(el('span', 'skeleton skeleton--ico'));
      var body = el('span', 'tx__body');
      body.appendChild(el('span', 'skeleton skeleton--line'));
      body.appendChild(el('span', 'skeleton skeleton--line skeleton--short'));
      row.appendChild(body);
      row.appendChild(el('span', 'skeleton skeleton--amount'));
      list.appendChild(row);
    }
    host.appendChild(list);
  }

  /* Enter the card screen with a short load before the history appears. */
  function openCard() {
    push('card');
    state.cardLoading = true;
    renderHistoryLoader();

    clearTimeout(state.cardTimer);
    state.cardTimer = setTimeout(function () {
      state.cardLoading = false;
      renderHistory();
    }, 2000);
  }

  /* Full history on the card screen, grouped by month. */
  function renderHistory() {
    var host = $('#tx-history');
    clear(host);

    var groups = [];
    var byKey = {};
    D.transactions.forEach(function (tx) {
      var key = tx.d.slice(0, 7);
      if (!byKey[key]) {
        byKey[key] = { key: key, date: tx.d, rows: [] };
        groups.push(byKey[key]);
      }
      byKey[key].rows.push(tx);
    });

    if (!groups.length) {
      host.appendChild(el('p', 'empty', t('card.empty')));
      return;
    }

    var seen = 0;
    groups.forEach(function (group) {
      var wrap = el('div', 'tx-group');
      wrap.appendChild(el('div', 'tx-group__label', fmt.monthLabel(group.date)));
      var list = el('ul', 'tx-list');
      group.rows.forEach(function (tx) { list.appendChild(txRow(tx, seen++)); });
      wrap.appendChild(list);
      host.appendChild(wrap);
    });
  }

  /* Deposit / credit cards, reused on Dashboard and Products. */
  function depositCard() {
    var card = el('div', 'pcard');

    var head = el('div', 'pcard__head');
    var ico = el('span', 'pcard__ico');
    ico.appendChild(icon('piggy'));
    head.appendChild(ico);
    var titles = el('span', 'pcard__titles');
    titles.appendChild(el('b', 'pcard__name', t('deposit.name')));
    titles.appendChild(el('span', 'pcard__note', t('deposit.rate')));
    head.appendChild(titles);
    head.appendChild(el('span', 'pcard__tag', t('products.active')));
    card.appendChild(head);

    var figures = el('div', 'pcard__figures');
    var main = el('div', 'pcard__figure');
    main.appendChild(el('small', null, t('deposit.amount')));
    main.appendChild(el('b', null, fmt.withCurrency(D.deposit.amount)));
    figures.appendChild(main);

    var cta = el('button', 'pcard__cta', t('common.more'));
    cta.type = 'button';
    cta.addEventListener('click', function () { openProductSheet('deposit'); });
    figures.appendChild(cta);
    card.appendChild(figures);

    var bar = el('div', 'pcard__bar');
    var fill = el('i');
    fill.style.width = '68%';
    bar.appendChild(fill);
    card.appendChild(bar);

    return card;
  }

  function creditCard() {
    var card = el('div', 'pcard');

    var head = el('div', 'pcard__head');
    var ico = el('span', 'pcard__ico pcard__ico--warm');
    ico.appendChild(icon('banknote'));
    head.appendChild(ico);
    var titles = el('span', 'pcard__titles');
    titles.appendChild(el('b', 'pcard__name', t('credit.name')));
    titles.appendChild(el('span', 'pcard__note', t('credit.rateValue')));
    head.appendChild(titles);
    card.appendChild(head);

    var figures = el('div', 'pcard__figures');
    var main = el('div', 'pcard__figure');
    main.appendChild(el('small', null, t('credit.limitLabel')));
    main.appendChild(el('b', null, fmt.withCurrency(D.credit.limit)));
    figures.appendChild(main);

    var cta = el('button', 'pcard__cta pcard__cta--solid', t('credit.apply'));
    cta.type = 'button';
    cta.addEventListener('click', function () { openProductSheet('credit'); });
    figures.appendChild(cta);
    card.appendChild(figures);

    return card;
  }

  function offerCard(offer) {
    var card = el('div', 'pcard');
    var head = el('div', 'pcard__head');
    var ico = el('span', 'pcard__ico');
    ico.appendChild(icon(offer.icon));
    head.appendChild(ico);
    var titles = el('span', 'pcard__titles');
    titles.appendChild(el('b', 'pcard__name', t(offer.nameKey)));
    titles.appendChild(el('span', 'pcard__note', t(offer.descKey)));
    head.appendChild(titles);
    card.appendChild(head);

    var figures = el('div', 'pcard__figures');
    figures.appendChild(el('span'));
    var cta = el('button', 'pcard__cta', t('products.open'));
    cta.type = 'button';
    cta.dataset.soon = '';
    figures.appendChild(cta);
    card.appendChild(figures);
    return card;
  }

  function cardProductCard() {
    var card = el('div', 'pcard');
    var head = el('div', 'pcard__head');
    var ico = el('span', 'pcard__ico');
    ico.appendChild(icon('card'));
    head.appendChild(ico);
    var titles = el('span', 'pcard__titles');
    titles.appendChild(el('b', 'pcard__name', t('products.card.name')));
    titles.appendChild(el('span', 'pcard__note', t('products.card.desc')));
    head.appendChild(titles);
    head.appendChild(el('span', 'pcard__tag', t('products.active')));
    card.appendChild(head);

    var figures = el('div', 'pcard__figures');
    var main = el('div', 'pcard__figure');
    main.appendChild(el('small', null, D.card.masked));
    main.appendChild(el('b', null, fmt.withCurrency(D.card.balance)));
    figures.appendChild(main);
    var cta = el('button', 'pcard__cta', t('common.more'));
    cta.type = 'button';
    cta.addEventListener('click', openCard);
    figures.appendChild(cta);
    card.appendChild(figures);
    return card;
  }

  function renderProducts() {
    var dash = $('#dash-products');
    clear(dash);
    dash.appendChild(depositCard());
    dash.appendChild(creditCard());

    var mine = $('#products-mine');
    clear(mine);
    mine.appendChild(cardProductCard());
    mine.appendChild(depositCard());

    var offers = $('#products-offers');
    clear(offers);
    offers.appendChild(creditCard());
    D.offers.forEach(function (offer) { offers.appendChild(offerCard(offer)); });
  }

  function renderNotifications() {
    var host = $('#notif-list');
    clear(host);

    D.notifications.forEach(function (n, index) {
      var item = el('li', 'notif' + (n.unread ? ' is-unread' : ''));
      item.style.animationDelay = Math.min(index, 10) * 45 + 'ms';

      var ico = el('span', 'notif__ico');
      ico.appendChild(icon(n.icon));
      item.appendChild(ico);

      var body = el('span', 'notif__body');
      body.appendChild(el('span', 'notif__title', n.title[i18n.lang]));
      body.appendChild(el('span', 'notif__text', n.text[i18n.lang]));
      body.appendChild(el('span', 'notif__time', fmt.timeAgo(n.at, D.today, i18n.lang)));
      item.appendChild(body);

      if (n.unread) item.appendChild(el('span', 'notif__dot'));
      host.appendChild(item);
    });

    updateBadges();
  }

  function updateBadges() {
    var unread = D.notifications.filter(function (n) { return n.unread; }).length;
    [$('#badge-top'), $('#badge-tab')].forEach(function (badge) {
      badge.hidden = unread === 0;
      badge.textContent = unread;
    });
  }

  function renderAll() {
    renderIdentity();
    renderRecent();
    /* Don't stomp on an in-flight card load (e.g. language switched mid-load). */
    if (state.cardLoading) renderHistoryLoader(); else renderHistory();
    renderProducts();
    renderNotifications();
    syncDateInputs();
  }

  /* --------------------------------------------------------------- sheets */

  /* Hides a node once its exit animation ends, with a timer fallback:
     animationend never fires while the page is backgrounded, which would
     otherwise strand the overlay on screen and swallow back gestures. */
  function hideAfterExit(node, done) {
    var finished = false;
    var finish = function () {
      if (finished) return;
      finished = true;
      node.hidden = true;
      node.classList.remove('is-hiding');
      if (done) done();
    };
    node.addEventListener('animationend', finish, { once: true });
    setTimeout(finish, 340);
  }

  function openSheet(id) {
    closeSheet(true);
    var sheet = $('#' + id);
    var scrim = $('#scrim');
    scrim.hidden = false;
    scrim.classList.remove('is-hiding');
    sheet.hidden = false;
    sheet.classList.remove('is-hiding');
    state.sheet = id;
  }

  function closeSheet(immediate) {
    if (!state.sheet) return;
    var sheet = $('#' + state.sheet);
    var scrim = $('#scrim');
    state.sheet = null;

    if (immediate) {
      sheet.hidden = true;
      scrim.hidden = true;
      return;
    }

    sheet.classList.add('is-hiding');
    scrim.classList.add('is-hiding');
    hideAfterExit(sheet);
    hideAfterExit(scrim);
  }

  function detailRow(label, value) {
    var row = el('div', 'pcard__figure pcard__figure--sm');
    row.appendChild(el('small', null, label));
    row.appendChild(el('b', null, value));
    return row;
  }

  function openProductSheet(kind) {
    var body = $('#sheet-product-body');
    clear(body);

    var head = el('div', 'pcard__head');
    var ico = el('span', 'pcard__ico' + (kind === 'credit' ? ' pcard__ico--warm' : ''));
    ico.appendChild(icon(kind === 'credit' ? 'banknote' : 'piggy'));
    head.appendChild(ico);
    var titles = el('span', 'pcard__titles');
    titles.appendChild(el('b', 'pcard__name', t(kind + '.name')));
    titles.appendChild(el('span', 'pcard__note',
      kind === 'credit' ? t('credit.limit') : t('deposit.rate')));
    head.appendChild(titles);
    body.appendChild(head);

    body.appendChild(el('p', 'sheet__sub', t(kind + '.desc')));

    var grid = el('div', 'options');
    grid.style.gap = '10px';

    if (kind === 'deposit') {
      var d1 = el('div', 'option');
      d1.appendChild(detailRow(t('deposit.amount'), fmt.withCurrency(D.deposit.amount)));
      d1.appendChild(detailRow(t('deposit.income'), fmt.withCurrency(D.deposit.accrued)));
      grid.appendChild(d1);
      var d2 = el('div', 'option');
      d2.appendChild(detailRow(t('deposit.term'), t('deposit.termValue')));
      d2.appendChild(detailRow(t('deposit.next'), fmt.dateShort(D.deposit.nextPayout)));
      grid.appendChild(d2);
    } else {
      var c1 = el('div', 'option');
      c1.appendChild(detailRow(t('credit.rate'), t('credit.rateValue')));
      c1.appendChild(detailRow(t('credit.term'), t('credit.termValue')));
      grid.appendChild(c1);
      var c2 = el('div', 'option');
      c2.appendChild(detailRow(t('credit.monthly'), fmt.withCurrency(D.credit.monthlyExample)));
      grid.appendChild(c2);
    }
    body.appendChild(grid);

    var cta = el('button', 'btn btn--primary btn--block',
      kind === 'credit' ? t('credit.apply') : t('common.more'));
    cta.type = 'button';
    cta.dataset.soon = '';
    body.appendChild(cta);

    openSheet('sheet-product');
  }

  /* -------------------------------------------------------- card details */

  function setReveal(on) {
    clearTimeout(state.revealTimer);
    state.revealed = on;

    $('#bankcard-detail').classList.toggle('is-revealed', on);
    $('#btn-reveal').setAttribute('aria-pressed', on ? 'true' : 'false');
    $('#reveal-icon').setAttribute('href', on ? '#i-eye-off' : '#i-eye');

    $$('[data-card-number]').forEach(function (n) {
      n.textContent = on ? D.card.number : D.card.masked;
    });
    $('#card-cvv').textContent = on ? D.card.cvv : '•••';

    /* Don't leave the full number sitting on screen. */
    if (on) {
      state.revealTimer = setTimeout(function () {
        setReveal(false);
        toast(t('card.hidden'), 'info');
      }, 20000);
    }
  }

  function copyText(text, message) {
    var failed = function () { toast(t('card.copyFailed'), 'info'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(function () { toast(message); })
        .catch(failed);
      return;
    }
    failed();
  }

  function copyCardNumber() {
    copyText(D.card.number.replace(/\s/g, ''), t('card.copied'));
  }

  /* ------------------------------------------------------------- scanner */

  function showScanError(titleKey, textKey) {
    var node = $('#scanner');
    node.classList.add('has-error');
    $('#scanner-error-title').textContent = t(titleKey);
    $('#scanner-error-text').textContent = t(textKey);
    $('#scanner-error').hidden = false;
  }

  function startCamera() {
    var cfg = SCAN_MODES[state.scanMode] || SCAN_MODES.qr;
    var video = $('#scanner-video');

    $('#scanner').classList.remove('has-error');
    $('#scanner-error').hidden = true;
    $('#scanner-hint').textContent = t('scan.starting');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showScanError('scan.unavailable', 'scan.deniedHint');
      return;
    }

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    }).then(function (stream) {
      state.stream = stream;
      video.srcObject = stream;
      var playing = video.play();
      if (playing && playing.catch) playing.catch(function () { /* autoplay guard */ });
      $('#scanner-hint').textContent = t(cfg.hint);
    }).catch(function (err) {
      var denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      showScanError(denied ? 'scan.denied' : 'scan.unavailable', 'scan.deniedHint');
      console.warn('[camera]', err);
    });
  }

  function openScanner(mode) {
    state.scanMode = mode;
    state.scanOpen = true;
    var node = $('#scanner');
    $('#scanner-title').textContent = t(SCAN_MODES[mode].title);
    node.hidden = false;
    node.classList.remove('is-hiding');
    /* So the back gesture closes the viewfinder before anything else. */
    guardHistory();
    startCamera();
  }

  function stopCamera() {
    if (state.stream) {
      state.stream.getTracks().forEach(function (track) { track.stop(); });
      state.stream = null;
    }
    var video = $('#scanner-video');
    video.pause();
    video.srcObject = null;
  }

  function closeScanner() {
    if (!state.scanOpen) return;
    /* Flip the flag first: routing decisions must not wait on the animation. */
    state.scanOpen = false;
    stopCamera();
    var node = $('#scanner');
    node.classList.add('is-hiding');
    hideAfterExit(node);
  }

  /* ------------------------------------------------------------ statement */

  function periodRange() {
    if (state.period === 'week')  return { from: fmt.shiftDays(D.today, -6), to: D.today };
    if (state.period === 'month') return { from: fmt.shiftDays(D.today, -29), to: D.today };
    return { from: $('#date-from').value, to: $('#date-to').value };
  }

  function syncDateInputs() {
    var from = $('#date-from');
    var to = $('#date-to');
    if (!from.value) from.value = fmt.shiftDays(D.today, -29);
    if (!to.value) to.value = D.today;
    from.max = D.today;
    to.max = D.today;
  }

  function showDateError(message) {
    var node = $('#date-error');
    if (!message) { node.hidden = true; return; }
    node.textContent = message;
    node.hidden = false;
    /* restart the shake animation */
    node.style.animation = 'none';
    void node.offsetWidth;
    node.style.animation = '';
  }

  function validateRange(range) {
    if (state.period !== 'custom') return true;
    if (!range.from || !range.to) { showDateError(t('statement.errEmpty')); return false; }
    if (range.from > range.to)    { showDateError(t('statement.errRange')); return false; }
    if (range.to > D.today)       { showDateError(t('statement.errFuture')); return false; }
    showDateError(null);
    return true;
  }

  function generateStatement() {
    var range = periodRange();
    if (!validateRange(range)) return;

    closeSheet();
    var busy = $('#busy');
    busy.hidden = false;
    var startedAt = Date.now();

    var finish = function (fn) {
      var wait = Math.max(0, state.busyMin - (Date.now() - startedAt));
      setTimeout(function () { busy.hidden = true; fn(); }, wait);
    };

    global.Statement.generate(range).then(function () {
      finish(function () { toast(t('toast.saved')); });
    }).catch(function (err) {
      finish(function () {
        toast(i18n.lang === 'en'
          ? 'Could not generate the statement'
          : 'Не вдалося сформувати виписку', 'info');
      });
      console.error('[statement]', err);
    });
  }

  /* ----------------------------------------------------------- login flow */

  function setLoginStatus(key, tone) {
    var status = $('#login-status');
    status.textContent = t(key);
    status.classList.toggle('is-ok', tone === 'ok');
    status.classList.toggle('is-error', tone === 'error');
  }

  /* Used only when the device has no platform authenticator, so the
     scanner still demonstrates the interaction. */
  function simulateScan() {
    return new Promise(function (resolve) { setTimeout(resolve, 2000); });
  }

  function runBiometrics(auto) {
    var scanner = $('#btn-biometric');
    /* A second tap withdraws a request the user never answered. */
    if (scanner.dataset.busy === '1') {
      if (!auto) global.Biometrics.abort();
      return;
    }

    scanner.dataset.busy = '1';
    scanner.classList.remove('is-done', 'is-failed');
    scanner.classList.add('is-scanning');
    setLoginStatus('login.scanning');
    $('#btn-login').disabled = true;

    var promptedAt = 0;

    global.Biometrics.available().then(function (hasPlatformAuth) {
      if (!hasPlatformAuth) {
        toast(t('login.noBiometry'), 'info');
        return simulateScan();
      }
      /* Swap the timed ring for an indeterminate one: the system sheet
         stays up for as long as the user needs. */
      scanner.classList.remove('is-scanning');
      scanner.classList.add('is-waiting');
      setLoginStatus('login.prompt');
      promptedAt = Date.now();
      return global.Biometrics.authenticate(D.user.fullName[i18n.lang]);
    }).then(function () {
      scanner.classList.remove('is-scanning', 'is-waiting');
      scanner.classList.add('is-done');
      setLoginStatus('login.success', 'ok');
      setTimeout(showLoading, 520);
    }).catch(function (err) {
      scanner.classList.remove('is-scanning', 'is-waiting');
      scanner.dataset.busy = '';
      $('#btn-login').disabled = false;

      /* Safari only allows WebAuthn from a user gesture. On the automatic
         attempt an instant rejection means the system sheet never opened,
         so fall back to the button rather than blaming the user. */
      var instant = promptedAt && Date.now() - promptedAt < 400;
      if (auto && instant) {
        setLoginStatus('login.hint');
        return;
      }

      scanner.classList.add('is-failed');
      var cancelled = err && (err.name === 'NotAllowedError' || err.name === 'AbortError');
      setLoginStatus(cancelled ? 'login.cancelled' : 'login.failed', 'error');
      toast(t(cancelled ? 'login.cancelled' : 'login.failed'), 'info');
      if (!cancelled) console.warn('[biometrics]', err);
    });
  }

  /* Ask for biometrics as soon as the login screen settles, without
     waiting for the button. Skipped right after an explicit sign-out. */
  function maybeAutoBiometrics() {
    if (state.autoBioTried || state.suppressAutoBio) return;
    state.autoBioTried = true;
    setTimeout(function () {
      if (state.screen === 'login') runBiometrics(true);
    }, 700);
  }

  var LOADING_MS = 5000;

  function showLoading() {
    go('loading');

    var bar = $('#load-progress');
    var sub = $('#load-sub');
    bar.style.width = '0%';

    /* Six ticks spread across the five seconds, each with its own caption. */
    var ticks = [
      { pct: 12,  key: 'loading.sub1' },
      { pct: 31,  key: 'loading.sub1' },
      { pct: 52,  key: 'loading.sub2' },
      { pct: 71,  key: 'loading.sub2' },
      { pct: 88,  key: 'loading.sub3' },
      { pct: 100, key: 'loading.sub3' }
    ];
    var step = (LOADING_MS - 200) / ticks.length;

    state.loadTimers.forEach(clearTimeout);
    state.loadTimers = ticks.map(function (tick, i) {
      return setTimeout(function () {
        bar.style.width = tick.pct + '%';
        sub.textContent = t(tick.key);
      }, 150 + i * step);
    });

    state.loadTimers.push(setTimeout(function () {
      go('dashboard');
      resetNavigation();
      toast(t('toast.login'));
      resetLogin();
    }, LOADING_MS));
  }

  function resetLogin() {
    var scanner = $('#btn-biometric');
    scanner.classList.remove('is-scanning', 'is-waiting', 'is-done', 'is-failed');
    scanner.dataset.busy = '';
    setLoginStatus('login.hint');
    $('#btn-login').disabled = false;
  }

  function logout() {
    closeSheet(true);
    closeScanner();
    setReveal(false);
    state.loadTimers.forEach(clearTimeout);
    state.loadTimers = [];
    clearTimeout(state.cardTimer);
    state.cardLoading = false;
    /* Signing out on purpose shouldn't immediately re-prompt for a finger. */
    state.suppressAutoBio = true;
    go('login');
    resetNavigation();
    resetLogin();
    toast(t('toast.logout'));
  }

  /* ---------------------------------------------------------------- theme */

  function setTheme(dark, silent) {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    $('#theme-toggle').setAttribute('aria-checked', dark ? 'true' : 'false');
    var meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0E1511' : '#2E7D32');
    if (!silent) {
      try { localStorage.setItem('privatb.theme', dark ? 'dark' : 'light'); } catch (e) { /* ignore */ }
    }
  }

  /* --------------------------------------------------------------- events */

  function ripple(event) {
    var target = event.target.closest('.btn');
    if (!target) return;
    var rect = target.getBoundingClientRect();
    var size = Math.max(rect.width, rect.height);
    var node = el('span', 'ripple');
    node.style.width = node.style.height = size + 'px';
    node.style.left = (event.clientX - rect.left - size / 2) + 'px';
    node.style.top = (event.clientY - rect.top - size / 2) + 'px';
    target.appendChild(node);
    node.addEventListener('animationend', function () { node.remove(); }, { once: true });
  }

  function bindEvents() {
    /* Global delegation for simple, repeated intents. */
    document.addEventListener('click', function (event) {
      var scan = event.target.closest('[data-scan]');
      if (scan) { openScanner(scan.dataset.scan); return; }

      var reveal = event.target.closest('[data-reveal]');
      if (reveal) { setReveal(!state.revealed); return; }

      var soon = event.target.closest('[data-soon]');
      if (soon) { toast(t('common.soon'), 'info'); return; }

      var goTo = event.target.closest('[data-go]');
      if (goTo) {
        var target = goTo.dataset.go;
        if (target === 'card') openCard();
        else {
          if (global.Modules.owns(target)) global.Modules.enter(target);
          push(target);
        }
        return;
      }

      var backBtn = event.target.closest('[data-back]');
      if (backBtn) { back(); return; }

      var langBtn = event.target.closest('[data-lang]');
      if (langBtn) { setLanguage(langBtn.dataset.lang); return; }

      var langToggle = event.target.closest('[data-lang-toggle]');
      if (langToggle) { setLanguage(i18n.other()); return; }

      var closer = event.target.closest('[data-close-sheet]');
      if (closer) { closeSheet(); return; }
    });

    /* Delegated so buttons rendered later (product sheet) ripple too. */
    document.addEventListener('pointerdown', ripple);

    $('#btn-login').addEventListener('click', runBiometrics);
    $('#btn-biometric').addEventListener('click', runBiometrics);

    $('#bankcard-main').addEventListener('click', openCard);

    $('#btn-reset-bio').addEventListener('click', function () {
      global.Biometrics.forget();
      toast(t('toast.bioReset'));
    });

    $$('.tabbar__item').forEach(function (item) {
      item.addEventListener('click', function () {
        var target = item.dataset.tab;
        var currentIndex = TAB_SCREENS.indexOf(state.screen);
        var nextIndex = TAB_SCREENS.indexOf(target);
        push(target, nextIndex > currentIndex ? 'push' : 'pop');
      });
    });

    $('#btn-statement').addEventListener('click', function () {
      syncDateInputs();
      showDateError(null);
      openSheet('sheet-statement');
    });

    $$('#period-options .option').forEach(function (option) {
      option.addEventListener('click', function () {
        $$('#period-options .option').forEach(function (o) { o.classList.remove('is-selected'); });
        option.classList.add('is-selected');
        state.period = option.dataset.period;
        $('#daterange').hidden = state.period !== 'custom';
        showDateError(null);
      });
    });

    $('#btn-generate').addEventListener('click', generateStatement);
    $('#scrim').addEventListener('click', function () { closeSheet(); });

    $('#btn-mark-read').addEventListener('click', function () {
      D.notifications.forEach(function (n) { n.unread = false; });
      renderNotifications();
      toast(t('toast.notifRead'));
    });

    $('#theme-toggle').addEventListener('click', function () {
      setTheme(document.documentElement.dataset.theme !== 'dark');
    });

    $('#btn-logout').addEventListener('click', logout);

    /* Card details */
    $('#btn-reveal').addEventListener('click', function () { setReveal(!state.revealed); });
    $('#bankcard-detail').addEventListener('click', function (event) {
      if (state.revealed && event.target.closest('.bankcard__number')) copyCardNumber();
    });

    /* Scanner */
    $('#scanner-close').addEventListener('click', function () { back(); });
    $('#scanner-retry').addEventListener('click', startCamera);

    /* Exit confirmation */
    $('#btn-stay').addEventListener('click', function () { closeSheet(); });
    $('#btn-leave').addEventListener('click', leaveApp);

    global.addEventListener('popstate', onPopState);

    /* Last line of defence for a real tab close or reload. */
    global.addEventListener('beforeunload', function (event) {
      if (state.leaving || state.screen === 'login' || state.screen === 'loading') return;
      event.preventDefault();
      event.returnValue = '';
      return '';
    });

    /* Free the camera if the app is backgrounded. */
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && state.scanOpen) closeScanner();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      if (state.scanOpen || state.sheet || state.history.length) back();
    });
  }

  /* ------------------------------------------------------------ bootstrap */

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    /* file:// has no service worker scope — skip quietly. */
    if (location.protocol === 'file:') return;
    global.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (err) {
        console.warn('[sw] registration failed', err);
      });
    });
  }

  function init() {
    var savedTheme = null;
    try { savedTheme = localStorage.getItem('privatb.theme'); } catch (e) { /* ignore */ }
    setTheme(savedTheme === 'dark', true);

    global.Modules.init({ toast: toast, back: back, copy: copyText });

    applyTranslations();
    renderAll();
    setReveal(false);
    bindEvents();
    updateChrome();
    resetNavigation();
    registerServiceWorker();
    maybeAutoBiometrics();

    global.addEventListener('offline', function () { toast(t('toast.offline'), 'info'); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
