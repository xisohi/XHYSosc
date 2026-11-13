 /**
 * @name 星海音乐源 - wy
 * @description MusicFree
 * @author 万去了了
 * @version 1.8
 * @Update 1.播放地址（无 Cookie 分支）改走自建主后端，与 LX 及 qs/kg/kw 同系列保持一致；2.移除第三方 GD Studio 依赖，删除其二次跳转函数与相关请求头；3.保留有 Cookie 的官方 eapi 播放分支及搜索/歌词/歌单/专辑/歌手/评论等逻辑不变
 */

const axios = require("axios");
const cheerio = require("cheerio");
const cryptoJS = require("crypto-js");
const qs = require("qs");
const bigInteger = require("big-integer");

// ============================ 核心配置 ============================
const CUSTOM_API_BASE = 'https://zrcdy.dpdns.org/musicfree/api/apiwy.php';
// 播放地址自建主后端（与 LX / qs / kg / kw 同源），主域失败自动回落备选域
const MAIN_API_BASE = 'https://yy.zddyr.top/lx/api/';
const MAIN_API_BACKUP_BASE = 'https://zrcdy.dpdns.org/lx/api/';
const PAGE_SIZE = 20;
const PLUGIN_NAME = 'xinghai-music-source-wy.js';
const UPDATE_URL = 'https://zrcdy.dpdns.org/musicfree/wy/' + PLUGIN_NAME;
// https://zrcdy.dpdns.org/music/ 目录禁止列目录（HTTP 403），改指向实际的项目发布页
const RELEASE_PAGE = 'https://zrcdy.dpdns.org/lx/vers.php';
const PLATFORM = "星海音乐源wy";

// ============================ 网易云 Cookie / 请求头 ============================
// 不再内置 Cookie，由用户在 MusicFree userVariables 中填写 music_u
// 读取 userVariables.music_u（运行时由 MusicFree 框架注入到 env）
function readUserMusicU() {
  try {
    const v = (typeof env !== 'undefined' && env.userVariables && env.userVariables.music_u) || '';
    return (typeof v === 'string' ? v.trim() : '');
  } catch (e) {
    return '';
  }
}
const MUSIC_U = readUserMusicU();
// 是否配置了 MUSIC_U（决定搜索/播放链接走 eapi 还是公开端点）
function hasCookie() {
  return !!MUSIC_U;
}
// 基础 Cookie（os/appver 等设备字段，给 GET 端点用）
const BASE_COOKIE = 'os=pc;osver=Microsoft-Windows-11;appver=3.1.16.204365;';
// 完整 Cookie（带 MUSIC_U，仅 hasCookie 时使用）
const NETEASE_COOKIE = hasCookie()
  ? `${BASE_COOKIE}MUSIC_U=${MUSIC_U};`
  : BASE_COOKIE;
// 所有 music.163.com GET 请求统一使用此 headers
const NETEASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://music.163.com/',
  'Cookie': NETEASE_COOKIE,
  'Accept': '*/*',
  'Accept-Language': 'zh-CN,zh;q=0.9'
};

// 插件 quality 值 → eapi level（参考 Python QUALITY_MAP）
const QUALITY_MAP_EAPI = {
  'low': 'standard',      // 128k
  'standard': 'standard', // 128k
  'high': 'exhigh',       // 320k
  'super': 'lossless'     // flac
};
// 插件 quality 值 → 自建主后端音质参数
// 实测依据（同一歌曲 447926067 多次请求，读取响应 quality/format/quality_requested/quality_fallback 与实际 url 后缀）：
//   - 主后端识别 "128k/320k/flac/hires" 这类风格：requested 原样回显、quality_fallback=false；
//   - 传 "128000/320000/999000" 数值码率时不识别（requested 被回显成 flac，实际只给 320k mp3），故弃用数值风格；
//   - 无损实际到货率：hires/master 稳定返回真实 .flac，而 flac/lossless 多数情况下仍返回 320k mp3，故 super 取 hires
const QUALITY_MAP_MAIN = {
  'low': '128k',
  'standard': '128k',
  'high': '320k',
  'super': 'hires'
};
const SEARCH_TYPE_MAP = {
  'music': 1,
  'album': 10,
  'artist': 100,
  'sheet': 1000,
  'lyric': 1006,
  'mv': 1004
};

// ============================ eapi 加密（参考 Python wy_crypto.py） ============================
const EAPIKEY = cryptoJS.enc.Utf8.parse("e82ckenh8dichen8");

// AES-128-ECB + PKCS7，返回大写 hex（与服务器一致）
function aesEcbEncrypt(text) {
  const encrypted = cryptoJS.AES.encrypt(
    cryptoJS.enc.Utf8.parse(text),
    EAPIKEY,
    { mode: cryptoJS.mode.ECB, padding: cryptoJS.pad.Pkcs7 }
  );
  return encrypted.ciphertext.toString(cryptoJS.enc.Hex).toUpperCase();
}

// eapi 参数加密，返回 POST body 字符串
function eapiEncrypt(path, params) {
  const text = JSON.stringify(params);
  const digest = cryptoJS.MD5(`nobody${path}use${text}md5forencrypt`).toString();
  const payload = `${path}-36cd479b6b5-${text}-36cd479b6b5-${digest}`;
  return `params=${aesEcbEncrypt(payload)}`;
}

// 通用 eapi 请求
async function eapiRequest(path, params) {
  const url = `https://interface.music.163.com/eapi${path.replace('/api', '')}`;
  const body = eapiEncrypt(path, params);
  const res = await axios.post(url, body, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Cookie': NETEASE_COOKIE,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': 'https://music.163.com/'
    },
    timeout: 10000
  });
  return res.data;
}

// 公开搜索端点（无需 Cookie 也能用，规避 -462 风控）
// 注意：返回字段为 artists/album（而非 eapi 的 ar/al），standardizeMusicItem 已兼容
async function searchByPublicApi(query, page, type) {
  const currentPage = page || 1;
  const limit = PAGE_SIZE;
  const searchType = SEARCH_TYPE_MAP[type] || 1;
  const url = `https://music.163.com/api/search/get/web?s=${encodeURIComponent(query)}&type=${searchType}&limit=${limit}&offset=${(currentPage - 1) * limit}`;
  const res = await axios.get(url, {
    headers: NETEASE_HEADERS,
    timeout: 10000
  });
  const data = res.data;
  if (data && data.code === -462) {
    throw new Error('网易云搜索接口要求绑定手机验证（-462）');
  }
  return formatSearchResult(data, type);
}

// ============================ 网易云 weapi 加密（仅用于推荐歌单） ============================
function createRandomKey() {
  const b = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let c = "";
  for (let i = 0; i < 16; i++) {
    const e = Math.floor(Math.random() * b.length);
    c += b.charAt(e);
  }
  return c;
}

function AES(text, key) {
  const keyBytes = cryptoJS.enc.Utf8.parse(key);
  const iv = cryptoJS.enc.Utf8.parse("0102030405060708");
  const encrypted = cryptoJS.AES.encrypt(text, keyBytes, {
    iv: iv,
    mode: cryptoJS.mode.CBC
  });
  return encrypted.toString();
}

function RSA(text) {
  text = text.split("").reverse().join("");
  const d = "010001";
  const e = "00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7";
  const hexText = text.split("").map(_ => _.charCodeAt(0).toString(16)).join("");
  const res = bigInteger(hexText, 16).modPow(bigInteger(d, 16), bigInteger(e, 16)).toString(16);
  const result = Array(256 - res.length).fill("0").join("") + res;
  return result;
}

function getParamsAndEnc(text) {
  const first = AES(text, "0CoJUm6Qyw8W8jud");
  const rand = createRandomKey();
  const params = AES(first, rand);
  const encSecKey = RSA(rand);
  return { params, encSecKey };
}

// weapi headers（叠加 Cookie）
const WEAPI_HEADERS = {
  authority: "music.163.com",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.135 Safari/537.36",
  "content-type": "application/x-www-form-urlencoded",
  accept: "*/*",
  origin: "https://music.163.com",
  "sec-fetch-site": "same-origin",
  "sec-fetch-mode": "cors",
  "sec-fetch-dest": "empty",
  referer: "https://music.163.com/",
  "accept-language": "zh-CN,zh;q=0.9",
  "cookie": NETEASE_COOKIE
};

// ============================ 工具函数 ============================
function buildCustomApiUrl(action, params) {
  const urlParams = new URLSearchParams({ action });
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) urlParams.append(k, v);
  });
  return `${CUSTOM_API_BASE}?${urlParams.toString()}`;
}

async function requestCustomApi(action, params, needSecondary = true, transform = null) {
  const apiUrl = buildCustomApiUrl(action, params);
  const response = await axios.get(apiUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 10000
  });
  const data = response.data;
  if (data.status !== 'success') {
    throw new Error(`API错误: ${data.message || JSON.stringify(data)}`);
  }

  if (!needSecondary) {
    return data;
  }

  if (!data.url) {
    throw new Error('API 未返回官方链接');
  }
  // 二次请求统一带 Cookie + 完整浏览器 headers，规避 -462 风控
  let targetUrl = data.url;
  const officialRes = await axios.get(targetUrl, {
    headers: NETEASE_HEADERS,
    timeout: 10000
  });
  const officialData = officialRes.data;
  // 命中风控时直接抛错，避免静默返回 0 结果
  if (officialData && officialData.code === -462) {
    throw new Error('网易云接口要求绑定手机验证（-462），请检查 Cookie 或更换接口');
  }
  const transformed = transform ? transform(officialData) : officialData;
  return transformed;
}

// 自建主后端播放地址：主域失败（网络异常/非200/code≠200/无url）自动回落备选域重试一次
async function requestMainPlayUrl(songId, qualityParam) {
  const bases = [MAIN_API_BASE, MAIN_API_BACKUP_BASE];
  let lastError = null;
  for (const base of bases) {
    const apiUrl = `${base}?source=wy&quality=${encodeURIComponent(qualityParam)}&id=${encodeURIComponent(String(songId))}`;
    try {
      const response = await axios.get(apiUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 10000
      });
      const data = response.data;
      if (response.status !== 200 || !data || data.code !== 200 || !data.url) {
        throw new Error(`status=${response.status}, code=${data?.code}, msg=${data?.msg || '未返回播放链接'}`);
      }
      return { url: data.url, via: base };
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`自建主后端获取播放地址失败：${lastError ? lastError.message : '未知错误'}`);
}

// ==================== 标准化歌曲对象 ====================
function standardizeMusicItem(song) {
  const album = song.al || song.album || {};
  const artists = song.ar || song.artists || [];
  let artistName = '未知歌手';
  if (artists.length) {
    artistName = artists.map(a => a.name).join(', ');
  } else if (song.artist) {
    artistName = typeof song.artist === 'string' ? song.artist : (song.artist.name || '未知歌手');
  }
  const albumName = album.name || song.albumName || '未知专辑';
  const artwork = album.picUrl || song.albumPicUrl || '';
  const duration = song.dt || song.duration || 0;
  const fee = song.fee !== undefined ? song.fee : 0;
  const qualities = {
    low: { size: song.l?.size || 0 },
    standard: { size: song.m?.size || 0 },
    high: { size: song.h?.size || 0 },
    super: { size: song.sq?.size || 0 }
  };
  return {
    platform: PLATFORM,
    id: String(song.id),
    title: song.name || '',
    artist: artistName,
    album: albumName,
    artwork: artwork,
    duration: duration,
    qualities,
    // 注：不再内置播放地址。原 https://share.duanx.cn/url/wy/<id>/128k 域名已失效（DNS 无法解析），
    // 播放链接统一由 getMediaSource 实时获取
    _songId: String(song.id),
    _rid: String(song.id),
    _fee: fee
  };
}

// ==================== 从 URL 提取歌单 ID ====================
function extractPlaylistId(urlLike) {
  let match = urlLike.match(/[?&]id=(\d{6,})/);
  if (match) return match[1];
  match = urlLike.match(/\/playlist\/(\d{6,})/);
  if (match) return match[1];
  match = urlLike.match(/\/m\/playlist\/(\d{6,})/);
  if (match) return match[1];
  match = urlLike.match(/\/m\/playlist\?id=(\d{6,})/);
  if (match) return match[1];
  match = urlLike.match(/(\d{6,})/);
  if (match) return match[1];
  return null;
}

// ==================== 批量获取歌曲详情 ====================
async function fetchSongDetails(ids) {
  if (!ids || ids.length === 0) return [];
  const batchSize = 200;
  const batches = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    batches.push(ids.slice(i, i + batchSize));
  }
  const allSongs = [];
  for (const batch of batches) {
    const idsStr = batch.join(',');
    const url = `https://music.163.com/api/song/detail/?ids=[${idsStr}]`;
    try {
      const res = await axios.get(url, { headers: NETEASE_HEADERS, timeout: 8000 });
      const songs = res.data.songs;
      if (songs && songs.length) {
        allSongs.push(...songs);
      }
    } catch (e) {
      // ignore
    }
  }
  return allSongs;
}

// ==================== 歌单导入核心逻辑 ====================
async function fetchPlaylistById(id) {
  let playlist = null;
  let trackIds = null;
  // 方法1：自建API
  try {
    const apiUrl = buildCustomApiUrl('get_playlist_detail', { id });
    const res = await axios.get(apiUrl, { timeout: 8000 });
    const data = res.data;
    if (data.status === 'success' && data.url) {
      const officialRes = await axios.get(data.url, { headers: NETEASE_HEADERS, timeout: 8000 });
      playlist = officialRes.data.playlist || officialRes.data;
      if (playlist && playlist.tracks && playlist.tracks.length > 0) {
        const total = playlist.trackCount || playlist.tracks.length;
        if (playlist.tracks.length >= total) {
          return playlist.tracks.map(standardizeMusicItem);
        } else {
          trackIds = playlist.trackIds ? playlist.trackIds.map(t => t.id) : null;
        }
      } else {
        trackIds = playlist?.trackIds ? playlist.trackIds.map(t => t.id) : null;
      }
    }
  } catch (e) {
    // ignore
  }

  // 方法2：官方API
  if (!playlist || !playlist.tracks || playlist.tracks.length < (playlist.trackCount || 0)) {
    try {
      const url = `https://music.163.com/api/v3/playlist/detail?id=${id}&n=5000`;
      const res = await axios.get(url, { headers: NETEASE_HEADERS, timeout: 8000 });
      playlist = res.data.playlist;
      if (playlist && playlist.tracks && playlist.tracks.length > 0) {
        const total = playlist.trackCount || playlist.tracks.length;
        if (playlist.tracks.length >= total) {
          return playlist.tracks.map(standardizeMusicItem);
        } else {
          trackIds = playlist.trackIds ? playlist.trackIds.map(t => t.id) : null;
        }
      } else {
        trackIds = playlist?.trackIds ? playlist.trackIds.map(t => t.id) : null;
      }
    } catch (e) {
      // ignore
    }
  }

  // 方法3：HTML解析
  if (!playlist || !playlist.tracks || playlist.tracks.length < (playlist.trackCount || 0)) {
    try {
      const url = `https://music.163.com/playlist?id=${id}`;
      const res = await axios.get(url, { headers: NETEASE_HEADERS, timeout: 8000 });
      const html = res.data;
      const match = html.match(/window\.REDUX_STATE\s*=\s*({.+?});/);
      if (match) {
        const reduxData = JSON.parse(match[1]);
        playlist = reduxData.playlist || reduxData.Playlist;
        if (playlist && playlist.tracks && playlist.tracks.length > 0) {
          const total = playlist.trackCount || playlist.tracks.length;
          if (playlist.tracks.length >= total) {
            return playlist.tracks.map(standardizeMusicItem);
          } else {
            trackIds = playlist.trackIds ? playlist.trackIds.map(t => t.id) : null;
          }
        } else {
          trackIds = playlist?.trackIds ? playlist.trackIds.map(t => t.id) : null;
        }
      }
    } catch (e) {
      // ignore
    }
  }

  // 通过 trackIds 批量获取
  if (trackIds && trackIds.length > 0) {
    const songs = await fetchSongDetails(trackIds);
    if (songs && songs.length > 0) {
      return songs.map(standardizeMusicItem);
    }
  }

  if (playlist && playlist.tracks && playlist.tracks.length > 0) {
    return playlist.tracks.map(standardizeMusicItem);
  }

  throw new Error('所有方法均无法获取歌单歌曲');
}

// ============================ 搜索格式化 ============================
function formatSearchResult(officialData, type) {
  // 命中风控直接抛错，避免静默返回 0 结果
  if (officialData && officialData.code === -462) {
    throw new Error('网易云接口要求绑定手机验证（-462），请检查 Cookie 或更换接口');
  }
  const result = officialData.result || {};
  let items = [];

  if (type === 'music') {
    const songs = result.songs || [];
    items = songs.map(song => standardizeMusicItem(song));
  } else if (type === 'album') {
    const albums = result.albums || [];
    items = albums.map(album => ({
      id: album.id?.toString() || '',
      title: album.name || '',
      artist: album.artist?.name || '未知歌手',
      artwork: album.picUrl || '',
      coverImg: album.picUrl || '',
      description: album.description || '',
      _albumId: album.id?.toString() || '',
      _type: 'album'
    }));
  } else if (type === 'artist') {
    const artists = result.artists || [];
    items = artists.map(artist => ({
      id: artist.id?.toString() || '',
      name: artist.name || '',
      avatar: artist.picUrl || '',
      worksNum: artist.albumSize || 0,
      description: artist.briefDesc || '',
      _artistId: artist.id?.toString() || '',
      _type: 'artist'
    }));
  } else if (type === 'sheet') {
    const playlists = result.playlists || [];
    items = playlists.map(pl => ({
      id: pl.id?.toString() || '',
      title: pl.name || '',
      artist: pl.creator?.nickname || '未知创建者',
      artwork: pl.coverImgUrl || '',
      coverImg: pl.coverImgUrl || '',
      description: pl.description || '',
      _playlistId: pl.id?.toString() || '',
      _type: 'playlist',
      trackCount: pl.trackCount || 0,
      playCount: pl.playCount || 0
    }));
  } else if (type === 'lyric') {
    const songs = result.songs || [];
    items = songs.map(song => standardizeMusicItem(song));
  }

  const isEnd = items.length < PAGE_SIZE;
  return { isEnd, data: items };
}

function formatSongDetail(officialData) {
  const song = officialData.songs?.[0];
  if (!song) return null;
  return standardizeMusicItem(song);
}

function formatComment(officialData, commentLimit) {
  // isEnd 需按本次实际请求的 limit 判定，否则 limit != PAGE_SIZE 时会一直翻页
  const commentPageSize = commentLimit || PAGE_SIZE;
  const hot = (officialData.hotComments || []).map(c => ({
    id: c.commentId?.toString() || '',
    nickName: c.user?.nickname || '匿名',
    avatar: c.user?.avatarUrl || '',
    comment: c.content || '',
    like: c.likedCount || 0,
    createAt: c.time || Date.now(),
    location: c.ipLocation?.location || '',
    replies: (c.beReplied || []).map(r => ({
      id: r.commentId?.toString() || '',
      nickName: r.user?.nickname || '匿名',
      avatar: r.user?.avatarUrl || '',
      comment: r.content || '',
      like: 0,
      createAt: r.time || Date.now(),
      location: r.ipLocation?.location || '',
      replies: []
    }))
  }));
  const normal = (officialData.comments || []).map(c => ({
    id: c.commentId?.toString() || '',
    nickName: c.user?.nickname || '匿名',
    avatar: c.user?.avatarUrl || '',
    comment: c.content || '',
    like: c.likedCount || 0,
    createAt: c.time || Date.now(),
    location: c.ipLocation?.location || '',
    replies: (c.beReplied || []).map(r => ({
      id: r.commentId?.toString() || '',
      nickName: r.user?.nickname || '匿名',
      avatar: r.user?.avatarUrl || '',
      comment: r.content || '',
      like: 0,
      createAt: r.time || Date.now(),
      location: r.ipLocation?.location || '',
      replies: []
    }))
  }));
  const allComments = [...hot, ...normal];
  const isEnd = normal.length < commentPageSize;
  return { isEnd, data: allComments };
}

// ==================== 获取歌单详情（支持分页，自动补充完整）====================
async function getMusicSheetInfo(sheetItem, page) {
  const playlistId = sheetItem._playlistId || sheetItem.id;
  if (!playlistId) throw new Error('歌单ID缺失');

  let allTracks = sheetItem._tracks;
  if (!allTracks) {
    const result = await requestCustomApi('get_playlist_detail', { id: playlistId }, true, (data) => {
      const playlist = data.playlist || data;
      if (!playlist.tracks && !playlist.trackIds) return { musicList: [] };
      return { playlist };
    });
    const playlist = result.playlist;
    if (!playlist) throw new Error('获取歌单数据失败');

    let tracks = playlist.tracks || [];
    const trackCount = playlist.trackCount || tracks.length;
    if (tracks.length < trackCount && playlist.trackIds && playlist.trackIds.length) {
      const trackIds = playlist.trackIds.map(t => t.id);
      const songs = await fetchSongDetails(trackIds);
      if (songs && songs.length) {
        tracks = songs;
      }
    }
    allTracks = tracks.map(standardizeMusicItem);
    sheetItem._tracks = allTracks;
  }

  const start = (page - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageTracks = allTracks.slice(start, end);
  const isEnd = end >= allTracks.length;

  return {
    isEnd,
    musicList: pageTracks
  };
}

// ==================== 专辑详情 ====================
async function getAlbumInfo(albumItem, page) {
  const albumId = albumItem._albumId || albumItem.id;
  if (!albumId) throw new Error('专辑ID缺失');

  let album = null;
  let songs = [];

  try {
    const result = await requestCustomApi('get_album_detail', { id: albumId }, true, (data) => {
      const albumData = data.album || data;
      return { album: albumData };
    });
    album = result.album;
    if (album && album.songs && album.songs.length) {
      songs = album.songs;
    }
  } catch (e) {
    // ignore
  }

  if (!songs.length) {
    try {
      let url = `https://music.163.com/api/v1/album/${albumId}`;
      let res = await axios.get(url, { headers: NETEASE_HEADERS, timeout: 8000 });
      let data = res.data;
      if (data.album && data.album.songs && data.album.songs.length) {
        songs = data.album.songs;
        album = data.album;
      } else if (data.songs && data.songs.length) {
        songs = data.songs;
        album = data.album || {};
      }
    } catch (e) {
      // ignore
    }
  }

  if (!songs.length) {
    try {
      let url = `https://music.163.com/api/album/${albumId}`;
      let res = await axios.get(url, { headers: NETEASE_HEADERS, timeout: 8000 });
      let data = res.data;
      if (data.album && data.album.songs && data.album.songs.length) {
        songs = data.album.songs;
        album = data.album;
      } else if (data.songs && data.songs.length) {
        songs = data.songs;
        album = data.album || {};
      }
    } catch (e) {
      // ignore
    }
  }

  if (!songs.length && album && album.trackIds && album.trackIds.length) {
    const trackIds = album.trackIds.map(t => t.id);
    const fetched = await fetchSongDetails(trackIds);
    if (fetched.length) {
      songs = fetched;
    }
  }

  if (!songs.length && album && album.size && album.size > 0) {
    try {
      const url = `https://music.163.com/album?id=${albumId}`;
      const res = await axios.get(url, { headers: NETEASE_HEADERS, timeout: 8000 });
      const html = res.data;
      const match = html.match(/<textarea[^>]*id="song-list-pre-data"[^>]*>([\s\S]*?)<\/textarea>/);
      if (match) {
        const songData = JSON.parse(match[1]);
        if (songData && songData.length) {
          songs = songData;
        }
      } else {
        const reduxMatch = html.match(/window\.REDUX_STATE\s*=\s*({.+?});/);
        if (reduxMatch) {
          const redux = JSON.parse(reduxMatch[1]);
          const albumState = redux.album || redux.Album;
          if (albumState && albumState.tracks && albumState.tracks.length) {
            songs = albumState.tracks;
          }
        }
      }
    } catch (e) {
      // ignore
    }
  }

  if (!songs.length) {
    throw new Error('无法获取专辑歌曲列表');
  }

  const allTracks = songs.map(standardizeMusicItem);

  return {
    isEnd: true,
    musicList: allTracks,
    albumItem: {
      id: album?.id?.toString() || String(albumId),
      title: album?.name || '未知专辑',
      artist: album?.artist?.name || (album?.artists && album.artists[0]?.name) || '未知歌手',
      artwork: album?.picUrl || '',
      coverImg: album?.picUrl || '',
      description: album?.description || '',
      _albumId: String(albumId),
      _type: 'album'
    }
  };
}

// ==================== 榜单相关 ====================
async function getTopLists() {
  try {
    const res = await axios.get("https://music.163.com/discover/toplist", {
      headers: {
        referer: "https://music.163.com/",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36 Edg/108.0.1462.54",
        "cookie": NETEASE_COOKIE
      },
      timeout: 10000
    });
    const $ = cheerio.load(res.data);
    const children = $(".n-minelst").children();
    const groups = [];
    let currentGroup = {};
    for (let c of children) {
      if (c.tagName == "h2") {
        if (currentGroup.title) {
          groups.push(currentGroup);
        }
        currentGroup = {};
        currentGroup.title = $(c).text();
        currentGroup.data = [];
      } else if (c.tagName === "ul") {
        let sections = $(c).children();
        currentGroup.data = sections
          .map((index, element) => {
            const ele = $(element);
            const id = ele.attr("data-res-id");
            const coverImg = ele
              .find("img")
              .attr("src")
              .replace(/(\.jpg\?).*/, ".jpg?param=800y800");
            const title = ele.find("p.name").text();
            const description = ele.find("p.s-fc4").text();
            return {
              id,
              coverImg,
              title,
              description,
            };
          })
          .toArray();
      }
    }
    if (currentGroup.title) {
      groups.push(currentGroup);
    }
    return groups;
  } catch (error) {
    const fallback = [
      { title: '官方榜单', data: [
        { id: '19723756', coverImg: 'https://p2.music.126.net/DrRIg6CrgDfRLEFJL7w9Sw==/109951164249078433.jpg', title: '飙升榜', description: '云音乐飙升榜' },
        { id: '3779629', coverImg: 'https://p2.music.126.net/DrRIg6CrgDfRLEFJL7w9Sw==/109951164249078433.jpg', title: '云音乐新歌榜', description: '云音乐新歌榜' },
        { id: '3778678', coverImg: 'https://p2.music.126.net/DrRIg6CrgDfRLEFJL7w9Sw==/109951164249078433.jpg', title: '热歌榜', description: '云音乐热歌榜' }
      ] }
    ];
    return fallback;
  }
}

async function getTopListDetail(topListItem, page) {
  const playlistId = topListItem.id;
  if (!playlistId) return { isEnd: true, musicList: [] };
  const result = await getMusicSheetInfo({ id: playlistId }, page || 1);
  return {
    ...topListItem,
    musicList: result.musicList,
    isEnd: result.isEnd
  };
}

// ==================== 推荐歌单相关 ====================
async function getRecommendSheetTags() {
  const data = { csrf_token: "" };
  const pae = getParamsAndEnc(JSON.stringify(data));
  const paeData = qs.stringify(pae);
  try {
    const res = await axios({
      method: "post",
      url: "https://music.163.com/weapi/playlist/catalogue",
      headers: WEAPI_HEADERS,
      data: paeData,
      timeout: 10000
    });
    const result = res.data;
    const cats = result.categories;
    const sub = result.sub;

    const pinned = sub.filter(tag => tag.hot).map(tag => ({ id: tag.name, title: tag.name }));
    const groups = [];
    const map = {};
    for (const [catId, catName] of Object.entries(cats)) {
      map[catId] = { id: catId, title: catName, data: [] };
    }
    for (const tag of sub) {
      const catId = String(tag.category);
      if (map[catId]) {
        map[catId].data.push({ id: tag.name, title: tag.name });
      } else {
        if (!map['other']) map['other'] = { id: 'other', title: '其他', data: [] };
        map['other'].data.push({ id: tag.name, title: tag.name });
      }
    }
    for (const group of Object.values(map)) {
      if (group.data && group.data.length > 0) groups.push(group);
    }
    return { pinned, data: groups };
  } catch (e) {
    const pinned = [
      { id: '全部', title: '全部' },
      { id: '华语', title: '华语' },
      { id: '流行', title: '流行' },
      { id: '电子', title: '电子' }
    ];
    const groups = [
      { id: 'lang', title: '语种', data: [
        { id: '华语', title: '华语' },
        { id: '欧美', title: '欧美' },
        { id: '日语', title: '日语' },
        { id: '韩语', title: '韩语' },
        { id: '粤语', title: '粤语' },
        { id: '小语种', title: '小语种' }
      ] },
      { id: 'style', title: '风格', data: [
        { id: '流行', title: '流行' },
        { id: '摇滚', title: '摇滚' },
        { id: '电子', title: '电子' },
        { id: '民谣', title: '民谣' },
        { id: '嘻哈', title: '嘻哈' },
        { id: 'R&B', title: 'R&B' },
        { id: '古典', title: '古典' },
        { id: '轻音乐', title: '轻音乐' }
      ] },
      { id: 'scene', title: '场景', data: [
        { id: '学习', title: '学习' },
        { id: '工作', title: '工作' },
        { id: '运动', title: '运动' },
        { id: '睡眠', title: '睡眠' },
        { id: '旅行', title: '旅行' },
        { id: '开车', title: '开车' }
      ] },
      { id: 'mood', title: '心情', data: [
        { id: '治愈', title: '治愈' },
        { id: '放松', title: '放松' },
        { id: '伤感', title: '伤感' },
        { id: '快乐', title: '快乐' },
        { id: '思念', title: '思念' }
      ] }
    ];
    return { pinned, data: groups };
  }
}

async function getRecommendSheetsByTag(tag, page) {
  const cat = tag.id || '全部';
  const pageSize = PAGE_SIZE;
  const data = {
    cat: cat,
    order: "hot",
    limit: pageSize,
    offset: (page - 1) * pageSize,
    total: true,
    csrf_token: ""
  };
  const pae = getParamsAndEnc(JSON.stringify(data));
  const paeData = qs.stringify(pae);
  try {
    const res = await axios({
      method: "post",
      url: "https://music.163.com/weapi/playlist/list",
      headers: WEAPI_HEADERS,
      data: paeData,
      timeout: 10000
    });
    const result = res.data;
    const playlists = result.playlists || [];
    const items = playlists.map(pl => ({
      id: pl.id?.toString() || '',
      title: pl.name || '',
      artist: pl.creator?.nickname || '未知创建者',
      artwork: pl.coverImgUrl || '',
      coverImg: pl.coverImgUrl || '',
      description: pl.description || '',
      _playlistId: pl.id?.toString() || '',
      _type: 'playlist',
      trackCount: pl.trackCount || 0,
      playCount: pl.playCount || 0
    }));
    const isEnd = !(result.more === true);
    return { isEnd, data: items };
  } catch (e) {
    return { isEnd: true, data: [] };
  }
}

// ==================== 歌手相关 ====================
async function getArtistInfo(artistItem, page) {
  const artistId = artistItem._artistId || artistItem.id;
  if (!artistId) throw new Error('歌手ID缺失');
  const result = await requestCustomApi('get_artist_detail', { id: artistId }, true, (data) => {
    const artist = data.artist || data;
    return {
      id: artist.id?.toString() || '',
      title: artist.name || '',
      artwork: artist.picUrl || '',
      description: artist.briefDesc || '',
      _artistId: artist.id?.toString() || '',
      _type: 'artist'
    };
  });
  return result;
}

async function getArtistAlbums(artistId, page) {
  const limit = PAGE_SIZE;
  const offset = (page - 1) * limit;
  const url = `https://music.163.com/api/artist/albums/${artistId}?limit=${limit}&offset=${offset}`;
  try {
    const res = await axios.get(url, { headers: NETEASE_HEADERS, timeout: 8000 });
    const data = res.data;
    if (data.code !== 200) throw new Error(`API返回错误码 ${data.code}`);
    const albums = data.hotAlbums || data.albums || [];
    const items = albums.map(album => ({
      id: album.id?.toString() || '',
      title: album.name || '',
      artist: album.artist?.name || '未知歌手',
      artwork: album.picUrl || '',
      coverImg: album.picUrl || '',
      description: album.description || '',
      _albumId: album.id?.toString() || '',
      _type: 'album'
    }));
    const isEnd = items.length < limit;
    return { isEnd, data: items };
  } catch (e) {
    return { isEnd: true, data: [] };
  }
}

async function getArtistWorks(artistItem, page, type) {
  const artistId = artistItem._artistId || artistItem.id;
  if (!artistId) throw new Error('歌手ID缺失');

  if (type === 'music') {
    try {
      const result = await requestCustomApi('get_artist_detail', { id: artistId }, true, (data) => {
        const artist = data.artist || data;
        const hotSongs = artist.hotSongs || data.hotSongs || [];
        const songs = hotSongs.map(standardizeMusicItem);
        const start = (page - 1) * PAGE_SIZE;
        const end = start + PAGE_SIZE;
        const pageSongs = songs.slice(start, end);
        const isEnd = end >= songs.length;
        return { isEnd, data: pageSongs };
      });
      return result;
    } catch (e) {
      return { isEnd: true, data: [] };
    }
  } else if (type === 'album') {
    return await getArtistAlbums(artistId, page);
  } else {
    return { isEnd: true, data: [] };
  }
}

// ==================== 评论相关 ====================
async function getMusicComments(musicItem, page, pageSize) {
  const songId = musicItem._rid || musicItem._songId || musicItem.id;
  if (!songId) return { isEnd: true, data: [] };
  const limit = Math.min(pageSize || 20, 100);
  const offset = ((page || 1) - 1) * limit;
  return await requestCustomApi('get_comment', { id: songId, limit, offset }, true, (data) => formatComment(data, limit));
}

// ============================ 插件导出 ============================
module.exports = {
  platform: PLATFORM,
  version: "1.7",
  author: "万去了了",
  srcUrl: UPDATE_URL,
  cacheControl: "no-cache",
  supportedSearchType: ["music", "album", "artist", "sheet", "lyric"],
  primaryKey: ["id", "_songId", "_rid"],
  hints: {
    importMusicItem: ["支持导入网易云歌曲链接或ID"],
    importMusicSheet: ["支持导入网易云歌单链接或ID"],
    feedback: ["问题反馈: https://zrcdy.dpdns.org/lx/fk/index.html"],
  },
  userVariables: [
    {
      key: "music_u",
      name: "网易云 Cookie (MUSIC_U)",
      hint: "可选。留空也能搜索和播放（走公开接口）。填写自己的 MUSIC_U 后可走 eapi 免 API 获取更稳定/更高音质播放链接"
    }
  ],

  // 搜索：有 Cookie 走 eapi（字段更完整，含 ar/al/音质 size）；无 Cookie 走公开 GET 端点
  search: async function(query, page, type) {
    if (hasCookie()) {
      const currentPage = page || 1;
      const limit = PAGE_SIZE;
      const searchType = SEARCH_TYPE_MAP[type] || 1;
      const params = {
        s: query,
        type: searchType,
        limit: limit,
        offset: (currentPage - 1) * limit
      };
      const data = await eapiRequest('/api/cloudsearch/get/web', params);
      if (data && data.code === -462) {
        throw new Error('网易云搜索接口要求绑定手机验证（-462），请检查 MUSIC_U Cookie');
      }
      return formatSearchResult(data, type);
    }
    // 无 Cookie：走公开 GET 端点（不需要登录，规避 -462）
    return await searchByPublicApi(query, page, type);
  },

  // 播放链接：有 Cookie 用 eapi 免 API 拿直链；无 Cookie 走自建主后端
  getMediaSource: async function(musicItem, quality) {
    const songId = musicItem._rid || musicItem._songId || musicItem.id;
    if (!songId) throw new Error('歌曲ID缺失');

    // 有 Cookie：eapi 免 API 直链（参考 Python wy_test.py）
    if (hasCookie()) {
      const level = QUALITY_MAP_EAPI[quality] || 'exhigh';
      const params = {
        ids: JSON.stringify([String(songId)]),
        level: level,
        encodeType: 'flac'
      };
      const data = await eapiRequest('/api/song/enhance/player/url/v1', params);
      if (!data || data.code !== 200) {
        throw new Error(`eapi 返回异常 code=${data?.code}`);
      }
      const d = data.data && data.data[0];
      if (!d || !d.url) {
        throw new Error(`无播放链接 | song code=${d?.code}, fee=${d?.fee}`);
      }
      return {
        url: d.url.split('?')[0],
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://music.163.com/'
        }
      };
    }

    // 无 Cookie：自建主后端（yy.zddyr.top/lx/api），主域失败回落 zrcdy.dpdns.org/lx/api
    const qualityParam = QUALITY_MAP_MAIN[quality] || '320k';
    const playInfo = await requestMainPlayUrl(songId, qualityParam);
    return {
      url: playInfo.url,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    };
  },

  getMusicInfo: async function(musicItem) {
    const songId = musicItem._rid || musicItem._songId || musicItem.id;
    if (!songId) return musicItem;
    const detail = await requestCustomApi('get_song_detail', { id: songId }, true, formatSongDetail);
    if (!detail) return musicItem;
    return { ...musicItem, ...detail };
  },

  // 歌词获取：eapi /api/song/lyric（无需 Cookie 也能用，比搜索接口更宽松）
  // 原 1.5 版用的自建后端 lyric_proxy.php 已失效（返回 401），改走网易云官方 eapi
  getLyric: async function(musicItem) {
    const songId = musicItem._rid || musicItem._songId || musicItem.id;
    if (!songId) return null;
    try {
      const params = { id: String(songId), lv: -1, tv: -1, sv: -1 };
      const data = await eapiRequest('/api/song/lyric', params);
      if (!data || data.code !== 200) {
        return null;
      }
      const rawLrc = data.lrc?.lyric || '';
      const translation = data.tlyric?.lyric || '';
      if (!rawLrc) return null;
      return { rawLrc, translation };
    } catch (err) {
      console.error('[星海] 获取歌词失败:', err.message);
      return null;
    }
  },

  getMusicComments,
  importMusicItem: async function(urlLike) {
    const id = urlLike.match(/(\d{6,})/)?.[0];
    if (!id) throw new Error('无法提取歌曲ID');
    const detail = await requestCustomApi('get_song_detail', { id }, true, formatSongDetail);
    if (!detail) throw new Error('获取歌曲信息失败');
    return detail;
  },
  importMusicSheet: async function(urlLike) {
    const id = extractPlaylistId(urlLike);
    if (!id) throw new Error('无法从链接中提取歌单ID');
    const musicItems = await fetchPlaylistById(id);
    if (!musicItems || musicItems.length === 0) throw new Error('未获取到任何歌曲');
    return musicItems;
  },
  getAlbumInfo,
  getMusicSheetInfo,
  getArtistInfo,
  getArtistWorks,
  getTopLists,
  getTopListDetail,
  getRecommendSheetTags,
  getRecommendSheetsByTag
};
