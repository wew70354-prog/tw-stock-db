// 與 Apps Script Web App 溝通的封裝
var Api = {
  // 呼叫 API：成功回傳 {data, meta, roundTripMs}；失敗丟 {code, message}
  call: function (action, params) {
    var url = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.API_URL) || '';
    if (!url) {
      return Promise.reject({ code: 'NO_API_URL', message: '尚未設定 API 網址（web/js/config.js）' });
    }
    var body = { action: action, params: params || {} };
    var token = sessionStorage.getItem('tsdb_token');
    if (token) body.token = token;
    var t0 = Date.now();
    // text/plain 可避免 CORS preflight；不送 cookie
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.json();
    }).catch(function () {
      throw { code: 'NETWORK', message: '無法連線到伺服器，請檢查網路' };
    }).then(function (json) {
      var roundTripMs = Date.now() - t0;
      if (json && json.ok) return { data: json.data, meta: json.meta, roundTripMs: roundTripMs };
      var err = (json && json.error) || { code: 'SERVER_ERROR', message: '伺服器發生錯誤' };
      if (err.code === 'AUTH_REQUIRED' && typeof App !== 'undefined' && App.onAuthExpired) App.onAuthExpired();
      throw { code: err.code, message: err.message };
    });
  },
  login: function (username, password) {
    return Api.call('login', { username: username, password: password }).then(function (r) {
      sessionStorage.setItem('tsdb_token', r.data.token);
      sessionStorage.setItem('tsdb_user', JSON.stringify(r.data.user));
      return r.data;
    });
  },
  logout: function () {
    return Api.call('logout').catch(function () {}).then(function () {
      sessionStorage.removeItem('tsdb_token');
      sessionStorage.removeItem('tsdb_user');
    });
  },
  getUser: function () {
    try { return JSON.parse(sessionStorage.getItem('tsdb_user')); } catch (e) { return null; }
  }
};
if (typeof module !== 'undefined') module.exports = Api;
