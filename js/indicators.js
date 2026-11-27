// 技術指標計算（純函式）：只用當天以前的資料，期數不足的位置為 null
var Ind = {
  sma: function (values, n) {
    var out = [], sum = 0;
    for (var i = 0; i < values.length; i++) {
      sum += values[i];
      if (i >= n) sum -= values[i - n];
      out.push(i >= n - 1 ? sum / n : null);
    }
    return out;
  },

  // 指數移動平均：k = 2/(n+1)，以第一個有值的位置為初值；null 照樣輸出 null
  ema: function (values, n) {
    var k = 2 / (n + 1), prev = null;
    return values.map(function (v) {
      if (v === null || v === undefined) return null;
      prev = prev === null ? v : v * k + prev * (1 - k);
      return prev;
    });
  },

  // 布林通道：中線 SMA(n)，上下軌 ±k 倍母體標準差
  bollinger: function (values, n, k) {
    var mid = Ind.sma(values, n);
    return mid.map(function (m, i) {
      if (m === null) return null;
      var s = 0;
      for (var j = i - n + 1; j <= i; j++) s += (values[j] - m) * (values[j] - m);
      var sd = Math.sqrt(s / n);
      return { upper: m + k * sd, mid: m, lower: m - k * sd };
    });
  },

  // KD：RSV = (收 − n 日最低) / (n 日最高 − n 日最低) × 100；K、D 各以 1/3 平滑，初值 50
  kd: function (bars, n) {
    var K = 50, D = 50;
    return bars.map(function (b, i) {
      if (i < n - 1) return null;
      var hi = -Infinity, lo = Infinity;
      for (var j = i - n + 1; j <= i; j++) { hi = Math.max(hi, bars[j].high); lo = Math.min(lo, bars[j].low); }
      var rsv = hi === lo ? 50 : (b.close - lo) / (hi - lo) * 100;
      K = K * 2 / 3 + rsv / 3;
      D = D * 2 / 3 + K / 3;
      return { k: K, d: D };
    });
  },

  // RSI（Wilder）：前 n 個漲跌簡單平均，之後 (前值 × (n−1) + 當期) / n；平均跌幅為 0 時為 100
  rsi: function (values, n) {
    var out = [null], up = 0, dn = 0;
    for (var i = 1; i < values.length; i++) {
      var ch = values[i] - values[i - 1], u = ch > 0 ? ch : 0, d = ch < 0 ? -ch : 0;
      if (i <= n) { up += u / n; dn += d / n; } else { up = (up * (n - 1) + u) / n; dn = (dn * (n - 1) + d) / n; }
      out.push(i < n ? null : (dn === 0 ? 100 : 100 - 100 / (1 + up / dn)));
    }
    return out.slice(0, values.length);
  },

  // MACD：DIF = EMA(fast) − EMA(slow)（第 slow 根起才有值），訊號 = DIF 的 EMA(signal)，柱 = DIF − 訊號
  macd: function (values, fast, slow, signal) {
    var f = Ind.ema(values, fast), s = Ind.ema(values, slow);
    var dif = values.map(function (_, i) { return i >= slow - 1 ? f[i] - s[i] : null; });
    var sig = Ind.ema(dif, signal);
    return dif.map(function (d, i) {
      return d === null ? null : { dif: d, signal: sig[i], hist: d - sig[i] };
    });
  }
};
if (typeof module !== 'undefined') module.exports = Ind;
