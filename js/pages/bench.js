// 效能分析頁：比較全表掃描、自建索引、快取（冷／熱）的伺服器耗時
var Bench = {
  _built: false,
  COLORS: ['#5c6bc0', '#26a69a', '#ffb300', '#8d6e63'],

  // 彙總一組執行結果（avg 四捨五入為整數 ms；rowsRead 取第一筆）
  summarize: function (runs) {
    var sum = 0, min = Infinity, max = -Infinity;
    for (var i = 0; i < runs.length; i++) {
      var v = Number(runs[i].serverMs);
      sum += v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return {
      avg: runs.length ? Math.round(sum / runs.length) : 0,
      min: runs.length ? min : 0,
      max: runs.length ? max : 0,
      rowsRead: runs.length ? runs[0].rowsRead : 0,
      count: runs.length
    };
  },

  // 把 API 結果拆成四組：全表掃描、自建索引、快取（冷）、快取（熱）
  groups: function (result) {
    var cache = result.cache || [];
    return [
      { label: '全表掃描', runs: result.scan || [] },
      { label: '自建索引', runs: result.index || [] },
      { label: '快取（冷）', runs: cache.slice(0, 1) },
      { label: '快取（熱）', runs: cache.slice(1) }
    ];
  },

  // 單一比較句：count 為 0 的組別沒有量測資料，不產生句子
  clause: function (name, scanSum, sum) {
    if (!scanSum.count || !sum.count) return '';
    var r = Math.max(scanSum.avg, 1) / Math.max(sum.avg, 1);
    if (r >= 1) return name + '比全表掃描快 ' + r.toFixed(1) + ' 倍';
    return name + '比全表掃描慢 ' + (1 / r).toFixed(1) + ' 倍';
  },

  // 由四組彙總（依 groups 順序）產生一行結論；沒有資料的組別不列入
  conclusion: function (sums) {
    return [Bench.clause('自建索引', sums[0], sums[1]), Bench.clause('熱快取', sums[0], sums[3])]
      .filter(function (c) { return c; }).join('，');
  },

  el: function (tag, text, cls) {
    var e = document.createElement(tag);
    if (text) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  },

  build: function (root) {
    var mk = Bench.el;
    var form = mk('form', '', 'query-form');
    function field(label, ctl) {
      var l = mk('label', label);
      l.appendChild(ctl);
      form.appendChild(l);
      return ctl;
    }
    var stock = field('股票', mk('select'));
    var from = field('起日', mk('input'));
    from.type = 'date'; from.required = true;
    var to = field('迄日', mk('input'));
    to.type = 'date'; to.required = true;
    var times = field('次數', mk('input'));
    times.type = 'number'; times.min = 1; times.max = 10; times.value = 5; times.required = true;
    var btn = mk('button', '開始比較');
    btn.type = 'submit';
    form.appendChild(btn);
    var msg = mk('span', '', 'error');
    form.appendChild(msg);

    var now = new Date();
    to.value = QueryPage.dateStr(now);
    from.value = QueryPage.dateStr(QueryPage.monthsAgo(now, 12));

    var result = mk('div', '', 'bench-result');
    var note = mk('p', '伺服器耗時為 Apps Script 內實際量測，每次結果會有差異', 'bench-note');
    root.appendChild(form);
    root.appendChild(result);
    root.appendChild(note);

    Bench.els = { form: form, stock: stock, from: from, to: to, times: times, btn: btn, msg: msg, result: result };
    form.addEventListener('submit', function (ev) { ev.preventDefault(); Bench.run(); });
  },

  render: function (box, result) {
    var mk = Bench.el;
    box.textContent = '';
    var gs = Bench.groups(result);
    var sums = gs.map(function (g) { return Bench.summarize(g.runs); });
    var maxAvg = 0;
    sums.forEach(function (s) { if (s.avg > maxAvg) maxAvg = s.avg; });

    box.appendChild(mk('p', Bench.conclusion(sums), 'bench-conclusion'));

    var table = mk('table', '', 'data-table');
    var head = mk('tr');
    ['方法', '平均（ms）', '最小（ms）', '最大（ms）', '讀取列數', '次數'].forEach(function (h) { head.appendChild(mk('th', h)); });
    var thead = mk('thead');
    thead.appendChild(head);
    table.appendChild(thead);
    var tbody = mk('tbody');
    gs.forEach(function (g, i) {
      var s = sums[i];
      var tr = mk('tr');
      tr.appendChild(mk('td', g.label));
      [s.avg, s.min, s.max, s.rowsRead, s.count].forEach(function (v, k) {
        // 沒有量測資料時，前四欄顯示「—」，次數仍顯示 0
        tr.appendChild(mk('td', (s.count === 0 && k < 4) ? '—' : Fmt.int(v), 'num'));
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    var tableBox = mk('div', '', 'table-box');
    tableBox.appendChild(table);
    box.appendChild(tableBox);

    var bars = mk('div', '', 'bench-bars');
    gs.forEach(function (g, i) {
      var pct = maxAvg > 0 ? Math.max(sums[i].avg / maxAvg * 100, 2) : 2;
      var row = mk('div', '', 'bench-row');
      row.appendChild(mk('span', g.label, 'bench-label'));
      if (sums[i].count === 0) {
        row.appendChild(mk('span', '無資料（次數為 1 時沒有熱快取）', 'empty'));
        bars.appendChild(row);
        return;
      }
      var track = mk('div', '', 'bench-track');
      var bar = mk('div', '', 'bench-bar');
      bar.style.width = pct.toFixed(1) + '%';
      bar.style.background = Bench.COLORS[i];
      track.appendChild(bar);
      row.appendChild(track);
      row.appendChild(mk('span', Fmt.int(sums[i].avg) + ' ms', 'bench-value'));
      bars.appendChild(row);
    });
    box.appendChild(bars);
  },

  run: function () {
    var e = Bench.els;
    if (!e.stock.value) { e.msg.textContent = '請選擇股票'; return; }
    if (e.from.value > e.to.value) { e.msg.textContent = '起日不可晚於迄日'; return; }
    var n = parseInt(e.times.value, 10);
    if (!(n >= 1 && n <= 10)) { e.msg.textContent = '次數需介於 1 到 10'; return; }
    e.msg.textContent = '';
    e.result.textContent = '';
    e.btn.disabled = true;
    e.btn.textContent = '測試中…';
    return Api.call('benchmark', { stock_id: e.stock.value, from: e.from.value, to: e.to.value, times: n })
      .then(function (r) {
        Bench.render(e.result, r.data);
        App.showPerf(null, r.roundTripMs);
      }).catch(function (err) {
        e.msg.textContent = (err && err.message) || '測試失敗';
        App.showError(err);
      }).then(function () {
        e.btn.disabled = false;
        e.btn.textContent = '開始比較';
      });
  },

  onShow: function () {
    if (!Bench._built) {
      Bench._built = true;
      Bench.build(document.getElementById('tab-bench'));
    }
    var sel = Bench.els.stock;
    if (sel.options.length > 0) return;
    QueryPage.getStocks().then(function (list) {
      if (sel.options.length > 0) return;
      list.forEach(function (s) {
        var o = document.createElement('option');
        o.value = s.stock_id;
        o.textContent = s.stock_id + ' ' + s.stock_name;
        sel.appendChild(o);
      });
      sel.value = '2330';
    }).catch(function (err) {
      Bench.els.msg.textContent = (err && err.message) || '無法載入股票清單';
      App.showError(err);
    });
  }
};
if (typeof App !== 'undefined') App.registerPage('bench', Bench);
if (typeof module !== 'undefined') module.exports = Bench;
