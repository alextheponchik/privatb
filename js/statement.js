/* ==================================================================
   PDF account statement (jsPDF + embedded PT Sans for Cyrillic).
   Exposes: Statement.selectPeriod(from, to) and Statement.generate(opts)
   ================================================================== */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------
   * DEMO MARKING
   *
   * This file lays the document out like a real bank statement, so the
   * output identifies itself as a sample. That marking is deliberate
   * and stays in: an unmarked copy of this PDF would function as a
   * financial document rather than as a UI prototype's output.
   * ------------------------------------------------------------------ */
  var DEMO_MARK = {
    watermark: true,   /* diagonal "ЗРАЗОК" / "SPECIMEN" behind the content */
    footerNote: true   /* one grey line in the footer of every page       */
  };

  /* ------------------------------- theme ------------------------------- */
  var C = {
    green:      [46, 125, 50],
    greenDark:  [31, 95, 36],
    greenLight: [227, 245, 233],
    greenPale:  [242, 250, 245],
    ink:        [22, 33, 26],
    muted:      [112, 128, 118],
    line:       [214, 227, 218],
    debit:      [176, 42, 40],
    credit:     [40, 110, 45],
    white:      [255, 255, 255]
  };

  var PAGE = { w: 210, h: 297, ml: 14, mr: 14 };
  var CONTENT_W = PAGE.w - PAGE.ml - PAGE.mr;          /* 182 mm */
  var BODY_BOTTOM = 268;                                /* start a new page past this */

  /* Table columns: [x, width, align] */
  var COL = {
    date:     { x: 14,  w: 24, align: 'left'   },
    desc:     { x: 38,  w: 96, align: 'left'   },
    amount:   { x: 134, w: 38, align: 'right'  },
    currency: { x: 172, w: 24, align: 'center' }
  };

  var PAD = 3;

  /* ------------------------------ helpers ------------------------------ */
  function t(key, params) { return global.i18n.t(key, params); }

  function setFont(doc, style, size, color) {
    doc.setFont('PTSans', style || 'normal');
    doc.setFontSize(size);
    doc.setTextColor.apply(doc, color || C.ink);
  }

  /* Totals are stored unsigned; only prefix a sign when there is a value. */
  function signed(total, sign) {
    return (total > 0 ? sign : '') + global.fmt.money(total);
  }

  function colX(col) {
    if (col.align === 'right') return col.x + col.w - PAD;
    if (col.align === 'center') return col.x + col.w / 2;
    return col.x + PAD;
  }

  /* ------------------------- data for the period ------------------------ */

  /* Account balance at the end of `iso`, walking the newest-first list. */
  function balanceAsOf(iso) {
    var list = global.DATA.transactions;
    for (var i = 0; i < list.length; i++) {
      if (list[i].d <= iso) return list[i].balanceAfter;
    }
    return global.DATA.openingBalance;
  }

  /* Transactions inside [from, to], ordered oldest -> newest. */
  function selectPeriod(from, to) {
    var rows = global.DATA.transactions.filter(function (tx) {
      return tx.d >= from && tx.d <= to;
    });
    return rows.slice().reverse();
  }

  function summarise(rows, from, to) {
    var opening, closing, totalIn = 0, totalOut = 0;

    if (rows.length) {
      var first = rows[0];
      opening = Math.round((first.balanceAfter - first.a) * 100) / 100;
      closing = rows[rows.length - 1].balanceAfter;
    } else {
      opening = balanceAsOf(global.fmt.shiftDays(from, -1));
      closing = balanceAsOf(to);
    }

    rows.forEach(function (tx) {
      if (tx.a >= 0) totalIn += tx.a; else totalOut += -tx.a;
    });

    return {
      opening: opening,
      closing: closing,
      totalIn: Math.round(totalIn * 100) / 100,
      totalOut: Math.round(totalOut * 100) / 100,
      count: rows.length
    };
  }

  /* ------------------------------ drawing ------------------------------ */

  function roundedBox(doc, x, y, w, h, r, fill, stroke) {
    if (fill) doc.setFillColor.apply(doc, fill);
    if (stroke) { doc.setDrawColor.apply(doc, stroke); doc.setLineWidth(0.3); }
    var style = fill && stroke ? 'FD' : (fill ? 'F' : 'S');
    doc.roundedRect(x, y, w, h, r, r, style);
  }

  /* Green rounded square with a white "P" — the same mark the app uses. */
  function drawLogo(doc, x, y, size) {
    roundedBox(doc, x, y, size, size, size * 0.28, C.green);
    setFont(doc, 'bold', size * 2.6, C.white);
    doc.text('P', x + size / 2, y + size * 0.72, { align: 'center' });
  }

  function drawHeader(doc, isFirstPage) {
    if (!isFirstPage) {
      drawLogo(doc, PAGE.ml, 12, 7);
      setFont(doc, 'bold', 9);
      doc.text(t('pdf.bankName'), PAGE.ml + 9.5, 17);
      setFont(doc, 'normal', 7.5, C.muted);
      doc.text(t('pdf.docTitle'), PAGE.w - PAGE.mr, 17, { align: 'right' });
      doc.setDrawColor.apply(doc, C.line);
      doc.setLineWidth(0.3);
      doc.line(PAGE.ml, 21, PAGE.w - PAGE.mr, 21);
      return 30;
    }

    drawLogo(doc, PAGE.ml, 13, 11);

    setFont(doc, 'bold', 13);
    doc.text(t('pdf.bankName'), PAGE.ml + 14, 18.6);
    setFont(doc, 'normal', 7.2, C.muted);
    doc.text(t('pdf.bankDetails'), PAGE.ml + 14, 22.8);
    doc.text(t('pdf.bankPhone'), PAGE.ml + 14, 26.2);

    doc.setDrawColor.apply(doc, C.green);
    doc.setLineWidth(0.7);
    doc.line(PAGE.ml, 30.5, PAGE.w - PAGE.mr, 30.5);
    return 30.5;
  }

  function drawTitle(doc, from, to) {
    setFont(doc, 'bold', 15);
    doc.text(t('pdf.docTitle'), PAGE.w / 2, 41, { align: 'center' });

    setFont(doc, 'normal', 9, C.muted);
    var lang = global.i18n.lang;
    var period = (lang === 'en' ? 'for the period ' : 'за період ') +
      global.fmt.dateLong(from, lang) + (lang === 'en' ? ' — ' : ' — ') +
      global.fmt.dateLong(to, lang);
    doc.text(period, PAGE.w / 2, 47.2, { align: 'center' });
  }

  function drawInfoPanel(doc) {
    var d = global.DATA;
    var top = 53;
    var h = 31;
    roundedBox(doc, PAGE.ml, top, CONTENT_W, h, 2.5, C.greenPale, C.line);

    var colA = PAGE.ml + 6;
    var colB = PAGE.ml + 98;
    var rows = [
      [t('pdf.client'),     d.user.fullName[global.i18n.lang],
       t('pdf.cardType'),   'PrivatB ' + d.card.type],
      [t('pdf.account'),    d.card.ibanMasked,
       t('pdf.currency'),   d.card.currency + ' (₴)'],
      [t('pdf.cardNumber'), d.card.maskedFull,
       t('pdf.createdAt'),  global.fmt.dateShort(d.today) + ', 10:24']
    ];

    rows.forEach(function (row, i) {
      var labelY = top + 6.2 + i * 9.2;
      var valueY = labelY + 4.4;
      setFont(doc, 'normal', 6.8, C.muted);
      doc.text(row[0].toUpperCase(), colA, labelY);
      doc.text(row[2].toUpperCase(), colB, labelY);
      setFont(doc, 'bold', 9.2, C.ink);
      doc.text(row[1], colA, valueY);
      doc.text(row[3], colB, valueY);
    });

    return top + h;
  }

  function drawSummaryStrip(doc, sum, top) {
    var gap = 4;
    var w = (CONTENT_W - gap * 3) / 4;
    var h = 17;
    var cells = [
      { label: t('pdf.openingBalance'), value: global.fmt.money(sum.opening),  color: C.ink },
      { label: t('pdf.totalIn'),        value: signed(sum.totalIn, '+'),  color: C.credit },
      { label: t('pdf.totalOut'),       value: signed(sum.totalOut, '−'), color: C.debit },
      { label: t('pdf.closingBalance'), value: global.fmt.money(sum.closing),  color: C.white, accent: true }
    ];

    cells.forEach(function (cell, i) {
      var x = PAGE.ml + i * (w + gap);
      roundedBox(doc, x, top, w, h, 2.5,
        cell.accent ? C.green : C.greenLight,
        cell.accent ? C.green : C.line);

      setFont(doc, 'normal', 6.4, cell.accent ? C.white : C.muted);
      doc.text(cell.label.toUpperCase(), x + w / 2, top + 6, { align: 'center' });

      setFont(doc, 'bold', 10.4, cell.color);
      doc.text(cell.value + ' ₴', x + w / 2, top + 12.6, { align: 'center' });
    });

    return top + h;
  }

  function drawTableHead(doc, y) {
    var h = 8.5;
    doc.setFillColor.apply(doc, C.green);
    doc.rect(PAGE.ml, y, CONTENT_W, h, 'F');

    setFont(doc, 'bold', 8.4, C.white);
    doc.text(t('pdf.colDate'), colX(COL.date), y + 5.7, { align: COL.date.align });
    doc.text(t('pdf.colDesc'), colX(COL.desc), y + 5.7, { align: COL.desc.align });
    doc.text(t('pdf.colAmount'), colX(COL.amount), y + 5.7, { align: COL.amount.align });
    doc.text(t('pdf.colCurrency'), colX(COL.currency), y + 5.7, { align: COL.currency.align });

    return y + h;
  }

  function describe(tx) {
    return t('tx.' + tx.c, { m: tx.m[global.i18n.lang] });
  }

  function drawRows(doc, rows, y) {
    var zebra = false;

    for (var i = 0; i < rows.length; i++) {
      var tx = rows[i];
      setFont(doc, 'normal', 8.6);
      var lines = doc.splitTextToSize(describe(tx), COL.desc.w - PAD * 2);
      var h = Math.max(7, 3.4 + lines.length * 3.9);

      if (y + h > BODY_BOTTOM) {
        doc.addPage();
        y = drawHeader(doc, false);
        y = drawTableHead(doc, y + 4);
        zebra = false;
      }

      if (zebra) {
        doc.setFillColor.apply(doc, C.greenPale);
        doc.rect(PAGE.ml, y, CONTENT_W, h, 'F');
      }
      zebra = !zebra;

      var baseline = y + (h - (lines.length - 1) * 3.9) / 2 + 1.2;

      setFont(doc, 'normal', 8.6, C.ink);
      doc.text(global.fmt.dateShort(tx.d), colX(COL.date), baseline, { align: COL.date.align });
      doc.text(lines, colX(COL.desc), baseline, { align: COL.desc.align });

      setFont(doc, 'bold', 8.8, tx.a >= 0 ? C.credit : C.debit);
      doc.text(global.fmt.moneySigned(tx.a), colX(COL.amount), baseline, { align: COL.amount.align });

      setFont(doc, 'normal', 8.4, C.muted);
      doc.text(global.DATA.card.currency, colX(COL.currency), baseline, { align: COL.currency.align });

      doc.setDrawColor.apply(doc, C.line);
      doc.setLineWidth(0.2);
      doc.line(PAGE.ml, y + h, PAGE.w - PAGE.mr, y + h);

      y += h;
    }

    return y;
  }

  function drawEmptyNotice(doc, y) {
    var h = 18;
    roundedBox(doc, PAGE.ml, y + 2, CONTENT_W, h, 2, C.greenPale, C.line);
    setFont(doc, 'normal', 9, C.muted);
    doc.text(t('pdf.noOps'), PAGE.w / 2, y + 13, { align: 'center' });
    return y + h + 2;
  }

  function drawTotals(doc, sum, y) {
    var h = 34;
    if (y + h + 6 > BODY_BOTTOM) {
      doc.addPage();
      y = drawHeader(doc, false);
    }
    y += 6;

    setFont(doc, 'normal', 8.4, C.muted);
    doc.text(t('pdf.opsCount') + ': ' + sum.count, PAGE.ml, y + 7);

    var boxW = 92;
    var x = PAGE.w - PAGE.mr - boxW;
    roundedBox(doc, x, y, boxW, h, 2.5, null, C.line);

    var rows = [
      [t('pdf.openingBalance'), global.fmt.money(sum.opening), C.ink, false],
      [t('pdf.totalIn'), signed(sum.totalIn, '+'), C.credit, false],
      [t('pdf.totalOut'), signed(sum.totalOut, '−'), C.debit, false]
    ];

    rows.forEach(function (row, i) {
      var ry = y + 6.4 + i * 6.4;
      setFont(doc, 'normal', 8.4, C.muted);
      doc.text(row[0], x + 4, ry);
      setFont(doc, 'bold', 8.8, row[2]);
      doc.text(row[1] + ' ₴', x + boxW - 4, ry, { align: 'right' });
    });

    var footY = y + h - 9.5;
    doc.setFillColor.apply(doc, C.green);
    doc.rect(x + 0.5, footY, boxW - 1, 9, 'F');
    setFont(doc, 'bold', 9, C.white);
    doc.text(t('pdf.closingBalance'), x + 4, footY + 6);
    doc.text(global.fmt.money(sum.closing) + ' ₴', x + boxW - 4, footY + 6, { align: 'right' });

    return y + h;
  }

  function drawWatermark(doc) {
    if (!DEMO_MARK.watermark) return;
    var applied = false;
    try {
      doc.setGState(new doc.GState({ opacity: 0.07 }));
      applied = true;
    } catch (e) { /* older jsPDF build — fall back to a very light grey */ }

    doc.setFont('PTSans', 'bold');
    doc.setFontSize(64);
    doc.setTextColor(applied ? 46 : 232, applied ? 125 : 240, applied ? 50 : 234);
    doc.text(t('pdf.watermark'), PAGE.w / 2, PAGE.h / 2 + 20, {
      align: 'center',
      angle: 34
    });

    if (applied) doc.setGState(new doc.GState({ opacity: 1 }));
  }

  function drawFooters(doc) {
    var total = doc.internal.getNumberOfPages();
    for (var p = 1; p <= total; p++) {
      doc.setPage(p);
      drawWatermark(doc);

      doc.setDrawColor.apply(doc, C.line);
      doc.setLineWidth(0.3);
      doc.line(PAGE.ml, 277, PAGE.w - PAGE.mr, 277);

      setFont(doc, 'normal', 6.8, C.muted);
      var lines = doc.splitTextToSize(t('pdf.footer'), CONTENT_W - 30);
      doc.text(lines, PAGE.ml, 282);

      setFont(doc, 'bold', 7.4, C.muted);
      doc.text(t('pdf.page', { n: p, total: total }), PAGE.w - PAGE.mr, 282, { align: 'right' });

      if (DEMO_MARK.footerNote) {
        setFont(doc, 'bold', 6.6, C.muted);
        doc.text(t('pdf.demoNote'), PAGE.ml, 290);
      }
    }
  }

  /* ------------------------------ public API ---------------------------- */

  function buildFileName(from, to) {
    var strip = function (iso) { return iso.replace(/-/g, ''); };
    return t('pdf.fileName') + '_' + strip(from) + '-' + strip(to) + '.pdf';
  }

  /**
   * Builds the statement and triggers a download.
   * @param {{from:string, to:string}} opts ISO dates, inclusive.
   * @returns {Promise<{fileName:string, count:number}>}
   */
  function generate(opts) {
    return new Promise(function (resolve, reject) {
      /* Yield first so the busy overlay paints before the heavy work. */
      setTimeout(function () {
        try {
          var jsPDFCtor = global.jspdf && global.jspdf.jsPDF;
          if (!jsPDFCtor) throw new Error('jsPDF failed to load');

          var doc = new jsPDFCtor({ unit: 'mm', format: 'a4', orientation: 'portrait' });
          global.registerPdfFonts(doc);

          doc.setProperties({
            title: t('pdf.docTitle'),
            subject: t('pdf.docTitle') + ' ' + opts.from + ' — ' + opts.to,
            author: t('pdf.bankName'),
            creator: 'PrivatB Online'
          });

          var rows = selectPeriod(opts.from, opts.to);
          var sum = summarise(rows, opts.from, opts.to);

          drawHeader(doc, true);
          drawTitle(doc, opts.from, opts.to);
          var y = drawInfoPanel(doc);
          y = drawSummaryStrip(doc, sum, y + 5);
          y = drawTableHead(doc, y + 7);
          y = rows.length ? drawRows(doc, rows, y) : drawEmptyNotice(doc, y);
          drawTotals(doc, sum, y);
          drawFooters(doc);

          var fileName = buildFileName(opts.from, opts.to);
          doc.save(fileName);
          resolve({ fileName: fileName, count: rows.length });
        } catch (err) {
          reject(err);
        }
      }, 60);
    });
  }

  global.Statement = {
    generate: generate,
    selectPeriod: selectPeriod,
    summarise: summarise,
    balanceAsOf: balanceAsOf,
    DEMO_MARK: DEMO_MARK
  };
})(window);
