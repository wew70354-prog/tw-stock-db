// 技術指標面板：開關列、在既有 K 線圖上疊線、K 線下方的副圖（KD／RSI／MACD，與主圖時間軸同步）
// 用法：IndicatorPanel.attach(開關列容器, 副圖容器, rows, PriceChart.create 的回傳值, {timeLabel})
var IndicatorPanel = {
  KEY: 'tsdb_indicators',
  DEFAULTS: { ma5: true, ma10: true, ma20: true, boll: false, vma: true, sub: 'kd' },
  SUBS: ['kd', 'rsi', 'macd'],
  UP: '#e53935',
  DOWN: '#43a047',
  OVERLAYS: [
    { key: 'ma5', label: 'MA5', color: '#f9a825' },
    { key: 'ma10', label: 'MA10', color: '#00897b' },
    { key: 'ma20', label: 'MA20', color: '#8e24aa' },
    { key: 'boll', label: '布林通道', color: '#90a4ae' },
    { key: 'vma', label: '均量 5 日', color: '#ff7043' }
  ],
  SUB_LABELS: { kd: 'KD', rsi: 'RSI', macd: 'MACD' },

  // ---- 純函式（Node 測試） ----

  loadState: function (storage) {
    var s = {};
    Object.keys(IndicatorPanel.DEFAULTS).forEach(function (k) { s[k] = IndicatorPanel.DEFAULTS[k]; });
    var saved = null;
    try { saved = storage ? JSON.parse(storage.getItem(IndicatorPanel.KEY)) : null; } catch (e) { saved = null; }
    if (!saved || typeof saved !== 'object') return s;
    Object.keys(s).forEach(function (k) {
      if (k === 'sub') { if (IndicatorPanel.SUBS.indexOf(saved.sub) >= 0) s.sub = saved.sub; }
      else if (typeof saved[k] === 'boolean') s[k] = saved[k];
    });
    return s;
  },

  saveState: function (storage, state) {
    try { storage.setItem(IndicatorPanel.KEY, JSON.stringify(state)); } catch (e) { /* 存不了就算了 */ }
  },

  // 數值陣列 → 圖表資料；null 的位置只放 time（whitespace），讓主圖與副圖的邏輯索引一致
  points_: function (rows, vals, color) {
    return rows.map(function (r, i) {
      var v = vals[i];
      if (v === null || v === undefined) return { time: r.date };
      var p = { time: r.date, value: v };
      if (color) p.color = color(v);
      return p;
    });
  },

  // 主圖要疊的線：[{id, color, scale:'right'|'volume', points}]
  overlaySeries: function (rows, state) {
    var P = IndicatorPanel, closes = rows.map(function (r) { return r.close; }), out = [];
    var add = function (id, color, scale, vals) { out.push({ id: id, color: color, scale: scale, points: P.points_(rows, vals) }); };
    if (state.ma5) add('ma5', '#f9a825', 'right', Ind.sma(closes, 5));
    if (state.ma10) add('ma10', '#00897b', 'right', Ind.sma(closes, 10));
    if (state.ma20) add('ma20', '#8e24aa', 'right', Ind.sma(closes, 20));
    if (state.boll) {
      var b = Ind.bollinger(closes, 20, 2);
      add('boll_upper', '#90a4ae', 'right', b.map(function (x) { return x && x.upper; }));
      add('boll_lower', '#90a4ae', 'right', b.map(function (x) { return x && x.lower; }));
    }
    if (state.vma) add('vma', '#ff7043', 'volume', Ind.sma(rows.map(function (r) { return r.volume; }), 5));
    return out;
  },

  // 副圖：{series: [{id, type:'line'|'histogram', color, title, points}], levels: [參考線價位]}
  subSeries: function (rows, sub) {
    var P = IndicatorPanel, closes = rows.map(function (r) { return r.close; });
    var line = function (id, title, color, vals) { return { id: id, type: 'line', title: title, color: color, points: P.points_(rows, vals) }; };
    if (sub === 'rsi') return { series: [line('rsi', 'RSI(14)', '#6a1b9a', Ind.rsi(closes, 14))], levels: [80, 20] };
    if (sub === 'macd') {
      var m = Ind.macd(closes, 12, 26, 9), pick = function (k) { return m.map(function (x) { return x && x[k]; }); };
      return {
        series: [
          { id: 'hist', type: 'histogram', title: '', color: P.UP,
            points: P.points_(rows, pick('hist'), function (v) { return v >= 0 ? P.UP : P.DOWN; }) },
          line('dif', 'DIF', '#1565c0', pick('dif')),
          line('signal', '訊號', '#ef6c00', pick('signal'))
        ],
        levels: []
      };
    }
    var kd = Ind.kd(rows, 9);
    return {
      series: [line('k', 'K', '#1565c0', kd.map(function (x) { return x && x.k; })),
        line('d', 'D', '#ef6c00', kd.map(function (x) { return x && x.d; }))],
      levels: [80, 20]
    };
  },

  // ---- DOM ----

  storage_: function () {
    try { return window.localStorage; } catch (e) { return null; }
  },

  attach: function (toolbarEl, subEl, rows, handle, opts) {
    opts = opts || {};
    var P = IndicatorPanel;
    toolbarEl.textContent = '';
    subEl.textContent = '';
    if (!handle || !handle.chart || !rows || rows.length === 0 || typeof LightweightCharts === 'undefined') {
      return { state: P.loadState(P.storage_()), destroy: function () {} };
    }
    var state = P.loadState(P.storage_());
    var main = handle.chart, overlays = [], sub = null, subSeries = [], stopWidth = function () {};

    // 主圖疊線：每次全部移除再依開關重加
    var drawOverlays = function () {
      overlays.forEach(function (s) { main.removeSeries(s); });
      overlays = P.overlaySeries(rows, state).map(function (o) {
        var s = main.addLineSeries({
          color: o.color, lineWidth: o.id.indexOf('boll') === 0 ? 1 : 2, priceScaleId: o.scale,
          lineStyle: o.id.indexOf('boll') === 0 ? 2 : 0, priceLineVisible: false, lastValueVisible: false,
          crosshairMarkerVisible: false
        });
        s.setData(o.points);
        return s;
      });
    };

    // 副圖：切換時把舊的 series 移除再加新的
    var drawSub = function () {
      subSeries.forEach(function (s) { sub.removeSeries(s); });
      var def = P.subSeries(rows, state.sub);
      subSeries = def.series.map(function (d) {
        var s = d.type === 'histogram'
          ? sub.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false })
          : sub.addLineSeries({ color: d.color, lineWidth: 2, title: d.title, priceLineVisible: false });
        s.setData(d.points);
        return s;
      });
      def.levels.forEach(function (lv) {
        subSeries[0].createPriceLine({ price: lv, color: lv > 50 ? '#ef9a9a' : '#a5d6a7', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' });
      });
      var r = main.timeScale().getVisibleLogicalRange();
      if (r) sub.timeScale().setVisibleLogicalRange(r);
    };

    var options = PriceChart.baseOptions_(subEl);
    // 副圖不能自己捲動縮放，只跟著主圖（雙向同步時，副圖建立當下的預設範圍會反過來把主圖擠到一邊）
    options.handleScroll = false;
    options.handleScale = false;
    if (opts.timeLabel) {
      var fmt = function (t) { return opts.timeLabel(PriceChart.timeStr(t)); };
      options.localization = { timeFormatter: fmt };
      options.timeScale.tickMarkFormatter = fmt;
    }
    sub = LightweightCharts.createChart(subEl, options);
    stopWidth = PriceChart.watchWidth_(subEl, sub);

    // 主圖的可見範圍 → 副圖
    var mainToSub = function (range) { if (range) sub.timeScale().setVisibleLogicalRange(range); };
    main.timeScale().subscribeVisibleLogicalRangeChange(mainToSub);

    // 開關列
    var mkBtn = function (text, on, color, onClick) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ind-tg' + (on ? ' on' : '');
      if (color) { var i = document.createElement('i'); i.style.background = color; b.appendChild(i); }
      b.appendChild(document.createTextNode(text));
      b.addEventListener('click', onClick);
      return b;
    };
    var label = function (t) { var s = document.createElement('span'); s.className = 'ind-lbl'; s.textContent = t; return s; };
    toolbarEl.appendChild(label('主圖'));
    P.OVERLAYS.forEach(function (o) {
      var b = mkBtn(o.label, state[o.key], o.color, function () {
        state[o.key] = !state[o.key];
        b.classList.toggle('on', state[o.key]);
        P.saveState(P.storage_(), state);
        drawOverlays();
        if (opts.onChange) opts.onChange(state);
      });
      toolbarEl.appendChild(b);
    });
    toolbarEl.appendChild(label('副圖'));
    var subBtns = P.SUBS.map(function (k) {
      return mkBtn(P.SUB_LABELS[k], state.sub === k, null, function () {
        state.sub = k;
        subBtns.forEach(function (x, j) { x.classList.toggle('on', P.SUBS[j] === k); });
        P.saveState(P.storage_(), state);
        drawSub();
        if (opts.onChange) opts.onChange(state);
      });
    });
    subBtns.forEach(function (b) { toolbarEl.appendChild(b); });

    drawOverlays();
    drawSub();
    return {
      state: state,
      destroy: function () {
        try { main.timeScale().unsubscribeVisibleLogicalRangeChange(mainToSub); } catch (e) { /* 主圖可能已先移除 */ }
        stopWidth();
        sub.remove();
        toolbarEl.textContent = '';
      }
    };
  }
};
if (typeof module !== 'undefined') module.exports = IndicatorPanel;
