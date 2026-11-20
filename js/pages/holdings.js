// 我的持股頁：現金、持股市值、總資產、總損益與持股明細
var Holdings = {
  _built: false,

  // 計算每檔市值、損益、報酬率與總計（金額皆四捨五入到小數 2 位）
  compute: function (holdings, cash) {
    var r2 = Fmt.round2;
    var mv = 0, cost = 0;
    var rows = holdings.map(function (h) {
      var c = h.quantity * h.avg_cost;
      var marketValue = r2(h.quantity * h.close);
      var pnl = r2(marketValue - c);
      var row = {};
      Object.keys(h).forEach(function (k) { row[k] = h[k]; });
      row.marketValue = marketValue;
      row.pnl = pnl;
      row.pnlPct = c > 0 ? r2(pnl / c * 10000) / 10000 : 0;
      mv += marketValue;
      cost += c;
      return row;
    });
    var marketValue = r2(mv);
    return {
      rows: rows,
      totals: {
        cash: cash,
        marketValue: marketValue,
        totalAssets: r2(cash + marketValue),
        totalPnl: r2(marketValue - cost)
      }
    };
  },

  el: function (tag, text, cls) {
    var e = document.createElement(tag);
    if (text) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  },

  card: function (label, value, cls) {
    var mk = Holdings.el;
    var c = mk('div', '', 'card');
    c.appendChild(mk('div', label, 'card-label'));
    c.appendChild(mk('div', value, 'card-value' + (cls ? ' ' + cls : '')));
    return c;
  },

  render: function (data) {
    var mk = Holdings.el;
    var e = Holdings.els;
    var res = Holdings.compute(data.holdings, data.cash_balance);
    var t = res.totals;
    e.cards.textContent = '';
    e.cards.appendChild(Holdings.card('現金', Fmt.num(t.cash)));
    e.cards.appendChild(Holdings.card('持股市值', Fmt.num(t.marketValue)));
    e.cards.appendChild(Holdings.card('總資產', Fmt.num(t.totalAssets)));
    e.cards.appendChild(Holdings.card('總損益', (t.totalPnl > 0 ? '+' : '') + Fmt.num(t.totalPnl), Fmt.signClass(t.totalPnl)));

    e.table.textContent = '';
    if (res.rows.length === 0) {
      e.table.appendChild(mk('p', '目前沒有持股', 'empty'));
      return;
    }
    var table = mk('table', '', 'data-table');
    var head = mk('tr');
    ['股票', '數量', '平均成本', '最新收盤（日期）', '市值', '未實現損益', '報酬率'].forEach(function (h) { head.appendChild(mk('th', h)); });
    var thead = mk('thead');
    thead.appendChild(head);
    table.appendChild(thead);
    var tbody = mk('tbody');
    res.rows.forEach(function (r) {
      var tr = mk('tr');
      var sc = Fmt.signClass(r.pnl);
      tr.appendChild(mk('td', r.stock_id + ' ' + r.stock_name));
      tr.appendChild(mk('td', Fmt.int(r.quantity), 'num'));
      tr.appendChild(mk('td', Fmt.num(r.avg_cost), 'num'));
      tr.appendChild(mk('td', Fmt.num(r.close) + '（' + r.close_date + '）', 'num'));
      tr.appendChild(mk('td', Fmt.num(r.marketValue), 'num'));
      tr.appendChild(mk('td', (r.pnl > 0 ? '+' : '') + Fmt.num(r.pnl), 'num ' + sc));
      tr.appendChild(mk('td', Fmt.pct(r.pnlPct), 'num ' + sc));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    e.table.appendChild(table);
  },

  // 清除上一位使用者的資料
  clearUser: function () {
    if (!Holdings.els) return;
    Holdings.els.cards.textContent = '';
    Holdings.els.table.textContent = '';
  },

  onShow: function () {
    if (!Holdings._built) {
      Holdings._built = true;
      var root = document.getElementById('tab-holdings');
      var cards = Holdings.el('div', '', 'cards');
      var table = Holdings.el('div', '', 'table-box');
      root.appendChild(cards);
      root.appendChild(table);
      Holdings.els = { cards: cards, table: table };
    }
    Holdings.clearUser();
    return Api.call('positions').then(function (r) {
      Holdings.render(r.data);
      App.showPerf(null);
    }).catch(function (err) {
      Holdings.els.table.textContent = '';
      Holdings.els.table.appendChild(Holdings.el('p', (err && err.message) || '無法載入持股', 'error'));
      App.showError(err);
    });
  }
};
if (typeof App !== 'undefined') App.registerPage('holdings', Holdings);
if (typeof module !== 'undefined') module.exports = Holdings;
