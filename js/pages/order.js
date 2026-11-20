// 模擬下單頁：市價單，以最新收盤價成交
var OrderPage = {
  _built: false,
  _quotes: {},      // 每檔股票的報價快取（頁面生命週期內）
  _stockMap: {},    // stock_id → stock_name
  _pending: false,
  _quoteSeq: 0,     // 避免舊的回應覆蓋新的選擇
  _positions: null, // 最近一次 positions 回應

  errorText: function (code) {
    switch (code) {
      case 'INSUFFICIENT_CASH': return '現金不足';
      case 'INSUFFICIENT_SHARES': return '持股不足';
      case 'BAD_REQUEST': return '輸入有誤，請檢查數量';
      default: return '系統錯誤，請稍後再試';
    }
  },

  el: function (tag, text, cls) {
    var e = document.createElement(tag);
    if (text) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  },

  label: function (id) {
    return id + (OrderPage._stockMap[id] ? ' ' + OrderPage._stockMap[id] : '');
  },

  build: function (root) {
    var mk = OrderPage.el;
    var form = mk('form', '', 'query-form order-form');
    function field(label, ctl) {
      var l = mk('label', label);
      l.appendChild(ctl);
      form.appendChild(l);
      return ctl;
    }
    var stock = field('股票', mk('select'));
    var side = mk('div', '', 'side-toggle');
    [['BUY', '買進'], ['SELL', '賣出']].forEach(function (p, i) {
      var l = mk('label', '', 'side-opt');
      var r = mk('input');
      r.type = 'radio'; r.name = 'order-side'; r.value = p[0];
      if (i === 0) r.checked = true;
      l.appendChild(r);
      l.appendChild(document.createTextNode(p[1]));
      side.appendChild(l);
    });
    var sideWrap = mk('div', '', 'side-wrap');
    sideWrap.appendChild(mk('span', '買賣'));
    sideWrap.appendChild(side);
    form.appendChild(sideWrap);
    var qty = field('數量（股）', mk('input'));
    qty.type = 'number'; qty.min = '1'; qty.step = '1'; qty.value = '10'; qty.required = true;
    var btn = mk('button', '送出委託');
    btn.type = 'submit';
    form.appendChild(btn);

    var info = mk('div', '', 'order-info');
    var msg = mk('p', '', 'error order-msg');
    msg.setAttribute('role', 'status');
    var title = mk('h3', '委託紀錄');
    var tableBox = mk('div', '', 'table-box');
    [form, info, msg, title, tableBox].forEach(function (n) { root.appendChild(n); });

    OrderPage.els = { form: form, stock: stock, side: side, qty: qty, btn: btn, info: info, msg: msg, table: tableBox };
    stock.addEventListener('change', OrderPage.refreshInfo);
    qty.addEventListener('input', OrderPage.refreshInfo);
    form.addEventListener('submit', function (ev) { ev.preventDefault(); OrderPage.submit(); });
  },

  getSide: function () {
    var r = OrderPage.els.side.querySelector('input:checked');
    return r ? r.value : 'BUY';
  },

  // 取得報價（每檔快取）
  getQuote: function (id) {
    if (OrderPage._quotes[id]) return Promise.resolve(OrderPage._quotes[id]);
    return Api.call('quote', { stock_id: id }).then(function (r) {
      OrderPage._quotes[id] = r.data;
      return r.data;
    });
  },

  // 重新載入現金與持股
  loadPositions: function () {
    return Api.call('positions').then(function (r) {
      OrderPage._positions = r.data;
      return r.data;
    });
  },

  // 更新資訊區：最新收盤、預估金額、現金、目前持股
  // 失敗時 reject，由呼叫端決定怎麼顯示
  fetchInfo: function () {
    var e = OrderPage.els;
    var id = e.stock.value;
    var seq = ++OrderPage._quoteSeq;
    if (!id) return Promise.resolve();
    var posP = OrderPage._positions ? Promise.resolve(OrderPage._positions) : OrderPage.loadPositions();
    return Promise.all([OrderPage.getQuote(id), posP]).then(function (res) {
      if (seq !== OrderPage._quoteSeq) return;
      OrderPage.renderInfo(res[0], res[1]);
    }).catch(function (err) {
      if (seq !== OrderPage._quoteSeq) return;
      throw err;
    });
  },

  refreshInfo: function () {
    var e = OrderPage.els;
    return OrderPage.fetchInfo().catch(function (err) {
      e.info.textContent = '';
      e.msg.className = 'error order-msg';
      e.msg.textContent = OrderPage.errorText(err && err.code);
      App.showError(err);
    });
  },

  renderInfo: function (quote, pos) {
    var mk = OrderPage.el;
    var e = OrderPage.els;
    var q = parseInt(e.qty.value, 10);
    var est = (q > 0) ? Fmt.num(Fmt.round2(q * quote.close)) : '-';
    var held = 0;
    pos.holdings.forEach(function (h) { if (h.stock_id === quote.stock_id) held = h.quantity; });
    e.info.textContent = '';
    [
      ['最新收盤價（' + quote.date + '）', Fmt.num(quote.close)],
      ['預估金額', est],
      ['目前現金', Fmt.num(pos.cash_balance)],
      ['該股目前持股', Fmt.int(held) + ' 股']
    ].forEach(function (p) {
      var c = mk('div', '', 'card');
      c.appendChild(mk('div', p[0], 'card-label'));
      c.appendChild(mk('div', p[1], 'card-value'));
      e.info.appendChild(c);
    });
  },

  renderOrders: function (orders) {
    var mk = OrderPage.el;
    var box = OrderPage.els.table;
    box.textContent = '';
    if (orders.length === 0) { box.appendChild(mk('p', '尚無委託紀錄', 'empty')); return; }
    var table = mk('table', '', 'data-table');
    var head = mk('tr');
    ['時間', '股票', '買賣', '數量', '價格', '金額'].forEach(function (h) { head.appendChild(mk('th', h)); });
    var thead = mk('thead');
    thead.appendChild(head);
    table.appendChild(thead);
    var tbody = mk('tbody');
    orders.forEach(function (o) {
      var tr = mk('tr');
      tr.appendChild(mk('td', o.order_time));
      tr.appendChild(mk('td', OrderPage.label(o.stock_id)));
      tr.appendChild(mk('td', o.side === 'BUY' ? '買進' : '賣出', o.side === 'BUY' ? 'up' : 'down'));
      tr.appendChild(mk('td', Fmt.int(o.quantity), 'num'));
      tr.appendChild(mk('td', Fmt.num(o.price), 'num'));
      tr.appendChild(mk('td', Fmt.num(Fmt.round2(o.quantity * o.price)), 'num'));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    box.appendChild(table);
  },

  loadOrders: function () {
    return Api.call('orders').then(function (r) { OrderPage.renderOrders(r.data); });
  },

  submit: function () {
    var e = OrderPage.els;
    if (OrderPage._pending) return;
    var id = e.stock.value;
    var q = Number(e.qty.value);
    var side = OrderPage.getSide();
    e.msg.className = 'error order-msg';
    if (!id || !(q >= 1) || Math.floor(q) !== q) { e.msg.textContent = OrderPage.errorText('BAD_REQUEST'); return; }
    e.msg.textContent = '';
    OrderPage._pending = true;
    e.btn.disabled = true;
    e.btn.textContent = '送出中…';
    return Api.call('placeOrder', { stock_id: id, side: side, quantity: q })
      .then(function (r) {
        var o = r.data.order;
        e.msg.className = 'order-msg success';
        e.msg.textContent = '成交：' + (o.side === 'BUY' ? '買進' : '賣出') + ' ' + OrderPage.label(o.stock_id) +
          ' ' + Fmt.int(o.quantity) + ' 股 @ ' + Fmt.num(o.price);
        App.showPerf(null);
        OrderPage._positions = null;
        // 成交訊息已顯示；更新畫面失敗時只附註，不覆蓋成交訊息
        return Promise.all([OrderPage.fetchInfo(), OrderPage.loadOrders()]).catch(function (err2) {
          e.msg.textContent += '（畫面更新失敗，請重新整理）';
          App.showError(err2);
        });
      }, function (err) {
        e.msg.className = 'error order-msg';
        e.msg.textContent = OrderPage.errorText(err && err.code);
        App.showError(err);
      }).then(function () {
        OrderPage._pending = false;
        e.btn.disabled = false;
        e.btn.textContent = '送出委託';
      });
  },

  // 清除上一位使用者的資料（登出或切換帳號時呼叫；報價快取與使用者無關，保留）
  clearUser: function () {
    OrderPage._positions = null;
    OrderPage._quoteSeq++;
    var e = OrderPage.els;
    if (!e) return;
    e.info.textContent = '';
    e.msg.textContent = '';
    e.table.textContent = '';
  },

  onShow: function () {
    if (!OrderPage._built) {
      OrderPage._built = true;
      OrderPage.build(document.getElementById('tab-order'));
    }
    var e = OrderPage.els;
    OrderPage.clearUser(); // 每次進入頁面都清空並重取現金、持股與委託
    var ready = Promise.resolve();
    if (e.stock.options.length === 0) {
      ready = QueryPage.getStocks().then(function (list) {
        if (e.stock.options.length > 0) return;
        list.forEach(function (s) {
          OrderPage._stockMap[s.stock_id] = s.stock_name;
          var o = document.createElement('option');
          o.value = s.stock_id;
          o.textContent = s.stock_id + ' ' + s.stock_name;
          e.stock.appendChild(o);
        });
      });
    }
    return ready.then(function () {
      return Promise.all([OrderPage.refreshInfo(), OrderPage.loadOrders()]);
    }).catch(function (err) {
      e.msg.className = 'error order-msg';
      e.msg.textContent = OrderPage.errorText(err && err.code);
      App.showError(err);
    });
  }
};
if (typeof App !== 'undefined') App.registerPage('order', OrderPage);
if (typeof module !== 'undefined') module.exports = OrderPage;
