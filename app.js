(function () {
  "use strict";

  var WB = window.WORKBOOK;
  var tg = window.Telegram && window.Telegram.WebApp;
  var inTG = !!(tg && tg.initData);
  var $app = document.getElementById("app");
  var $top = document.getElementById("topbar");

  /* ================= Ёрдамчилар ================= */

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function haptic(kind) {
    try {
      if (!tg || !tg.HapticFeedback) return;
      if (kind === "ok") tg.HapticFeedback.notificationOccurred("success");
      else tg.HapticFeedback.selectionChanged();
    } catch (e) {}
  }
  var toastTimer;
  function toast(msg) {
    var el = document.getElementById("toast");
    el.textContent = T(msg);
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2200);
  }

  /* ================= Кирилл → Лотин ================= */

  var MAP = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "ё": "yo", "ж": "j", "з": "z", "и": "i",
    "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p", "р": "r", "с": "s",
    "т": "t", "у": "u", "ф": "f", "х": "x", "ч": "ch", "ш": "sh", "щ": "sh", "ъ": "ʼ", "ь": "",
    "ы": "i", "э": "e", "ю": "yu", "я": "ya", "ў": "oʻ", "қ": "q", "ғ": "gʻ", "ҳ": "h"
  };
  var VOWELS = "аеёиоуэюяўы";
  function isCyr(ch) { return /[Ѐ-ӿ]/.test(ch || ""); }
  function isUpper(ch) { return !!ch && ch !== ch.toLowerCase(); }
  function isLetter(ch) { return !!ch && ch.toLowerCase() !== ch.toUpperCase(); }

  function toLatin(s) {
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (!isCyr(ch)) { out += ch; continue; }
      var lo = ch.toLowerCase();
      var prev = s[i - 1], next = s[i + 1];
      var prevLo = prev ? prev.toLowerCase() : "";
      var m;
      if (lo === "е") {
        m = (!isLetter(prev) || VOWELS.indexOf(prevLo) >= 0 || prevLo === "ъ" || prevLo === "ь") ? "ye" : "e";
      } else if (lo === "ц") {
        m = VOWELS.indexOf(prevLo) >= 0 ? "ts" : "s";
      } else {
        m = MAP[lo];
        if (m === undefined) m = ch;
      }
      if (isUpper(ch) && m) {
        var wordUpper = (isLetter(next) && isUpper(next)) || (!isLetter(next) && isLetter(prev) && isUpper(prev));
        m = wordUpper ? m.toUpperCase() : m.charAt(0).toUpperCase() + m.slice(1);
      }
      out += m;
    }
    return out;
  }

  var prefs = { script: "cyr", last: null };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem("gt_prefs") || "{}")); } catch (e) {}
  function savePrefs() { try { localStorage.setItem("gt_prefs", JSON.stringify(prefs)); } catch (e) {} }
  function T(s) { return prefs.script === "lat" ? toLatin(String(s)) : String(s); }
  function E(s) { return esc(T(s)); }

  /* ================= Сақлаш (Telegram CloudStorage + localStorage) ================= */

  var Store = (function () {
    var LS = "gt_wb_";
    var CHUNK = 3900;
    var cloud = !!(tg && tg.CloudStorage && tg.isVersionAtLeast && tg.isVersionAtLeast("6.9") && inTG);
    var data = {};
    var timers = {};

    function readLocal() {
      var out = {};
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k.indexOf(LS) === 0) out[k.slice(LS.length)] = JSON.parse(localStorage.getItem(k));
        }
      } catch (e) {}
      return out;
    }

    function readCloud() {
      return new Promise(function (resolve) {
        if (!cloud) return resolve({});
        var done = false;
        var timer = setTimeout(function () { if (!done) { done = true; resolve({}); } }, 3500);
        try {
          tg.CloudStorage.getKeys(function (err, keys) {
            if (err || !keys || !keys.length) { done = true; clearTimeout(timer); return resolve({}); }
            tg.CloudStorage.getItems(keys, function (err2, vals) {
              if (done) return;
              done = true; clearTimeout(timer);
              if (err2 || !vals) return resolve({});
              var out = {};
              keys.forEach(function (k) {
                if (/_\d+$/.test(k)) return;
                var head = vals[k] || "";
                var bar = head.indexOf("|");
                var n = parseInt(head.slice(0, bar), 10) || 1;
                var s = head.slice(bar + 1);
                for (var j = 1; j < n; j++) s += vals[k + "_" + j] || "";
                try { out[k] = JSON.parse(s); } catch (e) {}
              });
              resolve(out);
            });
          });
        } catch (e) { done = true; clearTimeout(timer); resolve({}); }
      });
    }

    function writeCloud(k, obj) {
      if (!cloud) return;
      var s = JSON.stringify(obj);
      var n = Math.max(1, Math.ceil(s.length / CHUNK));
      try {
        tg.CloudStorage.setItem(k, n + "|" + s.slice(0, CHUNK));
        for (var j = 1; j < n; j++) tg.CloudStorage.setItem(k + "_" + j, s.slice(j * CHUNK, (j + 1) * CHUNK));
      } catch (e) {}
    }

    function flash() {
      var el = document.getElementById("saved");
      el.textContent = "✓ " + T("Сақланди");
      el.classList.add("show");
      clearTimeout(flash.t);
      flash.t = setTimeout(function () { el.classList.remove("show"); }, 1400);
    }

    return {
      cloud: cloud,
      load: function () {
        var local = readLocal();
        return readCloud().then(function (remote) {
          var keys = {};
          Object.keys(local).concat(Object.keys(remote)).forEach(function (k) { keys[k] = 1; });
          Object.keys(keys).forEach(function (k) {
            var a = local[k], b = remote[k];
            data[k] = (!a || (b && (b.u || 0) > (a.u || 0))) ? b : a;
          });
        });
      },
      get: function (k) { return (data[k] && data[k].v) || {}; },
      set: function (k, v) {
        data[k] = { u: Date.now(), v: v };
        try { localStorage.setItem(LS + k, JSON.stringify(data[k])); } catch (e) {}
        clearTimeout(timers[k]);
        timers[k] = setTimeout(function () { writeCloud(k, data[k]); }, 700);
        flash();
      },
      all: function () { return data; },
      replaceAll: function (obj) {
        Object.keys(obj).forEach(function (k) { Store.set(k, obj[k].v || obj[k]); });
      },
      clear: function () {
        Object.keys(data).forEach(function (k) {
          try { localStorage.removeItem(LS + k); } catch (e) {}
        });
        if (cloud) {
          try {
            tg.CloudStorage.getKeys(function (err, keys) {
              if (!err && keys && keys.length) tg.CloudStorage.removeItems(keys);
            });
          } catch (e) {}
        }
        data = {};
      }
    };
  })();

  /* ================= Индекс ================= */

  var CARDS = [];
  var CARD_BY_N = {};
  WB.sections.forEach(function (s) {
    s.cards.forEach(function (c) {
      c.sec = s;
      c.idx = CARDS.length;
      CARDS.push(c);
      CARD_BY_N[c.n] = c;
    });
  });
  function secById(id) { return WB.sections.filter(function (s) { return s.id === +id; })[0]; }
  function secLabel(s) { return s.final ? s.title : s.roman + " " + "бўлим"; }

  /* Картадаги барча майдон калитлари (тўлдирилганликни ҳисоблаш учун) */
  function fieldKeys(card) {
    var keys = [];
    card.b.forEach(function (b, i) {
      var id = "b" + i;
      if (typeof b === "string" || b.q !== undefined) keys.push(id);
      else if (b.list) b.list.forEach(function (_, j) { keys.push(id + "." + j); });
      else if (b.tbl) b.tbl.rows.forEach(function (_, r) { b.tbl.cols.forEach(function (_, c) { keys.push(id + "." + r + "." + c); }); });
      else if (b.chk || b.range !== undefined || b.date) keys.push(id);
      else if (b.formula) b.formula.split("___").slice(1).forEach(function (_, k) { keys.push(id + "." + k); });
    });
    return keys;
  }
  function filled(v) {
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "number") return true;
    return String(v).trim() !== "";
  }
  function cardStat(card) {
    var v = Store.get("c" + card.n);
    var keys = fieldKeys(card);
    var f = keys.filter(function (k) { return filled(v[k]); }).length;
    return { total: keys.length, filled: f, pct: keys.length ? Math.round(f / keys.length * 100) : 0, done: !!v._done };
  }
  function secStat(sec) {
    var done = 0, started = 0;
    sec.cards.forEach(function (c) {
      var st = cardStat(c);
      if (st.done) done++;
      if (st.filled) started++;
    });
    return { done: done, started: started, total: sec.cards.length };
  }

  /* ================= Навигация ================= */

  function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
  function route() {
    var h = (location.hash || "#/").replace(/^#/, "");
    var p = h.split("/").filter(Boolean);
    return { name: p[0] || "home", arg: p[1] };
  }

  function setChrome(title, isHome) {
    document.getElementById("topTitle").textContent = T(title || "");
    $top.classList.toggle("always", !isHome);
    var showBack = !isHome;
    if (inTG && tg.BackButton) {
      if (showBack) tg.BackButton.show(); else tg.BackButton.hide();
      document.getElementById("backBtn").hidden = true;
    } else {
      document.getElementById("backBtn").hidden = !showBack;
    }
    document.getElementById("scriptBtn").textContent = prefs.script === "lat" ? "Lot" : "Кир";
    document.getElementById("saved").textContent = "✓ " + T("Сақланди");
  }

  function back() {
    var r = route();
    if (r.name === "c") { var c = CARD_BY_N[r.arg]; go(c ? "#/s/" + c.sec.id : "#/"); }
    else go("#/");
  }

  /* ================= Кўринишлар ================= */

  function ring(pct) {
    var R = 25, C = 2 * Math.PI * R;
    return '<svg class="ring" viewBox="0 0 58 58"><circle class="bg" cx="29" cy="29" r="' + R + '"/>' +
      '<circle class="fg" cx="29" cy="29" r="' + R + '" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + (C * (1 - pct / 100)).toFixed(1) + '"/>' +
      '<text x="29" y="29">' + pct + "%</text></svg>";
  }
  var CHEV = '<svg class="chev" width="18" height="18" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var TICK = '<svg width="14" height="14" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function viewHome() {
    var done = 0, filledF = 0, totalF = 0;
    CARDS.forEach(function (c) { var s = cardStat(c); if (s.done) done++; filledF += s.filled; totalF += s.total; });
    var pct = Math.round(done / CARDS.length * 100);
    var meta = Store.get("meta");
    var last = prefs.last && CARD_BY_N[prefs.last];
    var h = "";

    h += '<section class="hero">';
    h += '<div class="hero-kicker">' + E(WB.kicker) + "</div>";
    h += "<h1>" + E(WB.title) + "</h1>";
    h += '<div class="hero-stats">' + E(WB.stats) + "</div>";
    h += '<div class="hero-path">' + WB.path.map(function (p) { return "<span>" + E(p) + "</span>"; }).join("<i>→</i>") + "</div>";
    h += '<div class="hero-progress">' + ring(pct) + "<div><b>" + E(done + " / " + CARDS.length + " карта якунланди") + "</b><small>" +
      E(filledF ? "Жами " + filledF + " та жавоб ёзилган" : "Биринчи картадан ёки йўл кўрсаткичдан бошланг") + "</small></div></div>";
    h += "</section>";

    var target = last || CARDS[0];
    h += '<button class="continue" data-go="#/c/' + target.n + '"><span class="c-ico">' + target.n + "</span><span><small>" +
      E(last ? "Давом эттириш" : "Бошлаш") + "</small><b>" + E(target.t) + '</b></span><span class="arrow">' + CHEV + "</span></button>";

    h += '<div class="section-label">' + E("Тезкор") + "</div>";
    h += '<div class="tiles">';
    h += tile("#/guide", "🧭", "Қаердан бошлаш?", "Вазиятингизга мос бўлимни топинг");
    h += tile("#/c/9", "⏱️", "60 сониялик тўхташ", "Вақт кам бўлганда — тезкор карта");
    h += tile("#/intro", "📘", "Дафтардан фойдаланиш", "10 қоида ва кўникма шкаласи");
    h += tile("#/notes", "📝", "Менинг қайдларим", "Эркин ёзувлар учун жой");
    h += "</div>";

    h += '<div class="section-label">' + E("Иштирокчи") + "</div>";
    h += '<div class="card profile">';
    h += "<label><span>" + E("Иштирокчининг исми") + '</span><input class="inp" data-meta="name" value="' + esc(meta.name || "") + '" placeholder="' + E("Исмингиз") + '"></label>';
    h += "<label><span>" + E("Бошланган сана") + '</span><input class="inp" type="date" data-meta="start" value="' + esc(meta.start || "") + '"></label>';
    h += "</div>";

    h += '<div class="section-label">' + E("Бўлимлар") + "</div>";
    h += '<div class="sec-list">';
    WB.sections.forEach(function (s) {
      var st = secStat(s);
      var cls = st.done === st.total ? " done" : "";
      h += '<button class="sec-item' + cls + '" data-go="#/s/' + s.id + '"><span class="badge">' + esc(s.roman) + '</span><span class="sec-body"><b>' + E(s.title) + "</b>" +
        '<span class="sec-meta"><span>' + E(s.cards[0].n + "–" + s.cards[s.cards.length - 1].n + " карталар") + '</span><span class="bar"><i style="width:' + (st.done / st.total * 100) + '%"></i></span><span>' + st.done + "/" + st.total + "</span></span></span>" + CHEV + "</button>";
    });
    h += "</div>";

    h += '<div class="section-label">' + E("Сақлаш ва улашиш") + "</div>";
    h += '<div class="footer-links">';
    h += '<button class="btn" data-go="#/export">📤 ' + E("Экспорт / захира") + "</button>";
    h += '<button class="btn" data-go="#/search">🔎 ' + E("Қидириш") + "</button>";
    h += "</div>";
    h += '<p class="muted small" style="margin:10px 4px 0">' + E(Store.cloud
      ? "☁️ Жавоблар Telegram булутида сақланади — бошқа қурилмада ҳам очилади."
      : "📱 Жавоблар шу қурилмада сақланади. Telegram орқали очсангиз, булутда ҳам сақланади.") + "</p>";

    h += '<div class="brand-foot"><b>' + esc(WB.brand.toUpperCase()) + "</b><br>" + esc(WB.site) + "</div>";
    return { title: WB.title, home: true, html: h };
  }
  function tile(href, ico, title, sub) {
    return '<button class="tile" data-go="' + href + '"><span class="t-ico">' + ico + "</span><b>" + E(title) + "</b><small>" + E(sub) + "</small></button>";
  }

  function cycleHtml() {
    return '<div class="cycle">' + WB.cycle.map(function (c) { return "<span>" + E(c) + "</span>"; }).join("<i>→</i>") + "</div>";
  }

  function viewSection(id) {
    var s = secById(id);
    if (!s) return viewHome();
    var h = '<div class="sec-head"><div class="sec-roman">' + esc(s.icon) + " " + E(secLabel(s)) + "</div>";
    h += "<h1>" + E(s.title) + '</h1><p class="sec-sub">' + E(s.sub) + "</p>" + cycleHtml() + "</div>";
    h += '<div class="card-list">';
    s.cards.forEach(function (c) {
      var st = cardStat(c);
      var cls = st.done ? " done" : (st.filled ? " part" : "");
      var sub = st.done ? "✓ " + T("Якунланган") : (st.filled ? T("Тўлдирилди: ") + st.pct + "%" : T("Ҳали бошланмаган"));
      h += '<button class="card-item' + cls + '" data-go="#/c/' + c.n + '"><span class="cnum">' + (st.done ? TICK : c.n) + '</span><span class="cbody"><b>' + E(c.t) + "</b><small>" + esc(sub) + "</small></span>" + CHEV + "</button>";
    });
    h += "</div>";

    var notes = Store.get("n" + s.id);
    h += '<div class="section-label">' + E("Менинг қайдларим") + "</div>";
    h += '<div class="q"><textarea class="note-area" data-note="n' + s.id + '" placeholder="' + E("Бу бўлим бўйича фикрлар, кашфиётлар, саволлар…") + '">' + esc(notes.text || "") + "</textarea></div>";

    var i = WB.sections.indexOf(s);
    var prev = WB.sections[i - 1], next = WB.sections[i + 1];
    h += '<div class="pager">';
    h += "<button " + (prev ? 'data-go="#/s/' + prev.id + '"' : "disabled") + "><small>← " + E("Олдинги бўлим") + "</small><b>" + (prev ? E(prev.title) : "") + "</b></button>";
    h += "<button " + (next ? 'data-go="#/s/' + next.id + '"' : "disabled") + "><small>" + E("Кейинги бўлим") + " →</small><b>" + (next ? E(next.title) : "") + "</b></button>";
    h += "</div>";
    return { title: s.title, html: h };
  }

  /* ---------- Карта ---------- */

  function viewCard(n) {
    var c = CARD_BY_N[n];
    if (!c) return viewHome();
    prefs.last = c.n; savePrefs();
    var v = Store.get("c" + c.n);
    var st = cardStat(c);
    var h = '<div class="crumb"><button data-go="#/s/' + c.sec.id + '">' + esc(c.sec.icon) + " " + E(secLabel(c.sec)) + "</button>" + (c.sec.final ? "" : "<span>·</span><span>" + E(c.sec.title) + "</span>") + "</div>";
    h += '<div class="card-head"><span class="card-no">' + E(c.n + "-карта") + "</span><h1>" + E(c.t) + "</h1>";
    if (c.d) h += '<p class="card-desc">' + E(c.d) + "</p>";
    h += '<div class="card-prog"><span class="bar"><i id="cbar" style="width:' + st.pct + '%"></i></span><span id="cpct">' + st.filled + "/" + st.total + "</span></div></div>";

    h += '<div class="blocks">';
    c.b.forEach(function (b, i) { h += block(b, "b" + i, v); });
    h += "</div>";

    h += '<button class="done-btn' + (v._done ? " on" : "") + '" id="doneBtn">' + doneLabel(v._done) + "</button>";
    h += '<div class="actions"><button class="btn" id="copyCard">📋 ' + E("Нусха олиш") + '</button><button class="btn" id="shareCard">↗️ ' + E("Улашиш") + "</button></div>";

    var prev = CARDS[c.idx - 1], next = CARDS[c.idx + 1];
    h += '<div class="pager">';
    h += "<button " + (prev ? 'data-go="#/c/' + prev.n + '"' : "disabled") + "><small>← " + E(prev ? prev.n + "-карта" : "") + "</small><b>" + (prev ? E(prev.t) : "") + "</b></button>";
    h += "<button " + (next ? 'data-go="#/c/' + next.n + '"' : "disabled") + "><small>" + E(next ? next.n + "-карта" : "") + " →</small><b>" + (next ? E(next.t) : "") + "</b></button>";
    h += "</div>";
    return { title: c.n + ". " + c.t, html: h, card: c };
  }
  function doneLabel(on) {
    return on ? TICK + " " + E("Карта якунланди") : E("Картани якунладим");
  }

  var PH = "Жавобингизни ёзинг…";

  function ta(id, val, ph, cls) {
    return '<textarea rows="1" data-f="' + id + '"' + (cls ? ' class="' + cls + '"' : "") + ' placeholder="' + E(ph || PH) + '">' + esc(val || "") + "</textarea>";
  }

  function block(b, id, v) {
    if (typeof b === "string" || b.q !== undefined) {
      var q = typeof b === "string" ? b : b.q;
      return '<label class="q' + (filled(v[id]) ? " filled" : "") + '">' + (q ? '<span class="q-t">' + E(q) + "</span>" : "") + ta(id, v[id], b.ph) + "</label>";
    }
    if (b.h) return '<div class="sub-h">' + E(b.h) + "</div>";
    if (b.p) return '<p class="para">' + E(b.p) + "</p>";
    if (b.box) return '<div class="box"><b>' + E(b.box) + "</b><p>" + E(b.text) + "</p></div>";
    if (b.quote) return '<div class="quote">' + E(b.quote) + "</div>";
    if (b.chain) return '<div class="chain">' + b.chain.map(function (x) { return "<span>" + E(x) + "</span>"; }).join("<i>↓</i>") + "</div>";

    if (b.list) {
      var h = '<div class="q"><div class="lst">';
      b.list.forEach(function (label, j) {
        var fid = id + "." + j;
        var num = /^\d+\.$/.test(label);
        var mnum = label.match(/^(\d+)/);
        h += '<div class="li"><span class="li-n">' + (mnum ? mnum[1] : j + 1) + '</span><div class="li-body">';
        if (!num) h += '<span class="li-cap">' + E(label.replace(/^\d+\.\s*/, "")) + "</span>";
        h += ta(fid, v[fid], b.ph);
        if (b.tags) {
          var on = v[fid + "t"] || [];
          h += '<div class="tags">' + b.tags.map(function (t) {
            return '<button class="tag' + (on.indexOf(t) >= 0 ? " on" : "") + '" data-tag="' + fid + 't" data-val="' + esc(t) + '">' + E(t) + "</button>";
          }).join("") + "</div>";
        }
        h += "</div></div>";
      });
      return h + "</div></div>";
    }

    if (b.chk) {
      var sel = v[id] || [];
      if (b.chips) {
        return '<div class="q"><div class="chips">' + b.chk.map(function (t, k) {
          return '<button class="chip' + (sel.indexOf(k) >= 0 ? " on" : "") + '" data-chk="' + id + '" data-i="' + k + '">' + E(t) + "</button>";
        }).join("") + "</div></div>";
      }
      var cls = b.ladder ? "chk ladder" : (b.grid ? "chk grid" : "chk");
      return '<div class="q"><div class="' + cls + '">' + b.chk.map(function (t, k) {
        return '<button class="ck' + (sel.indexOf(k) >= 0 ? " on" : "") + '" data-chk="' + id + '" data-i="' + k + '"><span class="box-i">' + TICK + "</span><span>" + E(t) + "</span>" +
          (b.ladder ? '<span class="lv">' + (k + 1) + "</span>" : "") + "</button>";
      }).join("") + "</div></div>";
    }

    if (b.tbl) {
      var t = b.tbl;
      var h2 = '<div class="tbl">';
      t.rows.forEach(function (row, r) {
        var label = typeof row === "string" ? row : row.l;
        var hint = typeof row === "string" ? "" : row.hint;
        if (/^\d+$/.test(label) && t.head) label = t.head + " " + label;
        var rowKeys = t.cols.map(function (_, c) { return id + "." + r + "." + c; });
        var any = rowKeys.some(function (k) { return filled(v[k]); });
        h2 += '<div class="trow' + (any ? " filled" : "") + '"><div class="trow-h">' + E(label) + (hint ? "<small>" + E(hint) + "</small>" : "") + "</div>";
        h2 += '<div class="tcells">';
        var numCells = "";
        t.cols.forEach(function (col, c) {
          var fid = rowKeys[c];
          var name = typeof col === "string" ? col : col.t;
          var single = t.cols.length === 1;
          if (col.num) {
            numCells += '<label class="tcell num"><span>' + E(name) + '</span><input class="inp" type="number" inputmode="numeric" min="0" max="10" data-f="' + fid + '" value="' + esc(v[fid] == null ? "" : v[fid]) + '"></label>';
          } else if (col.date) {
            h2 += '<label class="tcell"><span>' + E(name) + '</span><input class="inp" type="date" data-f="' + fid + '" value="' + esc(v[fid] || "") + '"></label>';
          } else {
            h2 += '<label class="tcell">' + (single ? "" : "<span>" + E(name) + "</span>") + ta(fid, v[fid], single ? name + "…" : "…") + "</label>";
          }
        });
        if (numCells) h2 += '<div class="nums">' + numCells + "</div>";
        h2 += "</div></div>";
      });
      return h2 + "</div>";
    }

    if (b.ref) {
      return '<div class="q"><table class="ref"><thead><tr>' + b.ref.head.map(function (x) { return "<th>" + E(x) + "</th>"; }).join("") + "</tr></thead><tbody>" +
        b.ref.rows.map(function (row) { return "<tr>" + row.map(function (x) { return "<td>" + E(x) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>";
    }

    if (b.formula) {
      var parts = b.formula.split("___");
      var hf = '<div class="formula"><b>' + E(b.title || "Формула") + '</b><div class="f-line">';
      parts.forEach(function (p, k) {
        if (p.trim()) hf += "<span>" + E(p.trim()) + "</span>";
        if (k < parts.length - 1) {
          var fid = id + "." + k;
          hf += '<input class="inp" data-f="' + fid + '" value="' + esc(v[fid] || "") + '" placeholder="…">';
        }
      });
      return hf + "</div></div>";
    }

    if (b.range !== undefined) {
      var cur = v[id];
      var hr = '<div class="q"><span class="q-t">' + E(b.range + " (0–" + b.max + ")") + '</span><div class="rng">';
      for (var x = 0; x <= b.max; x++) hr += '<button class="' + (cur === x ? "on" : "") + '" data-rng="' + id + '" data-i="' + x + '">' + x + "</button>";
      return hr + '</div><div class="rng-l"><span>' + E("кучсиз") + "</span><span>" + E("жуда кучли") + "</span></div></div>";
    }

    if (b.date) {
      return '<label class="q' + (filled(v[id]) ? " filled" : "") + '"><span class="q-t">' + E(b.date) + '</span><input class="inp" type="date" data-f="' + id + '" value="' + esc(v[id] || "") + '"></label>';
    }
    return "";
  }

  /* ---------- Йўл кўрсаткич, қоидалар, қайдлар ---------- */

  function viewGuide() {
    var h = '<div class="sec-head"><div class="sec-roman">🧭 ' + E("Тезкор йўл кўрсаткич") + "</div><h1>" + E("Қаердан бошлаш?") + '</h1><p class="sec-sub">' +
      E("Қайси картадан бошлашни билмасангиз, вазиятингизга энг яқин қаторни топинг.") + "</p></div>";
    h += '<div class="guide" style="margin-top:16px">';
    WB.guide.forEach(function (g) {
      var href, label;
      if (g.card) { href = "#/c/" + g.card; label = g.card + "-карта"; }
      else { var s = secById(g.s); href = "#/s/" + s.id; label = s.roman + ". " + s.title; }
      h += '<button class="guide-row" data-go="' + href + '"><span class="gq">' + E(g.q) + '</span><span class="gt">' + E(label) + "</span></button>";
    });
    h += "</div>";
    return { title: "Қаердан бошлаш?", html: h };
  }

  function viewIntro() {
    var I = WB.intro;
    var colors = ["#B9C4BE", "#9DB3A7", "#7FA08F", "#5F7D6E", "#3E6653", "#254C3B"];
    var h = '<div class="sec-head"><div class="sec-roman">📘 ' + E("Кириш") + "</div><h1>" + E("Дафтардан қандай фойдаланиш керак") + "</h1></div>";
    h += '<div class="stack" style="margin-top:12px">';
    h += '<div class="card"><p style="margin:0">' + E(I.howto) + "</p></div>";
    h += '<div class="box brand"><b>' + E("Асосий савол") + "</b><p>" + E(I.keyQuestion) + "</p></div>";
    h += "</div>";
    h += '<div class="section-label">' + E("Ишлашнинг 10 қоидаси") + '</div><div class="card"><ol class="rules">' +
      I.rules.map(function (r) { return "<li>" + E(r) + "</li>"; }).join("") + "</ol></div>";
    h += '<div class="section-label">' + E("Кўникма ривожланишининг умумий шкаласи") + '</div><div class="card"><div class="scale">' +
      I.scale.map(function (s, i) { return '<div><b style="background:' + colors[i] + '">' + s[0] + "</b><span>" + E(s[1]) + "</span></div>"; }).join("") + "</div></div>";
    h += '<div class="box" style="margin-top:12px"><b>' + E("Муҳим") + "</b><p>" + E(I.scaleNote) + "</p></div>";
    h += '<p class="muted small" style="margin:16px 4px 0;font-style:italic">' + E(WB.purpose) + "</p>";
    h += '<button class="btn primary" style="width:100%;margin-top:16px" data-go="#/guide">' + E("Қаердан бошлашни танлаш") + " →</button>";
    return { title: "Дафтардан фойдаланиш", html: h };
  }

  function viewNotes() {
    var n = Store.get("notes");
    var h = '<div class="sec-head"><div class="sec-roman">📝 ' + E("Қайдлар") + "</div><h1>" + E("Менинг қайдларим") + '</h1><p class="sec-sub">' +
      E("Ҳар қандай фикр, кузатув ёки кейинроқ қайтмоқчи бўлган саволлар учун.") + "</p></div>";
    h += '<div class="stack" style="margin-top:14px">';
    h += '<label class="q"><span class="q-t">' + E("Қайдлар 1") + '</span><textarea class="note-area" data-note="notes" data-k="a">' + esc(n.a || "") + "</textarea></label>";
    h += '<label class="q"><span class="q-t">' + E("Қайдлар 2") + '</span><textarea class="note-area" data-note="notes" data-k="b">' + esc(n.b || "") + "</textarea></label>";
    h += "</div>";
    var secs = WB.sections.filter(function (s) { return (Store.get("n" + s.id).text || "").trim(); });
    if (secs.length) {
      h += '<div class="section-label">' + E("Бўлимлардаги қайдлар") + "</div>";
      secs.forEach(function (s) {
        h += '<button class="hit" data-go="#/s/' + s.id + '"><small>' + E(secLabel(s)) + "</small><b>" + E(s.title) + "</b><p>" + esc(Store.get("n" + s.id).text.slice(0, 140)) + "</p></button>";
      });
    }
    return { title: "Менинг қайдларим", html: h };
  }

  /* ---------- Қидириш ---------- */

  var searchQ = "";
  function blockTexts(b) {
    if (typeof b === "string") return [b];
    var out = [];
    ["q", "h", "p", "box", "text", "formula", "range", "date", "quote"].forEach(function (k) { if (typeof b[k] === "string") out.push(b[k]); });
    if (b.list) out = out.concat(b.list);
    if (b.chk) out = out.concat(b.chk);
    if (b.tbl) out = out.concat(b.tbl.rows.map(function (r) { return typeof r === "string" ? r : r.l; }), b.tbl.cols.map(function (c) { return typeof c === "string" ? c : c.t; }));
    if (b.ref) b.ref.rows.forEach(function (r) { out = out.concat(r); });
    return out;
  }
  function norm(s) { return toLatin(String(s).toLowerCase()).replace(/[ʻʼ'`‘’]/g, ""); }
  function hl(text, q) {
    var t = T(text);
    var i = q ? t.toLowerCase().indexOf(q.toLowerCase()) : -1;
    if (i < 0) return esc(t);
    return esc(t.slice(0, i)) + "<mark>" + esc(t.slice(i, i + q.length)) + "</mark>" + esc(t.slice(i + q.length));
  }
  function searchResults(q) {
    var nq = norm(q.trim());
    if (nq.length < 2) return '<div class="empty">' + E("Карта номи, савол ёки калит сўзни ёзинг (кирилл ёки лотинда).") + "</div>";
    var out = "";
    var count = 0;
    CARDS.forEach(function (c) {
      var hitTitle = norm(c.t).indexOf(nq) >= 0 || String(c.n) === q.trim();
      var texts = [];
      if (c.d) texts.push(c.d);
      c.b.forEach(function (b) { texts = texts.concat(blockTexts(b)); });
      var ans = Store.get("c" + c.n);
      var hitText = texts.filter(function (x) { return norm(x).indexOf(nq) >= 0; })[0];
      var hitAns = null;
      if (!hitTitle && !hitText) {
        Object.keys(ans).some(function (k) {
          var val = ans[k];
          if (typeof val === "string" && norm(val).indexOf(nq) >= 0) { hitAns = val; return true; }
          return false;
        });
      }
      if (hitTitle || hitText || hitAns) {
        count++;
        out += '<button class="hit" data-go="#/c/' + c.n + '"><small>' + E(c.n + "-карта · " + c.sec.title) + "</small><b>" + hl(c.t, q.trim()) + "</b>" +
          (hitText && !hitTitle ? "<p>" + hl(hitText, q.trim()) + "</p>" : "") +
          (hitAns ? "<p>✍️ " + esc(hitAns.slice(0, 120)) + "</p>" : "") + "</button>";
      }
    });
    return count ? out : '<div class="empty">' + E("Ҳеч нарса топилмади.") + "</div>";
  }
  function viewSearch() {
    var h = '<div class="search-in"><input class="inp" id="searchInput" type="search" placeholder="' + E("Қидириш: ҳис-туйғу, қадрият, низо…") + '" value="' + esc(searchQ) + '" autocomplete="off"></div>';
    h += '<div id="searchOut">' + searchResults(searchQ) + "</div>";
    return { title: "Қидириш", html: h };
  }

  /* ---------- Экспорт ---------- */

  function valueText(b, id, v) {
    var lines = [];
    function add(label, val) { if (filled(val)) lines.push((label ? T(label) + "\n" : "") + "— " + val); }
    if (typeof b === "string" || b.q !== undefined) add(typeof b === "string" ? b : b.q, v[id]);
    else if (b.list) b.list.forEach(function (l, j) {
      var fid = id + "." + j, tags = (v[fid + "t"] || []).map(T).join(", ");
      if (filled(v[fid])) lines.push(T(l) + " " + v[fid] + (tags ? " [" + tags + "]" : ""));
    });
    else if (b.chk) { var sel = v[id] || []; if (sel.length) lines.push(sel.map(function (k) { return "☑ " + T(b.chk[k]); }).join("\n")); }
    else if (b.tbl) b.tbl.rows.forEach(function (row, r) {
      var label = typeof row === "string" ? row : row.l;
      var cells = b.tbl.cols.map(function (col, c) {
        var val = v[id + "." + r + "." + c];
        return filled(val) ? (b.tbl.cols.length > 1 ? T(typeof col === "string" ? col : col.t) + ": " : "") + val : null;
      }).filter(Boolean);
      if (cells.length) lines.push("▪ " + T(label) + " — " + cells.join("; "));
    });
    else if (b.formula) {
      var parts = b.formula.split("___"), anyF = false, s = "";
      parts.forEach(function (p, k) {
        s += T(p);
        if (k < parts.length - 1) { var x = v[id + "." + k]; if (filled(x)) anyF = true; s += filled(x) ? x : "___"; }
      });
      if (anyF) lines.push((b.title ? T(b.title) + ": " : "") + s);
    }
    else if (b.range !== undefined) { if (filled(v[id])) lines.push(T(b.range) + ": " + v[id] + "/" + b.max); }
    else if (b.date) add(b.date, v[id]);
    else if (b.h) return null;
    return lines.length ? lines.join("\n") : "";
  }
  function cardText(c) {
    var v = Store.get("c" + c.n);
    var parts = [];
    c.b.forEach(function (b, i) {
      var t = valueText(b, "b" + i, v);
      if (t) parts.push(t);
    });
    if (!parts.length) return "";
    return "📌 " + T(c.n + "-КАРТА. " + c.t.toUpperCase()) + "\n\n" + parts.join("\n\n");
  }
  function allText() {
    var meta = Store.get("meta");
    var out = [T(WB.kicker.toUpperCase()) + " — " + T(WB.title)];
    if (meta.name) out.push(T("Иштирокчи: ") + meta.name);
    if (meta.start) out.push(T("Бошланган сана: ") + meta.start);
    WB.sections.forEach(function (s) {
      var body = s.cards.map(cardText).filter(Boolean);
      var note = (Store.get("n" + s.id).text || "").trim();
      if (!body.length && !note) return;
      out.push("\n━━━━━━━━━━━━\n" + T((s.final ? "" : s.roman + " бўлим. ") + s.title.toUpperCase()) + "\n━━━━━━━━━━━━");
      out = out.concat(body);
      if (note) out.push("📝 " + T("Менинг қайдларим") + "\n" + note);
    });
    var n = Store.get("notes");
    if ((n.a || "").trim() || (n.b || "").trim()) out.push("\n📝 " + T("Қайдлар") + "\n" + [n.a, n.b].filter(Boolean).join("\n\n"));
    return out.join("\n\n");
  }

  function viewExport() {
    var h = '<div class="sec-head"><div class="sec-roman">📤 ' + E("Сақлаш") + "</div><h1>" + E("Экспорт ва захира") + '</h1><p class="sec-sub">' +
      E("Жавобларингизни нусхалаб тренерга юборинг ёки захира нусха сақлаб қўйинг.") + "</p></div>";
    h += '<div class="section-label">' + E("Жавоблар матни") + "</div>";
    h += '<div class="card stack"><p class="muted small" style="margin:0">' + E("Барча тўлдирилган карталар битта матнга йиғилади. Уни исталган чатга (масалан, «Избранное»га) жойлаштиришингиз мумкин.") + "</p>";
    h += '<button class="btn primary" id="copyAll" style="width:100%">📋 ' + E("Барча жавобларни нусхалаш") + "</button>";
    if (!inTG) h += '<button class="btn" id="dlAll" style="width:100%">⬇️ ' + E("Файл (.txt) сифатида юклаб олиш") + "</button>";
    h += "</div>";

    h += '<div class="section-label">' + E("Захира нусха") + "</div>";
    h += '<div class="card stack"><p class="muted small" style="margin:0">' + E("Захира коди — бошқа қурилмага ёки браузерга жавобларни кўчириш учун.") + "</p>";
    h += '<button class="btn" id="copyBackup" style="width:100%">🗂 ' + E("Захира кодини нусхалаш") + "</button>";
    h += '<textarea id="restoreIn" rows="3" placeholder="' + E("Захира кодини шу ерга жойлаштиринг…") + '"></textarea>';
    h += '<button class="btn" id="restoreBtn" style="width:100%">♻️ ' + E("Захирадан тиклаш") + "</button></div>";

    h += '<div class="section-label">' + E("Хавфли ҳудуд") + "</div>";
    h += '<button class="btn danger" id="wipe" style="width:100%">🗑 ' + E("Барча жавобларни ўчириш") + "</button>";
    return { title: "Экспорт ва захира", html: h };
  }

  /* ================= Чизиш ================= */

  function render() {
    var r = route();
    var v;
    if (r.name === "s") v = viewSection(r.arg);
    else if (r.name === "c") v = viewCard(r.arg);
    else if (r.name === "guide") v = viewGuide();
    else if (r.name === "intro") v = viewIntro();
    else if (r.name === "notes") v = viewNotes();
    else if (r.name === "search") v = viewSearch();
    else if (r.name === "export") v = viewExport();
    else v = viewHome();
    $app.innerHTML = '<div class="view">' + v.html + "</div>";
    setChrome(v.title, !!v.home);
    document.title = T(v.home ? "Иш дафтари" : v.title) + " — GlobalTrainings";
    window.scrollTo(0, 0);
    onScroll();
    $app.querySelectorAll("textarea").forEach(grow);
    bindView(r, v);
  }

  function grow(el) {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + 3 + "px";
  }

  function bindView(r, v) {
    if (r.name === "c" && v.card) bindCard(v.card);
    if (r.name === "search") {
      var inp = document.getElementById("searchInput");
      if (!searchQ) setTimeout(function () { inp.focus(); }, 250);
      inp.addEventListener("input", function () {
        searchQ = inp.value;
        document.getElementById("searchOut").innerHTML = searchResults(searchQ);
      });
    }
    if (r.name === "export") bindExport();
  }

  function bindCard(c) {
    var key = "c" + c.n;
    var doneBtn = document.getElementById("doneBtn");
    doneBtn.addEventListener("click", function () {
      var v = Store.get(key);
      v._done = !v._done;
      Store.set(key, v);
      doneBtn.classList.toggle("on", v._done);
      doneBtn.innerHTML = doneLabel(v._done);
      if (v._done) {
        haptic("ok");
        var next = CARDS[c.idx + 1];
        toast(next ? "Зўр! Кейинги карта: " + next.n + "-карта" : "Табриклаймиз! Дафтар якунланди 🎉");
      }
    });
    document.getElementById("copyCard").addEventListener("click", function () {
      var t = cardText(c);
      if (!t) return toast("Ҳали жавоб ёзилмаган");
      copy(t);
    });
    document.getElementById("shareCard").addEventListener("click", function () {
      var t = cardText(c);
      if (!t) return toast("Ҳали жавоб ёзилмаган");
      share(t);
    });
  }

  function updateCardProgress() {
    var r = route();
    if (r.name !== "c") return;
    var st = cardStat(CARD_BY_N[r.arg]);
    var bar = document.getElementById("cbar"), pct = document.getElementById("cpct");
    if (bar) bar.style.width = st.pct + "%";
    if (pct) pct.textContent = st.filled + "/" + st.total;
  }

  function currentCardKey() {
    var r = route();
    return r.name === "c" ? "c" + r.arg : null;
  }

  /* ---------- Умумий ҳодисалар ---------- */

  function onEdit(e) {
    var el = e.target;
    if (el.tagName === "TEXTAREA") grow(el);
    var f = el.getAttribute("data-f");
    if (f) {
      var key = currentCardKey();
      if (!key) return;
      var v = Store.get(key);
      var val = el.value;
      if (el.type === "number") {
        val = val === "" ? null : Math.max(0, Math.min(10, +val));
      }
      if (val === null || val === "") delete v[f]; else v[f] = val;
      Store.set(key, v);
      var holder = el.closest(".q, .trow");
      if (holder && !holder.querySelector(".lst, .rng, .chk, .chips")) {
        var any = Array.prototype.some.call(holder.querySelectorAll("[data-f]"), function (x) { return x.value.trim() !== ""; });
        holder.classList.toggle("filled", any);
      }
      updateCardProgress();
      return;
    }
    var note = el.getAttribute("data-note");
    if (note) {
      var nv = Store.get(note);
      nv[el.getAttribute("data-k") || "text"] = el.value;
      Store.set(note, nv);
      return;
    }
    var meta = el.getAttribute("data-meta");
    if (meta) {
      var mv = Store.get("meta");
      mv[meta] = el.value;
      Store.set("meta", mv);
    }
  }
  $app.addEventListener("input", onEdit);
  $app.addEventListener("change", function (e) { if (e.target.type === "date") onEdit(e); });

  $app.addEventListener("click", function (e) {
    var t = e.target.closest("[data-go],[data-chk],[data-tag],[data-rng]");
    if (!t) return;
    if (t.hasAttribute("data-go")) { e.preventDefault(); go(t.getAttribute("data-go")); return; }
    var key = currentCardKey();
    if (!key) return;
    var v = Store.get(key);
    if (t.hasAttribute("data-chk")) {
      var id = t.getAttribute("data-chk"), i = +t.getAttribute("data-i");
      var arr = (v[id] || []).slice();
      var at = arr.indexOf(i);
      if (at >= 0) arr.splice(at, 1); else arr.push(i);
      arr.sort(function (a, b) { return a - b; });
      if (arr.length) v[id] = arr; else delete v[id];
      t.classList.toggle("on", at < 0);
    } else if (t.hasAttribute("data-tag")) {
      var tid = t.getAttribute("data-tag"), tv = t.getAttribute("data-val");
      var tags = (v[tid] || []).slice();
      var ti = tags.indexOf(tv);
      if (ti >= 0) tags.splice(ti, 1); else tags.push(tv);
      if (tags.length) v[tid] = tags; else delete v[tid];
      t.classList.toggle("on", ti < 0);
    } else if (t.hasAttribute("data-rng")) {
      var rid = t.getAttribute("data-rng"), rv = +t.getAttribute("data-i");
      if (v[rid] === rv) delete v[rid]; else v[rid] = rv;
      t.parentNode.querySelectorAll("button").forEach(function (b) { b.classList.toggle("on", +b.getAttribute("data-i") === v[rid]); });
    }
    haptic();
    Store.set(key, v);
    updateCardProgress();
  });

  /* ---------- Нусхалаш ва улашиш ---------- */

  function copy(text) {
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", "");
      ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
      toast(ok ? "Нусха олинди ✓" : "Нусхалаб бўлмади");
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast("Нусха олинди ✓"); haptic("ok"); }, fallback);
    } else fallback();
  }
  function share(text) {
    var MAX = 3500;
    var body = text.length > MAX ? text.slice(0, MAX) + "…" : text;
    if (inTG && tg.openTelegramLink) {
      tg.openTelegramLink("https://t.me/share/url?url=" + encodeURIComponent(body));
    } else if (navigator.share) {
      navigator.share({ text: text }).catch(function () {});
    } else copy(text);
  }
  function confirmBox(msg, cb) {
    if (inTG && tg.showConfirm) tg.showConfirm(T(msg), function (ok) { if (ok) cb(); });
    else if (window.confirm(T(msg))) cb();
  }

  function bindExport() {
    document.getElementById("copyAll").addEventListener("click", function () {
      var t = allText();
      copy(t);
    });
    var dl = document.getElementById("dlAll");
    if (dl) dl.addEventListener("click", function () {
      var blob = new Blob([allText()], { type: "text/plain;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "ish-daftari.txt";
      document.body.appendChild(a); a.click(); a.remove();
    });
    document.getElementById("copyBackup").addEventListener("click", function () {
      copy("GTWB1:" + btoa(unescape(encodeURIComponent(JSON.stringify(Store.all())))));
    });
    document.getElementById("restoreBtn").addEventListener("click", function () {
      var raw = document.getElementById("restoreIn").value.trim();
      try {
        var obj = JSON.parse(decodeURIComponent(escape(atob(raw.replace(/^GTWB1:/, "")))));
        if (!obj || typeof obj !== "object") throw 0;
        confirmBox("Захирадаги жавоблар жорий жавоблар устига ёзилади. Давом этамизми?", function () {
          Store.replaceAll(obj);
          toast("Жавоблар тикланди ✓");
          go("#/");
        });
      } catch (e) { toast("Захира коди нотўғри"); }
    });
    document.getElementById("wipe").addEventListener("click", function () {
      confirmBox("Барча жавоблар бутунлай ўчирилади. Ишончингиз комилми?", function () {
        Store.clear();
        toast("Ўчирилди");
        go("#/");
      });
    });
  }

  /* ================= Мавзу ва Telegram ================= */

  function applyTheme() {
    var dark;
    if (inTG && tg.colorScheme) dark = tg.colorScheme === "dark";
    else dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    if (tg) {
      var bg = dark ? "#0F1513" : "#F3F6F4";
      try {
        if (tg.isVersionAtLeast("6.1")) { tg.setHeaderColor(bg); tg.setBackgroundColor(bg); }
        if (tg.isVersionAtLeast("7.10") && tg.setBottomBarColor) tg.setBottomBarColor(bg);
      } catch (e) {}
    }
  }

  function onScroll() { $top.classList.toggle("scrolled", window.scrollY > 40); }
  window.addEventListener("scroll", onScroll, { passive: true });

  document.getElementById("backBtn").addEventListener("click", back);
  document.getElementById("searchBtn").addEventListener("click", function () { go("#/search"); });
  document.getElementById("scriptBtn").addEventListener("click", function () {
    prefs.script = prefs.script === "lat" ? "cyr" : "lat";
    savePrefs();
    haptic();
    var y = window.scrollY;
    render();
    window.scrollTo(0, y);
    toast(prefs.script === "lat" ? "Lotin yozuvi" : "Кирилл ёзуви");
  });
  window.addEventListener("hashchange", render);

  if (tg) {
    try {
      tg.ready();
      tg.expand();
      if (tg.isVersionAtLeast("7.7") && tg.disableVerticalSwipes) tg.disableVerticalSwipes();
      if (tg.BackButton) tg.BackButton.onClick(back);
      tg.onEvent("themeChanged", applyTheme);
    } catch (e) {}
  }
  applyTheme();
  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) mq.addEventListener("change", applyTheme);
  }

  // Telegram орқали «startapp=c12» параметри билан тўғридан-тўғри картани очиш
  var start = tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param;
  if (start && !location.hash) {
    var m = /^c(\d+)$/.exec(start), s = /^s(\d+)$/.exec(start);
    if (m && CARD_BY_N[m[1]]) location.hash = "#/c/" + m[1];
    else if (s && secById(s[1])) location.hash = "#/s/" + s[1];
  }

  Store.load().then(render, render);
})();
