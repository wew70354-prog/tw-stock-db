// 個股查詢頁：股票下拉、日期區間、方法，顯示 K 線圖與日成交表
var QueryPage = {
  _stocks: null,   // 股票清單的 Promise（登入後只呼叫一次）
  _built: false,

  // 共用股票清單（Task 10/11 也可呼叫）；失敗時清掉快取以便重試
  getStocks: function () {
    if (!QueryPage._stocks) {
      QueryPage._stocks = Api.call('stocks').then(function (r) { return r.data; }).catch(function (e) {
        QueryPage._stocks = null;
        throw e;
      });
    }
    return QueryPage._stocks;
  },

  // 依產業分組：檔數多的組在前（同數量照清單中首次出現的順序），組內依代號；沒有產業的（0050）歸「ETF」放最後
  groupStocks: function (list) {
    var groups = [], byLabel = {}, etf = null;
    list.forEach(function (s) {
      var label = s.industry ? String(s.industry) : 'ETF';
      var g = byLabel[label];
      if (!g) {
        g = byLabel[label] = { label: label, stocks: [] };
        if (label === 'ETF') etf = g; else groups.push(g);
      }
      g.stocks.push(s);
    });
    groups = groups.map(function (g, i) { return { g: g, i: i }; }).sort(function (a, b) {
      return b.g.stocks.length - a.g.stocks.length || a.i - b.i;
    }).map(function (x) { return x.g; });
    if (etf) groups.push(etf);
    groups.forEach(function (g) {
      g.stocks.sort(function (a, b) { return a.stock_id < b.stock_id ? -1 : a.stock_id > b.stock_id ? 1 : 0; });
    });
    return groups;
  },

  // 把股票清單填進 <select>，每個產業一個 <optgroup>（查詢、下單、效能比較三頁共用）
  fillStockSelect: function (sel, list) {
    QueryPage.groupStocks(list).forEach(function (g) {
      var og = document.createElement('optgroup');
      og.label = g.label + '（' + g.stocks.length + '）';
      g.stocks.forEach(function (s) {
        var o = document.createElement('option');
        o.value = s.stock_id;
        o.textContent = s.stock_id + ' ' + s.stock_name;
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
    // 分組後第一個選項不一定是清單第一檔；維持原本的預設（stocks 表第一檔，2330）
    if (list.length > 0) sel.value = list[0].stock_id;
  },

  pad: function (n) { return (n < 10 ? '0' : '') + n; },
  // 本地日期 YYYY-MM-DD
  dateStr: function (d) {
    return d.getFullYear() + '-' + QueryPage.pad(d.getMonth() + 1) + '-' + QueryPage.pad(d.getDate());
  },
  // 往前推 n 個月（日數超出時截到該月月底）
  monthsAgo: function (d, n) {
    var t = new Date(d.getFullYear(), d.getMonth() - n, 1);
    var last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    return new Date(t.getFullYear(), t.getMonth(), Math.min(d.getDate(), last));
  },

  // 由升冪價格列產生表格列（新到舊；change 為與前一日收盤差，首列為 null）
  buildRows: function (rows) {
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      out.push({
        date: r.date, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume,
        change: i === 0 ? null : Fmt.round2(r.close - rows[i - 1].close)
      });
    }
    return out.reverse();
  },

  el: function (tag, text, cls) {
    var e = document.createElement(tag);
    if (text) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  },

  build: function (root) {
    var mk = QueryPage.el;
    var form = mk('form', '', 'query-form');
    form.id = 'query-form';
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
    var method = field('方法', mk('select'));
    ['scan', 'index', 'cache'].forEach(function (m) {
      var o = mk('option', Fmt.methodLabel(m));
      o.value = m;
      method.appendChild(o);
    });
    method.value = 'index';
    var btn = mk('button', '查詢');
    btn.type = 'submit';
    form.appendChild(btn);
    var msg = mk('span', '', 'error');
    form.appendChild(msg);

    var now = new Date();
    to.value = QueryPage.dateStr(now);
    from.value = QueryPage.dateStr(QueryPage.monthsAgo(now, 3));

    var chart = mk('div', '', 'chart-box');
    var tableBox = mk('div', '', 'table-box');
    root.appendChild(form);
    root.appendChild(chart);
    root.appendChild(tableBox);

    QueryPage.els = { form: form, stock: stock, from: from, to: to, method: method, btn: btn, msg: msg, chart: chart, table: tableBox };
    form.addEventListener('submit', function (ev) { ev.preventDefault(); QueryPage.run(); });
  },

  renderTable: function (box, rows) {
    var mk = QueryPage.el;
    box.textContent = '';
    if (rows.length === 0) return;
    var table = mk('table', '', 'data-table');
    var head = mk('tr');
    ['日期', '開', '高', '低', '收', '漲跌', '成交量（股）'].forEach(function (h) { head.appendChild(mk('th', h)); });
    var thead = mk('thead');
    thead.appendChild(head);
    table.appendChild(thead);
    var tbody = mk('tbody');
    QueryPage.buildRows(rows).forEach(function (r) {
      var tr = mk('tr');
      tr.appendChild(mk('td', r.date));
      [r.open, r.high, r.low, r.close].forEach(function (v) { tr.appendChild(mk('td', Fmt.num(v), 'num')); });
      if (r.change === null) {
        tr.appendChild(mk('td', '-', 'num flat'));
      } else {
        tr.appendChild(mk('td', (r.change > 0 ? '+' : '') + Fmt.num(r.change), 'num ' + Fmt.signClass(r.change)));
      }
      tr.appendChild(mk('td', Fmt.int(r.volume), 'num'));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    box.appendChild(table);
  },

  run: function () {
    var e = QueryPage.els;
    if (!e.stock.value) { e.msg.textContent = '請選擇股票'; return; }
    if (e.from.value > e.to.value) { e.msg.textContent = '起日不可晚於迄日'; return; }
    e.msg.textContent = '';
    e.btn.disabled = true;
    e.btn.textContent = '查詢中…';
    return Api.call('prices', { stock_id: e.stock.value, from: e.from.value, to: e.to.value, method: e.method.value })
      .then(function (r) {
        PriceChart.render(e.chart, r.data);
        QueryPage.renderTable(e.table, r.data);
        App.showPerf(r.meta, r.roundTripMs);
      }).catch(function (err) {
        PriceChart.destroy();
        e.chart.textContent = '';
        e.table.textContent = '';
        e.msg.textContent = (err && err.message) || '查詢失敗';
        App.showError(err);
      }).then(function () {
        e.btn.disabled = false;
        e.btn.textContent = '查詢';
      });
  },

  onShow: function () {
    if (!QueryPage._built) {
      QueryPage._built = true;
      QueryPage.build(document.getElementById('tab-query'));
    }
    var sel = QueryPage.els.stock;
    if (sel.options.length > 0) return;
    QueryPage.getStocks().then(function (list) {
      if (sel.options.length > 0) return;
      QueryPage.fillStockSelect(sel, list);
    }).catch(function (err) {
      QueryPage.els.msg.textContent = (err && err.message) || '無法載入股票清單';
      App.showError(err);
    });
  }
};
if (typeof App !== 'undefined') App.registerPage('query', QueryPage);
if (typeof module !== 'undefined') module.exports = QueryPage;
