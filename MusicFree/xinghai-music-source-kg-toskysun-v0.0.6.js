/**
 * @name 星海音乐源kg
 * @description MusicFree
 * @author 万去了了
 * @version 0.0.6
 * @Update 0.0.6：修复音质传递——音质映射表缺少 atmos/dolby/tape，
 *                导致选择"全景音"时被兜底成 128k（或返回母带），拿不到真正的全景声。
 *                现补全三档直通后端；并为 MusicFree 内置音质枚举（low/standard/high/super）
 *                增加映射，未识别音质兜底改为 320k（原为 128k）。
 *                同时播放改用该档位自己的 hash（qualities[q].hash 优先，回退主 hash），
 *                与 LX 的 types[quality].hash 行为一致。
 * @Update 0.0.5：修复歌词接口失效——旧版歌词接口已归档下线，
 *                改为直连酷狗官方歌词接口（lyrics.kugou.com 搜索 + 下载 + Base64 解码），
 *                恢复歌词获取（标准 LRC）。
 *                修复歌单/专辑详情中歌曲标题与歌手解析错误：接口只有 filename("歌手 - 歌名")，
 *                原先被直接当作 songname，导致标题是整串、歌手为空；现改走 parseFilename 拆分。
 *                修复 importMusicSheet 无法识别歌单时同步抛错（改为返回 rejected Promise）。
 */

var PLUGIN_VERSION = '0.0.6';
var PLATFORM = '星海kg';
var UPDATE_URL = '';
var PAGE_SIZE = 20;

// ========== 常量 ==========

var DFID = '4FHmC13bOoFu3sMxa31Eh55n';
var MID  = md5(DFID);
var UUID = md5(DFID + MID);

var ANDROID_SECRET = 'OIlwieks28dk2k092lksi2UIkp';

// ========== 请求限速(2秒间隔) ==========

var _lastThrottled = 0;
var THROTTLE_MS = 2100;

function _throttledHttpGet(url, headers, timeout) {
  var now = Date.now();
  var wait = Math.max(0, _lastThrottled + THROTTLE_MS - now);
  _lastThrottled = Math.max(_lastThrottled, now) + Math.max(0, wait);
  if (wait > 0) {
    return new Promise(function(resolve, reject) {
      setTimeout(function() {
        httpGet(url, headers, timeout).then(resolve).catch(reject);
      }, wait);
    });
  }
  return httpGet(url, headers, timeout);
}

function _throttledHttpPost(url, body, headers, timeout) {
  var now = Date.now();
  var wait = Math.max(0, _lastThrottled + THROTTLE_MS - now);
  _lastThrottled = Math.max(_lastThrottled, now) + Math.max(0, wait);
  if (wait > 0) {
    return new Promise(function(resolve, reject) {
      setTimeout(function() {
        httpPost(url, body, headers, timeout).then(resolve).catch(reject);
      }, wait);
    });
  }
  return httpPost(url, body, headers, timeout);
}

// ========== 音质映射 ==========

var QUALITY_MAP = {
  '128k': '128k',
  '320k': '320k',
  'flac': 'flac',
  'hires': 'hires',
  'master': 'master',
  // 2026-11-01 补：全景声/杜比/磁带 三档此前缺失，选"全景音"会掉回 128k
  'atmos': 'atmos',
  'atmos_plus': 'atmos',
  'dolby': 'dolby',
  'tape': 'tape'
};

// MusicFree 内置音质枚举兜底（插件未声明时宿主会传这 4 个值，原先一律掉 128k）
var MUSICFREE_QUALITY_ALIAS = {
  'low': '128k',
  'standard': '128k',
  'high': '320k',
  'super': 'flac'
};

// ========== MD5 ==========

function md5(string) {
  function cmn(q, a, b, x, s, t) { return add(rol(add(add(a, q), add(x, t)), s), b); }
  function ff(a, b, c, d, x, s, t) { return cmn(b & c | ~b & d, a, b, x, s, t); }
  function gg(a, b, c, d, x, s, t) { return cmn(b & d | c & ~d, a, b, x, s, t); }
  function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
  function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }
  function add(x, y) { var lsw = (x & 0xFFFF) + (y & 0xFFFF); var msw = (x >> 16) + (y >> 16) + (lsw >> 16); return (msw << 16) | (lsw & 0xFFFF); }
  function rol(num, cnt) { return (num << cnt) | (num >>> (32 - cnt)); }
  function str2blks(str) {
    var nblk = ((str.length + 8) >> 6) + 1;
    var blks = new Array(nblk * 16);
    for (var i = 0; i < nblk * 16; i++) blks[i] = 0;
    for (var i = 0; i < str.length; i++) blks[i >> 2] |= str.charCodeAt(i) << ((i % 4) * 8);
    blks[i >> 2] |= 0x80 << ((i % 4) * 8);
    blks[nblk * 16 - 2] = str.length * 8;
    return blks;
  }
  var x = str2blks(string);
  var a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
  for (var i = 0; i < x.length; i += 16) {
    var oa = a, ob = b, oc = c, od = d;
    a = ff(a, b, c, d, x[i+0], 7, -680876936); d = ff(d, a, b, c, x[i+1], 12, -389564586); c = ff(c, d, a, b, x[i+2], 17, 606105819); b = ff(b, c, d, a, x[i+3], 22, -1044525330);
    a = ff(a, b, c, d, x[i+4], 7, -176418897); d = ff(d, a, b, c, x[i+5], 12, 1200080426); c = ff(c, d, a, b, x[i+6], 17, -1473231341); b = ff(b, c, d, a, x[i+7], 22, -45705983);
    a = ff(a, b, c, d, x[i+8], 7, 1770035416); d = ff(d, a, b, c, x[i+9], 12, -1958414417); c = ff(c, d, a, b, x[i+10], 17, -42063); b = ff(b, c, d, a, x[i+11], 22, -1990404162);
    a = ff(a, b, c, d, x[i+12], 7, 1804603682); d = ff(d, a, b, c, x[i+13], 12, -40341101); c = ff(c, d, a, b, x[i+14], 17, -1502002290); b = ff(b, c, d, a, x[i+15], 22, 1236535329);
    a = gg(a, b, c, d, x[i+1], 5, -165796510); d = gg(d, a, b, c, x[i+6], 9, -1069501632); c = gg(c, d, a, b, x[i+11], 14, 643717713); b = gg(b, c, d, a, x[i+0], 20, -373897302);
    a = gg(a, b, c, d, x[i+5], 5, -701558691); d = gg(d, a, b, c, x[i+10], 9, 38016083); c = gg(c, d, a, b, x[i+15], 14, -660478335); b = gg(b, c, d, a, x[i+3], 20, -405537848);
    a = gg(a, b, c, d, x[i+8], 5, 568446438); d = gg(d, a, b, c, x[i+13], 9, -1019803690); c = gg(c, d, a, b, x[i+2], 14, -187363961); b = gg(b, c, d, a, x[i+7], 20, 1163531501);
    a = gg(a, b, c, d, x[i+12], 5, -1444681467); d = gg(d, a, b, c, x[i+1], 9, -51403784); c = gg(c, d, a, b, x[i+6], 14, 1735328473); b = gg(b, c, d, a, x[i+11], 20, -1926607734);
    a = hh(a, b, c, d, x[i+5], 4, -378558); d = hh(d, a, b, c, x[i+8], 11, -2022574463); c = hh(c, d, a, b, x[i+11], 16, 1839030562); b = hh(b, c, d, a, x[i+14], 23, -35309556);
    a = hh(a, b, c, d, x[i+1], 4, -1530992060); d = hh(d, a, b, c, x[i+4], 11, 1272893353); c = hh(c, d, a, b, x[i+7], 16, -155497632); b = hh(b, c, d, a, x[i+10], 23, -1094730640);
    a = hh(a, b, c, d, x[i+13], 4, 681279174); d = hh(d, a, b, c, x[i+0], 11, -358537222); c = hh(c, d, a, b, x[i+3], 16, -722521979); b = hh(b, c, d, a, x[i+6], 23, 76029189);
    a = hh(a, b, c, d, x[i+9], 4, -640364487); d = hh(d, a, b, c, x[i+12], 11, -421815835); c = hh(c, d, a, b, x[i+15], 16, 530742520); b = hh(b, c, d, a, x[i+2], 23, -995338651);
    a = ii(a, b, c, d, x[i+0], 6, -198630844); d = ii(d, a, b, c, x[i+7], 10, 1126891415); c = ii(c, d, a, b, x[i+14], 15, -1416354905); b = ii(b, c, d, a, x[i+5], 21, -57434055);
    a = ii(a, b, c, d, x[i+12], 6, 1700485571); d = ii(d, a, b, c, x[i+3], 10, -1894986606); c = ii(c, d, a, b, x[i+10], 15, -1051523); b = ii(b, c, d, a, x[i+1], 21, -2054922799);
    a = ii(a, b, c, d, x[i+8], 6, 1873313359); d = ii(d, a, b, c, x[i+15], 10, -30611744); c = ii(c, d, a, b, x[i+6], 15, -1560198380); b = ii(b, c, d, a, x[i+13], 21, 1309151649);
    a = ii(a, b, c, d, x[i+4], 6, -145523070); d = ii(d, a, b, c, x[i+11], 10, -1120210379); c = ii(c, d, a, b, x[i+2], 15, 718787259); b = ii(b, c, d, a, x[i+9], 21, -343485551);
    a = add(a, oa); b = add(b, ob); c = add(c, oc); d = add(d, od);
  }
  function toHex(val) { var hex = ''; for (var i = 0; i < 4; i++) hex += ('0' + (val >> (i * 8 + 4) & 0x0F).toString(16)) + ('' + (val >> (i * 8) & 0x0F).toString(16)); return hex; }
  return (toHex(a) + toHex(b) + toHex(c) + toHex(d)).toLowerCase();
}

// ========== 签名 ==========

function androidSign(params, body) {
  var keys = Object.keys(params).sort();
  var str = keys.map(function(k) { return k + '=' + params[k]; }).join('');
  return md5(ANDROID_SECRET + str + (body || '') + ANDROID_SECRET);
}

// ========== 工具函数 ==========

function decodeName(str) {
  if (!str) return '';
  if (typeof str !== 'string') str = String(str);
  return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

function objStr2JSON(str) {
  if (!str) return null;
  try { return JSON.parse(str); } catch (e) {}
  return null;
}

function httpGet(url, headers, timeout) {
  return new Promise(function(resolve, reject) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.timeout = timeout || 10000;
      if (headers) {
        Object.keys(headers).forEach(function(k) { xhr.setRequestHeader(k, headers[k]); });
      }
      xhr.onload = function() { resolve(xhr.responseText || ''); };
      xhr.onerror = function() { reject(new Error('XHR error')); };
      xhr.ontimeout = function() { reject(new Error('XHR timeout')); };
      xhr.send();
    } catch (e) { reject(e); }
  });
}

function httpPost(url, body, headers, timeout) {
  return new Promise(function(resolve, reject) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.timeout = timeout || 8000;
      if (headers) {
        Object.keys(headers).forEach(function(k) { xhr.setRequestHeader(k, headers[k]); });
      }
      xhr.onload = function() { resolve(xhr.responseText || ''); };
      xhr.onerror = function() { reject(new Error('XHR error')); };
      xhr.ontimeout = function() { reject(new Error('XHR timeout')); };
      xhr.send(body || '');
    } catch (e) { reject(e); }
  });
}

function buildUrl(base, params) {
  var parts = [];
  Object.keys(params).forEach(function(k) {
    if (params[k] !== null && params[k] !== undefined) {
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
    }
  });
  return base + (base.indexOf('?') === -1 ? '?' : '&') + parts.join('&');
}

function buildCover(albumId, imgUrl) {
  if (imgUrl && imgUrl.indexOf('http') === 0) return imgUrl.replace('http://', 'https://').replace(/\{size\}/g, '480');
  if (albumId && albumId !== '0') return 'https://imge.kugou.com/stdmusic/480/' + albumId + '.jpg';
  return '';
}

function buildSingerCover(singerImg) {
  if (!singerImg) return '';
  return singerImg.replace('http://', 'https://').replace(/\{size\}/g, '400');
}

function parseFilename(filename) {
  if (!filename) return { artist: '', title: '' };
  var name = decodeName(filename).replace(/\.(mp3|flac|wma|wav|ape|ogg|m4a)$/i, '');
  var idx = name.lastIndexOf(' - ');
  if (idx === -1) return { artist: '', title: name };
  return { artist: name.substring(0, idx).trim(), title: name.substring(idx + 3).trim() };
}

// ========== 歌曲映射 ==========

function mapSongItem(item, qualityInfo) {
  var hash = String((item.hash || item.Hash || '')).toLowerCase();
  var albumId = String(item.album_id || item.albumid || item.AlbumId || '');

  var title, artist;
  var songname = item.songname || item.SongName;
  var singername = item.singername || item.SingerName || item.author_name;
  if (!singername && item.authors && item.authors.length) {
    singername = item.authors.map(function(a) { return a.author_name; }).join('、');
  }

  if (songname) {
    title = decodeName(songname);
    artist = decodeName(singername || '');
  } else if (item.filename) {
    var parsed = parseFilename(item.filename);
    title = parsed.title;
    artist = parsed.artist;
  } else {
    title = '';
    artist = '';
  }

  var rawImg = (item.trans_param && item.trans_param.union_cover) || item.imgUrl || item.union_cover || '';
  var cover = buildCover(albumId, rawImg);

  var qualities = qualityInfo || {};

  return {
    id: hash,
    title: title,
    artist: artist,
    album: decodeName(item.album_name || item.AlbumName || item.albumName || ''),
    albumId: albumId,
    duration: parseInt(item.duration || item.timeLength || '0', 10) || 0,
    artwork: cover,
    qualities: qualities,
    _audioId: parseInt(item.audio_id || item.AudioId || '0', 10) || 0,
    _albumAudioId: parseInt(item.album_audio_id || item.AlbumAudioId || '0', 10) || 0,
    _hash: hash,
    _albumName: decodeName(item.album_name || item.albumName || item.AlbumName || '')
  };
}

function mapAlbumItem(a) {
  var pic = buildCover(a.albumid || a.album_id || '', a.imgurl || a.imgUrl || a.img);
  return {
    id: String(a.albumid || a.album_id || ''),
    title: decodeName(a.albumname || a.album_name || a.name || ''),
    name: decodeName(a.albumname || a.album_name || a.name || ''),
    artist: decodeName(a.singername || a.SingerName || a.author_name || ''),
    artwork: pic,
    coverImg: pic,
    description: decodeName(a.intro || a.description || ''),
    publishTime: a.publishtime || a.publish_time || ''
  };
}

function mapSingerItem(s, info) {
  var id = String(s.singerid || s.SingerId || '');
  var name = decodeName(s.singername || s.SingerName || '');
  var avatar = '';
  var worksNum = 0;
  var description = '';

  if (info) {
    avatar = buildSingerCover(info.imgurl || info.sizable_avatar || '');
    worksNum = parseInt(info.songcount || info.song_count || '0', 10) || 0;
    description = decodeName(info.profile || info.intro || '');
  }

  return {
    id: id,
    title: name,
    name: name,
    avatar: avatar,
    description: description,
    worksNum: worksNum,
    _singerId: id
  };
}

// ========== 音质查询（网关 API）==========

function getBatchMusicQualityInfo(hashList) {
  if (!hashList || !hashList.length) return Promise.resolve({});

  var resources = hashList.map(function(hash) {
    return { id: 0, type: 'audio', hash: hash };
  });

  var body = JSON.stringify({
    behavior: 'play',
    clientver: '20049',
    resource: resources,
    area_code: '1',
    quality: '128',
    qualities: ['128', '320', 'flac', 'high', 'dolby', 'viper_atmos', 'viper_tape', 'viper_clear']
  });

  return _throttledHttpPost(
    'https://gateway.kugou.com/goodsmstore/v1/get_res_privilege?appid=1005&clientver=20049&clienttime=' + Date.now() + '&mid=' + MID,
    body,
    {
      'Content-Type': 'application/json',
      'User-Agent': 'MusicFreetss'
    },
    10000
  ).then(function(r) {
    var data = objStr2JSON(r);
    var qualityInfoMap = {};

    if (data && data.error_code === 0 && data.data) {
      data.data.forEach(function(songData, index) {
        var hash = hashList[index];
        var qualities = {};

        if (!songData || !songData.relate_goods) {
          qualityInfoMap[hash] = qualities;
          return;
        }

        for (var j = 0; j < songData.relate_goods.length; j++) {
          var qd = songData.relate_goods[j];
          var size = qd.info && qd.info.filesize;
          if (!size) continue;

          switch (qd.quality) {
            case '128': qualities['128k'] = { size: formatFileSize(size), bitrate: 128000, hash: qd.hash }; break;
            case '320': qualities['320k'] = { size: formatFileSize(size), bitrate: 320000, hash: qd.hash }; break;
            case 'flac': qualities['flac'] = { size: formatFileSize(size), bitrate: 1411000, hash: qd.hash }; break;
            case 'high': qualities['hires'] = { size: formatFileSize(size), bitrate: 2304000, hash: qd.hash }; break;
            case 'viper_clear': qualities['master'] = { size: formatFileSize(size), bitrate: 4608000, hash: qd.hash }; break;
            case 'viper_atmos': qualities['atmos'] = { size: formatFileSize(size), bitrate: 1411000, hash: qd.hash }; break;
            case 'dolby': qualities['dolby'] = { size: formatFileSize(size), bitrate: 640000, hash: qd.hash }; break;
            case 'viper_tape': qualities['tape'] = { size: formatFileSize(size), bitrate: 1411000, hash: qd.hash }; break;
          }
        }

        if (Object.keys(qualities).length === 0) {
          qualities['128k'] = {};
          qualities['320k'] = {};
          qualities['flac'] = {};
        }

        qualityInfoMap[hash] = qualities;
      });
    }

    return qualityInfoMap;
  }).catch(function() {
    console.warn('[KG] 音质查询失败');
    return {};
  });
}

function formatFileSize(bytes) {
  if (!bytes || bytes < 1024) return (bytes || 0) + 'B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / 1048576).toFixed(1) + 'MB';
}

// ========== 搜索 ==========

function kgSearchMusic(keyword, page) {
  var u = 'https://msearch.kugou.com/api/v3/search/song?format=json' +
    '&keyword=' + encodeURIComponent(keyword) +
    '&page=' + page + '&pagesize=' + PAGE_SIZE + '&showtype=1';

  return httpGet(u, { 'User-Agent': 'MusicFreetss' }, 8000).then(function(r) {
    var data = objStr2JSON(r);
    if (!data || data.status !== 1) throw new Error('search failed');
    var info = data.data && data.data.info || [];
    var total = parseInt(data.data && data.data.total || '0', 10);

    var hashList = info.map(function(s) { return (s.hash || '').toLowerCase(); }).filter(Boolean);

    return getBatchMusicQualityInfo(hashList).then(function(qMap) {
      return {
        isEnd: (page * PAGE_SIZE) >= total,
        data: info.map(function(s) {
          return mapSongItem(s, qMap[(s.hash || '').toLowerCase()]);
        })
      };
    });
  }).catch(function() {
    return { isEnd: true, data: [] };
  });
}

function kgSearchAlbum(keyword, page) {
  var u = 'https://msearch.kugou.com/api/v3/search/album?format=json' +
    '&keyword=' + encodeURIComponent(keyword) +
    '&page=' + page + '&pagesize=' + PAGE_SIZE;
  return httpGet(u, { 'User-Agent': 'MusicFreetss' }, 8000).then(function(r) {
    var data = objStr2JSON(r);
    if (!data || data.status !== 1) return { isEnd: true, data: [] };
    var info = data.data && data.data.info || [];
    return {
      isEnd: info.length < PAGE_SIZE,
      data: info.map(mapAlbumItem)
    };
  }).catch(function() { return { isEnd: true, data: [] }; });
}

function kgSearchArtist(keyword, page) {
  var u = 'http://mobilecdn.kugou.com/api/v3/search/singer?' +
    'version=9108&keyword=' + encodeURIComponent(keyword) +
    '&page=' + page + '&pagesize=' + PAGE_SIZE +
    '&singingtype=-100&accuracy=1&istag=1&area_code=1';

  return httpGet(u, {
    'User-Agent': 'MusicFreetss'
  }, 8000).then(function(r) {
    var data = objStr2JSON(r);
    if (!data || data.status !== 1 || !data.data) return { isEnd: true, data: [] };
    var list = data.data.info || data.data || [];

    var promises = list.map(function(s) {
      var singerId = String(s.singerid || '');
      if (!singerId) return Promise.resolve(mapSingerItem(s));
      return kgGetArtistInfo(singerId).then(function(info) {
        return mapSingerItem(s, info);
      }).catch(function() {
        return mapSingerItem(s);
      });
    });

    return Promise.all(promises).then(function(enriched) {
      return { isEnd: list.length < PAGE_SIZE, data: enriched };
    });
  }).catch(function() {
    return { isEnd: true, data: [] };
  });
}

function kgSearchPlaylist(keyword, page) {
  var u = 'https://msearch.kugou.com/api/v3/search/special?format=json' +
    '&keyword=' + encodeURIComponent(keyword) +
    '&page=' + page + '&pagesize=' + PAGE_SIZE;
  return httpGet(u, { 'User-Agent': 'MusicFreetss' }, 8000).then(function(r) {
    var data = objStr2JSON(r);
    if (!data || data.status !== 1) return { isEnd: true, data: [] };
    var info = data.data && data.data.info || [];
    return {
      isEnd: info.length < PAGE_SIZE,
      data: info.map(function(s) {
        return {
          id: 'special_' + String(s.specialid || ''),
          title: decodeName(s.specialname || ''),
          artist: decodeName(s.nickname || ''),
          artwork: (s.imgurl || '').replace(/\{size\}/g, '480'),
          description: decodeName(s.intro || ''),
          playCount: parseInt(s.playcount || '0', 10) || 0,
          worksNums: parseInt(s.songcount || '0', 10) || 0
        };
      })
    };
  }).catch(function() { return { isEnd: true, data: [] }; });
}

// ========== 榜单 ==========

function kgGetTopLists() {
  return httpGet('http://m.kugou.com/rank/list&json=true', {
    'User-Agent': 'MusicFreetss'
  }, 8000).then(function(r) {
    var data = objStr2JSON(r);
    if (!data || !data.rank || !data.rank.list) return [];
    var all = data.rank.list;
    var groups = [
      { title: '官方榜', data: [] },
      { title: '地区榜', data: [] },
      { title: '特色榜', data: [] }
    ];

    var official = { '8888': true, '6666': true, '74534': true, '33162': true, '52144': true };
    var regional = { '31308': true, '54848': true, '31313': true, '31310': true, '31311': true, '31312': true };

    for (var i = 0; i < all.length; i++) {
      var r = all[i];
      var rid = String(r.rankid || '');
      var cover = r.banner_9 || r.img_9 || r.banner7url || '';
      var item = {
        id: rid,
        title: decodeName(r.rankname || ''),
        description: decodeName(r.intro || ''),
        artwork: buildCover('', cover),
        coverImg: buildCover('', cover),
        playCount: parseInt(r.play_times || '0', 10) || 0
      };
      if (official[rid]) groups[0].data.push(item);
      else if (regional[rid]) groups[1].data.push(item);
      else groups[2].data.push(item);
    }
    return groups.filter(function(g) { return g.data.length > 0; });
  }).catch(function() { return []; });
}

function kgGetRankDetail(rankId, page) {
  var u = 'http://mobilecdn.kugou.com/api/v3/rank/song?format=json&rankid=' +
    rankId + '&page=' + page + '&pagesize=' + PAGE_SIZE;
  return httpGet(u, {
    'User-Agent': 'MusicFreetss',
    'Referer': 'http://m.kugou.com/'
  }, 12000).then(function(r) {
    var data = objStr2JSON(r);
    if (!data || !data.data) return { isEnd: true, musicList: [] };
    var info = data.data.info || [];
    var total = parseInt(data.data.total || '0', 10);

    var hashList = info.map(function(s) { return (s.hash || '').toLowerCase(); }).filter(Boolean);

    return getBatchMusicQualityInfo(hashList).then(function(qMap) {
      return {
        isEnd: (page * PAGE_SIZE) >= total,
        musicList: info.map(function(s) {
          return mapSongItem(s, qMap[(s.hash || '').toLowerCase()]);
        })
      };
    });
  }).catch(function() {
    return { isEnd: true, musicList: [] };
  });
}

// ========== 歌单 ==========

function kgGetRecSheetTags() {
  return Promise.resolve({
    data: [{
      title: '推荐歌单',
      data: [
        { id: 'all', title: '全部' }, { id: 'pop', title: '流行' }, { id: 'dj', title: 'DJ' },
        { id: 'classic', title: '经典' }, { id: 'pure', title: '纯音乐' }, { id: 'rock', title: '摇滚' },
        { id: 'folk', title: '民谣' }, { id: 'electron', title: '电音' }, { id: 'ancient', title: '古风' },
        { id: 'douyin', title: '抖音热歌' }, { id: 'network', title: '网络歌曲' }
      ]
    }]
  });
}

function kgGetRecSheets(tag, page) {
  return httpGet('http://m.kugou.com/plist/index&json=true&page=' + page, {
    'User-Agent': 'MusicFreetss'
  }, 8000).then(function(r) {
    var data = objStr2JSON(r);
    if (!data || !data.plist) return { isEnd: true, data: [] };
    var info = data.plist.list && data.plist.list.info || [];
    return {
      isEnd: info.length < PAGE_SIZE,
      data: info.map(function(item) {
        var cover = (item.imgurl || '').replace('http://', 'https://').replace(/\{size\}/g, '480');
        return {
          id: 'special_' + String(item.specialid || ''),
          title: decodeName(item.specialname || ''),
          artist: decodeName(item.username || ''),
          artwork: cover,
          coverImg: cover,
          playCount: parseInt(item.playcount || '0', 10) || 0,
          worksNum: parseInt(item.songcount || '0', 10) || 0
        };
      })
    };
  }).catch(function() { return { isEnd: true, data: [] }; });
}

function kgGetSheetDetail(sheetId, page) {
  var u = 'http://mobilecdn.kugou.com/api/v3/special/song?format=json&specialid=' +
    sheetId + '&page=' + page + '&pagesize=' + PAGE_SIZE;

  return httpGet(u, {
    'User-Agent': 'MusicFreetss',
    'Referer': 'http://m.kugou.com/'
  }, 12000).then(function(r) {
    var data = objStr2JSON(r);
    if (!data || !data.data) return { isEnd: true, musicList: [] };
    var info = data.data.info || [];
    var total = parseInt(data.data.total || '0', 10);

    var hashList = info.map(function(s) { return (s.hash || '').toLowerCase(); }).filter(Boolean);

    return getBatchMusicQualityInfo(hashList).then(function(qMap) {
      return {
        isEnd: (page * PAGE_SIZE) >= total,
        musicList: info.map(function(s) {
          return mapSongItem({
            hash: s.hash,
            songname: s.songname,
            filename: s.filename,
            album_id: String(s.album_id || ''),
            album_name: s.album_name || '',
            duration: s.duration,
            audio_id: s.audio_id,
            album_audio_id: s.album_audio_id,
            sqhash: s.sqhash,
            '320hash': s['320hash'],
            authors: s.authors,
            trans_param: s.trans_param
          }, qMap[(s.hash || '').toLowerCase()]);
        })
      };
    });
  }).catch(function() {
    return { isEnd: true, musicList: [] };
  });
}

// ========== 专辑 ==========

function kgGetAlbumDetail(albumId, page) {
  var u = 'http://mobilecdn.kugou.com/api/v3/album/song?format=json&albumid=' +
    albumId + '&page=' + page + '&pagesize=' + PAGE_SIZE;
  return httpGet(u, {
    'User-Agent': 'MusicFreetss',
    'Referer': 'http://m.kugou.com/'
  }, 10000).then(function(r) {
    var data = objStr2JSON(r);
    if (!data || !data.data) return { isEnd: true, data: [] };
    var info = data.data.info || [];
    var total = parseInt(data.data.total || '0', 10);

    var hashList = info.map(function(s) { return (s.hash || '').toLowerCase(); }).filter(Boolean);

    return getBatchMusicQualityInfo(hashList).then(function(qMap) {
      return {
        isEnd: (page * PAGE_SIZE) >= total,
        data: info.map(function(s) {
          return mapSongItem({
            hash: s.hash,
            songname: s.songname,
            filename: s.filename,
            album_id: String(s.album_id || albumId),
            album_name: s.album_name || '',
            duration: s.duration,
            audio_id: s.audio_id,
            album_audio_id: s.album_audio_id,
            sqhash: s.sqhash,
            '320hash': s['320hash'],
            authors: s.authors
          }, qMap[(s.hash || '').toLowerCase()]);
        })
      };
    });
  }).catch(function() { return { isEnd: true, data: [] }; });
}

// ========== 歌手（直连 KuGou API）==========

function kgGetArtistInfo(singerId) {
  var u = buildUrl('http://mobilecdn.kugou.com/api/v3/singer/info', {
    version: 9108, singerid: singerId, area_code: 1
  });
  return httpGet(u, { 'User-Agent': 'MusicFreetss' }, 8000).then(function(r) {
    var data = objStr2JSON(r);
    if (!data || data.status !== 1 || !data.data) return null;
    return data.data;
  }).catch(function() { return null; });
}

function kgGetArtistSongs(singerId, page) {
  var u = buildUrl('http://mobilecdn.kugou.com/api/v3/singer/song', {
    version: 9108, singerid: singerId, page: page, pagesize: 100, sorttype: 1, area_code: 1
  });
  return httpGet(u, { 'User-Agent': 'MusicFreetss' }, 10000).then(function(r) {
    var data = objStr2JSON(r);
    if (!data || data.status !== 1 || !data.data) return { isEnd: true, data: [] };
    var info = data.data.info || [];
    var total = parseInt(data.data.total || '0', 10);

    var hashList = info.map(function(s) { return (s.hash || '').toLowerCase(); }).filter(Boolean);

    return getBatchMusicQualityInfo(hashList).then(function(qMap) {
      return {
        isEnd: (page * 100) >= total,
        data: info.map(function(s) {
          return mapSongItem({
            hash: s.hash,
            filename: s.filename,
            album_id: String(s.album_id || ''),
            album_name: s.album_name || '',
            duration: s.duration,
            audio_id: s.audio_id,
            album_audio_id: s.album_audio_id
          }, qMap[(s.hash || '').toLowerCase()]);
        })
      };
    });
  }).catch(function() { return { isEnd: true, data: [] }; });
}

function kgGetArtistAlbums(singerId, page) {
  var u = buildUrl('http://mobilecdn.kugou.com/api/v3/singer/album', {
    version: 9108, singerid: singerId, page: page, pagesize: 20, area_code: 1
  });
  return httpGet(u, { 'User-Agent': 'MusicFreetss' }, 10000).then(function(r) {
    var data = objStr2JSON(r);
    if (!data || data.status !== 1 || !data.data) return { isEnd: true, data: [] };
    var info = data.data.info || [];
    var total = parseInt(data.data.total || '0', 10);
    return {
      isEnd: (page * 20) >= total,
      data: info.map(function(a) {
        return mapAlbumItem({
          albumid: a.albumid,
          albumname: a.albumname,
          singername: a.singername,
          imgurl: a.imgurl,
          intro: a.intro,
          publishtime: a.publishtime
        });
      })
    };
  }).catch(function() { return { isEnd: true, data: [] }; });
}

function kgResolveSingerId(name, hintId) {
  if (hintId && /^\d+$/.test(String(hintId))) return Promise.resolve(String(hintId));
  if (!name) return Promise.resolve('');

  var u = buildUrl('http://mobilecdn.kugou.com/api/v3/search/singer', {
    version: 9108, keyword: name, page: 1, pagesize: 5,
    singingtype: -100, accuracy: 1, area_code: 1
  });
  return httpGet(u, { 'User-Agent': 'MusicFreetss' }, 8000).then(function(r) {
    var data = objStr2JSON(r);
    if (!data || data.status !== 1 || !data.data) return '';
    var list = data.data.info || data.data || [];
    for (var i = 0; i < list.length; i++) {
      if ((list[i].singername || '').trim().toLowerCase() === name.trim().toLowerCase()) {
        return String(list[i].singerid || '');
      }
    }
    return list.length > 0 ? String(list[0].singerid || '') : '';
  }).catch(function() { return ''; });
}

// ========== 播放 ==========

function kgGetPlayData(musicItem, quality) {
  var hash = (musicItem._hash || musicItem.id || '').toLowerCase();
  var qualityParam = QUALITY_MAP[quality] || MUSICFREE_QUALITY_ALIAS[quality] || '320k';

  // 酷狗不同音质档有各自的 hash（get_res_privilege 每档返回独立 hash），
  // 优先用该档位的 hash，取不到再回退主 hash —— 与 LX 的 types[quality].hash 行为一致
  var qInfo = (musicItem.qualities && musicItem.qualities[quality]) || null;
  var playHash = (qInfo && qInfo.hash ? String(qInfo.hash) : hash).toLowerCase();

  console.log('[KG] play: hash=' + hash + ' playHash=' + playHash + ' quality=' + quality + '→' + qualityParam);

  if (!playHash) return Promise.reject(new Error('no hash'));

  var albumId = musicItem.albumId || '0';
  var u = 'https://yy.zddyr.top/lx/api/?source=kg&quality=' + qualityParam +
    '&songmid=0&albumId=' + encodeURIComponent(albumId) +
    '&mainHash=' + playHash + '&hash=' + playHash;

  return _throttledHttpGet(u, { 'User-Agent': 'MusicFreetss' }, 12000).then(function(r) {
    var data = objStr2JSON(r);
    if (!data) throw new Error('API格式错误');
    if (data.code !== 200 || !data.url) throw new Error('获取播放地址失败(code=' + data.code + ')');

    var url = (data.url || '').replace(/^http:\/\//i, 'https://');
    return { url: url };
  }).catch(function(e) {
    console.warn('[KG] play异常: ' + (e && e.message));
    throw e;
  });
}

// ========== 歌词（独立接口，KRC -> 逐字格式）==========

var lyricCache = {};

// ========== Base64 / UTF-8 解码（不依赖运行环境是否有 atob / Buffer）==========

var B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

function kgBase64ToBytes(input) {
  var str = String(input || '').replace(/[^A-Za-z0-9+/=]/g, '');
  var bytes = [];
  var enc1, enc2, enc3, enc4;
  for (var i = 0; i < str.length;) {
    enc1 = B64_CHARS.indexOf(str.charAt(i++));
    enc2 = B64_CHARS.indexOf(str.charAt(i++));
    enc3 = B64_CHARS.indexOf(str.charAt(i++));
    enc4 = B64_CHARS.indexOf(str.charAt(i++));
    if (enc1 === -1 || enc2 === -1) break;
    bytes.push((enc1 << 2) | (enc2 >> 4));
    if (enc3 !== -1 && enc3 !== 64) bytes.push(((enc2 & 15) << 4) | (enc3 >> 2));
    if (enc4 !== -1 && enc4 !== 64) bytes.push(((enc3 & 3) << 6) | enc4);
  }
  return bytes;
}

function kgUtf8BytesToString(bytes) {
  var out = '';
  var i = 0;
  while (i < bytes.length) {
    var c = bytes[i++];
    if (c < 0x80) {
      out += String.fromCharCode(c);
    } else if (c < 0xE0) {
      out += String.fromCharCode(((c & 0x1F) << 6) | (bytes[i++] & 0x3F));
    } else if (c < 0xF0) {
      out += String.fromCharCode(((c & 0x0F) << 12) | ((bytes[i++] & 0x3F) << 6) | (bytes[i++] & 0x3F));
    } else {
      var cp = ((c & 0x07) << 18) | ((bytes[i++] & 0x3F) << 12) |
        ((bytes[i++] & 0x3F) << 6) | (bytes[i++] & 0x3F);
      cp -= 0x10000;
      out += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF));
    }
  }
  return out;
}

// 官方歌词搜索：https://lyrics.kugou.com/search?ver=1&man=yes&client=pc&hash=xxx[&album_audio_id=xxx]
function kgSearchKrc(hash, albumAudioId) {
  var u = 'https://lyrics.kugou.com/search?ver=1&man=yes&client=pc&hash=' + hash +
    (albumAudioId ? '&album_audio_id=' + encodeURIComponent(albumAudioId) : '');
  return _throttledHttpGet(u, { 'User-Agent': 'Mozilla/5.0' }, 10000).then(function(r) {
    var data = objStr2JSON(r);
    if (!data || data.status !== 200 || !data.candidates || !data.candidates.length) return [];
    // 过滤酷狗广告占位候选（singer = 酷狗音乐），这类是假歌词
    return data.candidates.filter(function(c) {
      return c && c.id && c.accesskey && c.singer !== '酷狗音乐';
    });
  });
}

// 官方歌词下载（fmt=lrc 为标准 LRC，content 为 Base64）
function kgDownloadLrc(id, accesskey) {
  var u = 'https://lyrics.kugou.com/download?ver=1&client=pc&id=' + encodeURIComponent(id) +
    '&accesskey=' + encodeURIComponent(accesskey) + '&fmt=lrc&charset=utf8';
  return _throttledHttpGet(u, { 'User-Agent': 'Mozilla/5.0' }, 10000).then(function(r) {
    var data = objStr2JSON(r);
    if (!data || data.status !== 200 || !data.content) return '';
    var part;
    try {
      part = kgUtf8BytesToString(kgBase64ToBytes(data.content));
    } catch (e) {
      return '';
    }
    // KRC 源为 \r\n 换行，统一成 \n，避免播放器逐行解析时残留回车
    return part.replace(/\r/g, '').trim();
  });
}

function kgPickCandidate(candidates, durationMs) {
  if (!candidates.length) return null;
  if (!durationMs) return candidates[0];
  var best = candidates[0];
  var bestDiff = Math.abs((parseInt(candidates[0].duration, 10) || 0) - durationMs);
  for (var i = 1; i < candidates.length; i++) {
    var diff = Math.abs((parseInt(candidates[i].duration, 10) || 0) - durationMs);
    if (diff < bestDiff) { bestDiff = diff; best = candidates[i]; }
  }
  return best;
}

function kgFetchLyric(item) {
  var hash = (item._hash || item.id || '').toLowerCase();
  if (!hash) return Promise.resolve(null);

  if (lyricCache[hash]) return Promise.resolve(lyricCache[hash]);

  var durationMs = (parseInt(item.duration, 10) || 0) * 1000;

  return kgSearchKrc(hash, item._albumAudioId).then(function(candidates) {
    var picked = kgPickCandidate(candidates, durationMs);
    if (!picked) {
      console.warn('[KG] 歌词获取失败: 无可用候选');
      return null;
    }
    return kgDownloadLrc(picked.id, picked.accesskey).then(function(lrcText) {
      if (!lrcText) {
        console.warn('[KG] 歌词获取失败: 下载为空');
        return null;
      }
      var result = { lrc: lrcText, lrc_data: [] };
      lyricCache[hash] = result;
      return result;
    });
  }).catch(function(e) {
    console.warn('[KG] 歌词请求异常: ' + (e && e.message));
    return null;
  });
}

// ========== 评论（框架保留）==========

function kgGetComments(item, page) {
  var mixsongid = item._albumAudioId || 0;
  if (!mixsongid && item._audioId) mixsongid = item._audioId;
  if (!mixsongid) return Promise.resolve({ isEnd: true, data: [] });

  var pageSize = page === 1 ? 15 : 20;

  var clienttime = String(Math.floor(Date.now() / 1000));
  var params = {
    dfid: DFID, mid: MID, uuid: UUID,
    appid: '1005', clientver: '12329', userid: '0',
    clienttime: clienttime, mixsongid: String(mixsongid),
    need_show_image: '1', p: String(page), pagesize: String(pageSize),
    show_classify: '1', show_hotword_list: '1',
    extdata: '0', code: 'fc4be23b4e972707f36b8a828a93ba8a'
  };
  params.signature = androidSign(params);

  var body = Object.keys(params).map(function(k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
  }).join('&');

  return httpPost('https://gateway.kugou.com/mcomment/v1/cmtlist', body, {
    'User-Agent': 'MusicFreetss',
    'Content-Type': 'application/x-www-form-urlencoded'
  }, 8000).then(function(r) {
    var data = objStr2JSON(r);
    if (!data || data.status !== 1) return { isEnd: true, data: [] };
    var list = data.list || [];
    return {
      isEnd: list.length < pageSize,
      data: list.map(function(c) {
        return {
          id: String(c.id || ''),
          userName: decodeName(c.user_name || ''),
          avatar: c.user_pic || '',
          content: decodeName(c.content || ''),
          like: parseInt((c.like && c.like.count) || c.like_num || '0', 10) || 0,
          timestamp: (c.addtime ? parseInt(c.addtime, 10) * 1000 : parseInt(c.time || '0', 10) * 1000),
          replyNum: parseInt(c.reply_num || '0', 10) || 0,
          location: c.location || ''
        };
      })
    };
  }).catch(function() {
    return { isEnd: true, data: [] };
  });
}

// ========== 导入歌单 ==========

function resolveKgPlaylistId(urlLike) {
  if (!urlLike) return null;
  var m;
  m = urlLike.match(/^special_(\d+)$/); if (m) return m[1];
  m = urlLike.match(/specialid[=:](\d+)/); if (m) return m[1];
  m = urlLike.match(/\/special\/(\d+)/); if (m) return m[1];
  m = urlLike.match(/^(\d{5,})$/); if (m) return m[1];
  return null;
}

// ========== 导出 ==========
module.exports = {
  platform: PLATFORM,
  version: PLUGIN_VERSION,
  supportedSearchType: ['music', 'album', 'artist', 'sheet'],
  primaryKey: ['id'],
  hints: {
    importMusicSheet: [
      '支持酷狗歌单链接导入（PC/移动端）',
      '格式: https://www.kugou.com/special/detail/123456 或纯数字ID'
    ]
  },

  search: function(q, page, type) {
    if (!q || !q.trim()) return Promise.resolve({ isEnd: true, data: [] });
    if (type === 'music') return kgSearchMusic(q, page);
    if (type === 'album') return kgSearchAlbum(q, page);
    if (type === 'artist') return kgSearchArtist(q, page);
    if (type === 'sheet') return kgSearchPlaylist(q, page);
    return kgSearchMusic(q, page);
  },

  getMediaSource: function(item, quality) {
    return kgGetPlayData(item, quality).then(function(r) {
      return { url: r.url };
    });
  },

  getLyric: function(item) {
    return kgFetchLyric(item).then(function(result) {
      if (!result) return null;
      var raw = (typeof result === 'string') ? result : result.lrc;
      var translation = '';
      var lrcData = result && result.lrc_data;

      if (lrcData && Array.isArray(lrcData)) {
        var transLines = [];
        lrcData.forEach(function(line) {
          if (line.trans) {
            var startVal = parseFloat(line.start) || 0;
            var startSec = startVal > 3600 ? startVal / 1000 : startVal;
            var m = Math.floor(startSec / 60);
            var s = Math.floor(startSec % 60);
            var ms = Math.floor((startSec % 1) * 1000);
            var timeTag = '[' + (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s) + '.' + (ms < 100 ? (ms < 10 ? '00' + ms : '0' + ms) : ms) + ']';
            transLines.push(timeTag + line.trans);
          }
        });
        if (transLines.length > 0) translation = transLines.join('\n');
      }

      // 直接返回逐字歌词，不再进行额外的 YRC 解析
      return { rawLrc: raw, translation: translation };
    });
  },

  getMusicInfo: function(item) {
    return Promise.resolve({
      id: item.id || item._hash || '',
      name: item.title || item.name || '',
      artist: item.artist || '',
      album: item.album || '',
      artwork: item.artwork || '',
      duration: item.duration || 0,
      qualities: item.qualities || { '128k': {}, '320k': {}, 'flac': {} }
    });
  },

  getAlbumInfo: function(item, page) {
    var aid = item.albumId || item._albumId || item.id || '';
    if (!aid || aid === '0') return Promise.resolve({ isEnd: true, musicList: [] });
    return kgGetAlbumDetail(aid, page).then(function(r) {
      return { isEnd: r.isEnd, musicList: r.data || [], albumItem: r.albumInfo || undefined };
    }).catch(function() { return { isEnd: true, musicList: [] }; });
  },

  getMusicSheetInfo: function(item, page) {
    var sid = item._sheetId || item.id || '';
    if (sid.indexOf('special_') === 0) sid = sid.substring(8);
    if (!sid) return Promise.resolve({ isEnd: true, musicList: [] });
    return kgGetSheetDetail(sid, page).then(function(r) {
      return { isEnd: r.isEnd, musicList: r.musicList, sheetItem: r.sheetInfo || undefined };
    }).catch(function() { return { isEnd: true, musicList: [] }; });
  },

  getTopLists: function() {
    return kgGetTopLists();
  },

  getTopListDetail: function(topListItem, page) {
    return kgGetRankDetail(topListItem.id, page).then(function(res) {
      return { isEnd: res.isEnd, musicList: res.musicList };
    });
  },

  getMusicComments: function(item, page) {
    return kgGetComments(item, page);
  },

  getArtistInfo: function(artistItem) {
    var id = String(artistItem._singerId || artistItem._artistId || artistItem.id || '');
    if (!id || !/^\d+$/.test(id)) {
      var name = artistItem.name || artistItem.artist || artistItem.title || '';
      if (!name) return Promise.resolve(null);
      return kgResolveSingerId(name, '').then(function(sid) {
        if (!sid) return null;
        return kgGetArtistInfo(sid).then(function(info) {
          return mapSingerItem({ singerid: sid }, info);
        });
      });
    }
    return kgGetArtistInfo(id).then(function(info) {
      return mapSingerItem({ singerid: id }, info);
    });
  },

  getArtistWorks: function(item, page, type) {
    var name = item.name || item.artist || item.title || '';
    var hintId = item._singerId || item._artistId || String(item.id || '');

    return kgResolveSingerId(name, hintId).then(function(sid) {
      if (!sid) return { isEnd: true, data: [] };

      if (type === 'music') return kgGetArtistSongs(sid, page);
      if (type === 'album') {
        return kgGetArtistAlbums(sid, page).then(function(res) {
          if (res.data.length === 0 && page === 1) {
            return kgGetArtistSongs(sid, 1).then(function(songRes) {
              var seen = {};
              var albums = [];
              (songRes.data || []).forEach(function(s) {
                var aid = s.albumId;
                if (aid && aid !== '0' && !seen[aid]) {
                  seen[aid] = true;
                  albums.push({
                    id: aid,
                    title: s.album || '未知专辑',
                    name: s.album || '未知专辑',
                    artist: s.artist || name,
                    artwork: s.artwork || buildCover(aid, ''),
                    coverImg: s.artwork || buildCover(aid, ''),
                    description: ''
                  });
                }
              });
              return { isEnd: true, data: albums };
            });
          }
          return res;
        });
      }
      return { isEnd: true, data: [] };
    }).catch(function() { return { isEnd: true, data: [] }; });
  },

  getRecommendSheetTags: function() {
    return kgGetRecSheetTags();
  },

  getRecommendSheetsByTag: function(tag, page) {
    return kgGetRecSheets(tag, page);
  },

  importMusicSheet: function(urlLike) {
    var sid = resolveKgPlaylistId(urlLike);
    if (!sid) return Promise.reject(new Error('无法识别歌单ID'));
    var all = [];
    function fp(p) {
      return kgGetSheetDetail(sid, p).then(function(r) {
        if (r.musicList && r.musicList.length) all = all.concat(r.musicList);
        if (!r.isEnd && p < 10) return fp(p + 1);
        return all;
      });
    }
    return fp(1);
  }
};