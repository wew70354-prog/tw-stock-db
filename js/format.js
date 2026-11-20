// 數字與文字格式化工具（不依賴瀏覽器，可在 Node 測試）
var Fmt = {
  // 千分位 + 固定小數位：1234.5 → '1,234.50'
  num: function (n, digits) {
    if (digits === undefined) digits = 2;
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  },
  int: function (n) { return Fmt.num(Math.round(Number(n)), 0); },
  // 百分比（輸入為比例）：0.0523 → '+5.23%'
  pct: function (x) {
    var v = Number(x) * 100;
    return (v > 0 ? '+' : '') + v.toFixed(2) + '%';
  },
  // 台股慣例：紅漲綠跌
  signClass: function (x) { return x > 0 ? 'up' : (x < 0 ? 'down' : 'flat'); },
  methodLabel: function (m) {
    return { scan: '全表掃描', index: '自建索引', cache: '快取' }[m] || String(m);
  },
  // 四捨五入到小數 2 位（避免 1.005 這類浮點誤差）
  round2: function (x) { return Math.round((x + Number.EPSILON) * 100) / 100; }
};
if (typeof module !== 'undefined') module.exports = Fmt;
