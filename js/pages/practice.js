// 交易練習頁（盲測）：大廳、進行中、回顧三種畫面
// 伺服器只回傳縮放後的價格與「前 N 天／第 N 天」序號，結束後才揭曉股票與日期
var Practice = {
  CONTEXT_DAYS: 60,
  // 回顧表欄位：遊戲中用的是換算價（開局前一天收盤 = 100），旁邊並列真實價格
  REVIEW_COLUMNS: ['天數', '日期', '動作與成交（換算價）', '換算開盤', '換算收盤', '真實開盤', '真實收盤', '當天漲跌', '理由'],
  _times: null,     // 序號位置 → 假日期
  _game: null,      // 進行中的局
  _charts: [],      // 目前畫面上的圖表
  _busy: false,
  root: null,

  // ---- 純函式（Node 測試） ----

  barLabel: function (n) {
    return n < 0 ? '前 ' + (-n) + ' 天' : '第 ' + n + ' 天';
  },

  // 序號 → 假日期：從 2000-01-03（星期一）起算的連續平日，只是給圖表排順序用
  fakeTime: function (n) {
    if (!Practice._times) {
      var out = [];
      var d = new Date(Date.UTC(2000, 0, 3));
      while (out.length < 100) {
        var w = d.getUTCDay();
        if (w !== 0 && w !== 6) out.push(d.toISOString().slice(0, 10));
        d.setUTCDate(d.getUTCDate() + 1);
      }
      Practice._times = out;
    }
    return Practice._times[n < 0 ? n + Practice.CONTEXT_DAYS : n + Practice.CONTEXT_DAYS - 1];
  },

  timeToN: function (t) {
    Practice.fakeTime(1);
    var i = Practice._times.indexOf(t);
    if (i < 0) return null;
    return i < Practice.CONTEXT_DAYS ? i - Practice.CONTEXT_DAYS : i - Practice.CONTEXT_DAYS + 1;
  },

  toRows: function (bars) {
    return bars.map(function (b) {
      return { date: Practice.fakeTime(b.n), open: b.open, high: b.high, low: b.low, close: b.close, volume: b.vol };
    });
  },

  actionLabel: function (a) {
    return { BUY: '買進', SELL: '賣出', HOLD: '不動作' }[a] || String(a);
  },

  fillText: function (s) {
    if (s.action === 'HOLD') return '不動作';
    var label = Practice.actionLabel(s.action);
    if (s.qty_filled === 0) return label + '未成交（現金不足）';
    var price = ' @ ' + Fmt.num(s.fill_price);
    if (s.qty_filled < s.qty_requested) {
      return label + ' ' + Fmt.int(s.qty_filled) + '／' + Fmt.int(s.qty_requested) + ' 股' + price + '（現金不足，部分成交）';
    }
    return label + ' ' + Fmt.int(s.qty_filled) + ' 股' + price;
  },

  // 結果頁的統計卡片
  statCards: function (s) {
    var pct = function (x) { return { value: Fmt.pct(x), cls: Fmt.signClass(x) }; };
    var card = function (label, o) { return { label: label, value: o.value, cls: o.cls }; };
    return [
      card('總報酬率', pct(s.total_return)),
      card('買進持有', pct(s.bh_return)),
      card('超額報酬', pct(s.excess_return)),
      card('交易次數', { value: String(s.trades), cls: '' }),
      card('勝率', { value: s.win_rate === null ? '—' : (s.win_rate * 100).toFixed(1) + '%（' + s.sells + ' 次賣出）', cls: '' }),
      card('最大回撤', { value: s.max_drawdown > 0 ? '-' + (s.max_drawdown * 100).toFixed(2) + '%' : '0.00%', cls: s.max_drawdown > 0 ? 'down' : '' }),
      card('未實現損益', { value: Fmt.num(s.unrealized_pnl), cls: Fmt.signClass(s.unrealized_pnl) })
    ];
  },

  // 真實 K 線上的買賣點
  markers: function (steps) {
    return steps.filter(function (s) {
      return s.action !== 'HOLD' && s.qty_filled > 0;
    }).map(function (s) {
      var buy = s.action === 'BUY';
      return {
        time: s.trade_date,
        position: buy ? 'belowBar' : 'aboveBar',
        color: buy ? '#e53935' : '#43a047',
        shape: buy ? 'arrowUp' : 'arrowDown',
        text: buy ? '買' : '賣'
      };
    });
  },

  // ---- 畫面 ----

  el: function (tag, text, cls) {
    var e = document.createElement(tag);
    if (text) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  },

  card: function (label, value, cls) {
    var mk = Practice.el;
    var c = mk('div', '', 'card');
    c.appendChild(mk('div', label, 'card-label'));
    c.appendChild(mk('div', value, 'card-value' + (cls ? ' ' + cls : '')));
    return c;
  },

  clearCharts: function () {
    Practice._charts.forEach(function (c) { if (c) c.destroy(); });
    Practice._charts = [];
  },

  // 換畫面：清掉舊內容，保留標題
  reset: function () {
    Practice.clearCharts();
    var root = Practice.root;
    while (root.childNodes.length > 1) root.removeChild(root.lastChild);
    return root;
  },

  clearUser: function () {
    if (typeof Sprite !== 'undefined') Sprite.hide();
    Practice._game = null;
    Practice._busy = false;
    if (Practice.root) Practice.reset();
  },

  onShow: function () {
    if (!Practice.root) Practice.root = document.getElementById('tab-practice');
    Practice.reset();
    var root = Practice.root;
    var wait = Practice.el('p', '載入中…', 'empty');
    root.appendChild(wait);
    return Api.call('practiceCurrent').then(function (r) {
      App.showPerf(null, r.roundTripMs);
      if (r.data) Practice.showGame(r.data); else Practice.showLobby();
    }).catch(function (err) {
      wait.className = 'error';
      wait.textContent = (err && err.message) || '無法載入交易練習';
      App.showError(err);
    });
  },

  showLobby: function () {
    var mk = Practice.el;
    var root = Practice.reset();
    if (typeof Sprite !== 'undefined') Sprite.hide();
    Practice._game = null;
    var rules = mk('ul', '', 'practice-rules');
    [
      '系統隨機抽一檔股票和一段期間，先不告訴你是哪一檔、哪幾天；價格換算成「開局前一天收盤 = 100」，成交量顯示為平均量的幾倍。',
      '開局先看前 60 個交易日的 K 線，接著一天一天決定買進、賣出或不動作，並寫下理由。',
      '送出後以當天開盤價成交，才揭曉當天的 K 棒；起始資金 1,000,000，不能放空，可買零股。',
      '20 天後揭曉答案，看報酬率、與買進持有的比較，並逐日回顧你的理由。',
      '價格未還原除權息，除息日可能出現跳空，請自行判斷。'
    ].forEach(function (t) { rules.appendChild(mk('li', t)); });
    var btn = mk('button', '開始新的一局');
    btn.type = 'button';
    var msg = mk('p', '', 'error');
    var history = mk('div', '', 'practice-history');
    [rules, btn, msg, history].forEach(function (n) { root.appendChild(n); });
    btn.addEventListener('click', function () {
      btn.disabled = true;
      msg.textContent = '';
      Api.call('practiceStart').then(function (r) {
        App.showPerf(null, r.roundTripMs);
        Practice.showGame(r.data);
      }).catch(function (err) {
        btn.disabled = false;
        if (err && err.code === 'GAME_ACTIVE') { Practice.onShow(); return; }
        msg.textContent = (err && err.message) || '無法開始新的一局';
        App.showError(err);
      });
    });
    if (Practice.loadHistory) Practice.loadHistory(history);
  },

  showGame: function (game) {
    var mk = Practice.el;
    var root = Practice.reset();
    Practice._game = game;
    var cards = mk('div', '', 'cards');
    var indBar = mk('div', '', 'ind-bar');
    var chart = mk('div', '', 'chart-box with-sub');
    var subChart = mk('div', '', 'chart-box chart-sub');
    var result = mk('p', '', 'practice-result');

    var form = mk('form', '', 'practice-form');
    var sideWrap = mk('div', '', 'side-toggle');
    [['BUY', '買進'], ['SELL', '賣出'], ['HOLD', '不動作']].forEach(function (p) {
      var l = mk('label', '', 'side-opt');
      var r = mk('input');
      r.type = 'radio'; r.name = 'practice-action'; r.value = p[0];
      if (p[0] === 'HOLD') r.checked = true;
      l.appendChild(r);
      l.appendChild(document.createTextNode(p[1]));
      sideWrap.appendChild(l);
    });
    var qtyLabel = mk('label', '股數');
    var qty = mk('input');
    qty.type = 'number'; qty.min = '1'; qty.step = '1'; qty.value = '1000';
    qtyLabel.appendChild(qty);
    var allLabel = mk('label', '', 'side-opt');
    var all = mk('input');
    all.type = 'checkbox';
    allLabel.appendChild(all);
    allLabel.appendChild(document.createTextNode('全部（買進用全部現金／賣出全部持股）'));
    var row1 = mk('div', '', 'practice-row');
    [sideWrap, qtyLabel, allLabel].forEach(function (n) { row1.appendChild(n); });
    var reasonLabel = mk('label', '理由（必填，送出後不能修改）', 'practice-reason');
    var reason = mk('textarea');
    reason.maxLength = 500; reason.rows = 3; reason.required = true;
    reason.placeholder = '例如：連三天量縮整理，等突破再進場';
    reasonLabel.appendChild(reason);
    var btn = mk('button', '');
    btn.type = 'submit';
    var msg = mk('p', '', 'error');
    msg.setAttribute('role', 'status');
    [row1, reasonLabel, btn, msg].forEach(function (n) { form.appendChild(n); });

    var listTitle = mk('h3', '已揭曉');
    var list = mk('div', '', 'table-box');
    var quit = mk('button', '放棄這局', 'secondary');
    quit.type = 'button';
    [cards, indBar, chart, subChart, result, form, listTitle, list, quit].forEach(function (n) { root.appendChild(n); });

    Practice.els = { cards: cards, indBar: indBar, chart: chart, subChart: subChart, result: result, form: form, side: sideWrap, qty: qty, all: all,
      reason: reason, btn: btn, msg: msg, list: list, quit: quit };
    var sync = function () {
      var a = Practice.getAction();
      qty.disabled = a === 'HOLD' || all.checked;
      all.disabled = a === 'HOLD';
    };
    sideWrap.addEventListener('change', sync);
    all.addEventListener('change', sync);
    sync();
    form.addEventListener('submit', function (ev) { ev.preventDefault(); Practice.submit(); });
    quit.addEventListener('click', Practice.abandon);
    Practice.renderGame();
  },

  getAction: function () {
    var r = Practice.els.side.querySelector('input:checked');
    return r ? r.value : 'HOLD';
  },

  renderGame: function () {
    var mk = Practice.el;
    var g = Practice._game;
    var e = Practice.els;
    var next = g.days_done + 1;
    e.cards.textContent = '';
    e.cards.appendChild(Practice.card('進度', '第 ' + next + '／' + g.total_days + ' 天'));
    e.cards.appendChild(Practice.card('現金', Fmt.num(g.cash)));
    e.cards.appendChild(Practice.card('持股', Fmt.int(g.shares) + ' 股'));
    e.cards.appendChild(Practice.card('總資產', Fmt.num(g.equity), Fmt.signClass(g.equity - 1000000)));
    e.btn.textContent = '送出，揭曉第 ' + next + ' 天';
    Practice.clearCharts();
    var timeLabel = function (t) { var n = Practice.timeToN(t); return n === null ? '' : Practice.barLabel(n); };
    var rows = Practice.toRows(g.bars);
    var handle = PriceChart.create(e.chart, rows, { timeLabel: timeLabel });
    Practice._charts.push(handle);
    var note = g.days_done === 0 ? '依前導資料最後一天判斷，只用畫面上看得到的資料。'
      : '依第 ' + g.days_done + ' 天收盤後的畫面判斷，只用已揭曉的資料。';
    var panel = IndicatorPanel.attach(e.indBar, e.subChart, rows, handle, {
      timeLabel: timeLabel,
      onChange: function (s) { Sprite.update(rows, s, note); }
    });
    Practice._charts.push(panel);
    Sprite.mount(Practice.root);
    Sprite.update(rows, panel.state, note);
    e.list.textContent = '';
    if (g.steps.length === 0) { e.list.appendChild(mk('p', '還沒有揭曉任何一天', 'empty')); return; }
    var byDay = {};
    g.bars.forEach(function (b) { byDay[b.n] = b; });
    var table = mk('table', '', 'data-table');
    var head = mk('tr');
    ['天數', '開盤', '收盤', '動作與成交', '收盤後總資產', '理由'].forEach(function (h) { head.appendChild(mk('th', h)); });
    var thead = mk('thead');
    thead.appendChild(head);
    table.appendChild(thead);
    var tbody = mk('tbody');
    g.steps.slice().reverse().forEach(function (s) {
      var b = byDay[s.day] || {};
      var tr = mk('tr');
      tr.appendChild(mk('td', Practice.barLabel(s.day)));
      tr.appendChild(mk('td', Fmt.num(b.open), 'num'));
      tr.appendChild(mk('td', Fmt.num(b.close), 'num ' + Fmt.signClass(b.close - b.open)));
      tr.appendChild(mk('td', Practice.fillText(s), s.action === 'BUY' ? 'up' : (s.action === 'SELL' ? 'down' : '')));
      tr.appendChild(mk('td', Fmt.num(s.equity_after), 'num'));
      tr.appendChild(mk('td', s.reason, 'practice-reason-cell'));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    e.list.appendChild(table);
  },

  submit: function () {
    if (Practice._busy) return;
    var e = Practice.els;
    var g = Practice._game;
    var action = Practice.getAction();
    var reason = e.reason.value.trim();
    e.msg.textContent = '';
    if (!reason) { e.msg.textContent = '請先寫下這麼做的理由'; e.reason.focus(); return; }
    var params = { game_id: g.game_id, day: g.days_done + 1, action: action, reason: reason, all: false };
    if (action !== 'HOLD') {
      params.all = e.all.checked;
      if (!params.all) params.quantity = parseInt(e.qty.value, 10);
    }
    Practice._busy = true;
    e.btn.disabled = true;
    Api.call('practiceStep', params).then(function (r) {
      App.showPerf(null, r.roundTripMs);
      var d = r.data;
      g.bars.push(d.bar);
      g.steps.push(d.step);
      g.days_done = d.step.day;
      g.cash = d.cash; g.shares = d.shares; g.avg_cost = d.avg_cost; g.equity = d.equity;
      e.reason.value = '';
      if (d.finished) { Practice.showReview(d.review); return; }
      e.result.textContent = Practice.barLabel(d.bar.n) + '：開 ' + Fmt.num(d.bar.open) + '、高 ' + Fmt.num(d.bar.high) +
        '、低 ' + Fmt.num(d.bar.low) + '、收 ' + Fmt.num(d.bar.close) + '｜' + Practice.fillText(d.step);
      Practice.renderGame();
    }).catch(function (err) {
      if (err && err.code === 'CONFLICT') { Practice.onShow(); return; }
      e.msg.textContent = (err && err.message) || '送出失敗，請再試一次';
      App.showError(err);
    }).then(function () {
      Practice._busy = false;
      if (Practice.els && Practice.els.btn) Practice.els.btn.disabled = false;
    });
  },

  abandon: function () {
    var g = Practice._game;
    if (!g || Practice._busy) return;
    if (!window.confirm('確定要放棄這局嗎？會直接揭曉答案，之後不能再繼續。')) return;
    Practice._busy = true;
    Api.call('practiceAbandon', { game_id: g.game_id }).then(function (r) {
      App.showPerf(null, r.roundTripMs);
      Practice.showReview(r.data);
    }).catch(function (err) {
      Practice.els.msg.textContent = (err && err.message) || '放棄失敗，請再試一次';
      App.showError(err);
    }).then(function () { Practice._busy = false; });
  },

  // 大廳的歷史列表
  loadHistory: function (box) {
    var mk = Practice.el;
    box.textContent = '';
    box.appendChild(mk('p', '載入過去的練習…', 'empty'));
    return Api.call('practiceList').then(function (r) {
      box.textContent = '';
      box.appendChild(mk('h3', '過去的練習（點一列看回顧）'));
      if (r.data.length === 0) { box.appendChild(mk('p', '還沒有完成的練習', 'empty')); return; }
      var table = mk('table', '', 'data-table pick-table');
      var head = mk('tr');
      ['開始日期', '股票', '天數', '報酬率', '狀態'].forEach(function (h) { head.appendChild(mk('th', h)); });
      var thead = mk('thead');
      thead.appendChild(head);
      table.appendChild(thead);
      var tbody = mk('tbody');
      r.data.forEach(function (g) {
        var tr = mk('tr');
        tr.tabIndex = 0;
        tr.appendChild(mk('td', g.start_date));
        tr.appendChild(mk('td', g.stock_id + ' ' + g.stock_name));
        tr.appendChild(mk('td', g.days_done + '／20', 'num'));
        tr.appendChild(mk('td', Fmt.pct(g.total_return), 'num ' + Fmt.signClass(g.total_return)));
        tr.appendChild(mk('td', g.status === 'finished' ? '完成' : '已放棄'));
        var open = function () {
          Api.call('practiceReview', { game_id: g.game_id }).then(function (rr) {
            App.showPerf(null, rr.roundTripMs);
            Practice.showReview(rr.data);
          }).catch(App.showError);
        };
        tr.addEventListener('click', open);
        tr.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') open(); });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      box.appendChild(table);
    }).catch(function (err) {
      box.textContent = '';
      box.appendChild(mk('p', (err && err.message) || '無法載入過去的練習', 'error'));
      App.showError(err);
    });
  },

  // 結果／回顧畫面：揭曉答案、統計、資產曲線、真實 K 線、逐日回顧、整局檢討
  showReview: function (review) {
    var mk = Practice.el;
    var root = Practice.reset();
    Practice._game = null;
    var who = review.stock_id + ' ' + review.stock_name + (review.industry ? '（' + review.industry + '）' : '');
    var when = review.end_date ? review.start_date + ' ～ ' + review.end_date : '原本從 ' + review.start_date + ' 開始';
    root.appendChild(mk('p', '這是 ' + who + '，' + when, 'practice-reveal'));
    if (review.status === 'abandoned') {
      root.appendChild(mk('p', '已放棄，進行到第 ' + review.days_done + ' 天', 'empty'));
    }
    var cards = mk('div', '', 'cards');
    Practice.statCards(review.stats).forEach(function (c) { cards.appendChild(Practice.card(c.label, c.value, c.cls)); });
    root.appendChild(cards);

    var label = function (t) { var n = Practice.timeToN(t); return n === null ? '' : (n === -1 ? '開局' : Practice.barLabel(n)); };
    if (review.days_done > 0) {
      root.appendChild(mk('h3', '資產曲線'));
      var eqBox = mk('div', '', 'chart-box chart-short');
      root.appendChild(eqBox);
      var pts = function (arr) {
        return arr.map(function (v, i) { return { time: Practice.fakeTime(i === 0 ? -1 : i), value: v }; });
      };
      Practice._charts.push(LineChart.create(eqBox, [
        { name: '你的資產', color: '#1565c0', points: pts(review.stats.equity) },
        { name: '買進持有', color: '#9e9e9e', points: pts(review.stats.bh_equity) }
      ], { timeLabel: label }));
    }

    root.appendChild(mk('h3', '真實 K 線（紅箭頭買、綠箭頭賣）'));
    var kBar = mk('div', '', 'ind-bar');
    var kBox = mk('div', '', 'chart-box with-sub');
    var kSub = mk('div', '', 'chart-box chart-sub');
    [kBar, kBox, kSub].forEach(function (n) { root.appendChild(n); });
    var kHandle = PriceChart.create(kBox, review.real_bars, { markers: Practice.markers(review.steps) });
    Practice._charts.push(kHandle);
    var reviewNote = '回顧：依這局最後一天的真實 K 線判斷。';
    var kPanel = IndicatorPanel.attach(kBar, kSub, review.real_bars, kHandle, {
      onChange: function (s) { Sprite.update(review.real_bars, s, reviewNote); }
    });
    Practice._charts.push(kPanel);
    Sprite.mount(Practice.root);
    Sprite.update(review.real_bars, kPanel.state, reviewNote);
    root.appendChild(mk('p', '提醒：價格未還原除權息，除息日可能出現跳空，請自行判斷。', 'bench-note'));

    root.appendChild(mk('h3', '逐日回顧'));
    var tableBox = mk('div', '', 'table-box');
    if (review.steps.length === 0) {
      tableBox.appendChild(mk('p', '這局沒有任何決定', 'empty'));
    } else {
      var table = mk('table', '', 'data-table');
      var head = mk('tr');
      Practice.REVIEW_COLUMNS.forEach(function (h) { head.appendChild(mk('th', h)); });
      var thead = mk('thead');
      thead.appendChild(head);
      table.appendChild(thead);
      var tbody = mk('tbody');
      review.steps.forEach(function (s) {
        var tr = mk('tr');
        tr.appendChild(mk('td', Practice.barLabel(s.day)));
        tr.appendChild(mk('td', s.trade_date));
        tr.appendChild(mk('td', Practice.fillText(s), s.action === 'BUY' ? 'up' : (s.action === 'SELL' ? 'down' : '')));
        tr.appendChild(mk('td', Fmt.num(s.open), 'num'));
        tr.appendChild(mk('td', Fmt.num(s.close), 'num'));
        tr.appendChild(mk('td', Fmt.num(s.real_open), 'num'));
        tr.appendChild(mk('td', Fmt.num(s.real_close), 'num'));
        tr.appendChild(mk('td', Fmt.pct(s.change_pct), 'num ' + Fmt.signClass(s.change_pct)));
        tr.appendChild(mk('td', s.reason, 'practice-reason-cell'));
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      tableBox.appendChild(table);
    }
    root.appendChild(tableBox);

    root.appendChild(mk('h3', '整局檢討'));
    var form = mk('form', '', 'practice-form');
    var note = mk('textarea');
    note.maxLength = 2000; note.rows = 4;
    note.placeholder = '哪些理由事後看是對的？哪些是錯的？下次會怎麼做？';
    note.value = review.review_note || '';
    var save = mk('button', '儲存檢討');
    save.type = 'submit';
    var msg = mk('p', '', 'error');
    msg.setAttribute('role', 'status');
    [note, save, msg].forEach(function (n) { form.appendChild(n); });
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      save.disabled = true;
      msg.className = 'error';
      msg.textContent = '';
      Api.call('practiceNote', { game_id: review.game_id, note: note.value }).then(function (r) {
        App.showPerf(null, r.roundTripMs);
        note.value = r.data.review_note;
        msg.className = 'order-msg success';
        msg.textContent = '已儲存';
      }).catch(function (err) {
        msg.textContent = (err && err.message) || '儲存失敗';
        App.showError(err);
      }).then(function () { save.disabled = false; });
    });
    root.appendChild(form);

    var back = mk('button', '回大廳', 'secondary');
    back.type = 'button';
    back.addEventListener('click', Practice.showLobby);
    root.appendChild(back);
  }
};
if (typeof App !== 'undefined') App.registerPage('practice', Practice);
if (typeof module !== 'undefined') module.exports = Practice;
