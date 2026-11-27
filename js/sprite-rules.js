// 看盤小精靈的規則（純函式）：依最後一根 K 棒與目前開著的指標，產生中性的現象說明。不給買賣建議。
// state 形狀同 IndicatorPanel：{ma5, ma10, ma20, boll, vma, sub: 'kd'|'rsi'|'macd'}
var SpriteRules = {
  // 訊號文字範本：{名稱} 由 observe 代入數值
  SIGNALS: {
    kd_hot: { level: 'hot', title: 'KD 過熱', text: 'K 值 {k}、D 值 {d}，K 在 80 以上，屬於過熱區。代表最近幾天收盤都靠近 9 日高點、漲勢強；過熱不等於馬上下跌，強勢時 K 值可能在高檔停留很久（叫做鈍化）。' },
    kd_cold: { level: 'cold', title: 'KD 超賣', text: 'K 值 {k}、D 值 {d}，K 在 20 以下，屬於超賣區。代表收盤一直靠近 9 日低點、跌勢重；超賣不等於馬上反彈，弱勢時也可能在低檔鈍化。' },
    kd_golden: { level: 'info', title: 'KD 黃金交叉', text: 'K 值由下往上穿過 D 值（K {k}、D {d}），代表短線動能轉強。出現在 20 以下的低檔時，通常被認為參考價值比較高。' },
    kd_dead: { level: 'info', title: 'KD 死亡交叉', text: 'K 值由上往下穿過 D 值（K {k}、D {d}），代表短線動能轉弱。出現在 80 以上的高檔時，通常被認為參考價值比較高。' },
    rsi_hot: { level: 'hot', title: 'RSI 過熱', text: 'RSI {rsi}，在 80 以上。代表最近 14 天上漲的力道遠大於下跌；強勢行情中 RSI 也可能持續過熱。' },
    rsi_cold: { level: 'cold', title: 'RSI 超賣', text: 'RSI {rsi}，在 20 以下。代表最近 14 天下跌的力道遠大於上漲；弱勢行情中 RSI 也可能持續停在低檔。' },
    macd_golden: { level: 'info', title: 'MACD 黃金交叉', text: 'DIF（{dif}）由下往上穿過訊號線（{sig}），代表短期均線開始拉開、上漲動能增加。MACD 反應比 KD 慢，比較適合看中期方向。' },
    macd_dead: { level: 'info', title: 'MACD 死亡交叉', text: 'DIF（{dif}）由上往下穿過訊號線（{sig}），代表上漲動能減弱。MACD 反應比較慢，訊號出現時價格通常已經走了一段。' },
    ma_golden: { level: 'info', title: '均線黃金交叉', text: 'MA5 今天由下往上穿過 MA20。意思是最近 5 天買進的人平均成本，已經高於最近 20 天，短線氣氛轉強。' },
    ma_dead: { level: 'info', title: '均線死亡交叉', text: 'MA5 今天由上往下穿過 MA20。最近 5 天買進的人平均成本，已經低於最近 20 天，短線氣氛轉弱。' },
    ma_bull: { level: 'info', title: '多頭排列', text: '收盤 > MA5 > MA10 > MA20，叫做「多頭排列」：短、中期買進的人大多是賺錢的，通常是趨勢向上的狀態。' },
    ma_bear: { level: 'info', title: '空頭排列', text: '收盤 < MA5 < MA10 < MA20，叫做「空頭排列」：短、中期買進的人大多是虧損的，通常是趨勢向下的狀態。' },
    boll_up: { level: 'hot', title: '突破布林上軌', text: '收盤 {c} 高於布林上軌 {u}，價格衝出近 20 天的正常波動範圍。可能是強勢突破，也可能是短線漲過頭，通常要搭配成交量和趨勢一起看。' },
    boll_down: { level: 'cold', title: '跌破布林下軌', text: '收盤 {c} 低於布林下軌 {l}，價格跌出近 20 天的正常波動範圍。可能是弱勢破底，也可能是短線跌過頭。' },
    vol_surge: { level: 'info', title: '成交量放大', text: '今天成交量是 5 日均量的 {x} 倍，屬於大量。{dir}' },
    vol_dry: { level: 'info', title: '成交量萎縮', text: '今天成交量只有 5 日均量的 {x} 倍，屬於量縮，代表交易冷清、多數人在觀望。' },
    upper_shadow: { level: 'info', title: '長上影線', text: '盤中最高到 {h}，收盤卻回到 {c}，留下長上影線。代表高處有人賣出，追價的力道不足。' },
    lower_shadow: { level: 'info', title: '長下影線', text: '盤中最低到 {l}，收盤拉回到 {c}，留下長下影線。代表低處有人買進，下方有支撐。' },
    big_red: { level: 'info', title: '長紅 K', text: '今天收盤比前一天漲 {p}%，實體很長，代表買方力道強。' },
    big_black: { level: 'info', title: '長黑 K', text: '今天收盤比前一天跌 {p}%，實體很長，代表賣方力道強。' }
  },

  VOL_DIR: {
    up: '今天收紅，價漲量增，代表有人願意用更高的價格買。',
    down: '今天收黑，價跌量增，代表賣出的人很多。',
    flat: '今天收平，量大但價格沒有明顯方向。'
  },

  TIPS: [
    { title: '先看趨勢，再看指標', text: '均線的方向決定大方向。KD、RSI 在盤整時比較好用；遇到強烈趨勢常常「鈍化」，一直停在過熱或超賣區。' },
    { title: '一個訊號不夠', text: '只憑一個指標下判斷很容易被騙。常見的做法是等兩、三個訊號同時出現，例如黃金交叉加上成交量放大。' },
    { title: '量是價的先行指標', text: '上漲時量增、回檔時量縮，通常是健康的走勢；價格創新高但量越來越小，代表追價的人變少了。' },
    { title: '長上影線要留意', text: '盤中漲很高、收盤卻掉回來，代表高處有人賣；在漲了一大段之後連續出現時，特別值得注意。' },
    { title: '均線像支撐與壓力', text: '價格回落到上升中的 MA20 附近常會遇到買盤；反彈到下彎的 MA20 附近則常遇到賣壓。' },
    { title: '過熱不等於要跌', text: 'KD 超過 80 只代表最近漲得多，強勢股可以在高檔停留很久。是否轉弱，通常要等 K 往下穿過 D、或跌破短期均線再確認。' },
    { title: '先想好錯了怎麼辦', text: '做決定前先想：如果走勢跟預期相反，價格到哪裡你會認錯？把這個價位寫進理由欄。' },
    { title: '不要被一天的 K 棒嚇到', text: '單日的大漲大跌常常是雜訊，搭配前後幾天和均線方向一起看，比較不容易被甩下車。' },
    { title: '寫下你的理由', text: '理由寫得越具體（看到什麼、預期什麼），結束後回顧越能看出自己的判斷習慣與盲點。' },
    { title: '布林通道收窄', text: '上下軌越靠越近，代表波動越來越小，常是醞釀下一段大行情的前兆，但方向要等突破後才知道。' }
  ],

  fill_: function (tpl, vals) {
    return tpl.replace(/\{(\w+)\}/g, function (m, k) { return vals[k] !== undefined ? vals[k] : m; });
  },

  // 最後一根 K 棒的訊號：[{key, level, title, text}]；資料不足的規則自動略過
  observe: function (rows, state) {
    var n = rows.length;
    if (n < 2) return [];
    var S = SpriteRules.SIGNALS, out = [], i = n - 1;
    var add = function (key, vals) { out.push({ key: key, level: S[key].level, title: S[key].title, text: SpriteRules.fill_(S[key].text, vals || {}) }); };
    var f1 = function (v) { return v.toFixed(1); }, f2 = function (v) { return v.toFixed(2); };
    var cross = function (a0, b0, a1, b1) {
      if (a0 === null || b0 === null || a1 === null || b1 === null) return 0;
      if (a0 <= b0 && a1 > b1) return 1;
      if (a0 >= b0 && a1 < b1) return -1;
      return 0;
    };
    var closes = rows.map(function (r) { return r.close; });
    var b = rows[i], prev = rows[i - 1];

    // 均線
    var ma5 = Ind.sma(closes, 5), ma10 = Ind.sma(closes, 10), ma20 = Ind.sma(closes, 20);
    if (state.ma5 && state.ma20) {
      var mc = cross(ma5[i - 1], ma20[i - 1], ma5[i], ma20[i]);
      if (mc === 1) add('ma_golden'); else if (mc === -1) add('ma_dead');
    }
    if (state.ma5 && state.ma10 && state.ma20 && ma20[i] !== null) {
      if (b.close > ma5[i] && ma5[i] > ma10[i] && ma10[i] > ma20[i]) add('ma_bull');
      else if (b.close < ma5[i] && ma5[i] < ma10[i] && ma10[i] < ma20[i]) add('ma_bear');
    }

    // 布林
    if (state.boll) {
      var bb = Ind.bollinger(closes, 20, 2)[i];
      if (bb && b.close > bb.upper) add('boll_up', { c: f2(b.close), u: f2(bb.upper) });
      else if (bb && b.close < bb.lower) add('boll_down', { c: f2(b.close), l: f2(bb.lower) });
    }

    // 成交量
    if (state.vma) {
      var vma = Ind.sma(rows.map(function (r) { return r.volume; }), 5)[i];
      if (vma) {
        var x = b.volume / vma;
        var dir = b.close > b.open ? 'up' : (b.close < b.open ? 'down' : 'flat');
        if (x >= 2) add('vol_surge', { x: f1(x), dir: SpriteRules.VOL_DIR[dir] });
        else if (x <= 0.5) add('vol_dry', { x: f1(x) });
      }
    }

    // 副圖
    if (state.sub === 'kd') {
      var kd = Ind.kd(rows, 9), k1 = kd[i], k0 = kd[i - 1];
      if (k1) {
        var kv = { k: f1(k1.k), d: f1(k1.d) };
        if (k1.k >= 80) add('kd_hot', kv); else if (k1.k <= 20) add('kd_cold', kv);
        if (k0) {
          var kc = cross(k0.k, k0.d, k1.k, k1.d);
          if (kc === 1) add('kd_golden', kv); else if (kc === -1) add('kd_dead', kv);
        }
      }
    } else if (state.sub === 'rsi') {
      var rsi = Ind.rsi(closes, 14)[i];
      if (rsi !== null && rsi >= 80) add('rsi_hot', { rsi: f1(rsi) });
      else if (rsi !== null && rsi <= 20) add('rsi_cold', { rsi: f1(rsi) });
    } else if (state.sub === 'macd') {
      var m = Ind.macd(closes, 12, 26, 9), m1 = m[i], m0 = m[i - 1];
      if (m1 && m0) {
        var xc = cross(m0.dif, m0.signal, m1.dif, m1.signal), mv = { dif: f2(m1.dif), sig: f2(m1.signal) };
        if (xc === 1) add('macd_golden', mv); else if (xc === -1) add('macd_dead', mv);
      }
    }

    // K 棒型態：振幅至少前收的 2% 才看影線，避免平盤小十字線被當成長影線
    var body = Math.abs(b.close - b.open), range = b.high - b.low;
    var upper = b.high - Math.max(b.open, b.close), lower = Math.min(b.open, b.close) - b.low;
    if (range >= prev.close * 0.02) {
      if (upper >= 2 * body && upper >= range / 2) add('upper_shadow', { h: f2(b.high), c: f2(b.close) });
      else if (lower >= 2 * body && lower >= range / 2) add('lower_shadow', { l: f2(b.low), c: f2(b.close) });
    }
    if (body >= prev.close * 0.03) {
      var pct = f2(Math.abs(b.close / prev.close - 1) * 100);
      if (b.close > b.open) add('big_red', { p: pct }); else add('big_black', { p: pct });
    }
    return out;
  },

  // 目前開著的圖怎麼看
  explain: function (state) {
    var out = [{ title: 'K 線（紅漲綠跌）', text: '每根 K 棒是一天：實體的上下緣是開盤和收盤，細線（影線）的頂端和底端是當天最高和最低。紅色代表收盤比開盤高，綠色代表收盤比開盤低。' }];
    var mas = [];
    if (state.ma5) mas.push('MA5');
    if (state.ma10) mas.push('MA10');
    if (state.ma20) mas.push('MA20');
    if (mas.length) {
      out.push({ title: '均線 ' + mas.join('／'), text: '過去 N 天收盤價的平均，可以想成這段期間買進的人的平均成本。價格在均線上方，代表這群人大多賺錢；天數越短的均線反應越快。' });
    }
    if (state.boll) {
      out.push({ title: '布林通道', text: '中線是 20 日均線，上下兩條灰色虛線是中線加減 2 倍標準差，大約涵蓋近 20 天九成以上的價格波動。碰到或衝出上下軌，代表價格偏離平常很多。' });
    }
    out.push({ title: '成交量' + (state.vma ? '與 5 日均量' : ''), text: '下方的柱子是成交量，這裡換算成「平均量的幾倍」，紅柱是收紅那天、綠柱是收黑那天。' + (state.vma ? '橘線是 5 日均量，柱子高出橘線很多就是大量。' : '') });
    if (state.sub === 'rsi') {
      out.push({ title: 'RSI（副圖）', text: '比較最近 14 天上漲與下跌的平均幅度，介於 0 到 100。數值越高代表漲的力道越強；圖上 80 以上叫過熱、20 以下叫超賣。' });
    } else if (state.sub === 'macd') {
      out.push({ title: 'MACD（副圖）', text: '藍線 DIF 是 12 日與 26 日指數平均的差距，橘線是 DIF 的 9 日平均（訊號線）。柱子是兩者的差，紅柱變長代表上漲動能增強，綠柱變長代表下跌動能增強。' });
    } else {
      out.push({ title: 'KD（副圖）', text: '看收盤價落在最近 9 天高低區間的哪個位置，介於 0 到 100。藍線 K 反應快、橘線 D 比較慢；80 以上叫過熱、20 以下叫超賣；K 往上穿過 D 叫黃金交叉。' });
    }
    return out;
  }
};
if (typeof module !== 'undefined') module.exports = SpriteRules;
