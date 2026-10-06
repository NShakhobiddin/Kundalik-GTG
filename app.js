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
        m = prevLo && VOWELS.indexOf(prevLo) >= 0 ? "ts" : "s";
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

  var prefs = { script: "lat", chosen: false, last: null, fs: true };
  try {
    var savedPrefs = JSON.parse(localStorage.getItem("gt_prefs") || "{}");
    if (savedPrefs.script && savedPrefs.chosen === undefined) savedPrefs.chosen = true;
    Object.assign(prefs, savedPrefs);
  } catch (e) {}
  // Ҳавола орқали ёзувни танлаш: ...?lat / ...?cyr ёки startapp=lat, startapp=cyr_c12
  var START = (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) || "";
  (function () {
    var m = /(?:^|[?&_])(lat|cyr)(?:$|[&_=])/.exec(location.search + "&" + START);
    if (m) { prefs.script = m[1]; prefs.chosen = true; }
  })();
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
    var readOnly = false;

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
      set: function (k, v, silent) {
        if (readOnly) return;
        data[k] = { u: Date.now(), v: v };
        try { localStorage.setItem(LS + k, JSON.stringify(data[k])); } catch (e) {}
        clearTimeout(timers[k]);
        timers[k] = setTimeout(function () { writeCloud(k, data[k]); }, 700);
        if (!silent) flash();
      },
      all: function () { return data; },
      // Ҳаволадан келган жавобларни фақат кўрсатиш учун (сақламасдан) юклаш
      snapshot: function (d) { data = d || {}; readOnly = true; },
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

  var TABS = ["home", "sections", "search", "notes", "settings"];
  var stack = [];          // илова ичидаги ўтишлар тарихи (анимация йўналиши ва «Орқага» учун)
  var scrollMem = {};      // ҳар бир саҳифанинг скролл ҳолати
  var navDir = "fade";

  function go(hash, opts) {
    opts = opts || {};
    if (location.hash === hash) return render();
    if (opts.replace) { stack = []; location.replace(hash); }
    else location.hash = hash;
  }
  function route() {
    var h = (location.hash || "#/").replace(/^#/, "");
    var p = h.split("/").filter(Boolean);
    var name = p[0] || "home";
    if (name === "export") name = "settings";
    if (!prefs.chosen) name = "welcome";
    return { name: name, arg: p[1] };
  }
  function depth(r) {
    if (r.name === "c") return 2;
    if (r.name === "s" || r.name === "guide" || r.name === "intro") return 1;
    return 0;
  }
  function parentHash(r) {
    if (r.name === "c") { var c = CARD_BY_N[r.arg]; return c ? "#/s/" + c.sec.id : "#/"; }
    return "#/";
  }

  function setChrome(title, r) {
    var root = depth(r) === 0;
    document.getElementById("topTitle").textContent = T(title || "");
    $top.classList.toggle("always", r.name !== "home");
    $top.hidden = r.name === "welcome";
    var showBack = !root;
    if (inTG && tg.BackButton) {
      if (showBack) tg.BackButton.show(); else tg.BackButton.hide();
      document.getElementById("backBtn").hidden = true;
    } else {
      document.getElementById("backBtn").hidden = !showBack;
    }
    document.getElementById("scriptBtn").textContent = prefs.script === "lat" ? "Lotin" : "Кирилл";
    document.getElementById("saved").textContent = "✓ " + T("Сақланди");

    var showTabs = r.name !== "welcome" && r.name !== "c";
    document.body.classList.toggle("has-tabs", showTabs);
    var activeTab = TABS.indexOf(r.name) >= 0 ? r.name : (r.name === "s" ? "sections" : "home");
    document.querySelectorAll("#tabbar [data-tab]").forEach(function (b) {
      var on = b.getAttribute("data-tab") === activeTab;
      b.classList.toggle("on", on);
      b.setAttribute("aria-current", on ? "page" : "false");
      var lab = b.querySelector("span");
      lab.textContent = T(lab.getAttribute("data-l"));
    });
  }

  function back() {
    if (stack.length > 1) history.back();
    else go(parentHash(route()), { replace: true });
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

    h += '<button class="pdf-cta" id="pdfHome"><span class="c-ico">PDF</span><span><b>' + E("Жавобларни PDF қилиб сақлаш") + "</b><small>" +
      E("Барча тўлдирилган карталар — чиройли A4 ҳужжатда") + "</small></span>" + CHEV + "</button>";
    h += '<p class="muted small" style="margin:16px 4px 0">' + E(storageNote()) + "</p>";

    h += '<div class="brand-foot"><b>' + esc(WB.brand.toUpperCase()) + "</b><br>" + esc(WB.site) + "</div>";
    return { title: WB.title, home: true, html: h };
  }
  function storageNote() {
    return Store.cloud
      ? "☁️ Жавоблар автоматик равишда Telegram булутида сақланади — бошқа қурилмада ҳам очилади."
      : "📱 Жавоблар автоматик равишда шу қурилмада сақланади. Telegram орқали очсангиз, булутда ҳам сақланади.";
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
    h += '<div class="actions three"><button class="btn" id="pdfCard">📄 PDF</button><button class="btn" id="copyCard">📋 ' + E("Нусха") + '</button><button class="btn" id="shareCard">↗️ ' + E("Улашиш") + "</button></div>";

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

  var installPrompt = null;
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); installPrompt = e; });

  function viewSettings() {
    var h = '<div class="sec-head"><div class="sec-roman">⚙️ ' + E("Созламалар") + "</div><h1>" + E("Созламалар") + "</h1></div>";
    h += '<div class="section-label">' + E("Ёзув") + "</div>";
    h += '<div class="seg">' +
      '<button data-script="lat" class="' + (prefs.script === "lat" ? "on" : "") + '"><b>Lotin</b><small>Oʻzbekcha</small></button>' +
      '<button data-script="cyr" class="' + (prefs.script === "cyr" ? "on" : "") + '"><b>Кирилл</b><small>Ўзбекча</small></button></div>';

    h += '<div class="section-label">' + E("Илова") + '</div><div class="card rows">';
    if (tg && tg.isVersionAtLeast && tg.isVersionAtLeast("8.0") && tg.requestFullscreen) {
      h += '<button class="row" id="fsToggle"><span class="row-ico">⛶</span><span class="row-t"><b>' + E("Тўлиқ экран") + "</b><small>" +
        E("Telegram'да очилганда бутун экранни эгаллайди") + '</small></span><span class="switch' + (tg.isFullscreen ? " on" : "") + '"><i></i></span></button>';
    }
    if (tg && tg.isVersionAtLeast && tg.isVersionAtLeast("8.0") && tg.addToHomeScreen) {
      h += '<button class="row" id="homeBtn"><span class="row-ico">📲</span><span class="row-t"><b>' + E("Бош экранга қўшиш") + "</b><small id=\"homeStatus\">" +
        E("Дафтарни телефон экранидан илова каби очинг") + "</small></span>" + CHEV + "</button>";
    }
    if (!inTG) {
      h += '<button class="row" id="installBtn"' + (installPrompt ? "" : " hidden") + '><span class="row-ico">📲</span><span class="row-t"><b>' + E("Иловани ўрнатиш") + "</b><small>" +
        E("Бош экранга илова сифатида қўшиш") + "</small></span>" + CHEV + "</button>";
    }
    h += '<div class="row static"><span class="row-ico">' + (Store.cloud ? "☁️" : "📱") + '</span><span class="row-t"><b>' + E("Автоматик сақлаш") + "</b><small>" +
      E(storageNote().replace(/^\S+\s/, "")) + "</small></span></div>";
    h += "</div>";

    h += '<div class="section-label">' + E("Жавоблар матни") + "</div>";
    h += '<div class="card stack"><p class="muted small" style="margin:0">' + E("Барча тўлдирилган карталар битта матнга йиғилади. Уни исталган чатга (масалан, «Сақланган хабарлар»га) жойлаштиришингиз мумкин.") + "</p>";
    h += '<button class="btn primary" id="pdfAll" style="width:100%">📄 ' + E("PDF сифатида сақлаш") + "</button>";
    h += '<button class="btn" id="copyAll" style="width:100%">📋 ' + E("Барча жавобларни нусхалаш") + "</button>";
    if (!inTG) h += '<button class="btn" id="dlAll" style="width:100%">⬇️ ' + E("Файл (.txt) сифатида юклаб олиш") + "</button>";
    h += "</div>";

    h += '<div class="section-label">' + E("Захира нусха") + "</div>";
    h += '<div class="card stack"><p class="muted small" style="margin:0">' + E("Захира коди — бошқа қурилмага ёки браузерга жавобларни кўчириш учун.") + "</p>";
    h += '<button class="btn" id="copyBackup" style="width:100%">🗂 ' + E("Захира кодини нусхалаш") + "</button>";
    h += '<textarea id="restoreIn" rows="3" placeholder="' + E("Захира кодини шу ерга жойлаштиринг…") + '"></textarea>';
    h += '<button class="btn" id="restoreBtn" style="width:100%">♻️ ' + E("Захирадан тиклаш") + "</button></div>";

    h += '<div class="section-label">' + E("Хавфли ҳудуд") + "</div>";
    h += '<button class="btn danger" id="wipe" style="width:100%">🗑 ' + E("Барча жавобларни ўчириш") + "</button>";
    h += '<div class="brand-foot"><b>' + esc(WB.brand.toUpperCase()) + "</b><br>" + esc(WB.site) + "</div>";
    return { title: "Созламалар", html: h };
  }

  function setScript(sc) {
    if (prefs.script === sc) return;
    prefs.script = sc;
    prefs.chosen = true;
    savePrefs();
    Store.set("prefs", { script: sc }, true);
    haptic();
    var y = window.scrollY;
    navDir = "none";
    lastRoute = null;
    render();
    window.scrollTo(0, y);
    toast(sc === "lat" ? "Lotin yozuvi" : "Кирилл ёзуви");
  }

  function setFullscreen(on) {
    prefs.fs = on; savePrefs();
    try { if (on) tg.requestFullscreen(); else tg.exitFullscreen(); } catch (e) {}
  }

  function bindSettings() {
    bindExport();
    $app.querySelectorAll("[data-script]").forEach(function (b) {
      b.addEventListener("click", function () { setScript(b.getAttribute("data-script")); });
    });
    var fs = document.getElementById("fsToggle");
    if (fs) fs.addEventListener("click", function () { setFullscreen(!tg.isFullscreen); haptic(); });
    var hb = document.getElementById("homeBtn");
    if (hb) {
      try {
        tg.checkHomeScreenStatus(function (st) {
          if (st === "added") document.getElementById("homeStatus").textContent = T("✓ Бош экранга қўшилган");
          if (st === "unsupported") hb.hidden = true;
        });
      } catch (e) {}
      hb.addEventListener("click", function () { try { tg.addToHomeScreen(); } catch (e) {} });
    }
    var ib = document.getElementById("installBtn");
    if (ib) ib.addEventListener("click", function () {
      if (!installPrompt) return;
      installPrompt.prompt();
      installPrompt = null;
      ib.hidden = true;
    });
  }

  /* ---------- Биринчи очилиш: ёзувни танлаш ---------- */

  function viewWelcome() {
    var h = '<div class="welcome">';
    h += '<div class="w-logo"><svg viewBox="0 0 64 64" width="64" height="64"><rect width="64" height="64" rx="18" fill="#254C3B"/><path d="M19 17h19a7 7 0 0 1 7 7v23H26a7 7 0 0 1-7-7z" fill="none" stroke="#C99A5B" stroke-width="4" stroke-linejoin="round"/><path d="M26 27h12M26 34h9" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg></div>';
    h += '<div class="w-kicker">GLOBALTRAININGS</div>';
    h += "<h1>Shaxsiy rivojlanish tizimi</h1><p class=\"w-alt\">Шахсий ривожланиш тизими</p>";
    h += '<p class="w-ask">Yozuvni tanlang <i>·</i> Ёзувни танланг</p>';
    h += '<button class="w-opt" data-pick="lat"><span class="w-ab">Aa</span><span><b>Lotin</b><small>Oʻzbekcha · lotin yozuvi</small></span>' + CHEV + "</button>";
    h += '<button class="w-opt" data-pick="cyr"><span class="w-ab">Аа</span><span><b>Кирилл</b><small>Ўзбекча · кирилл ёзуви</small></span>' + CHEV + "</button>";
    h += '<p class="w-note">Keyinroq sozlamalardan oʻzgartirish mumkin<br>Кейинроқ созламалардан ўзгартириш мумкин</p>';
    h += "</div>";
    return { title: "", html: h };
  }
  function bindWelcome() {
    $app.querySelectorAll("[data-pick]").forEach(function (b) {
      b.addEventListener("click", function () {
        prefs.script = b.getAttribute("data-pick");
        prefs.chosen = true;
        savePrefs();
        Store.set("prefs", { script: prefs.script }, true);
        haptic("ok");
        stack = [];
        lastRoute = null;
        render();
      });
    });
  }

  /* ---------- Мундарижа ---------- */

  function viewSections() {
    var h = '<div class="sec-head"><div class="sec-roman">📚 ' + E("Мундарижа") + "</div><h1>" + E("Бўлимлар ва карталар") + '</h1><p class="sec-sub">' +
      E("Бўлимлар ўзини кузатишдан бошлаб автоном ривожланиш ва ижтимоий ҳиссагача бўлган мантиқда жойлаштирилган.") + "</p></div>";
    WB.sections.forEach(function (s) {
      var st = secStat(s);
      h += '<div class="toc"><button class="toc-h" data-go="#/s/' + s.id + '"><span class="badge">' + esc(s.roman) + '</span><span class="sec-body"><b>' + E(s.title) +
        "</b><small>" + st.done + "/" + st.total + " " + E("якунланган") + "</small></span>" + CHEV + "</button>";
      h += '<div class="toc-cards">';
      s.cards.forEach(function (c) {
        var cs = cardStat(c);
        h += '<button class="toc-c' + (cs.done ? " done" : cs.filled ? " part" : "") + '" data-go="#/c/' + c.n + '"><span class="dot">' + c.n + "</span><span>" + E(c.t) + "</span></button>";
      });
      h += "</div></div>";
    });
    return { title: "Бўлимлар", html: h };
  }

  /* ================= Чизиш ================= */

  var lastRoute = null;
  function render() {
    var r = route();
    var hash = location.hash || "#/";
    // Йўналиш: орқага / олдинга / таблар орасида
    if (lastRoute) scrollMem[lastRoute.hash] = window.scrollY;
    var isBack = stack.length > 1 && stack[stack.length - 2] === hash;
    if (isBack) stack.pop();
    else if (stack[stack.length - 1] !== hash) stack.push(hash);
    if (stack.length > 50) stack = stack.slice(-50);
    if (!lastRoute || r.name === "welcome" || lastRoute.r.name === "welcome") navDir = "fade";
    else if (isBack || depth(r) < depth(lastRoute.r)) navDir = "back";
    else if (depth(r) > depth(lastRoute.r) || (r.name === "c" && lastRoute.r.name === "c")) navDir = "fwd";
    else navDir = "fade";
    if (r.name === "c" && lastRoute && lastRoute.r.name === "c" && +r.arg < +lastRoute.r.arg) navDir = "back";

    var v;
    if (r.name === "welcome") v = viewWelcome();
    else if (r.name === "s") v = viewSection(r.arg);
    else if (r.name === "c") v = viewCard(r.arg);
    else if (r.name === "sections") v = viewSections();
    else if (r.name === "guide") v = viewGuide();
    else if (r.name === "intro") v = viewIntro();
    else if (r.name === "notes") v = viewNotes();
    else if (r.name === "search") v = viewSearch();
    else if (r.name === "settings") v = viewSettings();
    else v = viewHome();
    $app.innerHTML = '<div class="view ' + navDir + '">' + v.html + "</div>";
    setChrome(v.title, r);
    document.title = T(r.name === "home" ? "Иш дафтари" : v.title) + " — GlobalTrainings";
    $app.querySelectorAll("textarea").forEach(grow);
    window.scrollTo(0, isBack ? (scrollMem[hash] || 0) : 0);
    onScroll();
    bindView(r, v);
    lastRoute = { r: r, hash: hash };
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
    if (r.name === "settings") bindSettings();
    if (r.name === "home") document.getElementById("pdfHome").addEventListener("click", function () { window.GTPdf.save(); });
    if (r.name === "welcome") bindWelcome();
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
    document.getElementById("pdfCard").addEventListener("click", function () {
      if (!cardStat(c).filled) return toast("Бу картада ҳали жавоб йўқ");
      window.GTPdf.save({ card: c });
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
    document.getElementById("pdfAll").addEventListener("click", function () { window.GTPdf.save(); });
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
  document.getElementById("scriptBtn").addEventListener("click", function () {
    setScript(prefs.script === "lat" ? "cyr" : "lat");
  });
  document.getElementById("tabbar").addEventListener("click", function (e) {
    var b = e.target.closest("[data-tab]");
    if (!b) return;
    var t = b.getAttribute("data-tab");
    haptic();
    if (route().name === t) return window.scrollTo({ top: 0, behavior: "smooth" });
    go(t === "home" ? "#/" : "#/" + t, { replace: true });
  });
  // Клавиатура очиқлигида пастки менюни яшириш
  document.addEventListener("focusin", function (e) {
    if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) document.body.classList.add("kb");
  });
  document.addEventListener("focusout", function () {
    setTimeout(function () {
      var a = document.activeElement;
      if (!a || !/^(INPUT|TEXTAREA)$/.test(a.tagName)) document.body.classList.remove("kb");
    }, 80);
  });
  window.addEventListener("hashchange", function () { if (!/^#pdf=/.test(location.hash)) render(); });

  if (tg) {
    try {
      tg.ready();
      tg.expand();
      if (tg.isVersionAtLeast("7.7") && tg.disableVerticalSwipes) tg.disableVerticalSwipes();
      if (tg.BackButton) tg.BackButton.onClick(back);
      tg.onEvent("themeChanged", applyTheme);
      if (tg.isVersionAtLeast("7.0") && tg.SettingsButton) {
        tg.SettingsButton.show();
        tg.SettingsButton.onClick(function () { go("#/settings", { replace: true }); });
      }
      // Мобил Telegram'да тўлиқ экран режими
      var mobile = /^(android|android_x|ios)$/.test(tg.platform || "");
      if (tg.isVersionAtLeast("8.0") && tg.requestFullscreen && mobile && prefs.fs !== false && !tg.isFullscreen) {
        tg.requestFullscreen();
      }
      var syncFs = function () {
        document.documentElement.classList.toggle("tg-fullscreen", !!tg.isFullscreen);
        var sw = document.querySelector("#fsToggle .switch");
        if (sw) sw.classList.toggle("on", !!tg.isFullscreen);
      };
      tg.onEvent("fullscreenChanged", syncFs);
      tg.onEvent("fullscreenFailed", syncFs);
      syncFs();
    } catch (e) {}
  }
  applyTheme();
  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) mq.addEventListener("change", applyTheme);
  }

  // Telegram орқали «startapp=c12» параметри билан тўғридан-тўғри картани очиш
  if (START && !location.hash) {
    var m = /(?:^|_)c(\d+)$/.exec(START), s = /(?:^|_)s(\d+)$/.exec(START);
    if (m && CARD_BY_N[m[1]]) location.hash = "#/c/" + m[1];
    else if (s && secById(s[1])) location.hash = "#/s/" + s[1];
  }

  window.GTApp = {
    WB: WB, CARDS: CARDS, T: T, toLatin: toLatin, esc: esc, filled: filled, cardStat: cardStat,
    get: function (k) { return Store.get(k); }, all: function () { return Store.all(); },
    cardByN: function (n) { return CARD_BY_N[n]; },
    inTG: inTG, tg: tg, toast: toast, haptic: haptic, prefs: prefs,
    snapshot: function (d, script) { Store.snapshot(d); if (script) prefs.script = script; }
  };

  // Ташқи браузерда «#pdf=...» ҳаволаси: PDF яратиш ва юклаб олиш
  function pdfLanding(payload) {
    $top.hidden = true;
    document.body.classList.remove("has-tabs");
    var box = function (title, body) {
      $app.innerHTML = '<div class="welcome view fade"><div class="w-logo"><svg viewBox="0 0 64 64" width="64" height="64"><rect width="64" height="64" rx="18" fill="#254C3B"/><path d="M19 17h19a7 7 0 0 1 7 7v23H26a7 7 0 0 1-7-7z" fill="none" stroke="#C99A5B" stroke-width="4" stroke-linejoin="round"/><path d="M26 27h12M26 34h9" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg></div>' +
        '<div class="w-kicker">GLOBALTRAININGS</div><h1>' + title + "</h1>" + body + "</div>";
    };
    box("PDF…", '<div class="loading" style="height:auto;margin-top:24px"><div class="spinner"></div></div>');
    window.GTPdf.fromLink(payload).then(function (res) {
      box(E("PDF тайёр"), '<p class="w-alt">' + esc(res.name) + '</p><button class="btn primary" id="dl" style="width:100%;margin-top:28px;padding:16px;font-size:16px"><b>⬇️ ' + E("PDF'ни юклаб олиш") + "</b></button>" +
        '<p class="w-note">' + E("Файл телефонингизнинг «Юклаб олинганлар» (Downloads) папкасига сақланади. Кейин бу саҳифани ёпиб, Telegram'га қайтишингиз мумкин.") + "</p>");
      document.getElementById("dl").addEventListener("click", function () { window.GTPdf.download(res.blob, res.name); });
      try { window.GTPdf.download(res.blob, res.name); } catch (e) {}
    }).catch(function () {
      box(E("Ҳавола нотўғри"), '<p class="w-alt">' + E("PDF ҳаволаси бузилган ёки тўлиқ эмас. Илованинг ўзидан қайта уриниб кўринг.") + "</p>");
    });
  }

  function boot() {
    if (/^#pdf=/.test(location.hash)) return pdfLanding(location.hash.slice(5));
    // Ёзув танлови бошқа қурилмадан (Telegram булутидан) келган бўлса
    var cp = Store.get("prefs");
    if (!prefs.chosen && cp.script) { prefs.script = cp.script; prefs.chosen = true; savePrefs(); }
    render();
  }
  // pdf.js ва бошқа скриптлар юклангандан кейин бошлаш
  var domReady = new Promise(function (resolve) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", resolve); else resolve();
  });
  Promise.all([Store.load(), domReady]).then(boot, boot);

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }
})();
