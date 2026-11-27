// 看盤小精靈：固定在視窗右下角，點開有「現在發生什麼／這些圖怎麼看／看線小技巧」三個分頁
// Sprite.mount(容器) 放進交易練習頁；Sprite.update(rows, 指標開關, 說明) 更新內容；Sprite.hide() 收起並隱藏
var Sprite = {
  TABS: [['now', '現在發生什麼'], ['read', '這些圖怎麼看'], ['tip', '看線小技巧']],
  el: null,
  isOpen: false,
  tab: 'now',
  tipAt: 0,
  seen: {},          // 打開過時看過的訊號（key + 日期），用來算紅色數字
  rows: [],
  state: null,
  note: '',
  obs: [],

  SVG: '<svg viewBox="0 0 68 68" width="64" height="64" aria-hidden="true">' +
    '<defs><radialGradient id="spriteG" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#b3e5fc"/><stop offset=".6" stop-color="#4fc3f7"/><stop offset="1" stop-color="#1e88e5"/></radialGradient>' +
    '<filter id="spriteGlow"><feGaussianBlur stdDeviation="2.5"/></filter></defs>' +
    '<ellipse cx="34" cy="64" rx="16" ry="3" fill="rgba(0,0,0,.15)"/>' +
    '<circle cx="34" cy="34" r="24" fill="#4fc3f7" opacity=".35" filter="url(#spriteGlow)"/>' +
    '<path d="M14 40 Q14 12 34 12 Q54 12 54 40 Q54 50 48 54 Q44 50 40 55 Q36 50 32 55 Q28 50 24 55 Q20 50 14 52 Z" fill="url(#spriteG)"/>' +
    '<ellipse cx="27" cy="33" rx="4" ry="5" fill="#0d2a44"/><ellipse cx="41" cy="33" rx="4" ry="5" fill="#0d2a44"/>' +
    '<circle cx="28.3" cy="31.3" r="1.4" fill="#fff"/><circle cx="42.3" cy="31.3" r="1.4" fill="#fff"/>' +
    '<path d="M29 42 Q34 46 39 42" stroke="#0d2a44" stroke-width="2" fill="none" stroke-linecap="round"/>' +
    '<ellipse cx="22" cy="40" rx="3" ry="1.8" fill="#f48fb1" opacity=".6"/><ellipse cx="46" cy="40" rx="3" ry="1.8" fill="#f48fb1" opacity=".6"/>' +
    '<line x1="30" y1="2" x2="30" y2="13" stroke="#e53935" stroke-width="1.5"/><rect x="27.5" y="5" width="5" height="6" fill="#e53935" rx="1"/>' +
    '<line x1="38" y1="4" x2="38" y2="13" stroke="#43a047" stroke-width="1.5"/><rect x="35.5" y="7" width="5" height="5" fill="#43a047" rx="1"/>' +
    '</svg>',

  mk_: function (tag, text, cls) {
    var e = document.createElement(tag);
    if (text) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  },

  build_: function () {
    var S = Sprite, mk = S.mk_;
    var root = mk('div', '', 'sprite');
    var bubble = mk('div', '', 'sprite-bubble closed');
    bubble.setAttribute('role', 'dialog');
    bubble.setAttribute('aria-label', '看盤小精靈');
    var head = mk('div', '', 'sprite-head');
    head.appendChild(mk('span', '📈 看盤小精靈'));
    head.appendChild(mk('small', '只解釋現象，不給買賣建議'));
    var tabs = mk('div', '', 'sprite-tabs');
    S.TABS.forEach(function (t) {
      var b = mk('button', t[1]);
      b.type = 'button';
      b.setAttribute('data-tab', t[0]);
      b.addEventListener('click', function () { S.tab = t[0]; S.render_(); });
      tabs.appendChild(b);
    });
    var body = mk('div', '', 'sprite-body');
    var foot = mk('div', '', 'sprite-foot');
    [head, tabs, body, foot].forEach(function (n) { bubble.appendChild(n); });
    var me = mk('button', '', 'sprite-me');
    me.type = 'button';
    me.setAttribute('aria-label', '打開看盤小精靈');
    me.innerHTML = S.SVG;
    var badge = mk('span', '', 'sprite-badge');
    badge.hidden = true;
    me.appendChild(badge);
    me.addEventListener('click', function () { S.setOpen_(!S.isOpen); });
    root.appendChild(bubble);
    root.appendChild(me);
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && S.isOpen) S.setOpen_(false); });
    S.el = root;
    S.parts = { bubble: bubble, tabs: tabs, body: body, foot: foot, me: me, badge: badge };
    S.tipAt = Math.floor(Math.random() * SpriteRules.TIPS.length);
  },

  sig_: function (o) {
    var last = Sprite.rows.length ? Sprite.rows[Sprite.rows.length - 1].date : '';
    return o.key + '@' + last;
  },

  setOpen_: function (open) {
    var S = Sprite;
    S.isOpen = open;
    S.parts.bubble.classList.toggle('closed', !open);
    S.parts.me.setAttribute('aria-label', open ? '收起看盤小精靈' : '打開看盤小精靈');
    if (open) S.obs.forEach(function (o) { S.seen[S.sig_(o)] = true; });
    S.render_();
  },

  mount: function (container) {
    if (!Sprite.el) Sprite.build_();
    if (Sprite.el.parentNode !== container) container.appendChild(Sprite.el);
    Sprite.el.hidden = false;
  },

  update: function (rows, state, note) {
    var S = Sprite;
    S.rows = rows || [];
    S.state = state;
    S.note = note || '';
    S.obs = state ? SpriteRules.observe(S.rows, state) : [];
    if (S.isOpen) S.obs.forEach(function (o) { S.seen[S.sig_(o)] = true; });
    if (S.el) S.render_();
  },

  hide: function () {
    if (!Sprite.el) return;
    Sprite.setOpen_(false);
    Sprite.el.hidden = true;
  },

  render_: function () {
    var S = Sprite, P = S.parts, mk = S.mk_;
    var unseen = S.obs.filter(function (o) { return !S.seen[S.sig_(o)]; }).length;
    P.badge.hidden = S.isOpen || unseen === 0;
    P.badge.textContent = String(unseen);
    [].forEach.call(P.tabs.children, function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === S.tab); });
    P.body.textContent = '';
    P.foot.textContent = '';
    var item = function (level, title, text) {
      var d = mk('div', '', 'sprite-item');
      var t = mk('div', '', 'sprite-title');
      var tag = level === 'hot' || level === 'cold' ? '注意' : '說明';
      t.appendChild(mk('span', tag, 'sprite-tag ' + level));
      t.appendChild(document.createTextNode(title));
      d.appendChild(t);
      d.appendChild(mk('div', text));
      P.body.appendChild(d);
    };
    if (S.tab === 'now') {
      if (S.obs.length === 0) item('info', '今天沒有明顯訊號', '目前開著的指標都沒有出現交叉、過熱或特殊 K 棒。沒有訊號也是一種資訊：可以多看看均線方向和最近幾天的量。');
      S.obs.forEach(function (o) { item(o.level, o.title, o.text); });
      P.foot.textContent = S.note;
    } else if (S.tab === 'read') {
      SpriteRules.explain(S.state || {}).forEach(function (x) { item('info', x.title, x.text); });
      P.foot.textContent = '只說明你目前打開的圖；在上方切換指標，這裡會跟著變。';
    } else {
      var tips = SpriteRules.TIPS, i = S.tipAt % tips.length;
      item('info', tips[i].title, tips[i].text);
      P.foot.appendChild(document.createTextNode('技巧 ' + (i + 1) + '／' + tips.length));
      var next = mk('button', '下一則 ›', 'sprite-next');
      next.type = 'button';
      next.addEventListener('click', function () { S.tipAt++; S.render_(); });
      P.foot.appendChild(next);
    }
  }
};
if (typeof module !== 'undefined') module.exports = Sprite;
