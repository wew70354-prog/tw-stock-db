// 應用程式主體：登入切換、分頁路由、效能資訊列
// 瀏覽器中 Fmt 為全域物件；Node 測試時改用 require
var FmtRef = (typeof Fmt !== 'undefined') ? Fmt : require('./format.js');
var App = {
  pages: {},
  current: null,

  registerPage: function (name, page) { App.pages[name] = page; },

  // 效能資訊列文字
  perfText: function (meta, roundTripMs) {
    if (!meta) return (typeof roundTripMs === 'number') ? '往返 ' + FmtRef.int(roundTripMs) + ' ms' : '';
    var s = '方法：' + FmtRef.methodLabel(meta.method) +
      '｜伺服器 ' + FmtRef.int(meta.serverMs) + ' ms' +
      '｜往返 ' + FmtRef.int(roundTripMs) + ' ms' +
      '｜讀取 ' + FmtRef.int(meta.rowsRead) + ' 列';
    if (meta.cacheHit) s += '（命中快取）';
    return s;
  },
  showPerf: function (meta, roundTripMs) {
    var el = document.getElementById('perf-bar');
    if (!el) return;
    el.textContent = App.perfText(meta, roundTripMs);
  },

  // 通知各頁清除使用者資料，避免下一位登入者看到前一位的內容
  clearUserData: function () {
    Object.keys(App.pages).forEach(function (k) {
      if (App.pages[k].clearUser) App.pages[k].clearUser();
    });
  },

  showLogin: function (msg) {
    App.clearUserData();
    document.getElementById('app-view').hidden = true;
    document.getElementById('login-view').hidden = false;
    document.getElementById('login-error').textContent = msg || '';
  },
  showApp: function () {
    var u = Api.getUser();
    document.getElementById('login-view').hidden = true;
    document.getElementById('app-view').hidden = false;
    document.getElementById('nav-user').textContent = u ? u.username : '';
    App.showPerf(null);
    App.route();
    // 只在進入應用程式時驗證一次 token（登入後或重新載入頁面）
    Api.call('me').catch(App.showError);
  },

  // token 過期或無效：清除登入狀態並回登入頁
  onAuthExpired: function () {
    sessionStorage.removeItem('tsdb_token');
    sessionStorage.removeItem('tsdb_user');
    App.current = null;
    if (typeof document !== 'undefined') App.showLogin('登入已逾時，請重新登入');
  },

  // 依 location.hash 切換分頁（預設 #query）
  route: function () {
    var name = (location.hash || '').replace('#', '');
    if (!App.pages[name]) name = 'query';
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].hidden = (tabs[i].id !== 'tab-' + name);
    var links = document.querySelectorAll('#nav a[data-page]');
    for (var j = 0; j < links.length; j++) {
      links[j].classList.toggle('active', links[j].getAttribute('data-page') === name);
    }
    App.current = name;
    App.showPerf(null);
    // 直接顯示頁面；頁面自己的 API 呼叫遇到 AUTH_REQUIRED 會觸發 onAuthExpired
    if (App.pages[name].onShow) App.pages[name].onShow();
  },

  // 顯示錯誤訊息於資訊列（AUTH_REQUIRED 已由 onAuthExpired 處理，不重複顯示）
  showError: function (e) {
    if (e && e.code === 'AUTH_REQUIRED') return;
    var el = document.getElementById('perf-bar');
    if (el) el.textContent = (e && e.message) || '發生未知錯誤';
  },

  init: function () {
    var form = document.getElementById('login-form');
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var err = document.getElementById('login-error');
      err.textContent = '';
      var btn = document.getElementById('login-btn');
      btn.disabled = true;
      Api.login(form.username.value.trim(), form.password.value).then(function () {
        form.password.value = '';
        App.showApp();
      }).catch(function (e) {
        err.textContent = e.message;
      }).then(function () { btn.disabled = false; });
    });
    document.getElementById('logout-btn').addEventListener('click', function () {
      Api.logout().then(function () { App.showLogin(''); });
    });
    window.addEventListener('hashchange', function () {
      if (Api.getUser()) App.route();
    });
    if (sessionStorage.getItem('tsdb_token') && Api.getUser()) App.showApp();
    else App.showLogin('');
  }
};
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', App.init);
}
if (typeof module !== 'undefined') module.exports = App;
