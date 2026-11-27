// 登入頁背景：發光走勢線（多檔輪播）與報價跑馬燈。先用 login-data.js 的靜態快照，再向公開 API loginSnapshot 取最新資料。
var LoginBg = {
  W: 800, H: 260, PAD: 20,     // SVG viewBox 尺寸與上下留白
  INTERVAL: 8000,              // 每檔停留毫秒數
  FADE: 400,                   // 換股淡出毫秒數
  timer: null,
  index: 0,

  // 把收盤序列轉成 SVG path：x 平均分布在 0..w，y 依最低/最高價映射到 [pad, h-pad]，高價在上
  buildPath: function (closes, w, h, pad) {
    var min = Math.min.apply(null, closes), max = Math.max.apply(null, closes);
    var n = closes.length, span = max - min;
    var r = function (v) { return Math.round(v * 10) / 10; };
    var x, y, line = '';
    for (var i = 0; i < n; i++) {
      x = r(n === 1 ? w : i * w / (n - 1));
      y = r(span === 0 ? h / 2 : pad + (max - closes[i]) / span * (h - 2 * pad));
      line += (i ? 'L' : 'M') + x + ',' + y;
    }
    return { line: line, area: line + 'L' + w + ',' + h + 'L0,' + h + 'Z', last: { x: x, y: y } };
  },

  // 例：2330 台積電　2025/11 – 2026/11 收盤走勢
  label: function (s) {
    var ym = function (d) { return d.slice(0, 7).replace('-', '/'); };
    return s.code + ' ' + s.name + '　' + ym(s.dates[0]) + ' – ' + ym(s.dates[s.dates.length - 1]) + ' 收盤走勢';
  },

  // 跑馬燈內容；重複兩次讓 CSS 位移 -50% 時能無縫接上
  tapeHtml: function (quotes, asOf) {
    var html = '<span class="asof">資料日期 ' + asOf.replace(/-/g, '/') + ' 收盤</span>';
    quotes.forEach(function (q) {
      var up = q.changePct >= 0;
      html += '<span>' + q.code + ' ' + q.name + '<em class="' + (up ? 'r' : 'g') + '">' +
        q.close + ' ' + (up ? '▲' : '▼') + Math.abs(q.changePct).toFixed(2) + '%</em></span>';
    });
    return html + html;
  },

  // 決定要不要換成 API 回來的快照：格式正確、每檔至少兩天、資料日期不比目前舊才採用
  pick: function (cur, incoming) {
    var d = incoming;
    var ok = d && typeof d.asOf === 'string' && Array.isArray(d.quotes) && d.quotes.length > 0 &&
      Array.isArray(d.series) && d.series.length > 0 &&
      d.series.every(function (s) { return s && Array.isArray(s.closes) && Array.isArray(s.dates) && s.closes.length >= 2; });
    return ok && d.asOf >= cur.asOf ? d : cur;
  },

  // 以下為 DOM 操作，只在瀏覽器執行
  data: null,       // 目前使用的快照；先用 login-data.js，API 回來較新的再換掉
  fetched: false,
  el: function (sel) { return document.querySelector(sel); },
  reducedMotion: function () {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  },

  // 顯示第 i 檔：舊線淡出 → 換 path → 新線從左畫到右
  show: function (i) {
    var self = LoginBg, data = self.data.series[i];
    var group = self.el('.lg-line'), stroke = self.el('.lg-stroke'), dot = self.el('.lg-dot');
    var p = self.buildPath(data.closes, self.W, self.H, self.PAD);
    group.classList.add('fading');
    dot.classList.remove('on');
    setTimeout(function () {
      self.el('.lg-area').setAttribute('d', p.area);
      stroke.setAttribute('d', p.line);
      self.el('.lg-legend').textContent = self.label(data);
      dot.style.left = (p.last.x / self.W * 100) + '%';
      dot.style.top = (p.last.y / self.H * 100) + '%';
      stroke.style.transition = 'none';
      if (!self.reducedMotion() && stroke.getTotalLength) {
        var len = stroke.getTotalLength();
        stroke.style.strokeDasharray = len;
        stroke.style.strokeDashoffset = len;
        stroke.getBoundingClientRect();   // 強制重排，讓下一行的 transition 生效
        stroke.style.transition = 'stroke-dashoffset 1.6s ease-out';
        stroke.style.strokeDashoffset = 0;
      } else {
        stroke.style.strokeDasharray = 'none';
        stroke.style.strokeDashoffset = 0;
      }
      group.classList.remove('fading');
      setTimeout(function () { dot.classList.add('on'); }, self.reducedMotion() ? 0 : 1600);
    }, self.FADE);
  },

  next: function () {
    LoginBg.index = (LoginBg.index + 1) % LoginBg.data.series.length;
    LoginBg.show(LoginBg.index);
  },

  // 向公開 API 要最新快照（每次載入頁面只要一次）；失敗就沿用靜態快照，不顯示錯誤
  refresh: function () {
    if (LoginBg.fetched || typeof Api === 'undefined') return;
    LoginBg.fetched = true;
    Api.call('loginSnapshot').then(function (r) {
      var next = LoginBg.pick(LoginBg.data, r.data);
      if (next === LoginBg.data) return;
      LoginBg.data = next;
      LoginBg.index = LoginBg.index % next.series.length;   // 下一次輪播就用新資料
      LoginBg.renderTape();
    }).catch(function () {});
  },

  renderTape: function () {
    LoginBg.el('.lg-track').innerHTML = LoginBg.tapeHtml(LoginBg.data.quotes, LoginBg.data.asOf);
  },

  start: function () {
    if (LoginBg.timer !== null) return;
    LoginBg.refresh();
    LoginBg.show(LoginBg.index);
    LoginBg.timer = setInterval(LoginBg.next, LoginBg.INTERVAL);
  },

  stop: function () {
    if (LoginBg.timer !== null) clearInterval(LoginBg.timer);
    LoginBg.timer = null;
  },

  init: function () {
    var view = document.getElementById('login-view');
    if (!view || typeof LOGIN_DATA === 'undefined') return;
    LoginBg.data = LOGIN_DATA;
    LoginBg.renderTape();
    // app.js 用 hidden 切換登入頁／主畫面；跟著啟停動畫，登入後不佔資源
    var sync = function () { if (view.hidden) LoginBg.stop(); else LoginBg.start(); };
    new MutationObserver(sync).observe(view, { attributes: true, attributeFilter: ['hidden'] });
    sync();
  }
};
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', LoginBg.init);
}
if (typeof module !== 'undefined') module.exports = LoginBg;
