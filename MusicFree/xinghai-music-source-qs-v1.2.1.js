/**
 * @name 星海音乐源 - 汽水音乐 (qs)
 * @description MusicFree 汽水音乐插件（搜索 / 播放 / 榜单 / 逐字歌词 / 评论）
 * @author 万去了了
 * @version 1.2.1
 * @update 修复 MusicFree 环境下 `require is not defined` 导致初始化失败（axios 改为安全探测 + fetch 兜底、移除依赖 process 的无效代码）；榜单/逐字歌词/评论仍走插件本地
 */
// axios 兼容层：不同 MusicFree 运行环境注入方式不同（require / __musicfree_require / 全局 fetch）
let axios = null;
try { if (typeof require === "function") axios = require("axios"); } catch (e) { axios = null; }
try { if (!axios && typeof __musicfree_require === "function") axios = __musicfree_require("axios"); } catch (e) { axios = null; }

// ============================ 配置（插件名拆段拼接） ============================
var _pn = ['xing', 'hai', '-music', '-source', '-qs', '.js'].join('');
var _rt = {
  base: 'https://yy.zddyr.top/lx/api',
  platform: '星海音乐源-汽水',
  plugin: _pn,
  update: 'https://zrcdy.dpdns.org/musicfree/qs/' + _pn
};

const QS_API = _rt.base + '/qs.php';
const PLAY_API = _rt.base + '/';
const PLATFORM = _rt.platform;
const UPDATE_URL = _rt.update;
const PAGE_SIZE = 20;
const QUALITY_MAP = { 'low': 'medium', 'standard': 'higher', 'high': 'highest', 'super': 'highest' };

// ============================ 汽水官方接口（插件本地直连） ============================
const LUNA = 'https://api.qishui.com';
const LUNA_PC_UA = 'LunaPC/3.3.0(359450208)';
const LUNA_WEB_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';
const LUNA_COMMON = 'aid=386088&device_platform=web&channel=pc_web';

// 官方榜单（汽水没有公开的榜单目录接口，这里内置四个官方榜）
const QS_TOPLISTS = [
  {
    id: '7036274230471712007', title: '热歌榜',
    description: '汽水音乐内每周热度最高的 50 首歌，每周四更新',
    coverImg: 'https://p3-luna.douyinpic.com/img/tos-cn-i-b829550vbb/d0d8d48461a62748e84689cdf049b19a.png~tplv-b829550vbb-resize:960:960.png'
  },
  {
    id: '7060812597884869927', title: '新歌榜',
    description: '近期发行的热度最高的 50 首新歌，每周四更新',
    coverImg: 'https://p3-luna.douyinpic.com/img/tos-cn-i-b829550vbb/f12f7eb5b54d0899c7c724df009668a8.png~tplv-b829550vbb-resize:960:960.png'
  },
  {
    id: '7061475546400005410', title: '欧美榜',
    description: '汽水音乐内每周热度最高的 50 首外文歌曲，每周四更新',
    coverImg: 'https://p3-luna.douyinpic.com/img/tos-cn-i-b829550vbb/33747550ed5499b58feda42a21748637.png~tplv-b829550vbb-resize:960:960.png'
  },
  {
    id: '7415959718721494311', title: '音乐人歌曲榜',
    description: '抖音音乐人开放平台上传歌曲，综合每周站内热度排序',
    coverImg: 'https://p3-luna.douyinpic.com/img/tos-cn-v-2774c002/o8FQKiQQBxHWa2hzsBNAgYOX6iEHEAibADAbfB~tplv-b829550vbb-resize:960:960.png'
  }
];

// ============================ HTTP ============================
async function _httpGet(url, timeout, headers) {
  timeout = timeout || 15;
  var hdrs = Object.assign({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json, text/plain, */*'
  }, headers || {});
  // 优先用 axios（标准白名单环境）
  if (axios && typeof axios.get === "function") {
    try {
      var resp = await axios.get(url, {
        timeout: timeout * 1000,
        headers: hdrs,
        validateStatus: function() { return true; }
      });
      return resp.data;
    } catch (e) { /* 回退 fetch */ }
  }
  // 回退到全局 fetch（WebView / Node18+ 均原生支持）
  var ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
  var timer = ctrl ? setTimeout(function() { ctrl.abort(); }, timeout * 1000) : null;
  try {
    var r = await fetch(url, { headers: hdrs, signal: ctrl ? ctrl.signal : undefined });
    var txt = await r.text();
    try { return JSON.parse(txt); } catch (e) { return txt; }
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// 汽水官方 JSON 接口（返回 Object，失败返回 null）
async function _lunaGet(path, params, ua) {
  const qs = Object.keys(params || {}).map(function(k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
  }).join('&');
  const url = LUNA + path + (qs ? ('?' + qs) : '');
  const data = await _httpGet(url, 15, {
    'User-Agent': ua || LUNA_WEB_UA,
    'Referer': 'https://music.douyin.com/'
  });
  if (typeof data === 'string') {
    try { return JSON.parse(data); } catch (e) { return null; }
  }
  return data || null;
}

// h5/seo_track 同时含曲目、逐字歌词、评论，做 60 秒内存缓存避免重复请求
var _seoCache = {};
async function _lunaSeoTrack(trackId) {
  var key = String(trackId);
  var hit = _seoCache[key];
  if (hit && Date.now() - hit.ts < 60000) return hit.data;
  var data = await _lunaGet('/luna/h5/seo_track', { track_id: key }, LUNA_WEB_UA);
  if (data) _seoCache[key] = { ts: Date.now(), data: data };
  return data;
}

// ============================ 榜单 ============================
function getTopLists() {
  return Promise.resolve([{ title: '汽水官方榜', data: QS_TOPLISTS.slice() }]);
}

function mapTrack(t) {
  if (!t || !t.id) return null;
  var artists = (t.artists || []).map(function(a) { return a && a.name; }).filter(Boolean).join(' / ');
  var covers = ((t.album || {}).url_cover || {}).urls || [];
  var durMs = parseInt(t.duration || 0, 10) || 0;
  if (durMs > 10000000) durMs = Math.floor(durMs / 1000); // 极少数返回微秒
  return {
    id: String(t.id),
    _songId: String(t.id),
    _rid: String(t.id),
    _qsId: String(t.id),
    _qsName: t.name || '',
    _qsArtist: artists,
    _vid: t.vid || '',
    title: t.name || '',
    artist: artists,
    album: (t.album || {}).name || '',
    duration: Math.floor(durMs / 1000),
    artwork: covers[0] || ''
  };
}

function getTopListDetail(topListItem, page) {
  var id = String(topListItem && topListItem.id || '');
  if (!id) return Promise.resolve({ isEnd: true, musicList: [] });
  var url = LUNA + '/luna/pc/charts/' + encodeURIComponent(id) + '?' + LUNA_COMMON;
  return _httpGet(url, 15, {
    'User-Agent': LUNA_PC_UA,
    'x-luna-background-type': 'foreground',
    'x-luna-is-background-req': '0',
    'x-luna-is-local-user': '1',
    'Referer': 'https://music.douyin.com/'
  }).then(function(data) {
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { data = null; } }
    var chart = data && data.chart;
    var ranks = (chart && chart.track_ranks) || [];
    var list = [];
    for (var i = 0; i < ranks.length; i++) {
      var item = mapTrack(ranks[i].track);
      if (item) {
        item._rank = (ranks[i].rank && parseInt(ranks[i].rank.rank, 10)) || (i + 1);
        list.push(item);
      }
    }
    return { isEnd: true, musicList: list };
  }).catch(function() {
    return { isEnd: true, musicList: [] };
  });
}

// ============================ 搜索 ============================
async function search(query, page, type) {
  if (type && type !== 'music') return { isEnd: true, data: [] };
  const currentPage = page || 1;
  const url = QS_API + '?action=search&keywords=' + encodeURIComponent(query) + '&page=' + currentPage;
  const data = await _httpGet(url);
  if (!data || data.code !== 200 || !Array.isArray(data.list)) {
    throw new Error('汽水搜索失败: ' + (data && data.msg || '未知错误'));
  }
  const list = data.list || [];
  const musicItems = list.map(function(s) {
    const id = String(s.id || '');
    const durationMs = s.duration ? parseInt(s.duration) : 0;
    const duration = durationMs > 1000 ? Math.floor(durationMs / 1000) : durationMs;
    return {
      id: id, _songId: id, _rid: id,
      title: s.name || '', artist: s.artist || '', album: s.album || '',
      duration: duration, artwork: s.cover || s.pic || '',
      _qsId: id, _qsName: s.name || '', _qsArtist: s.artist || ''
    };
  });
  return { isEnd: list.length < PAGE_SIZE, data: musicItems };
}

// ============================ 播放（服务端） ============================
async function getMediaSource(musicItem, quality) {
  const songId = musicItem._rid || musicItem._songId || musicItem.id || musicItem._qsId;
  if (!songId) throw new Error('歌曲ID缺失');
  const songName = musicItem._qsName || musicItem.title || '';
  const songArtist = musicItem._qsArtist || musicItem.artist || '';
  const qsQuality = QUALITY_MAP[quality] || 'highest';
  const url = PLAY_API + '?source=qs&name=' + encodeURIComponent(songName) + '&singer=' + encodeURIComponent(songArtist) + '&songmid=' + encodeURIComponent(songId) + '&quality=' + qsQuality;
  const data = await _httpGet(url, 20);
  if (!data || data.code !== 200 || !data.url) {
    throw new Error('汽水取链失败: ' + (data && data.msg || '无播放链接'));
  }
  return {
    url: data.url,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    quality: quality
  };
}

// ============================ 歌词（逐字，取不到退回整行） ============================
function _pad(n, w) {
  var s = String(n);
  while (s.length < (w || 2)) s = '0' + s;
  return s;
}

function _msToTag(ms) {
  ms = Math.max(0, Math.round(ms));
  var m = Math.floor(ms / 60000);
  var s = Math.floor((ms % 60000) / 1000);
  var x = ms % 1000;
  return '[' + _pad(m) + ':' + _pad(s) + '.' + _pad(x, 3) + ']';
}

// KRC 逐字：(QRC) [行起始ms,行时长ms]<字偏移ms,字时长ms,0>字...
// 转增强 LRC：[mm:ss.xxx]<mm:ss.xxx>字<...>字
function krcToLrc(content) {
  if (!content) return '';
  var lines = String(content).split(/\r?\n/);
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var m = line.match(/^\[(\d+),(\d+)\](.*)$/);
    if (!m) {
      if (line.trim()) out.push(line.trim());
      continue;
    }
    var lineStart = parseInt(m[1], 10) || 0;
    var body = m[3] || '';
    var words = [];
    var re = /<(\d+),(\d+),(-?\d+)>([^<]*)/g;
    var mm;
    var textAll = '';
    while ((mm = re.exec(body)) !== null) {
      var off = parseInt(mm[1], 10) || 0;
      var word = mm[4] || '';
      textAll += word;
      if (word) {
        words.push('<' + _msToTag(lineStart + off).slice(1, -1) + '>' + word);
      }
    }
    if (!words.length) {
      // 没有逐字标记，按整行处理
      if (textAll.trim() || body.trim()) out.push(_msToTag(lineStart) + (textAll || body).trim());
      continue;
    }
    out.push(_msToTag(lineStart) + words.join(''));
  }
  return out.join('\n');
}

async function getLyric(musicItem) {
  const songId = musicItem._rid || musicItem._songId || musicItem.id || musicItem._qsId;
  if (!songId) return null;

  // 1) 优先官方 KRC 逐字歌词
  try {
    var seo = await _lunaSeoTrack(songId);
    var ly = seo && seo.lyric;
    if (ly && ly.content) {
      var raw = String(ly.type || '').toLowerCase() === 'krc' ? krcToLrc(ly.content) : String(ly.content);
      if (raw && raw.trim()) return { rawLrc: raw };
    }
  } catch (err) {
    console.error('[星海-汽水] 逐字歌词获取失败，退回整行:', err.message);
  }

  // 2) 退回首行歌词（服务端）
  const eid = encodeURIComponent(String(songId));
  try {
    const url = QS_API + '?action=lyric&id=' + eid;
    const data = await _httpGet(url);
    if (data && data.code === 200 && data.lrc) {
      return { rawLrc: data.lrc, translation: data.txt || '' };
    }
    const detail = await _httpGet(QS_API + '?action=detail&id=' + eid);
    if (detail && detail.code === 200 && detail.lrc) {
      return { rawLrc: detail.lrc, translation: detail.txt || '' };
    }
    return null;
  } catch (err) {
    console.error('[星海-汽水] 获取歌词失败:', err.message);
    return null;
  }
}

// ============================ 评论 ============================
async function getMusicComments(musicItem, page) {
  if (page && page > 1) return { isEnd: true, data: [] };
  const songId = musicItem._rid || musicItem._songId || musicItem.id || musicItem._qsId;
  if (!songId) return { isEnd: true, data: [] };
  try {
    var seo = await _lunaSeoTrack(songId);
    var box = seo && seo.comments;
    var list = (box && box.comments) || [];
    var data = [];
    for (var i = 0; i < list.length; i++) {
      var c = list[i] || {};
      var u = c.user || {};
      var avatars = (u.medium_avatar_url || {}).urls || (u.thumb_avatar_url || {}).urls || [];
      data.push({
        id: String(c.id || ''),
        userName: u.public_name || u.nickname || '',
        avatar: avatars[0] || '',
        content: c.content || '',
        like: parseInt(c.count_digged || 0, 10) || 0,
        timestamp: (parseInt(c.time_created || 0, 10) || 0) * 1000,
        replyNum: parseInt(c.reply_comment_total || 0, 10) || 0,
        location: c.ip_label || ''
      });
    }
    return { isEnd: true, data: data, total: (box && box.count) || data.length };
  } catch (err) {
    console.error('[星海-汽水] 获取评论失败:', err.message);
    return { isEnd: true, data: [] };
  }
}

// ============================ 详情 ============================
async function getMusicInfo(musicItem) { return musicItem; }

// ============================ 导出 ============================
module.exports = {
  platform: PLATFORM, version: "1.2.1", author: "万去了了",
  srcUrl: UPDATE_URL, cacheControl: "no-cache",
  supportedSearchType: ["music"],
  primaryKey: ["id", "_songId", "_rid"],
  hints: { feedback: ["问题反馈: https://zrcdy.dpdns.org/lx/fk/index.html"] },
  search: search, getMediaSource: getMediaSource,
  getLyric: getLyric, getMusicInfo: getMusicInfo,
  getTopLists: getTopLists, getTopListDetail: getTopListDetail,
  getMusicComments: getMusicComments
};
