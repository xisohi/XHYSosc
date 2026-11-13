/*!
 * @name RadioBrowser
 * @version 0.0.2
 * @description 基于 radio-browser.info API，提供全球电台，支持中文翻译
 * @author 星海 & 万去了了
 * @updateURL https://zrcdy.dpdns.org/musicfree/dt/xinghai-radio-browser.infov0.1.js
 * @Update 修复失效镜像与解析接口、更新地址错误及连续失败计数未重置
 */

var axios = require("axios");

// ============================ 核心配置 ============================
var PLATFORM = "RadioBrowser";
var API_MIRRORS = [
    "https://de1.api.radio-browser.info/json",
    "https://de2.api.radio-browser.info/json"
];
var PAGE_SIZE = 30;
var APP_NAME = "MusicFreePlugin/0.0.2 (radio-browser)";
var REQUEST_TIMEOUT = 25000;
var MAX_RETRIES = 3;

// 远程解析接口配置（原接口已下线，使用 RadioBrowser 返回的 url_resolved）
var RESOLVER_URL = "";

// ============================ 翻译映射表 ============================
var COUNTRY_TRANSLATIONS = {
    "The United States Of America": "美国", "United States": "美国", "USA": "美国",
    "Germany": "德国", "The Russian Federation": "俄罗斯", "Russia": "俄罗斯",
    "France": "法国", "Mexico": "墨西哥", "Greece": "希腊",
    "The United Kingdom Of Great Britain And Northern Ireland": "英国",
    "United Kingdom": "英国", "UK": "英国", "Australia": "澳大利亚",
    "China": "中国", "Italy": "意大利", "Canada": "加拿大", "Brazil": "巴西",
    "Spain": "西班牙", "The Netherlands": "荷兰", "Netherlands": "荷兰",
    "India": "印度", "Poland": "波兰", "The Philippines": "菲律宾",
    "Philippines": "菲律宾", "The United Arab Emirates": "阿联酋",
    "United Arab Emirates": "阿联酋", "Argentina": "阿根廷", "Romania": "罗马尼亚",
    "Japan": "日本", "South Korea": "韩国", "Korea": "韩国", "Taiwan": "台湾",
    "Hong Kong": "香港", "Thailand": "泰国", "Vietnam": "越南",
    "Singapore": "新加坡", "Malaysia": "马来西亚", "Indonesia": "印度尼西亚",
    "Turkey": "土耳其", "Sweden": "瑞典", "Norway": "挪威", "Denmark": "丹麦",
    "Finland": "芬兰", "Switzerland": "瑞士", "Austria": "奥地利",
    "Belgium": "比利时", "Portugal": "葡萄牙", "New Zealand": "新西兰",
    "South Africa": "南非", "Egypt": "埃及", "Israel": "以色列",
    "Saudi Arabia": "沙特阿拉伯", "Iran": "伊朗", "Iraq": "伊拉克",
    "Pakistan": "巴基斯坦", "Bangladesh": "孟加拉国", "Nigeria": "尼日利亚",
    "Kenya": "肯尼亚", "Colombia": "哥伦比亚", "Chile": "智利", "Peru": "秘鲁",
    "Venezuela": "委内瑞拉", "Cuba": "古巴"
};

var TAG_TRANSLATIONS = {
    "pop": "流行", "music": "音乐", "rock": "摇滚", "news": "新闻",
    "radio": "电台", "entretenimiento": "娱乐", "estación": "电台站",
    "classical": "古典", "mexico": "墨西哥", "norteamérica": "北美",
    "fm": "调频", "talk": "谈话", "dance": "舞曲", "hits": "热门",
    "moi merino": "莫伊·梅里诺", "jazz": "爵士", "blues": "蓝调",
    "country": "乡村", "electronic": "电子", "hip hop": "嘻哈",
    "rnb": "节奏布鲁斯", "soul": "灵魂乐", "reggae": "雷鬼", "latin": "拉丁",
    "world": "世界音乐", "folk": "民谣", "metal": "金属", "punk": "朋克",
    "alternative": "另类", "indie": "独立", "chillout": "驰放",
    "lounge": "沙发", "ambient": "氛围", "instrumental": "纯音乐",
    "easy listening": "轻音乐", "oldies": "老歌", "80s": "80年代",
    "90s": "90年代", "top40": "前40", "christian": "基督教", "gospel": "福音",
    "religious": "宗教", "community": "社区", "college": "校园",
    "public": "公共", "local": "本地", "variety": "综合", "sports": "体育",
    "weather": "天气", "traffic": "交通", "comedy": "喜剧", "culture": "文化",
    "education": "教育", "technology": "科技", "health": "健康",
    "business": "商业", "finance": "财经", "politics": "政治",
    "government": "政府"
};

function getTranslatedCountryName(originalName) {
    var translated = COUNTRY_TRANSLATIONS[originalName];
    if (translated) return originalName + " (" + translated + ")";
    for (var key in COUNTRY_TRANSLATIONS) {
        if (COUNTRY_TRANSLATIONS.hasOwnProperty(key) && originalName.toLowerCase().indexOf(key.toLowerCase()) >= 0) {
            return originalName + " (" + COUNTRY_TRANSLATIONS[key] + ")";
        }
    }
    return originalName;
}

function getTranslatedTagName(originalName) {
    var lowerName = originalName.toLowerCase();
    var translated = TAG_TRANSLATIONS[lowerName];
    if (translated) return originalName + " (" + translated + ")";
    for (var key in TAG_TRANSLATIONS) {
        if (TAG_TRANSLATIONS.hasOwnProperty(key) && lowerName.indexOf(key) >= 0) {
            return originalName + " (" + TAG_TRANSLATIONS[key] + ")";
        }
    }
    return originalName;
}

// ============================ 用户变量 ============================
var USER_VARIABLES = [
    {
        title: 'streamFormat',
        key: '流格式 (1~3)',
        type: 'input',
        defaultValue: '1',
        hint: '1=MP3(默认) 2=AAC 3=HLS(m3u8)',
        description: '1=MP3(默认), 2=AAC, 3=HLS(m3u8)'
    },
    {
        title: 'maxConsecutiveFails',
        key: '连续失败停止数 (0=不限)',
        type: 'input',
        defaultValue: '3',
        hint: '连续失败N首后停止切歌，0=不限制',
        description: '连续失败多少首后停止切歌，0=不限制'
    },
    {
        title: 'skipResolveForDirectUrls',
        key: '跳过直链解析',
        type: 'radio',
        options: [
            { value: '1', label: '开启 (推荐)' },
            { value: '0', label: '关闭' }
        ],
        defaultValue: '1',
        hint: '对能直接使用的链接跳过'
    },
    {
        title: 'playDelay',
        key: '播放前延迟(毫秒)',
        type: 'input',
        defaultValue: '0',
        hint: '单位：毫秒，0为不延迟',
        description: '返回流地址前等待的毫秒数，可缓解闪退'
    }
];




// ============================ 全局失败计数器 ============================
var consecutiveFails = 0;
var lastFailedStationId = null;

console.log('[RadioBrowser] 插件 v0.0.2 已加载');

// ============================ 工具函数 ============================
function delay(ms) {
    return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

function isDirectAudioUrl(url) {
    if (!url) return false;
    var lowerUrl = url.toLowerCase();
    var extensions = ['.mp3', '.m3u8', '.aac', '.ogg', '.wav', '.flac', '.m4a', '.opus'];
    for (var i = 0; i < extensions.length; i++) {
        if (lowerUrl.indexOf(extensions[i]) >= 0) return true;
    }
    return false;
}

function requestWithRetry(endpoint, params, mirrorIndex, retryCount) {
    if (mirrorIndex === undefined) mirrorIndex = 0;
    if (retryCount === undefined) retryCount = 0;
    
    var baseUrl = API_MIRRORS[mirrorIndex % API_MIRRORS.length];
    var url = baseUrl + '/' + endpoint;
    var firstParam = true;
    
    for (var key in params) {
        if (params.hasOwnProperty(key) && params[key] !== undefined && params[key] !== null) {
            url += (firstParam ? '?' : '&') + key + '=' + encodeURIComponent(String(params[key]));
            firstParam = false;
        }
    }
    
    return axios.get(url, {
        headers: { 'User-Agent': APP_NAME },
        timeout: REQUEST_TIMEOUT
    }).then(function(response) {
        return response.data;
    }).catch(function(error) {
        console.warn('[RadioBrowser] 请求失败 (镜像' + mirrorIndex + ', 重试' + retryCount + '): ' + error.message);
        if (retryCount < MAX_RETRIES) {
            return delay(1000 * (retryCount + 1)).then(function() {
                return requestWithRetry(endpoint, params, mirrorIndex, retryCount + 1);
            });
        }
        if (mirrorIndex < API_MIRRORS.length - 1) {
            return requestWithRetry(endpoint, params, mirrorIndex + 1, 0);
        }
        throw new Error('所有镜像请求失败: ' + error.message);
    });
}

function resolveStreamUrlRemote(originalUrl) {
    if (!RESOLVER_URL) return Promise.resolve(originalUrl);
    var resolverUrl = RESOLVER_URL + '?url=' + encodeURIComponent(originalUrl);
    return axios.get(resolverUrl, {
        timeout: 15000,
        headers: { 'User-Agent': APP_NAME }
    }).then(function(response) {
        var data = response.data;
        return (data.success && data.final_url) ? data.final_url : originalUrl;
    }).catch(function() {
        return originalUrl;
    });
}

function sanitizeStreamUrl(url) {
    return url ? ('' + url).trim() : '';
}

function convertStationToMusicItem(station) {
    var streamUrl = sanitizeStreamUrl(station.url_resolved || station.url);
    return {
        id: 'rb_' + station.stationuuid,
        title: station.name || '未知电台',
        artist: (station.country || '') + ' ' + (station.state || '') + ' ' + (station.language || '').trim() || 'RadioBrowser',
        album: station.tags || '网络电台',
        artwork: station.favicon || '',
        duration: 0,
        url: streamUrl,
        platform: PLATFORM,
        _raw: station,
        _stationuuid: station.stationuuid,
        _streamUrl: streamUrl,
        _bitrate: station.bitrate,
        _codec: station.codec,
        _hls: station.hls
    };
}

// ============================ API 封装 ============================
var API = {
    getStationsByCountry: function(countryCode, offset, limit) {
        offset = offset || 0; limit = limit || PAGE_SIZE;
        return requestWithRetry('stations/bycountrycodeexact/' + countryCode, {
            hidebroken: true, limit: limit, offset: offset, order: 'clicks', reverse: true
        });
    },
    getStationsByTag: function(tag, offset, limit) {
        offset = offset || 0; limit = limit || PAGE_SIZE;
        return requestWithRetry('stations/bytag/' + encodeURIComponent(tag), {
            hidebroken: true, limit: limit, offset: offset, order: 'clicks', reverse: true
        });
    },
    getStationsByLanguage: function(lang, offset, limit) {
        offset = offset || 0; limit = limit || PAGE_SIZE;
        return requestWithRetry('stations/bylanguage/' + encodeURIComponent(lang), {
            hidebroken: true, limit: limit, offset: offset, order: 'clicks', reverse: true
        });
    },
    searchStations: function(name, offset, limit) {
        offset = offset || 0; limit = limit || PAGE_SIZE;
        return requestWithRetry('stations/search', {
            name: name, hidebroken: true, limit: limit, offset: offset, order: 'clicks', reverse: true
        });
    },
    getTopClick: function(offset, limit) {
        offset = offset || 0; limit = limit || PAGE_SIZE;
        return requestWithRetry('stations/topclick', {
            hidebroken: true, limit: limit, offset: offset
        });
    },
    getCountries: function() {
        return requestWithRetry('countries', { order: 'stationcount', reverse: true });
    },
    getLanguages: function() {
        return requestWithRetry('languages', { order: 'stationcount', reverse: true, limit: 50 });
    },
    getTags: function() {
        return requestWithRetry('tags', { order: 'stationcount', reverse: true, limit: 100 });
    }
};

// ============================ 插件导出 ============================
module.exports = {
    platform: PLATFORM,
    version: "0.0.2",
    author: "星海 & 万去了了",
    srcUrl: "https://zrcdy.dpdns.org/musicfree/dt/xinghai-radio-browser.infov0.1.js",
    cacheControl: "no-cache",
    supportedSearchType: ["music"],
    primaryKey: ["id", "_stationuuid"],
    userVariables: USER_VARIABLES,

    // -------------------- 搜索 --------------------
    search: function(query, page, type) {
        var offset = ((page || 1) - 1) * PAGE_SIZE;
        return API.searchStations(query, offset, PAGE_SIZE).then(function(stations) {
            return { isEnd: stations.length < PAGE_SIZE, data: stations.map(convertStationToMusicItem) };
        }).catch(function() {
            return { isEnd: true, data: [] };
        });
    },

    // -------------------- 媒体源 --------------------
    getMediaSource: function(musicItem, quality) {
        var station = musicItem._raw;
        if (!station) return Promise.reject(new Error('电台原始数据缺失'));
        
        var stationName = station.name || '未知电台';
        console.log('[RadioBrowser][' + stationName + '] 获取媒体源');
        
        var maxFails = parseInt((this.userVariables && this.userVariables.maxConsecutiveFails) || '3', 10);
        if (maxFails > 0 && consecutiveFails >= maxFails) {
            return Promise.reject(new Error('连续播放失败已达' + maxFails + '次，已停止切歌'));
        }
        
        var formatChoice = (this.userVariables && this.userVariables.streamFormat) || '1';
        var skipResolve = (this.userVariables && this.userVariables.skipResolveForDirectUrls) || '1';
        var playDelayMs = parseInt((this.userVariables && this.userVariables.playDelay) || '0', 10) || 0;
        
        var mimeType = formatChoice === '2' ? 'audio/aac' : (formatChoice === '3' ? 'application/vnd.apple.mpegurl' : 'audio/mpeg');
        
        var candidateUrls = [];
        var primaryUrl = sanitizeStreamUrl(station.url_resolved || station.url);
        var fallbackUrl = sanitizeStreamUrl(station.url);
        if (primaryUrl) candidateUrls.push({ url: primaryUrl, desc: 'url_resolved' });
        if (fallbackUrl && fallbackUrl !== primaryUrl) candidateUrls.push({ url: fallbackUrl, desc: 'url' });
        
        if (!candidateUrls.length) {
            return this._handleMediaSourceFailure(station.stationuuid, stationName, '无可用流地址');
        }
        
        var self = this;
        function tryCandidate(index) {
            if (index >= candidateUrls.length) {
                return self._handleMediaSourceFailure(station.stationuuid, stationName, '所有地址不可用');
            }
            var candidate = candidateUrls[index];
            var shouldResolve = !(skipResolve === '1' && isDirectAudioUrl(candidate.url));
            var promise = shouldResolve ? resolveStreamUrlRemote(candidate.url) : Promise.resolve(candidate.url);
            
            return promise.then(function(resolvedUrl) {
                var finalMime = mimeType;
                if (resolvedUrl.indexOf('.m3u8') >= 0 || station.hls === 1) finalMime = 'application/vnd.apple.mpegurl';
                else if (resolvedUrl.indexOf('.aac') >= 0) finalMime = 'audio/aac';
                else if (resolvedUrl.indexOf('.mp3') >= 0) finalMime = 'audio/mpeg';
                
                return (playDelayMs > 0 ? delay(playDelayMs) : Promise.resolve()).then(function() {
                    consecutiveFails = 0;
                    lastFailedStationId = null;
                    console.log('[RadioBrowser][' + stationName + '] 最终URL: ' + resolvedUrl);
                    return {
                        url: resolvedUrl,
                        mime: finalMime,
                        headers: { 'User-Agent': APP_NAME, 'Referer': 'https://www.radio-browser.info/' }
                    };
                });
            }).catch(function() {
                return tryCandidate(index + 1);
            });
        }
        return tryCandidate(0);
    },
    
    _handleMediaSourceFailure: function(stationId, stationName, reason) {
        if (lastFailedStationId !== stationId) {
            consecutiveFails++;
            lastFailedStationId = stationId;
        }
        var maxFails = parseInt((this.userVariables && this.userVariables.maxConsecutiveFails) || '3', 10);
        if (maxFails > 0 && consecutiveFails >= maxFails) {
            return Promise.reject(new Error('连续失败已达' + maxFails + '次'));
        }
        return Promise.reject(new Error('获取失败: ' + reason));
    },

    // -------------------- 歌词、评论（空实现）--------------------
    getLyric: function() { return Promise.resolve({ rawLrc: '', translation: '' }); },
    getMusicInfo: function(m) { return Promise.resolve(m); },
    getMusicComments: function() { return Promise.resolve({ isEnd: true, data: [] }); },

    // -------------------- 首页榜单 --------------------
    getTopLists: function() {
        return API.getCountries().then(function(countries) {
            var groups = [];
            groups.push({
                title: '🌍 热门国家',
                data: countries.slice(0, 20).map(function(c) {
                    return {
                        id: 'country_' + c.iso_3166_1,
                        title: getTranslatedCountryName(c.name),
                        artist: c.stationcount + ' 个电台',
                        artwork: '',
                        description: c.name + ' 全国电台',
                        _type: 'country',
                        _countryCode: c.iso_3166_1
                    };
                })
            });
            return API.getTags().then(function(tags) {
                groups.push({
                    title: '🏷️ 热门分类',
                    data: tags.slice(0, 15).map(function(t) {
                        return {
                            id: 'tag_' + t.name,
                            title: getTranslatedTagName(t.name),
                            artist: t.stationcount + ' 个电台',
                            artwork: '',
                            description: t.name + ' 类电台',
                            _type: 'tag',
                            _tagName: t.name
                        };
                    })
                });
                return groups;
            });
        }).catch(function() { return []; });
    },

    getTopListDetail: function(topListItem, page) {
        var offset = ((page || 1) - 1) * PAGE_SIZE;
        var promise;
        if (topListItem._type === 'country') {
            promise = API.getStationsByCountry(topListItem._countryCode, offset, PAGE_SIZE);
        } else if (topListItem._type === 'tag') {
            promise = API.getStationsByTag(topListItem._tagName, offset, PAGE_SIZE);
        } else {
            return Promise.resolve({ isEnd: true, musicList: [] });
        }
        return promise.then(function(stations) {
            return {
                isEnd: stations.length < PAGE_SIZE,
                musicList: stations.map(convertStationToMusicItem),
                albumItem: { id: topListItem.id, title: topListItem.title, artist: topListItem.artist, artwork: topListItem.artwork, description: topListItem.description }
            };
        }).catch(function() {
            return { isEnd: true, musicList: [] };
        });
    },

    // -------------------- 推荐歌单标签 --------------------
    getRecommendSheetTags: function() {
        var pinned = [
            { id: 'topclick', title: '🌍 全球热门' },
            { id: 'pop', title: getTranslatedTagName('pop') },
            { id: 'rock', title: getTranslatedTagName('rock') },
            { id: 'classical', title: getTranslatedTagName('classical') },
            { id: 'jazz', title: getTranslatedTagName('jazz') },
            { id: 'news', title: getTranslatedTagName('news') },
            { id: 'english', title: '🇬🇧 英语电台' },
            { id: 'spanish', title: '🇪🇸 西班牙语' },
            { id: 'french', title: '🇫🇷 法语' },
            { id: 'german', title: '🇩🇪 德语' }
        ];
        return API.getLanguages().then(function(langs) {
            return {
                pinned: pinned,
                data: [{
                    title: '按语言浏览',
                    data: langs.slice(0, 30).map(function(l) {
                        return { id: 'lang_' + l.iso_639, title: l.name + ' (' + l.stationcount + ')' };
                    })
                }]
            };
        }).catch(function() {
            return { pinned: pinned, data: [] };
        });
    },

    // -------------------- 推荐歌单内容（返回歌单项）--------------------
    getRecommendSheetsByTag: function(tag, page) {
        var tagId = tag.id;
        console.log('[RadioBrowser] 推荐歌单标签点击: ' + tag.title);
        
        function createSheetItem(id, title, type, extra) {
            extra = extra || {};
            return {
                id: id,
                title: title,
                artist: 'RadioBrowser',
                artwork: '',
                description: title + ' 电台集合',
                _type: type,
                _extra: extra
            };
        }
        
        var sheetItems = [];
        if (tagId === 'topclick') {
            sheetItems.push(createSheetItem('topclick', '🌍 全球热门电台', 'topclick'));
        } else if (tagId.indexOf('lang_') === 0) {
            var langCode = tagId.replace('lang_', '');
            sheetItems.push(createSheetItem('lang_' + langCode, tag.title, 'language', { langCode: langCode }));
        } else {
            var cleanTag = tagId;
            if (tagId.indexOf('tag_') === 0) cleanTag = tagId.substring(4);
            else if (tag.title.indexOf(' (') > 0) cleanTag = tag.title.substring(0, tag.title.indexOf(' ('));
            sheetItems.push(createSheetItem('tag_' + cleanTag, tag.title, 'tag', { tagName: cleanTag }));
        }
        
        return Promise.resolve({ isEnd: true, data: sheetItems });
    },

    // -------------------- 歌单详情 --------------------
    getMusicSheetInfo: function(sheetItem, page) {
        console.log('[RadioBrowser] 加载歌单详情: ' + sheetItem.id + ' 类型: ' + sheetItem._type);
        
        var offset = ((page || 1) - 1) * PAGE_SIZE;
        var promise;
        
        if (sheetItem._type === 'topclick') {
            promise = API.getTopClick(offset, PAGE_SIZE);
        } else if (sheetItem._type === 'language') {
            var langCode = sheetItem._extra && sheetItem._extra.langCode;
            if (!langCode) return Promise.resolve({ isEnd: true, musicList: [] });
            promise = API.getStationsByLanguage(langCode, offset, PAGE_SIZE);
        } else if (sheetItem._type === 'tag') {
            var tagName = sheetItem._extra && sheetItem._extra.tagName;
            if (!tagName) return Promise.resolve({ isEnd: true, musicList: [] });
            promise = API.getStationsByTag(tagName, offset, PAGE_SIZE);
        } else if (sheetItem._type === 'country') {
            var countryCode = sheetItem._countryCode;
            promise = API.getStationsByCountry(countryCode, offset, PAGE_SIZE);
        } else {
            return Promise.resolve({ isEnd: true, musicList: [] });
        }
        
        return promise.then(function(stations) {
            console.log('[RadioBrowser] 歌单详情返回电台数: ' + stations.length);
            return {
                isEnd: stations.length < PAGE_SIZE,
                musicList: stations.map(convertStationToMusicItem),
                sheetItem: {
                    id: sheetItem.id,
                    title: sheetItem.title,
                    artist: sheetItem.artist,
                    artwork: sheetItem.artwork,
                    description: sheetItem.description
                }
            };
        }).catch(function(e) {
            console.error('[RadioBrowser] 加载歌单详情失败: ' + e.message);
            return { isEnd: true, musicList: [] };
        });
    },

    getAlbumInfo: function() { return Promise.resolve({ isEnd: true, musicList: [] }); },
    getArtistInfo: function(a) { return Promise.resolve(a); },
    getArtistWorks: function() { return Promise.resolve({ isEnd: true, data: [] }); }
};