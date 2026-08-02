/* ------------------------------------------------------------------
 * Formatting helpers shared by the UI and the PDF generator.
 *
 * Money is always rendered with a space as the thousands separator and
 * a comma before the two decimals: 511 000,00
 * ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var NBSP = ' ';       /* keeps "1 234,00 ₴" from wrapping mid-number */
  var MINUS = '−';      /* true minus sign, not a hyphen */

  function money(value) {
    var negative = value < 0;
    var fixed = Math.abs(value).toFixed(2);
    var parts = fixed.split('.');
    var grouped = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
    return (negative ? MINUS : '') + grouped + ',' + parts[1];
  }

  /* Always shows the sign — used for transaction rows and statement lines. */
  function moneySigned(value) {
    if (value > 0) return '+' + money(value);
    return money(value);
  }

  function withCurrency(value) {
    return money(value) + NBSP + '₴';
  }

  function signedWithCurrency(value) {
    return moneySigned(value) + NBSP + '₴';
  }

  /* '2026-08-02' -> '02.08.2026' */
  function dateShort(iso) {
    var p = String(iso).split('-');
    return p[2] + '.' + p[1] + '.' + p[0];
  }

  /* '2026-08-02' -> '2 серпня 2026' / '2 August 2026' */
  function dateLong(iso, lang) {
    var p = String(iso).split('-');
    var months = global.i18n ? global.i18n.t('months') : [];
    var name = months[parseInt(p[1], 10) - 1] || p[1];
    if (lang === 'en') return parseInt(p[2], 10) + ' ' + name + ' ' + p[0];
    return parseInt(p[2], 10) + ' ' + name + ' ' + p[0] + ' р.';
  }

  /* Month heading for grouped transaction lists. */
  function monthLabel(iso) {
    var p = String(iso).split('-');
    var months = global.i18n ? global.i18n.t('monthsNom') : [];
    return (months[parseInt(p[1], 10) - 1] || p[1]) + ' ' + p[0];
  }

  function toISO(date) {
    var m = date.getMonth() + 1;
    var d = date.getDate();
    return date.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }

  function fromISO(iso) {
    var p = String(iso).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  /* iso shifted by `days` (negative goes back in time). */
  function shiftDays(iso, days) {
    var d = fromISO(iso);
    d.setDate(d.getDate() + days);
    return toISO(d);
  }

  /* Relative label for the notification feed. */
  function timeAgo(isoStamp, todayISO, lang) {
    var stamp = isoStamp.split('T');
    var time = (stamp[1] || '00:00').slice(0, 5);
    if (stamp[0] === todayISO) {
      return (lang === 'en' ? 'Today' : 'Сьогодні') + ', ' + time;
    }
    if (stamp[0] === shiftDays(todayISO, -1)) {
      return (lang === 'en' ? 'Yesterday' : 'Вчора') + ', ' + time;
    }
    return dateShort(stamp[0]) + ', ' + time;
  }

  global.fmt = {
    NBSP: NBSP,
    MINUS: MINUS,
    money: money,
    moneySigned: moneySigned,
    withCurrency: withCurrency,
    signedWithCurrency: signedWithCurrency,
    dateShort: dateShort,
    dateLong: dateLong,
    monthLabel: monthLabel,
    toISO: toISO,
    fromISO: fromISO,
    shiftDays: shiftDays,
    timeAgo: timeAgo
  };
})(window);
