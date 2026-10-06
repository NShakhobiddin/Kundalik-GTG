/*
 * Тўлдирилган жавобларни PDF қилиб сақлаш.
 *
 * PDF телефоннинг ўзида pdfmake ёрдамида яратилади (vendor/ — фақат керак
 * бўлганда юкланади). Telegram ичида файлни юклаб олиш ҳамма жойда ишламагани
 * учун етказишнинг бир неча йўли бор:
 *   1) config.js'да pdfApi берилган бўлса — бот PDF'ни чатга юборади;
 *   2) телефон «Улашиш» менюси (iOS ва баъзи Android'лар) — «Файлларга сақлаш»;
 *   3) оддий браузер / Telegram Desktop — тўғридан-тўғри юклаб олиш;
 *   4) акс ҳолда — жавоблар ҳаволага сиқилиб, ташқи браузерда очилади ва
 *      PDF ўша ерда юклаб олинади.
 */
(function () {
  "use strict";

  var A = window.GTApp; // app.js берадиган ёрдамчилар
  var CFG = window.GT_CONFIG || {};

  var C = {
    brand: "#254C3B", gold: "#C99A5B", goldInk: "#8A6330", sage: "#5F7D6E",
    ink: "#25302B", muted: "#66706B", line: "#DDE5E0", soft: "#EAF2ED", paper: "#F5F7F5", cream: "#FFF8ED"
  };

  /* ---------- Кутубхонани юклаш ---------- */

  var libPromise = null;
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  function loadLib() {
    if (window.pdfMake && window.pdfMake.vfs) return Promise.resolve();
    if (!libPromise) {
      libPromise = loadScript("vendor/pdfmake.min.js")
        .then(function () { return loadScript("vendor/vfs_fonts.js"); })
        .catch(function (e) { libPromise = null; throw e; });
    }
    return libPromise;
  }

  /* ---------- Матн ---------- */

  var EMOJI = /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/gu;
  // Шрифтда йўқ белгиларни ўхшашига алмаштириш
  function clean(s) {
    return String(s == null ? "" : s)
      .replace(/ʻ/g, "‘").replace(/→/g, "›").replace(/↓/g, "›")
      .replace(EMOJI, "").replace(/\r/g, "");
  }
  function P(s) { return clean(A.T(s)); }        // дафтар матни (ёзув танловига қараб)
  function U(s) { return clean(s).trim(); }      // фойдаланувчи жавоби

  /* ---------- Блоклар ---------- */

  function qLabel(text) {
    return { text: P(text), fontSize: 9.5, bold: true, color: C.sage, margin: [0, 8, 0, 3] };
  }
  function answerBox(text) {
    return {
      table: { widths: ["*"], body: [[{ text: U(text), margin: [8, 6, 8, 6] }]] },
      layout: {
        hLineWidth: function () { return 0; },
        vLineWidth: function (i) { return i === 0 ? 2 : 0; },
        vLineColor: function () { return C.gold; },
        fillColor: function () { return C.paper; },
        paddingLeft: function () { return 0; }, paddingRight: function () { return 0; },
        paddingTop: function () { return 0; }, paddingBottom: function () { return 0; }
      }
    };
  }
  function qa(q, val) {
    var long = String(val).length > 900;
    return { stack: [qLabel(q), answerBox(val)], unbreakable: !long };
  }
  function checkRow(text) {
    return {
      columns: [
        { width: 14, canvas: [
          { type: "rect", x: 0, y: 2, w: 9, h: 9, r: 2, color: C.brand },
          { type: "polyline", lineWidth: 1.4, lineColor: "#FFFFFF", points: [{ x: 2, y: 6.6 }, { x: 4, y: 8.6 }, { x: 7.4, y: 4.4 }] }
        ] },
        { width: "*", text: P(text) }
      ],
      margin: [0, 2, 0, 2]
    };
  }
  function tableBlock(b, id, v) {
    var t = b.tbl;
    var rows = [];
    t.rows.forEach(function (row, r) {
      var label = typeof row === "string" ? row : row.l;
      var hint = typeof row === "string" ? "" : row.hint;
      if (/^\d+$/.test(label) && t.head) label = t.head + " " + label;
      var cells = t.cols.map(function (_, c) { return v[id + "." + r + "." + c]; });
      if (!cells.some(A.filled)) return;
      var first = { stack: [{ text: P(label), bold: true, color: C.brand }] };
      if (hint) first.stack.push({ text: P(hint), fontSize: 8, color: C.muted, margin: [0, 2, 0, 0] });
      rows.push([first].concat(cells.map(function (x) { return { text: A.filled(x) ? U(String(x)) : "—", color: A.filled(x) ? C.ink : C.line }; })));
    });
    if (!rows.length) return null;
    var head = [{ text: P(t.head || ""), bold: true, fontSize: 8.5, color: C.brand }].concat(t.cols.map(function (c) {
      return { text: P(typeof c === "string" ? c : c.t), bold: true, fontSize: 8.5, color: C.brand };
    }));
    var widths = ["28%"].concat(t.cols.map(function (c) { return c.num ? 44 : "*"; }));
    return {
      table: { headerRows: 1, widths: widths, body: [head].concat(rows), dontBreakRows: true },
      layout: {
        fillColor: function (i) { return i === 0 ? C.soft : null; },
        hLineColor: function () { return C.line; }, vLineColor: function () { return C.line; },
        hLineWidth: function () { return 0.6; }, vLineWidth: function () { return 0.6; },
        paddingLeft: function () { return 6; }, paddingRight: function () { return 6; },
        paddingTop: function () { return 5; }, paddingBottom: function () { return 5; }
      },
      margin: [0, 8, 0, 2]
    };
  }

  // Битта блокнинг PDF кўриниши (бўш бўлса — null)
  function block(b, id, v) {
    if (typeof b === "string" || b.q !== undefined) {
      var q = typeof b === "string" ? b : b.q;
      return A.filled(v[id]) ? qa(q || "", v[id]) : null;
    }
    if (b.date) return A.filled(v[id]) ? qa(b.date, v[id]) : null;
    if (b.list) {
      var items = [];
      b.list.forEach(function (label, j) {
        var fid = id + "." + j;
        if (!A.filled(v[fid])) return;
        var tags = (v[fid + "t"] || []).map(P).join(", ");
        var cap = /^\d+\.$/.test(label) ? "" : label.replace(/^\d+\.\s*/, "");
        var num = (label.match(/^(\d+)/) || [0, j + 1])[1];
        items.push({
          columns: [
            { width: 20, text: num + ".", bold: true, color: C.goldInk },
            { width: "*", text: [cap ? { text: P(cap) + ": ", bold: true, color: C.sage } : "", U(v[fid]), tags ? { text: "  [" + tags + "]", color: C.goldInk, bold: true, fontSize: 9 } : ""] }
          ],
          margin: [0, 2, 0, 2]
        });
      });
      return items.length ? { stack: items, margin: [0, 6, 0, 0] } : null;
    }
    if (b.chk) {
      var sel = v[id] || [];
      if (!sel.length) return null;
      return { stack: sel.map(function (k) { return checkRow(b.chk[k]); }), margin: [0, 6, 0, 0] };
    }
    if (b.tbl) return tableBlock(b, id, v);
    if (b.formula) {
      var parts = b.formula.split("___"), any = false, txt = [];
      parts.forEach(function (p, k) {
        txt.push(P(p));
        if (k < parts.length - 1) {
          var x = v[id + "." + k];
          if (A.filled(x)) any = true;
          txt.push(A.filled(x) ? { text: " " + U(x) + " ", bold: true, color: C.brand, decoration: "underline", decorationColor: C.gold } : " ______ ");
        }
      });
      if (!any) return null;
      return {
        table: { widths: ["*"], body: [[{ stack: [
          { text: P(b.title || "Формула").toUpperCase(), fontSize: 8, bold: true, color: C.brand, characterSpacing: 0.8, margin: [0, 0, 0, 3] },
          { text: txt, fontSize: 11 }
        ], margin: [10, 8, 10, 8] }]] },
        layout: "noBorders", fillColor: C.soft, margin: [0, 8, 0, 2]
      };
    }
    if (b.range !== undefined) {
      if (!A.filled(v[id])) return null;
      var w = 160, val = +v[id];
      return {
        stack: [
          qLabel(b.range),
          { columns: [
            { width: w + 8, canvas: [
              { type: "rect", x: 0, y: 3, w: w, h: 7, r: 3.5, color: C.soft },
              { type: "rect", x: 0, y: 3, w: Math.max(7, w * val / b.max), h: 7, r: 3.5, color: C.brand }
            ] },
            { width: "*", text: val + " / " + b.max, bold: true, color: C.brand }
          ] }
        ],
        unbreakable: true
      };
    }
    return null;
  }

  function cardContent(c, v) {
    var out = [], pendingH = null;
    c.b.forEach(function (b, i) {
      if (b.h) { pendingH = b.h; return; }
      var node = block(b, "b" + i, v);
      if (!node) return;
      if (pendingH) {
        out.push({ text: P(pendingH).toUpperCase(), fontSize: 8.5, bold: true, color: C.goldInk, characterSpacing: 0.8, margin: [0, 12, 0, 0] });
        pendingH = null;
      }
      out.push(node);
    });
    return out;
  }

  function cardHeader(c, done) {
    return {
      stack: [
        { columns: [
          { width: "auto", table: { body: [[{ text: P(c.n + "-карта").toUpperCase(), color: "#FFFFFF", bold: true, fontSize: 8, characterSpacing: 0.8, margin: [6, 1, 6, 1] }]] }, layout: "noBorders", fillColor: C.brand },
          { width: "*", text: done ? P("Якунланган") : "", alignment: "right", color: C.sage, fontSize: 8.5, bold: true, margin: [0, 2, 0, 0] }
        ] },
        { text: P(c.t), fontSize: 14, bold: true, color: C.ink, margin: [0, 6, 0, 0] },
        c.d ? { text: P(c.d), italics: true, color: C.muted, fontSize: 9.5, margin: [0, 2, 0, 0] } : ""
      ],
      margin: [0, 18, 0, 2],
      unbreakable: true
    };
  }

  function notesBlock(title, text) {
    return { stack: [
      { text: P(title).toUpperCase(), fontSize: 8.5, bold: true, color: C.goldInk, characterSpacing: 0.8, margin: [0, 16, 0, 4] },
      answerBox(text)
    ] };
  }

  /* ---------- Ҳужжат ---------- */

  function today() {
    var d = new Date();
    return ("0" + d.getDate()).slice(-2) + "." + ("0" + (d.getMonth() + 1)).slice(-2) + "." + d.getFullYear();
  }
  function fmtDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
    return m ? m[3] + "." + m[2] + "." + m[1] : (s || "");
  }

  function buildDoc(opts) {
    var WB = A.WB;
    var meta = A.get("meta");
    var content = [];
    var single = opts.card;
    var total = 0;

    if (!single) {
      var done = A.CARDS.filter(function (c) { return A.cardStat(c).done; }).length;
      var filledCards = A.CARDS.filter(function (c) { return A.cardStat(c).filled; }).length;
      content.push(
        { text: P(WB.kicker).toUpperCase(), color: "#E8CFA8", bold: true, fontSize: 9, characterSpacing: 1.5, margin: [0, 40, 0, 0] },
        { text: P(WB.title), color: "#FFFFFF", bold: true, fontSize: 30, lineHeight: 1.05, margin: [0, 8, 0, 6] },
        { text: P(WB.stats), color: "#D7E3DC", fontSize: 10.5 },
        { text: WB.path.map(P).join("  ›  "), color: "#D7E3DC", fontSize: 9.5, margin: [0, 18, 0, 0] },
        {
          margin: [0, 120, 0, 0],
          table: { widths: [150, "*"], body: [
            [{ text: P("Иштирокчи"), color: C.muted }, { text: U(meta.name) || "—", bold: true }],
            [{ text: P("Бошланган сана"), color: C.muted }, { text: fmtDate(meta.start) || "—", bold: true }],
            [{ text: P("PDF яратилган сана"), color: C.muted }, { text: today(), bold: true }],
            [{ text: P("Тўлдирилган карталар"), color: C.muted }, { text: filledCards + " / " + A.CARDS.length, bold: true }],
            [{ text: P("Якунланган карталар"), color: C.muted }, { text: done + " / " + A.CARDS.length, bold: true }]
          ] },
          layout: {
            hLineWidth: function (i, node) { return i === 0 || i === node.table.body.length ? 0 : 0.6; },
            vLineWidth: function () { return 0; }, hLineColor: function () { return C.line; },
            paddingTop: function () { return 7; }, paddingBottom: function () { return 7; }
          }
        },
        { text: P(WB.purpose), italics: true, color: C.muted, fontSize: 9.5, margin: [0, 24, 0, 0] },
        { text: "", pageBreak: "after" }
      );
    }

    var cards = single ? [single] : A.CARDS;
    var lastSec = null;
    cards.forEach(function (c) {
      var v = A.get("c" + c.n);
      var body = cardContent(c, v);
      if (!body.length) return;
      total++;
      if (!single && c.sec !== lastSec) {
        lastSec = c.sec;
        content.push({
          stack: [
            { text: P(c.sec.final ? c.sec.title : c.sec.roman + " бўлим").toUpperCase(), color: C.goldInk, bold: true, fontSize: 9, characterSpacing: 1.2 },
            { text: P(c.sec.title), fontSize: 20, bold: true, color: C.brand, margin: [0, 4, 0, 4] },
            { text: P(c.sec.sub), italics: true, color: C.muted, fontSize: 10 },
            { canvas: [{ type: "line", x1: 0, y1: 6, x2: 499, y2: 6, lineWidth: 1.5, lineColor: C.gold }], margin: [0, 4, 0, 0] }
          ],
          margin: [0, total > 1 ? 30 : 0, 0, 4],
          headlineLevel: 1,
          unbreakable: true
        });
      }
      content.push(cardHeader(c, v._done));
      content = content.concat(body);
    });

    if (!single) {
      WB.sections.forEach(function (s) {
        var t = (A.get("n" + s.id).text || "").trim();
        if (t) content.push(notesBlock(A.T(s.title) + " — " + A.T("менинг қайдларим"), t));
      });
      var n = A.get("notes");
      if ((n.a || "").trim()) content.push(notesBlock("Қайдлар 1", n.a));
      if ((n.b || "").trim()) content.push(notesBlock("Қайдлар 2", n.b));
    }

    if (!total && content.length <= (single ? 0 : 7)) return null; // фақат муқова — жавоб йўқ

    var who = U(meta.name);
    return {
      info: { title: P(single ? single.n + "-карта. " + single.t : WB.title), author: who || "GlobalTrainings", creator: "GlobalTrainings — " + P(WB.kicker) },
      pageSize: "A4",
      pageMargins: [48, 58, 48, 54],
      defaultStyle: { font: "Roboto", fontSize: 10.5, lineHeight: 1.3, color: C.ink },
      background: function (page) {
        if (single || page !== 1) return null;
        return { canvas: [
          { type: "rect", x: 0, y: 0, w: 595.28, h: 330, color: C.brand },
          { type: "ellipse", x: 560, y: 40, r1: 120, r2: 120, lineWidth: 26, lineColor: "#3D5F45" }
        ] };
      },
      header: function (page) {
        if (!single && page === 1) return null;
        return {
          columns: [
            { text: "GLOBALTRAININGS  ·  " + P(WB.kicker).toUpperCase(), fontSize: 7.5, bold: true, color: C.goldInk, characterSpacing: 0.6 },
            { text: who, fontSize: 8, color: C.muted, alignment: "right" }
          ],
          margin: [48, 26, 48, 0]
        };
      },
      footer: function (page, count) {
        if (!single && page === 1) return null;
        return { columns: [
          { text: "www.globaltrainings.uz", fontSize: 7.5, color: C.muted },
          { text: page + " / " + count, fontSize: 8, color: C.muted, alignment: "right" }
        ], margin: [48, 18, 48, 0] };
      },
      content: content,
      // Бўлим сарлавҳаси саҳифа охирида ёлғиз қолмасин
      pageBreakBefore: function (node, following) {
        return node.headlineLevel === 1 && following.length < 6 && node.startPosition.top > 520;
      }
    };
  }

  /* ---------- Етказиш ---------- */

  function fileName(card) {
    var who = A.toLatin(String(A.get("meta").name || "")).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
    var d = new Date().toISOString().slice(0, 10);
    var base = card ? card.n + "-karta" : "Ish-daftari";
    return base + (who ? "-" + who : "") + "-" + d + ".pdf";
  }

  function makeBlob(dd) {
    return new Promise(function (resolve, reject) {
      try { window.pdfMake.createPdf(dd).getBlob(resolve); } catch (e) { reject(e); }
    });
  }

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = name; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  function sendViaBot(blob, name) {
    var fd = new FormData();
    fd.append("initData", A.tg.initData);
    fd.append("file", blob, name);
    return fetch(CFG.pdfApi, { method: "POST", body: fd }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || !j.ok) throw new Error(j.error || "send failed");
        return j;
      });
    });
  }

  function canShareFile(file) {
    try { return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [file] })); } catch (e) { return false; }
  }

  /* Жавобларни ҳаволага жойлаш (ташқи браузерда PDF яратиш учун) */
  function b64url(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function packPayload(obj) {
    var bytes = new TextEncoder().encode(JSON.stringify(obj));
    if (typeof CompressionStream === "undefined") return Promise.resolve("r" + b64url(bytes));
    var cs = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    return new Response(cs).arrayBuffer().then(function (buf) { return "z" + b64url(new Uint8Array(buf)); });
  }
  function unpackPayload(str) {
    var kind = str.charAt(0), b = str.slice(1).replace(/-/g, "+").replace(/_/g, "/");
    while (b.length % 4) b += "=";
    var bin = atob(b), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (kind === "r") return Promise.resolve(JSON.parse(new TextDecoder().decode(bytes)));
    var ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Response(ds).text().then(JSON.parse);
  }
  function payloadFor(card) {
    var all = A.all(), d = {};
    Object.keys(all).forEach(function (k) {
      if (k === "prefs") return;
      if (card && k !== "c" + card.n && k !== "meta") return;
      d[k] = { v: all[k].v };
    });
    return { s: A.prefs.script, c: card ? card.n : 0, d: d };
  }
  function openInBrowser(card) {
    return packPayload(payloadFor(card)).then(function (p) {
      var url = location.href.split("#")[0].split("?")[0] + "#pdf=" + p;
      if (A.inTG && A.tg.openLink) A.tg.openLink(url);
      else window.open(url, "_blank");
    });
  }

  /* ---------- Ойна (bottom sheet) ---------- */

  function sheet(html) {
    var el = document.createElement("div");
    el.className = "sheet-wrap";
    el.innerHTML = '<div class="sheet" role="dialog" aria-modal="true">' + html + "</div>";
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add("show"); });
    function close() {
      el.classList.remove("show");
      setTimeout(function () { el.remove(); }, 250);
    }
    el.addEventListener("click", function (e) { if (e.target === el || e.target.closest("[data-close]")) close(); });
    return { el: el, close: close };
  }
  function busy(on) {
    var el = document.getElementById("pdfBusy");
    if (on && !el) {
      el = document.createElement("div");
      el.id = "pdfBusy"; el.className = "busy";
      el.innerHTML = '<div class="busy-box"><div class="spinner"></div><b>' + A.esc(A.T("PDF тайёрланмоқда…")) + "</b></div>";
      document.body.appendChild(el);
    } else if (!on && el) el.remove();
  }

  function offerChoices(blob, name, card) {
    var ext = A.inTG;
    var h = '<div class="sheet-ico">📄</div><h3>' + A.esc(A.T("PDF тайёр")) + "</h3><p>" + A.esc(name) + "</p>";
    if (ext) {
      h += '<button class="btn primary" data-act="browser">🌐 ' + A.esc(A.T("Браузерда очиб юклаб олиш")) + "</button>";
      h += '<p class="sheet-note">' + A.esc(A.T("Telegram илова ичида файлни тўғридан-тўғри сақлашга рухсат бермайди. Жавобларингиз ҳаволанинг ичига жойланади ва PDF браузернинг ўзида яратилади — ҳеч қандай серверга юборилмайди.")) + "</p>";
      h += '<button class="btn" data-act="download">⬇️ ' + A.esc(A.T("Шу ерда юклаб олишга уриниш")) + "</button>";
    } else {
      h += '<button class="btn primary" data-act="download">⬇️ ' + A.esc(A.T("Юклаб олиш")) + "</button>";
    }
    h += '<button class="btn ghost" data-close>' + A.esc(A.T("Ёпиш")) + "</button>";
    var s = sheet(h);
    s.el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-act]");
      if (!b) return;
      var act = b.getAttribute("data-act");
      if (act === "download") download(blob, name);
      if (act === "browser") openInBrowser(card).catch(function () { A.toast("Ҳаволани очиб бўлмади"); });
      s.close();
    });
  }

  /* ---------- Асосий функция ---------- */

  function save(opts) {
    opts = opts || {};
    var card = opts.card || null;
    var dd = buildDoc({ card: card });
    if (!dd) { A.toast(card ? "Бу картада ҳали жавоб йўқ" : "Ҳали ҳеч бир жавоб ёзилмаган"); return Promise.resolve(); }
    busy(true);
    return loadLib()
      .then(function () { return makeBlob(dd); })
      .then(function (blob) {
        var name = fileName(card);
        // 1) Бот орқали чатга юбориш
        if (CFG.pdfApi && A.inTG) {
          return sendViaBot(blob, name).then(function () {
            busy(false);
            A.haptic("ok");
            if (A.tg.showAlert) A.tg.showAlert(A.T("PDF Telegram чатингизга юборилди ✓"));
            else A.toast("PDF чатга юборилди ✓");
          }, function () { return deliverLocal(blob, name, card); });
        }
        return deliverLocal(blob, name, card);
      })
      .catch(function (e) {
        busy(false);
        console.error(e);
        A.toast("PDF яратишда хатолик. Интернетни текширинг.");
      });
  }

  function deliverLocal(blob, name, card) {
    busy(false);
    var file = null;
    try { file = new File([blob], name, { type: "application/pdf" }); } catch (e) {}
    // 2) Телефоннинг «Улашиш» менюси
    if (file && canShareFile(file)) {
      return navigator.share({ files: [file], title: name }).then(function () { A.haptic("ok"); }, function (e) {
        if (e && e.name === "AbortError") return;
        offerChoices(blob, name, card);
      });
    }
    // 3) Оддий браузер — дарҳол юклаб олиш
    if (!A.inTG) { download(blob, name); A.toast("PDF юклаб олинди ✓"); return; }
    // 4) Telegram (Android ва б.) — танлов
    offerChoices(blob, name, card);
  }

  /* ---------- Ташқи браузер: #pdf=... ҳаволаси ---------- */

  function fromLink(str) {
    return unpackPayload(str).then(function (p) {
      A.snapshot(p.d, p.s);
      var card = p.c ? A.cardByN(p.c) : null;
      var dd = buildDoc({ card: card });
      return loadLib().then(function () { return makeBlob(dd); }).then(function (blob) {
        return { blob: blob, name: fileName(card) };
      });
    });
  }

  window.GTPdf = { save: save, fromLink: fromLink, download: download };
})();
