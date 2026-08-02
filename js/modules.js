/* ==================================================================
   Quick-action modules: Transfer, Top up, Payments.
   (QR payment is the camera viewfinder and lives in app.js.)

   Each module owns a screen and renders its own steps into it. The host
   passes in the few helpers it needs via Modules.init(), so this file
   never reaches into the app's internals.
   ================================================================== */
(function (global) {
  'use strict';

  var D = global.DATA;
  var fmt = global.fmt;
  var i18n = global.i18n;
  var t = i18n.t;

  var api = null;          /* { toast, go, back, copy } */
  var $ = function (sel) { return document.querySelector(sel); };

  /* Per-module step state, reset whenever a module is entered. */
  var transfer = {};
  var payments = {};

  /* ------------------------------- helpers ------------------------------ */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function icon(name) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ico');
    svg.setAttribute('viewBox', '0 0 24 24');
    var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#i-' + name);
    svg.appendChild(use);
    return svg;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function field(labelKey, input) {
    var wrap = el('label', 'field field--block');
    wrap.appendChild(el('span', 'field__label', t(labelKey)));
    wrap.appendChild(input);
    return wrap;
  }

  function textInput(opts) {
    var input = el('input', 'field__input');
    input.type = opts.type || 'text';
    if (opts.inputMode) input.inputMode = opts.inputMode;
    if (opts.placeholder) input.placeholder = opts.placeholder;
    if (opts.value) input.value = opts.value;
    if (opts.maxLength) input.maxLength = opts.maxLength;
    return input;
  }

  /* Groups digits as 4-4-4-4 while typing, keeping the caret at the end. */
  function bindCardMask(input) {
    input.addEventListener('input', function () {
      var digits = input.value.replace(/\D/g, '').slice(0, 16);
      input.value = digits.replace(/(.{4})(?=.)/g, '$1 ');
    });
  }

  function bindPhoneMask(input) {
    input.addEventListener('input', function () {
      var d = input.value.replace(/\D/g, '').slice(0, 10);
      var out = d.slice(0, 3);
      if (d.length > 3) out += ' ' + d.slice(3, 6);
      if (d.length > 6) out += ' ' + d.slice(6, 8);
      if (d.length > 8) out += ' ' + d.slice(8, 10);
      input.value = out;
    });
  }

  function bindAmountMask(input) {
    input.addEventListener('input', function () {
      /* digits and a single separator, max two decimals */
      var v = input.value.replace(/[^\d.,]/g, '').replace(/,/g, '.');
      var parts = v.split('.');
      input.value = parts.length > 1
        ? parts[0] + '.' + parts.slice(1).join('').slice(0, 2)
        : parts[0];
    });
  }

  function amountValue(input) {
    var n = parseFloat(String(input.value).replace(',', '.'));
    return isNaN(n) ? 0 : Math.round(n * 100) / 100;
  }

  function chips(input, values) {
    var row = el('div', 'chips');
    values.forEach(function (value) {
      var chip = el('button', 'chip', fmt.money(value) + ' ₴');
      chip.type = 'button';
      chip.addEventListener('click', function () {
        input.value = String(value);
        clearError(input);
      });
      row.appendChild(chip);
    });
    return row;
  }

  function clearError(input) {
    var holder = input.closest('.field');
    if (holder) holder.classList.remove('is-invalid');
    var msg = document.querySelector('.form-error');
    if (msg) msg.remove();
  }

  function showError(input, messageKey) {
    var holder = input.closest('.field');
    if (holder) holder.classList.add('is-invalid');
    var existing = document.querySelector('.form-error');
    if (existing) existing.remove();
    var msg = el('p', 'form-error', t(messageKey));
    (holder || input).insertAdjacentElement('afterend', msg);
    input.focus();
  }

  function sumRow(label, value, variant) {
    var row = el('div', 'sumrow' + (variant ? ' sumrow--' + variant : ''));
    row.appendChild(el('span', null, label));
    row.appendChild(el('b', null, value));
    return row;
  }

  function primaryButton(labelKey, onClick) {
    var btn = el('button', 'btn btn--primary btn--block', t(labelKey));
    btn.type = 'button';
    btn.addEventListener('click', onClick);
    return btn;
  }

  /* Shared "working…" then "done" sequence used by transfer and payments. */
  function runProcessing(host, titleKey, subKey, onDone) {
    clear(host);
    var box = el('div', 'process');
    var spinner = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    spinner.setAttribute('class', 'spinner');
    spinner.setAttribute('viewBox', '0 0 50 50');
    ['spinner__track', 'spinner__bar'].forEach(function (cls) {
      var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('class', cls);
      c.setAttribute('cx', '25'); c.setAttribute('cy', '25'); c.setAttribute('r', '20');
      spinner.appendChild(c);
    });
    box.appendChild(spinner);
    box.appendChild(el('p', 'process__title', t(titleKey)));
    box.appendChild(el('p', 'process__sub', t(subKey)));
    host.appendChild(box);

    setTimeout(onDone, 1800);
  }

  function successView(host, titleKey, text, rows, actions) {
    clear(host);
    var wrap = el('div', 'result');

    var badge = el('span', 'result__badge');
    badge.appendChild(icon('check'));
    wrap.appendChild(badge);

    wrap.appendChild(el('h2', 'result__title', t(titleKey)));
    wrap.appendChild(el('p', 'result__text', text));

    var card = el('div', 'result__rows');
    rows.forEach(function (row) { card.appendChild(sumRow(row[0], row[1])); });
    card.appendChild(sumRow(t('pdf.createdAt'),
      fmt.dateShort(D.today) + ', ' + new Date().toTimeString().slice(0, 5)));
    wrap.appendChild(card);

    actions.forEach(function (action) { wrap.appendChild(action); });
    host.appendChild(wrap);
  }

  /* ============================== TRANSFER ============================== */

  function transferFee(amount) {
    /* 0.5%, at least 5 UAH — shown so the confirmation step has substance. */
    return Math.max(5, Math.round(amount * 0.005 * 100) / 100);
  }

  function renderTransferForm() {
    var host = $('#transfer-body');
    clear(host);

    var source = el('div', 'srccard');
    var srcIco = el('span', 'srccard__ico');
    srcIco.appendChild(icon('card'));
    source.appendChild(srcIco);
    var srcText = el('span', 'srccard__text');
    srcText.appendChild(el('small', null, t('tr.from')));
    srcText.appendChild(el('b', null, 'PrivatB ' + D.card.type + ' · ' + D.card.masked));
    source.appendChild(srcText);
    source.appendChild(el('span', 'srccard__sum', fmt.withCurrency(D.card.balance)));
    host.appendChild(source);

    var card = textInput({ inputMode: 'numeric', placeholder: t('tr.toPlaceholder'), maxLength: 19,
                           value: transfer.card || '' });
    bindCardMask(card);
    card.addEventListener('input', function () { clearError(card); });
    host.appendChild(field('tr.to', card));

    var amount = textInput({ inputMode: 'decimal', placeholder: '0.00', value: transfer.amount || '' });
    bindAmountMask(amount);
    amount.addEventListener('input', function () { clearError(amount); });
    host.appendChild(field('tr.amount', amount));
    host.appendChild(chips(amount, [100, 200, 500, 1000]));

    var comment = textInput({ placeholder: t('tr.commentPlaceholder'), maxLength: 60,
                              value: transfer.comment || '' });
    host.appendChild(field('tr.comment', comment));

    host.appendChild(primaryButton('tr.continue', function () {
      var digits = card.value.replace(/\D/g, '');
      var sum = amountValue(amount);

      if (digits.length !== 16) return showError(card, 'tr.errCard');
      if (digits === D.card.number.replace(/\s/g, '')) return showError(card, 'tr.errOwn');
      if (sum <= 0) return showError(amount, 'tr.errAmount');
      if (sum + transferFee(sum) > D.card.balance) return showError(amount, 'tr.errFunds');

      transfer.card = card.value;
      transfer.amount = amount.value;
      transfer.comment = comment.value;
      transfer.digits = digits;
      transfer.sum = sum;
      renderTransferConfirm();
    }));
  }

  function renderTransferConfirm() {
    var host = $('#transfer-body');
    clear(host);

    var fee = transferFee(transfer.sum);
    var masked = '•••• ' + transfer.digits.slice(-4);

    host.appendChild(el('h2', 'step-title', t('tr.confirmTitle')));

    var big = el('div', 'bigsum');
    big.appendChild(el('span', null, t('tr.amount')));
    big.appendChild(el('b', null, fmt.withCurrency(transfer.sum)));
    host.appendChild(big);

    var rows = el('div', 'sumcard');
    rows.appendChild(sumRow(t('tr.recipient'), masked));
    rows.appendChild(sumRow(t('tr.from'), D.card.masked));
    rows.appendChild(sumRow(t('tr.fee'), fmt.withCurrency(fee)));
    if (transfer.comment) rows.appendChild(sumRow(t('tr.comment'), transfer.comment));
    rows.appendChild(sumRow(t('tr.total'), fmt.withCurrency(transfer.sum + fee), 'total'));
    host.appendChild(rows);

    host.appendChild(primaryButton('tr.confirm', function () {
      runProcessing(host, 'tr.processing', 'tr.processingSub', function () {
        successView(host, 'tr.successTitle',
          t('tr.successText', { amount: fmt.withCurrency(transfer.sum), card: masked }),
          [
            [t('tr.recipient'), masked],
            [t('tr.fee'), fmt.withCurrency(fee)],
            [t('tr.total'), fmt.withCurrency(transfer.sum + fee)]
          ],
          [
            primaryButton('tr.done', function () { transfer = {}; api.back(); }),
            ghost('tr.again', function () { transfer = {}; renderTransferForm(); })
          ]);
        api.toast(t('tr.successTitle'));
      });
    }));

    host.appendChild(ghost('common.back', renderTransferForm));
  }

  function ghost(labelKey, onClick) {
    var btn = el('button', 'btn btn--ghost btn--block', t(labelKey));
    btn.type = 'button';
    btn.addEventListener('click', onClick);
    return btn;
  }

  /* =============================== TOP UP ============================== */

  function copyRow(labelKey, value) {
    var row = el('div', 'copyrow');
    var text = el('span', 'copyrow__text');
    text.appendChild(el('small', null, t(labelKey)));
    text.appendChild(el('b', null, value));
    row.appendChild(text);

    var btn = el('button', 'copyrow__btn');
    btn.type = 'button';
    btn.setAttribute('aria-label', t('tu.copied', { field: t(labelKey) }));
    btn.appendChild(icon('copy'));
    btn.addEventListener('click', function () {
      api.copy(value, t('tu.copied', { field: t(labelKey) }));
    });
    row.appendChild(btn);
    return row;
  }

  function topupDetails() {
    return [
      ['tu.recipient', D.user.fullName[i18n.lang]],
      ['tu.iban', D.card.iban],
      ['tu.card', D.card.maskedFull],
      ['tu.purpose', t('tu.purposeValue', { mask: D.card.masked })]
    ];
  }

  function renderTopup() {
    var host = $('#topup-body');
    clear(host);

    host.appendChild(el('p', 'lead', t('tu.lead')));

    var list = el('div', 'copylist');
    topupDetails().forEach(function (row) { list.appendChild(copyRow(row[0], row[1])); });
    host.appendChild(list);

    var plain = topupDetails().map(function (row) {
      return t(row[0]) + ': ' + row[1];
    }).join('\n');

    if (navigator.share) {
      host.appendChild(primaryButton('tu.share', function () {
        navigator.share({ title: t('tu.title'), text: plain }).catch(function () { /* dismissed */ });
      }));
    }
    host.appendChild(ghost('tu.copyAll', function () {
      api.copy(plain, t('tu.copiedAll'));
    }));

    host.appendChild(el('p', 'note', t('tu.note')));
  }

  /* ============================== PAYMENTS ============================= */

  function renderCategories() {
    var host = $('#payments-body');
    clear(host);
    host.appendChild(el('h2', 'step-title', t('pay.pickCategory')));

    var grid = el('div', 'tiles');
    D.paymentCategories.forEach(function (category, index) {
      var tile = el('button', 'tile');
      tile.type = 'button';
      tile.style.animationDelay = index * 45 + 'ms';
      var box = el('span', 'tile__ico');
      box.appendChild(icon(category.icon));
      tile.appendChild(box);
      tile.appendChild(el('span', 'tile__name', t(category.nameKey)));
      tile.addEventListener('click', function () { renderProviders(category); });
      grid.appendChild(tile);
    });
    host.appendChild(grid);
  }

  function renderProviders(category) {
    var host = $('#payments-body');
    clear(host);
    host.appendChild(el('h2', 'step-title', t('pay.pickProvider')));

    var list = el('ul', 'menu');
    category.providers.forEach(function (provider) {
      var item = el('li');
      var row = el('button', 'menu__row');
      row.type = 'button';
      var box = el('span', 'menu__ico');
      box.appendChild(icon(category.icon));
      row.appendChild(box);
      var text = el('span', 'menu__text');
      text.appendChild(el('b', null, provider[i18n.lang]));
      text.appendChild(el('small', null, t(category.nameKey)));
      row.appendChild(text);
      row.appendChild(icon('chevron-right'));
      row.addEventListener('click', function () { renderPaymentForm(category, provider); });
      item.appendChild(row);
      list.appendChild(item);
    });
    host.appendChild(list);
    host.appendChild(ghost('common.back', renderCategories));
  }

  function renderPaymentForm(category, provider) {
    var host = $('#payments-body');
    clear(host);

    var head = el('div', 'srccard');
    var headIco = el('span', 'srccard__ico');
    headIco.appendChild(icon(category.icon));
    head.appendChild(headIco);
    var headText = el('span', 'srccard__text');
    headText.appendChild(el('small', null, t('pay.provider')));
    headText.appendChild(el('b', null, provider[i18n.lang]));
    head.appendChild(headText);
    host.appendChild(head);

    var isPhone = category.field === 'phone';
    var account = textInput({
      inputMode: isPhone ? 'tel' : 'numeric',
      placeholder: t(isPhone ? 'pay.phonePlaceholder' : 'pay.accountPlaceholder'),
      maxLength: isPhone ? 13 : 14
    });
    if (isPhone) bindPhoneMask(account);
    account.addEventListener('input', function () { clearError(account); });
    host.appendChild(field(isPhone ? 'pay.phone' : 'pay.account', account));

    var amount = textInput({ inputMode: 'decimal', placeholder: '0.00' });
    bindAmountMask(amount);
    amount.addEventListener('input', function () { clearError(amount); });
    host.appendChild(field('pay.amount', amount));
    host.appendChild(chips(amount, isPhone ? [50, 100, 200, 500] : [200, 500, 1000, 2000]));

    host.appendChild(primaryButton('pay.payBtn', function () {
      var digits = account.value.replace(/\D/g, '');
      var sum = amountValue(amount);

      if (isPhone && digits.length !== 10) return showError(account, 'pay.errPhone');
      if (!isPhone && digits.length < 4) return showError(account, 'pay.errAccount');
      if (sum <= 0) return showError(amount, 'tr.errAmount');
      if (sum > D.card.balance) return showError(amount, 'tr.errFunds');

      payments = { category: category, provider: provider, account: account.value, sum: sum };
      renderPaymentConfirm();
    }));

    host.appendChild(ghost('common.back', function () { renderProviders(category); }));
  }

  function renderPaymentConfirm() {
    var host = $('#payments-body');
    clear(host);

    var isPhone = payments.category.field === 'phone';
    host.appendChild(el('h2', 'step-title', t('pay.confirmTitle')));

    var big = el('div', 'bigsum');
    big.appendChild(el('span', null, t('pay.amount')));
    big.appendChild(el('b', null, fmt.withCurrency(payments.sum)));
    host.appendChild(big);

    var rows = el('div', 'sumcard');
    rows.appendChild(sumRow(t('pay.provider'), payments.provider[i18n.lang]));
    rows.appendChild(sumRow(t(isPhone ? 'pay.phone' : 'pay.account'), payments.account));
    rows.appendChild(sumRow(t('tr.from'), D.card.masked));
    rows.appendChild(sumRow(t('tr.total'), fmt.withCurrency(payments.sum), 'total'));
    host.appendChild(rows);

    host.appendChild(primaryButton('pay.confirm', function () {
      runProcessing(host, 'pay.processing', 'tr.processingSub', function () {
        successView(host, 'pay.successTitle',
          t('pay.successText', {
            amount: fmt.withCurrency(payments.sum),
            provider: payments.provider[i18n.lang]
          }),
          [
            [t('pay.provider'), payments.provider[i18n.lang]],
            [t(isPhone ? 'pay.phone' : 'pay.account'), payments.account],
            [t('tr.total'), fmt.withCurrency(payments.sum)]
          ],
          [
            primaryButton('tr.done', function () { payments = {}; api.back(); }),
            ghost('pay.title', function () { payments = {}; renderCategories(); })
          ]);
        api.toast(t('pay.successTitle'));
      });
    }));

    host.appendChild(ghost('common.back', function () {
      renderPaymentForm(payments.category, payments.provider);
    }));
  }

  /* ------------------------------- public ------------------------------ */

  global.Modules = {
    init: function (host) { api = host; },

    /* Called by the router whenever one of these screens is entered. */
    enter: function (name) {
      if (name === 'transfer') { transfer = {}; renderTransferForm(); }
      else if (name === 'topup') { renderTopup(); }
      else if (name === 'payments') { payments = {}; renderCategories(); }
    },

    /* Re-render the visible module after a language switch. */
    refresh: function (name) {
      if (name === 'transfer' || name === 'topup' || name === 'payments') {
        global.Modules.enter(name);
      }
    },

    owns: function (name) {
      return name === 'transfer' || name === 'topup' || name === 'payments';
    }
  };
})(window);
