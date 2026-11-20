// K 線圖封裝：TradingView Lightweight Charts 4.2.0（全域 LightweightCharts）
var PriceChart = {
  UP: '#e53935',
  DOWN: '#43a047',
  _chart: null,
  _observer: null,

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

  // 移除舊圖表與尺寸監聽
  destroy: function () {
    if (PriceChart._observer) { PriceChart._observer.disconnect(); PriceChart._observer = null; }
    if (PriceChart._chart) { PriceChart._chart.remove(); PriceChart._chart = null; }
  },

  render: function (el, rows) {
    PriceChart.destroy();
    el.textContent = '';
    if (!rows || rows.length === 0) {
      el.textContent = '此期間沒有交易資料';
      return;
    }
    if (typeof LightweightCharts === 'undefined') {
      el.textContent = '圖表元件載入失敗，請檢查網路';
      return;
    }
    var data = PriceChart.toChartData(rows);
    var chart = LightweightCharts.createChart(el, {
      width: el.clientWidth || 600,
      height: el.clientHeight || 380,
      layout: { background: { color: '#ffffff' }, textColor: '#333' },
      grid: { vertLines: { color: '#eee' }, horzLines: { color: '#eee' } },
      rightPriceScale: { scaleMargins: { top: 0.05, bottom: 0.28 } },
      timeScale: { borderColor: '#ccc' }
    });
    var candle = chart.addCandlestickSeries({
      upColor: PriceChart.UP, downColor: PriceChart.DOWN,
      borderUpColor: PriceChart.UP, borderDownColor: PriceChart.DOWN,
      wickUpColor: PriceChart.UP, wickDownColor: PriceChart.DOWN
    });
    candle.setData(data.candles);
    var vol = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'volume' });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    vol.setData(data.volumes);
    chart.timeScale().fitContent();
    PriceChart._chart = chart;
    // 隨容器寬度調整
    if (typeof ResizeObserver !== 'undefined') {
      PriceChart._observer = new ResizeObserver(function () {
        if (PriceChart._chart) PriceChart._chart.applyOptions({ width: el.clientWidth });
      });
      PriceChart._observer.observe(el);
    }
  }
};
if (typeof module !== 'undefined') module.exports = PriceChart;
