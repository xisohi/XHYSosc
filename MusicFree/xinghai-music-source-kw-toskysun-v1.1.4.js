/*!
 * @name 星海音乐源kw
 * @description MusicFree 酷我音乐插件
 * @author 万去了了
 * @version 1.1.4
 * @Update 1.修复歌词接口kuwo_lyric.php已404，改用酷我官方歌词接口
 *         2.修复评论接口返回结构变更（rows/total包在data里）导致评论始终为空
 *         3.为搜索/歌单详情/评论等缺少兜底的分支补充异常捕获
 * @updateUrl https://zrcdy.dpdns.org/musicfree/kw/xinghai-music-source-kw-toskysun.js
 */

var PLUGIN_VERSION = '1.1.4';
var PLATFORM = '星海音乐源kuwo';
var UPDATE_URL = 'https://zrcdy.dpdns.org/musicfree/kw/xinghai-music-source-kw-toskysun.js';
var PAGE_SIZE = 30;
var initDone = false;
var extraCache = new Map();
var ipCache = '';

// ========== 工具函数 ==========
function decodeName(str) {
  if (!str) return '';
  if (typeof str !== 'string') str = String(str);
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\\u([0-9a-fA-F]{4})/g, function(_, c) {
      return String.fromCharCode(parseInt(c, 16));
    });
}

function formatSinger(raw) {
  return decodeName(raw);
}

function objStr2JSON(str) {
  if (!str) return null;
  try { return JSON.parse(str); } catch(e) {}
  try { return JSON.parse(str.replace(/'/g, '"')); } catch(e) { return null; }
}

function httpGet(url, headers, timeout) {
  return new Promise(function(resolve, reject) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.timeout = timeout || 8000;
      if (headers) {
        Object.keys(headers).forEach(function(k) {
          xhr.setRequestHeader(k, headers[k]);
        });
      }
      xhr.onload = function() { resolve(xhr.responseText || ''); };
      xhr.onerror = function() { reject(new Error('XHR error')); };
      xhr.ontimeout = function() { reject(new Error('XHR timeout')); };
      xhr.send();
    } catch (e) { reject(e); }
  });
}

function doInit() {
  if (initDone) return Promise.resolve();
  return httpGet('https://yy.zddyr.top/ip.php', null, 5000).then(function(r) {
    var data = objStr2JSON(r);
    ipCache = (data && data.ip) || '';
    initDone = true;
    return ipCache;
  }).catch(function() {
    ipCache = '';
    initDone = true;
    return '';
  });
}

function artworkShort2Long(short) {
  if (!short) return undefined;
  return 'https://img4.kuwo.cn/star/albumcover/' + short;
}

function extractSongId(raw) {
  if (!raw) return '';
  return String(raw).replace('MUSIC_', '');
}

function buildUrl(base, params) {
  var qs = Object.keys(params).map(function(k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
  }).join('&');
  return base + '?' + qs;
}

function buildPic(item) {
  if (item.hts_MVPIC) return item.hts_MVPIC;
  var s = item.pic || item.img || item.MVPIC || '';
  if (s && s.indexOf('http') !== 0 && s.length > 0) {
    return 'https://img4.kuwo.cn/star/albumcover/' + s;
  }
  if (s && s.indexOf('http') === 0) return s;
  return '';
}

function buildSongCover(musicId) {
  if (!musicId) return '';
  var rid = String(musicId).replace('MUSIC_', '');
  if (!rid) return '';
  return 'https://artistpicserver.kuwo.cn/pic.web?corp=kuwo&type=rid_pic&pictype=500&size=500&rid=' + rid;
}

// ========== 歌词行 → LRC 文本 ==========
function formatLrcTime(sec) {
  var t = parseFloat(sec);
  if (isNaN(t) || t < 0) t = 0;
  var mm = Math.floor(t / 60);
  var ss = t - mm * 60;
  var mStr = mm < 10 ? '0' + mm : String(mm);
  var sStr = ss.toFixed(3);
  if (ss < 10) sStr = '0' + sStr;
  return '[' + mStr + ':' + sStr + ']';
}

function linesToLrc(lrclist) {
  if (!Array.isArray(lrclist) || lrclist.length === 0) return '';
  return lrclist.map(function(l) {
    var txt = (l && l.lineLyric != null) ? String(l.lineLyric) : '';
    return formatLrcTime(l && l.time) + txt;
  }).join('\n');
}

// v1.1.3: 请求 artistpicserver 获取真实 CDN 图片地址（返回纯文本 URL，非重定向）
function resolveCoverUrl(url) {
  if (!url || url.indexOf('artistpicserver') === -1) return Promise.resolve(url);
  return new Promise(function(resolve) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.timeout = 5000;
      xhr.onload = function() {
        var body = (xhr.responseText || '').trim();
        if (body && body.indexOf('http') === 0 && body.length < 300) {
          var finalUrl = body;
          if (finalUrl.indexOf('http://') === 0) finalUrl = finalUrl.replace('http://', 'https://');
          resolve(finalUrl);
        } else {
          resolve(url);
        }
      };
      xhr.onerror = function() { resolve(url); };
      xhr.ontimeout = function() { resolve(url); };
      xhr.send();
    } catch(e) { resolve(url); }
  });
}

// v1.1.3: 批量解析歌曲列表中的 artistpicserver 封面
function resolveCovers(songList) {
  if (!songList || !songList.length) return Promise.resolve(songList);
  var ps = songList.map(function(s) {
    if (!s.artwork || s.artwork.indexOf('artistpicserver') === -1) return Promise.resolve();
    return resolveCoverUrl(s.artwork).then(function(finalUrl) {
      if (finalUrl && finalUrl !== s.artwork) s.artwork = finalUrl;
    });
  });
  return Promise.all(ps).then(function() { return songList; });
}

// ========== 播放（仅主 API，加密格式直接拒绝） ==========
function kwGetPlayData(musicItem, quality) {
  var id = musicItem.id || '';
  if (!id) return Promise.reject(new Error('no id'));
  var rid = String(id).replace('MUSIC_', '');
  if (!rid) return Promise.reject(new Error('invalid id'));
  var q = quality || '128k';

  // 主 API：yy.zddyr.top
  var u = 'https://yy.zddyr.top/lx/api/?source=kw' +
    '&name=' + encodeURIComponent(musicItem.title || '') +
    '&singer=' + encodeURIComponent(musicItem.artist || '') +
    '&songmid=' + rid +
    '&interval=' + (musicItem.duration || '') +
    '&albumName=' + encodeURIComponent(musicItem._albumName || musicItem.album || '') +
    '&quality=' + q +
    '&ip=' + ipCache;

  return httpGet(u, {
    'User-Agent': 'LX-Music-Mobile',
    'Referer': 'http://www.kuwo.cn/'
  }, 10000).then(function(r) {
    var data = objStr2JSON(r);
    if (!data || data.code !== 200 || !data.url) {
      throw new Error('无可用播放源');
    }
    var playUrl = data.url;
    // v1.1.3: 检测加密格式，直接拒绝（VIP 歌曲最低音质也没有）
    if (playUrl.indexOf('.mflac') !== -1 || playUrl.indexOf('.mgg') !== -1) {
      throw new Error('加密格式，无法播放');
    }
    if (playUrl.indexOf('http://') === 0) {
      playUrl = playUrl.replace('http://', 'https://');
    }
    return { url: playUrl };
  });
}

// ========== 歌词（固定逐字：保留原始标签） ==========
function kwFetchLyric(musicId, lyricFormat) {
  var rid = String(musicId).replace('MUSIC_', '');
  if (!rid) return Promise.resolve(null);
  
  // 原 yy.zddyr.top/lx/api/kuwo_lyric.php 已 404，改用酷我官方歌词接口
  var url = 'http://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId=' + rid + '&httpStatus=1';
  return httpGet(url, {
    'User-Agent': 'Mozilla/5.0',
    'Referer': 'http://www.kuwo.cn/'
  }, 8000).then(function(r) {
    if (!r) return null;
    var data = objStr2JSON(r);
    if (!data || data.status !== 200 || !data.data) return null;
    var raw = linesToLrc(data.data.lrclist);
    if (!raw) return null;
    var result = { rawLrc: raw, translation: '' };
    return result;
  }).catch(function() { return null; });
}

// ========== 核心映射函数 ==========
function parseKuWoQualityInfo(nMInfo) {
  if (!nMInfo) return {};
  var qualities = {};
  var items = nMInfo.split(';');
  for (var i = 0; i < items.length; i++) {
    var m = items[i].match(/level:(\w+),bitrate:(\d+),format:(\w+),size:([\w.]+)/);
    if (m) {
      var bitrate = parseInt(m[2], 10);
      if (bitrate === 128) qualities['128k'] = {};
      else if (bitrate === 192) qualities['192k'] = {};
      else if (bitrate === 320) qualities['320k'] = {};
      else if (bitrate === 2000) qualities['flac'] = {};
    }
  }
  return qualities;
}

function mapSongItem(item) {
  var id = extractSongId(item.MUSICRID || item.musicrid || item.rid || item.id || '');
  return {
    id: id,
    title: decodeName(item.NAME || item.name || ''),
    artist: formatSinger(item.ARTIST || item.artist || ''),
    album: decodeName(item.ALBUM || item.album || ''),
    albumId: String(item.ALBUMID || item.albumid || '0'),
    artistId: String(item.ARTISTID || item.artistid || '0'),
    duration: parseInt(item.DURATION || item.duration || '0', 10) || 0,
    artwork: artworkShort2Long(item.web_albumpic_short) || buildPic(item) || buildSongCover(item.MUSICRID || item.musicrid || item.rid || item.id) || '',
    qualities: parseKuWoQualityInfo(item.N_MINFO || item.n_minfo),
    _albumName: decodeName(item.ALBUM || item.album || ''),
    _nMInfo: item.N_MINFO || ''
  };
}

function mapAlbumItem(a) {
  var pic = a.img || artworkShort2Long(a.pic);
  if (pic && pic.indexOf('http') !== 0 && pic.length > 0) {
    pic = 'https://img4.kuwo.cn/star/albumcover/' + pic;
  }
  return {
    id: String(a.albumid || ''),
    title: decodeName(a.name || a.NAME || ''),
    name: decodeName(a.name || a.NAME || ''),
    artist: decodeName(a.artist || a.ARTIST || ''),
    artwork: pic,
    coverImg: pic,
    coverImgUrl: pic,
    description: decodeName(a.info || ''),
    _albumId: String(a.albumid || ''),
    _type: 'album'
  };
}

// ========== 搜索接口 ==========
function kwSearchMusic(keyword, page) {
  var params = {
    client: 'kt',
    all: keyword,
    pn: page - 1,
    rn: PAGE_SIZE,
    uid: 2574109560,
    ver: 'kwplayer_ar_8.5.4.2',
    vipver: 1,
    ft: 'music',
    cluster: 0,
    strategy: 2012,
    encoding: 'utf8',
    rformat: 'json',
    vermerge: 1,
    mobi: 1
  };
  var u = buildUrl('http://search.kuwo.cn/r.s', params);
  return httpGet(u, {
    'User-Agent': 'Mozilla/5.0',
    'Referer': 'http://www.kuwo.cn/'
  }, 8000).then(function(r) {
    var data = objStr2JSON(r);
    if (!data) throw new Error('parse fail');
    var total = parseInt(data.TOTAL || '0', 10);
    var arr = (data.abslist || []).map(mapSongItem);
    return {
      isEnd: (page * PAGE_SIZE) >= total,
      data: arr
    };
  }).catch(function() { return { isEnd: true, data: [] }; });
}

function kwSearchAlbum(keyword, page) {
  var params = {
    all: keyword,
    ft: 'album',
    itemset: 'web_2013',
    client: 'kt',
    pn: page - 1,
    rn: PAGE_SIZE,
    rformat: 'json',
    encoding: 'utf8',
    pcjson: 1
  };
  var u = buildUrl('http://search.kuwo.cn/r.s', params);
  return httpGet(u, {
    'User-Agent': 'Mozilla/5.0',
    'Referer': 'http://www.kuwo.cn/'
  }, 8000).then(function(r) {
    var data = objStr2JSON(r);
    if (!data || !data.albumlist) return { isEnd: true, data: [] };
    var total = parseInt(data.TOTAL || '0', 10);
    return {
      isEnd: (page * PAGE_SIZE) >= total,
      data: data.albumlist.map(mapAlbumItem)
    };
  }).catch(function() { return { isEnd: true, data: [] }; });
}

function kwSearchArtist(keyword, page) {
  var params = {
    all: keyword,
    ft: 'artist',
    itemset: 'web_2013',
    client: 'kt',
    pn: page - 1,
    rn: PAGE_SIZE,
    rformat: 'json',
    encoding: 'utf8',
    pcjson: 1
  };
  var u = buildUrl('http://search.kuwo.cn/r.s', params);
  return httpGet(u, {
    'User-Agent': 'Mozilla/5.0',
    'Referer': 'http://www.kuwo.cn/'
  }, 8000).then(function(r) {
    var data = objStr2JSON(r);
    if (!data || !data.abslist) return { isEnd: true, data: [] };
    var total = parseInt(data.TOTAL || '0', 10);
    return {
      isEnd: (page * PAGE_SIZE) >= total,
      data: data.abslist.map(function(a) {
        return {
          id: String(a.ARTISTID || ''),
          title: decodeName(a.ARTIST || a.artist || ''),
          name: decodeName(a.ARTIST || a.artist || ''),
          avatar: a.hts_PICPATH || '',
          description: decodeName(a.desc || ''),
          worksNum: parseInt(a.SONGNUM || '0', 10) || 0,
          _artistId: String(a.ARTISTID || '')
        };
      })
    };
  }).catch(function() { return { isEnd: true, data: [] }; });
}

function kwSearchPlaylist(keyword, page) {
  var params = {
    all: keyword,
    ft: 'playlist',
    itemset: 'web_2013',
    client: 'kt',
    pn: page - 1,
    rn: PAGE_SIZE,
    rformat: 'json',
    encoding: 'utf8',
    pcjson: 1
  };
  var u = buildUrl('http://search.kuwo.cn/r.s', params);
  return httpGet(u, {
    'User-Agent': 'Mozilla/5.0',
    'Referer': 'http://www.kuwo.cn/'
  }, 8000).then(function(r) {
    var data = objStr2JSON(r);
    if (!data) throw new Error('parse fail');
    var total = parseInt(data.TOTAL || '0', 10);
    return {
      isEnd: (page * PAGE_SIZE) >= total,
      data: (data.abslist || []).map(function(item) {
        var cover = item.pic || '';
        return {
          id: item.playlistid || item.id || '',
          title: decodeName(item.name || ''),
          artist: decodeName(item.nickname || ''),
          artwork: cover,
          coverImg: cover,
          description: decodeName(item.intro || ''),
          playCount: item.playcnt || 0,
          worksNum: parseInt(item.songnum || '0', 10) || 0,
          _playlistId: item.playlistid || item.id || ''
        };
      })
    };
  }).catch(function() { return { isEnd: true, data: [] }; });
}

// ========== 歌手作品 ==========
function kwGetArtistSongs(artistId, page) {
  var params = {
    pn: page - 1,
    rn: PAGE_SIZE,
    artistid: artistId,
    stype: 'artist2music',
    sortby: 0,
    alflac: 1,
    show_copyright_off: 1,
    pcmp4: 1,
    encoding: 'utf8',
    plat: 'pc',
    thost: 'search.kuwo.cn',
    vipver: 'MUSIC_9.1.1.2_BCS2',
    devid: '38668888',
    newver: 1,
    pcjson: 1
  };
  var u = buildUrl('http://search.kuwo.cn/r.s', params);
  return httpGet(u, {
    'User-Agent': 'Mozilla/5.0',
    'Referer': 'http://www.kuwo.cn/'
  }, 8000).then(function(r) {
    var data = objStr2JSON(r);
    if (!data || !data.musiclist) return { isEnd: true, musicList: [] };
    var total = parseInt(data.total || '0', 10);
    return {
      isEnd: (page * PAGE_SIZE) >= total,
      musicList: data.musiclist.map(mapSongItem)
    };
  }).catch(function() { return { isEnd: true, musicList: [] }; });
}

function kwGetArtistAlbums(artistId, page) {
  var params = {
    pn: page - 1,
    rn: PAGE_SIZE,
    artistid: artistId,
    stype: 'albumlist',
    sortby: 1,
    alflac: 1,
    show_copyright_off: 1,
    pcmp4: 1,
    encoding: 'utf8',
    plat: 'pc',
    thost: 'search.kuwo.cn',
    vipver: 'MUSIC_9.1.1.2_BCS2',
    devid: '38668888',
    newver: 1,
    pcjson: 1
  };
  var u = buildUrl('http://search.kuwo.cn/r.s', params);
  return httpGet(u, {
    'User-Agent': 'Mozilla/5.0',
    'Referer': 'http://www.kuwo.cn/'
  }, 8000).then(function(r) {
    var data = objStr2JSON(r);
    if (!data || !data.albumlist) return { isEnd: true, data: [] };
    var total = parseInt(data.total || '0', 10);
    return {
      isEnd: (page * PAGE_SIZE) >= total,
      data: data.albumlist.map(mapAlbumItem)
    };
  }).catch(function() { return { isEnd: true, data: [] }; });
}

// ========== 榜单 ==========
function kwGetTopLists() {
  var u = 'http://wapi.kuwo.cn/api/pc/bang/list';
  return httpGet(u, {
    'User-Agent': 'Mozilla/5.0',
    'Referer': 'http://www.kuwo.cn/'
  }, 8000).then(function(r) {
    var data = objStr2JSON(r);
    if (!data || !data.child) return [];
    return data.child.map(function(group) {
      return {
        title: group.disname || group.name || '',
        data: (group.child || []).map(function(item) {
          var cover = item.pic5 || item.pic2 || item.pic || '';
          return {
            id: item.sourceid || '',
            title: item.name || '',
            description: item.intro || '',
            artwork: cover,
            coverImg: cover,
            playCount: parseInt(item.listen || '0', 10) || 0,
            worksNum: parseInt(item.info || '0', 10) || 0
          };
        })
      };
    });
  }).catch(function() { return []; });
}

function kwGetBangDetail(bangId, page) {
  var params = {
    from: 'pc',
    fmt: 'json',
    pn: page - 1,
    rn: PAGE_SIZE,
    type: 'bang',
    data: 'content',
    id: bangId,
    show_copyright_off: 0,
    pcmp4: 1,
    isbang: 1,
    userid: 0,
    httpStatus: 1
  };
  var u = buildUrl('http://kbangserver.kuwo.cn/ksong.s', params);
  return httpGet(u, {
    'User-Agent': 'Mozilla/5.0',
    'Referer': 'http://www.kuwo.cn/'
  }, 8000).then(function(r) {
    var data = objStr2JSON(r);
    if (!data || !data.musiclist) return { isEnd: true, musicList: [], topListItem: null };
    var total = parseInt(data.num || data.total || '0', 10) || data.musiclist.length;
    var bangCover = data.v9_pic2 || data.pic || '';
    var mapped = data.musiclist.map(function(item) {
      var sid = String(item.id || '').replace('MUSIC_', '');
      // v1.1.3: 榜单封面统一走 artistpicserver → resolveCovers 解析
      var cover = buildSongCover('MUSIC_' + sid);
      return {
        id: sid,
        title: decodeName(item.name || ''),
        artist: formatSinger(item.artist || ''),
        album: decodeName(item.album || ''),
        albumId: String(item.albumid || '0'),
        artistId: String(item.artistid || '0'),
        duration: parseInt(item.duration || '0', 10) || 0,
        artwork: cover,
        _albumName: decodeName(item.album || '')
      };
    }).filter(function(s) { return s && s.id; });
    var info = {
      id: String(bangId),
      title: decodeName(data.name || data.leader || ''),
      name: decodeName(data.name || data.leader || ''),
      artwork: bangCover,
      coverImg: bangCover,
      description: decodeName(data.info || ''),
      worksNum: total
    };
    return resolveCovers(mapped).then(function() {
      return { isEnd: (page * PAGE_SIZE) >= total, musicList: mapped, topListItem: info };
    });
  }).catch(function() { return { isEnd: true, musicList: [], topListItem: null }; });
}

// ========== 专辑详情 ==========
function kwGetAlbumDetail(albumId, page) {
  var params = {
    pn: page - 1,
    rn: PAGE_SIZE,
    albumid: albumId,
    stype: 'albuminfo',
    sortby: 0,
    alflac: 1,
    show_copyright_off: 1,
    pcmp4: 1,
    encoding: 'utf8',
    plat: 'pc',
    thost: 'search.kuwo.cn',
    vipver: 'MUSIC_9.1.1.2_BCS2',
    devid: '38668888',
    newver: 1,
    pcjson: 1
  };
  var u = buildUrl('http://search.kuwo.cn/r.s', params);
  return httpGet(u, {
    'User-Agent': 'Mozilla/5.0',
    'Referer': 'http://www.kuwo.cn/'
  }, 8000).then(function(r) {
    var data = objStr2JSON(r);
    if (!data || !data.musiclist) return { isEnd: true, musicList: [], albumInfo: null };
    var total = parseInt(data.total || data.songnum || '0', 10) || data.musiclist.length;
    var albumCover = artworkShort2Long(data.pic) || data.img || '';
    if (!albumCover && data.hts_img) {
      albumCover = 'https://img4.kuwo.cn/star/albumcover/' + data.hts_img;
    }
    var albumName = decodeName(data.album || data.name || '');
    var ml = data.musiclist.map(function(item) {
      var id = extractSongId(item.id || item.musicrid || '');
      return {
        id: id,
        title: decodeName(item.name || ''),
        artist: formatSinger(item.artist || ''),
        album: decodeName(item.album || albumName || ''),
        albumId: String(albumId),
        artistId: String(item.artistid || '0'),
        duration: parseInt(item.duration || '0', 10) || 0,
        // v1.1.3: 专辑详情封面统一走 artistpicserver → resolveCovers 解析
        artwork: buildSongCover('MUSIC_' + id),
        _albumName: decodeName(item.album || albumName || '')
      };
    });
    var ai = {
      id: String(albumId),
      title: albumName,
      name: albumName,
      artwork: albumCover,
      coverImg: albumCover,
      artist: decodeName(data.artist || ''),
      description: decodeName(data.info || '')
    };
    return resolveCovers(ml).then(function() {
      return { isEnd: (page * PAGE_SIZE) >= total, musicList: ml, albumInfo: ai };
    });
  }).catch(function() { return { isEnd: true, musicList: [], albumInfo: null }; });
}

// ========== 歌单详情 ==========
function kwGetSheetDetail(sheetId, page) {
  var params = {
    op: 'getlistinfo',
    pid: sheetId,
    pn: page - 1,
    rn: PAGE_SIZE,
    encode: 'utf8',
    keyset: 'pl2012',
    vipver: 'MUSIC_9.1.1.2_BCS2',
    newver: 1
  };
  var u = buildUrl('http://nplserver.kuwo.cn/pl.svc', params);
  return httpGet(u, {
    'User-Agent': 'Mozilla/5.0',
    'Referer': 'http://www.kuwo.cn/'
  }, 8000).then(function(r) {
    var data = objStr2JSON(r);
    if (!data || data.result !== 'ok') return { isEnd: true, musicList: [], sheetInfo: null };
    var total = parseInt(data.total || '0', 10);
    var ml = data.musiclist.map(function(item) {
      var songId = String(item.id || '').replace('MUSIC_', '');
      // v1.1.3: 歌单封面统一走 artistpicserver → resolveCovers 解析
      var artwork = buildSongCover('MUSIC_' + songId);
      return {
        id: songId,
        title: decodeName(item.name || ''),
        artist: formatSinger(item.artist || ''),
        album: decodeName(item.album || ''),
        albumId: String(item.albumid || '0'),
        artistId: String(item.artistid || '0'),
        duration: parseInt(item.duration || '0', 10) || 0,
        artwork: artwork,
        _albumName: decodeName(item.album || '')
      };
    });
    var si = null;
    if (data.title) {
      si = {
        id: String(sheetId),
        title: decodeName(data.title),
        name: decodeName(data.title),
        artwork: data.pic || '',
        coverImg: data.pic || '',
        description: decodeName(data.info || ''),
        playCount: parseInt(data.listencnt || '0', 10) || 0,
        worksNum: total
      };
    }
    return resolveCovers(ml).then(function() {
      return { isEnd: (page * PAGE_SIZE) >= total, musicList: ml, sheetInfo: si };
    });
  }).catch(function() { return { isEnd: true, musicList: [], sheetInfo: null }; });
}

// ========== 推荐歌单 ==========
function kwGetRecSheetTags() {
  var u = 'http://wapi.kuwo.cn/api/pc/classify/playlist/getTagList?cmd=rcm_keyword_playlist&user=0&prod=kwplayer_pc_9.0.5.0&vipver=9.0.5.0&source=kwplayer_pc_9.0.5.0&loginUid=0&loginSid=0&appUid=76039576';
  return httpGet(u, {
    'User-Agent': 'Mozilla/5.0',
    'Referer': 'http://www.kuwo.cn/'
  }, 8000).then(function(r) {
    var data = objStr2JSON(r);
    if (!data || !data.data) return { pinned: [], data: [] };
    var groups = data.data || [];
    var result = [];
    var pinned = [
      { id: "1848", title: "翻唱" },
      { id: "621", title: "网络" },
      { id: "146", title: "伤感" },
      { id: "35", title: "欧美" }
    ];
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      var children = g.data || [];
      var items = [];
      for (var j = 0; j < children.length; j++) {
        var t = children[j];
        items.push({ id: String(t.id || ''), title: decodeName(t.name || ''), digest: t.digest || '' });
      }
      if (items.length > 0) result.push({ title: decodeName(g.name || ''), data: items });
    }
    return { pinned: pinned, data: result };
  }).catch(function() { return { pinned: [], data: [] }; });
}

function kwGetRecSheets(tag, page) {
  var tid = tag && tag.id ? tag.id : '';
  var digest = tag && tag.digest ? tag.digest : '';
  var u;
  if (digest === '10000') {
    u = 'http://wapi.kuwo.cn/api/pc/classify/playlist/getTagPlayList?loginUid=0&loginSid=0&appUid=76039576&pn=' + (page - 1) + '&id=' + tid + '&rn=' + PAGE_SIZE;
  } else {
    u = 'https://wapi.kuwo.cn/api/pc/classify/playlist/getRcmPlayList?loginUid=0&loginSid=0&appUid=76039576&pn=' + (page - 1) + '&rn=' + PAGE_SIZE + '&order=hot';
  }
  return httpGet(u, {
    'User-Agent': 'Mozilla/5.0',
    'Referer': 'http://www.kuwo.cn/'
  }, 8000).then(function(r) {
    var data = objStr2JSON(r);
    var list = [];
    var total = 0;
    if (data && data.data) {
      if (data.data.data) {
        list = data.data.data;
        total = parseInt(data.data.total || '0', 10);
      } else if (Array.isArray(data.data)) {
        list = data.data;
      }
    }
    // v1.1.3: 推荐歌单 API 无 total 且固定返回条数，返回空才结束翻页
    var isEnd;
    if (total > 0) {
      isEnd = (page * PAGE_SIZE) >= total;
    } else {
      isEnd = list.length === 0;
    }
    return {
      isEnd: isEnd,
      data: list.map(function(item) {
        var cover = item.img || item.pic || '';
        return {
          id: item.id || '',
          title: decodeName(item.name || ''),
          artist: decodeName(item.uname || ''),
          artwork: cover,
          coverImg: cover,
          playCount: item.listencnt || 0,
          worksNum: parseInt(item.total || item.songnum || '0', 10) || 0,
          _playlistId: item.id || ''
        };
      })
    };
  }).catch(function() { return { isEnd: true, data: [] }; });
}

// ========== 评论 ==========
function fetchCommentsPage(musicId, page, digest, rn) {
  var type = digest == 15 ? 'get_rec_comment' : 'get_comment';
  var u = 'https://comment.kuwo.cn/com.s?type=' + type +
    '&sid=' + musicId +
    '&digest=' + digest +
    '&page=' + page +
    '&rows=' + rn +
    '&f=web&uid=0&prod=newWeb&httpsStatus=1';
  return httpGet(u, {
    'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 10)',
    'Referer': 'http://www.kuwo.cn/'
  }, 6000).then(function(r) {
    var data = objStr2JSON(r);
    if (!data || data.result !== 'ok') return { comments: [], total: 0 };
    // 新版接口把数据包在 data 里，且字段为 info/total
    var body = data.data || data;
    return {
      comments: formatComments(body.rows || body.info || []),
      total: parseInt(body.total || '0', 10) || 0
    };
  }).catch(function() { return { comments: [], total: 0 }; });
}

function formatComments(list) {
  if (!Array.isArray(list)) return [];
  return list.map(function(c) {
    var time = 0;
    if (c.time) {
      var d = new Date(c.time.replace(/-/g, '/'));
      time = isNaN(d.getTime()) ? 0 : d.getTime();
    }
    var children = [];
    if (c.reply) {
      var r = c.reply;
      var replyTime = 0;
      if (r.time) {
        var rd = new Date(r.time.replace(/-/g, '/'));
        replyTime = isNaN(rd.getTime()) ? 0 : rd.getTime();
      }
      children.push({
        id: String(r.id),
        nickName: decodeName(r.u_name),
        avatar: r.u_pic || '',
        comment: decodeName(r.msg),
        like: parseInt(r.like_num, 10) || 0,
        time: replyTime
      });
    }
    return {
      id: String(c.id),
      nickName: decodeName(c.u_name),
      avatar: c.u_pic || '',
      comment: decodeName(c.msg),
      like: parseInt(c.like_num, 10) || 0,
      time: time,
      children: children
    };
  });
}

function kwGetComments(musicId, page) {
  var sid = String(musicId).replace('MUSIC_', '');
  var pageSize = 20;
  if (page === 1) {
    return Promise.all([
      fetchCommentsPage(sid, 1, 15, 15),
      fetchCommentsPage(sid, 1, 0, pageSize)
    ]).then(function(res) {
      var hot = res[0].comments || [];
      var nw = res[1].comments || [];
      var totalNw = res[1].total;
      var ids = {};
      hot.forEach(function(c) { ids[c.id] = true; });
      var fill = nw.filter(function(c) { return !ids[c.id]; });
      var merged = hot.concat(fill).slice(0, pageSize);
      return { isEnd: page * pageSize >= totalNw, data: merged };
    }).catch(function() { return { isEnd: true, data: [] }; });
  }
  return fetchCommentsPage(sid, page, 0, pageSize).then(function(res) {
    var comments = res.comments || [];
    var totalNw = res.total;
    return { isEnd: page * pageSize >= totalNw, data: comments };
  }).catch(function() {
    return { isEnd: true, data: [] };
  });
}

// ========== 导入歌单 ==========
function resolvePlaylistId(urlLike) {
  if (!urlLike) return null;
  var m;
  m = urlLike.match(/https?:\/\/www\.kuwo\.cn\/playlist_detail\/(\d+)/);
  if (m) return m[1];
  m = urlLike.match(/https?:\/\/m\.kuwo\.cn\/h5app\/playlist\/(\d+)/);
  if (m) return m[1];
  m = urlLike.match(/^(\d{5,15})$/);
  if (m) return m[1];
  return null;
}

// ========== 导出模块 ==========
module.exports = {
  platform: PLATFORM,
  version: PLUGIN_VERSION,
  author: '万去了了',
  srcUrl: UPDATE_URL,
  supportedSearchType: ['music', 'album', 'sheet', 'lyric', 'artist'],
  supportedQualities: ['128k', '192k', '320k', 'flac'],
  primaryKey: ['id'],
  hints: {
    importMusicSheet: [
      '支持酷我歌单链接导入（PC/移动端）',
      '格式: https://www.kuwo.cn/playlist_detail/123456 或纯数字ID'
    ]
  },
  search: function(q, page, type) {
    return doInit().then(function() {
      if (!q || !q.trim()) return { isEnd: true, data: [] };
      if (type === 'music' || type === 'lyric') return kwSearchMusic(q, page);
      if (type === 'album') return kwSearchAlbum(q, page);
      if (type === 'artist') return kwSearchArtist(q, page);
      if (type === 'sheet') return kwSearchPlaylist(q, page);
      return kwSearchMusic(q, page);
    });
  },
  getMediaSource: function(item, quality) {
    return doInit().then(function() {
      return kwGetPlayData(item, quality).then(function(r) {
        return { url: r.url };
      });
    });
  },
  getLyric: function(item) {
    var rid = String(item.id || '').replace('MUSIC_', '');
    if (!rid) return Promise.resolve(null);
    return kwFetchLyric(rid, 1).then(function(r) {
      if (r && r.rawLrc) return { rawLrc: r.rawLrc, translation: r.translation || '' };
      return null;
    }).catch(function() { return null; });
  },
  getMusicInfo: function(item) {
    var rid = String(item.id || '').replace('MUSIC_', '');
    var artwork = item.artwork || item.coverImg || '';
    if (!artwork && item.id) artwork = buildSongCover(item.id);
    var qualities = item.qualities || {};
    if (Object.keys(qualities).length === 0) qualities = { '128k': {}, '192k': {}, '320k': {}, 'flac': {} };
    return Promise.resolve({
      id: item.id || '',
      name: item.title || item.name || '',
      artist: item.artist || '',
      album: item.album || item._albumName || '',
      artwork: artwork,
      qualities: qualities
    });
  },
  getAlbumInfo: function(item, page) {
    var aid = item._albumId || item.albumId || item.id;
    if (!aid || aid === '0') return Promise.resolve({ isEnd: true, musicList: [] });
    return kwGetAlbumDetail(aid, page).then(function(r) {
      if (r.albumInfo && !r.albumInfo.artwork && item.artwork) r.albumInfo.artwork = item.artwork;
      if (r.albumInfo && !r.albumInfo.coverImg && item.coverImg) r.albumInfo.coverImg = item.coverImg;
      if (r.albumInfo && !r.albumInfo.title) r.albumInfo.title = item.title || item.name || '';
      return { isEnd: r.isEnd, musicList: r.musicList, albumItem: r.albumInfo || undefined };
    }).catch(function() { return { isEnd: true, musicList: [] }; });
  },
  getMusicSheetInfo: function(item, page) {
    var sid = item._playlistId || item.id;
    if (!sid) return Promise.resolve({ isEnd: true, musicList: [] });
    return kwGetSheetDetail(sid, page).then(function(r) {
      return { isEnd: r.isEnd, musicList: r.musicList, sheetItem: r.sheetInfo || undefined };
    }).catch(function() { return { isEnd: true, musicList: [] }; });
  },
  getTopLists: function() {
    return kwGetTopLists().catch(function() { return []; });
  },
  getTopListDetail: function(item, page) {
    var bid = item.id;
    if (!bid) return Promise.resolve({ isEnd: true, musicList: [] });
    return kwGetBangDetail(bid, page).then(function(r) {
      var topListItem = null;
      if (r.topListItem) {
        if (!r.topListItem.artwork && item.artwork) r.topListItem.artwork = item.artwork;
        if (!r.topListItem.coverImg && item.coverImg) r.topListItem.coverImg = item.coverImg;
        topListItem = r.topListItem;
      }
      return { isEnd: r.isEnd, musicList: r.musicList, topListItem: topListItem };
    }).catch(function() { return { isEnd: true, musicList: [] }; });
  },
  getArtistInfo: function(item, page) {
    var aid = item._artistId || item.id;
    if (!aid) return Promise.resolve({ id: '', name: '', avatar: '', worksNum: 0 });
    var u = buildUrl('http://search.kuwo.cn/r.s', {
      ft: 'artist',
      artistid: aid,
      rn: 1,
      rformat: 'json',
      encoding: 'utf8',
      pcjson: 1
    });
    return httpGet(u, {
      'User-Agent': 'Mozilla/5.0',
      'Referer': 'http://www.kuwo.cn/'
    }).then(function(r) {
      var data = objStr2JSON(r);
      var a = (data && data.abslist && data.abslist[0]) || {};
      return {
        id: aid,
        name: decodeName(a.ARTIST || item.name || item.title || ''),
        title: decodeName(a.ARTIST || item.name || item.title || ''),
        avatar: a.hts_PICPATH || '',
        worksNum: parseInt(a.SONGNUM || '0', 10) || 0,
        description: decodeName(a.desc || '')
      };
    }).catch(function() { return { id: aid, name: item.name || item.title || '', title: item.title || item.name || '', avatar: '', worksNum: 0 }; });
  },
  getArtistWorks: function(item, page, type) {
    var aid = item._artistId || item.id;
    if (!aid) return Promise.resolve({ isEnd: true, data: [] });
    if (type === 'music') {
      return kwGetArtistSongs(aid, page).then(function(r) {
        return { isEnd: r.isEnd, data: r.musicList };
      });
    }
    if (type === 'album') {
      return kwGetArtistAlbums(aid, page).then(function(r) {
        return { isEnd: r.isEnd, data: r.data };
      });
    }
    return Promise.resolve({ isEnd: true, data: [] });
  },
  getRecommendSheetTags: function() {
    return kwGetRecSheetTags();
  },
  getRecommendSheetsByTag: function(tag, page) {
    return kwGetRecSheets(tag, page);
  },
  getMusicComments: function(item, page) {
    var id = item.id;
    if (!id) return Promise.resolve({ isEnd: true, data: [] });
    return kwGetComments(id, page);
  },
  importMusicSheet: function(urlLike) {
    return doInit().then(function() {
      var sid = resolvePlaylistId(urlLike);
      if (!sid) throw new Error('无法识别歌单ID');
      var all = [];
      function fp(p) {
        return kwGetSheetDetail(sid, p).then(function(r) {
          if (r.musicList && r.musicList.length) all = all.concat(r.musicList);
          if (!r.isEnd && p < 10) return fp(p + 1);
          return all;
        });
      }
      return fp(1);
    });
  }
};
