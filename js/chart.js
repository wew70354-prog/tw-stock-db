// K 線圖封裝：TradingView Lightweight Charts 4.2.0（全域 LightweightCharts）
var PriceChart = {
  UP: '#e53935',
  DOWN: '#43a047',
  _handle: null,
  _chart: null,

  // 純函式：價格列 → 蠟燭與成交量資料（收 >= 開為紅，否則綠）
  toChartData: function (rows) {
    var candles = [], volumes = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      candles.push({ time: r.date, open: r.open, high: r.high, low: r.low, close: r.close });
      volumes.push({ time: r.date, value: r.volume, color: r.close >= r.open ? PriceChart.UP : PriceChart.DOWN });
    }
    return { candles: candles, volumes: volumes };
  },

  // 圖表回傳的時間（BusinessDay 物件、時間戳或字串）→ 'YYYY-MM-DD'
  timeStr: function (t) {
    if (typeof t === 'string') return t;
    if (typeof t === 'number') return new Date(t * 1000).toISOString().slice(0, 10);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return t.year + '-' + p(t.month) + '-' + p(t.day);
  },

  // 隨容器寬度調整；回傳停止監聽的函式
  watchWidth_: function (el, chart) {
    if (typeof ResizeObserver === 'undefined') return function () {};
    var ob = new ResizeObserver(function () { chart.applyOptions({ width: el.clientWidth }); });
    ob.observe(el);
    return function () { ob.disconnect(); };
  },

  baseOptions_: function (el) {
    return {
      width: el.clientWidth || 600,
      height: el.clientHeight || 380,
      layout: { background: { color: '#ffffff' }, textColor: '#333' },
      grid: { vertLines: { color: '#eee' }, horzLines: { color: '#eee' } },
      timeScale: { borderColor: '#ccc' }
    };
  },

  // 建立一張 K 線圖（可同時存在多張）；回傳 {chart, candle, destroy}，失敗回 null 並在容器顯示原因
  // opts.timeLabel('YYYY-MM-DD') → 軸與游標上顯示的文字；opts.markers → 買賣標記
  create: function (el, rows, opts) {
    opts = opts || {};
    el.textContent = '';
    if (!rows || rows.length === 0) { el.textContent = '此期間沒有交易資料'; return null; }
    if (typeof LightweightCharts === 'undefined') { el.textContent = '圖表元件載入失敗，請檢查網路'; return null; }
    var data = PriceChart.toChartData(rows);
    var options = PriceChart.baseOptions_(el);
    options.rightPriceScale = { scaleMargins: { top: 0.05, bottom: 0.28 } };
    if (opts.timeLabel) {
      var fmt = function (t) { return opts.timeLabel(PriceChart.timeStr(t)); };
      options.localization = { timeFormatter: fmt };
      options.timeScale.tickMarkFormatter = fmt;
    }
    var chart = LightweightCharts.createChart(el, options);
    var candle = chart.addCandlestickSeries({
      upColor: PriceChart.UP, downColor: PriceChart.DOWN,
      borderUpColor: PriceChart.UP, borderDownColor: PriceChart.DOWN,
      wickUpColor: PriceChart.UP, wickDownColor: PriceChart.DOWN
    });
    candle.setData(data.candles);
    if (opts.markers && opts.markers.length) candle.setMarkers(opts.markers);
    var vol = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'volume' });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    vol.setData(data.volumes);
    chart.timeScale().fitContent();
    var stop = PriceChart.watchWidth_(el, chart);
    return {
      chart: chart, candle: candle,
      destroy: function () { stop(); chart.remove(); }
    };
  },

  // 移除個股查詢頁的圖表
  destroy: function () {
    if (PriceChart._handle) { PriceChart._handle.destroy(); PriceChart._handle = null; }
    PriceChart._chart = null;
  },

  // 個股查詢頁用：同一時間只有一張
  render: function (el, rows) {
    PriceChart.destroy();
    PriceChart._handle = PriceChart.create(el, rows);
    PriceChart._chart = PriceChart._handle ? PriceChart._handle.chart : null;
  }
};
// 折線圖（交易練習的資產曲線）：lines = [{name, color, points: [{time, value}]}]
var LineChart = {
  create: function (el, lines, opts) {
    opts = opts || {};
    el.textContent = '';
    if (typeof LightweightCharts === 'undefined') { el.textContent = '圖表元件載入失敗，請檢查網路'; return null; }
    var options = PriceChart.baseOptions_(el);
    // 金額用千分位整數顯示
    options.localization = { priceFormatter: function (v) { return Math.round(v).toLocaleString('en-US'); } };
    if (opts.timeLabel) {
      var fmt = function (t) { return opts.timeLabel(PriceChart.timeStr(t)); };
      options.localization.timeFormatter = fmt;
      options.timeScale.tickMarkFormatter = fmt;
    }
    var chart = LightweightCharts.createChart(el, options);
    var legend = document.createElement('div');
    legend.className = 'chart-legend';
    lines.forEach(function (l) {
      chart.addLineSeries({ color: l.color, lineWidth: 2, title: l.name }).setData(l.points);
      var item = document.createElement('span');
      var dot = document.createElement('i');
      dot.style.background = l.color;
      item.appendChild(dot);
      item.appendChild(document.createTextNode(l.name));
      legend.appendChild(item);
    });
    el.style.position = 'relative';
    el.appendChild(legend);
    chart.timeScale().fitContent();
    var stop = PriceChart.watchWidth_(el, chart);
    return { chart: chart, destroy: function () { stop(); chart.remove(); } };
  }
};
if (typeof module !== 'undefined') module.exports = PriceChart;
