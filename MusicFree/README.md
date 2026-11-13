# MusicFree 插件合集

本目录收录可直接导入 **MusicFree** 的插件脚本（`module.exports` 协议：`platform` / `version` / `search` / `getMediaSource` 等）。

- 和 `../XHmusic/` **不是同一套东西**：那边是洛雪音乐助手（LX Music）的自定义源（`globalThis.lx` 协议）。两边脚本互相导入都会失败，别混装。
- 插件本体来自网络公开分享，本仓库只做归档与整理。

## 目录

- [快速开始](#快速开始)
- [插件清单](#插件清单)
- [后端与风险](#后端与风险)
- [音质档位](#音质档位)
- [XHMusic.json 说明](#xhmusicjson-说明)
- [常见问题](#常见问题)
- [维护说明](#维护说明)
- [免责声明](#免责声明)
- [Credits](#credits)

## 快速开始

1. 装客户端：

   | 平台 | 下载 |
   |:--|:--|
   | 手机（Android） | <https://github.com/maotoumao/MusicFree/releases> |
   | 桌面（Windows / macOS / Linux） | <https://github.com/maotoumao/MusicFreeDesktop/releases> |

   插件对客户端版本有要求（见下表「最低版本」），老版本装了会提示 `appVersion` 不满足。

2. 装插件（两种方式，任选）：
   - **从网络安装**：插件管理 → 从网络安装 → 粘贴 js 直链；
   - **从本地安装**：先把 js 下载到本地 → 插件管理 → 从本地安装 → 选择文件。

3. 插件管理里出现对应「平台名」即安装成功。之后在搜索页按平台筛选、或在设置里指定音源。

直链前缀：

```text
https://xhys.xisohi.dpdns.org/MusicFree/
```

即 `<前缀><文件名>`。文件名含中文时需 URL 编码，也可以走 raw 地址：

```text
https://raw.githubusercontent.com/xisohi/XHYSosc/master/MusicFree/<文件名>
```

> 新版客户端的插件管理里若有「插件订阅」入口，可以直接粘贴本目录 `XHMusic.json` 的在线地址一次性导入；没有该入口的版本就按下表逐个安装。

## 插件清单

「搜索类型」取自插件导出的 `supportedSearchType`；`music` / `album` / `artist` / `sheet` / `lyric` 依次为歌曲、专辑、歌手、歌单、歌词。

| 文件 | 平台名 | 版本 | 作者 | 搜索类型 | 说明 |
|:--|:--|:--|:--|:--|:--|
| `网易音乐.js` | 网易音乐 | 2025.09.14 | Thomas喲（反馈群 365976134） | music / album / sheet / artist / lyric | 支持单曲与歌单导入、评论；用户变量可填 `music_u`（cookie）、`ikun_key`（卡密）、`source`（酷我白名单渠道） |
| `腾讯音乐.js` | 腾讯音乐 | 2025.09.13 | Thomas喲（反馈群 365976134） | music / album / sheet / artist / lyric | 支持单曲导入与评论；QQ 歌单可粘贴分享链接或纯数字 ID |
| `酷狗.js` | 酷狗音乐 | 2025.10.01 | Thomas喲（反馈群 365976134） | music / album / sheet / artist / lyric | 歌单只认**酷狗码**（纯数字），不认链接；带用户变量 |
| `酷狗1.js` | 酷狗 | 0.0.1 | xixi | music / album / sheet / artist | 功能齐全（歌词 / 榜单 / 评论 / 歌单 / 歌手作品）；**jsjiami 混淆**，无法直接改 |
| `酷我.js` | 酷我 | 1.0.0 | 玥然OvO | music / album / sheet / artist | 歌词、榜单、歌手作品、推荐歌单、歌单导入都有；源码可读 |
| `汽水音乐.js` | 开心汽水 | 0.1.5 | 鸿蒙 | music | 全功能（榜单 / 评论 / 歌单 / 歌手作品 / 推荐歌单）；**jsjiami 混淆** |
| `千千.js` | 千千 | 0.1.3 | 猫头猫 | music / album / artist | 官方插件；**只有 standard 一档**，往高选会拿不到播放地址 |
| `猫耳FM.js` | 猫耳FM | 0.1.4 | 猫头猫 | music / album | 官方插件；只展示免费节目（`pay_type == 0`），付费内容搜不到 |
| `bilibili.js` | bilibili | 0.3.0 | 猫头猫 | music / album / artist | 官方插件；把**公开**收藏夹当歌单导入（H5/PC 复制收藏夹链接或填 ID），非公开收藏夹导不进来 |
| `xinghai-music-source-wy-v1.8.js` | 星海音乐源wy | 1.7（文件头部写 1.8） | 万去了了 | music / album / artist / sheet / lyric | 星海系列的网易云分支；填 `music_u` cookie 走 eapi，留空走公开接口；支持单曲/歌单导入 |
| `xinghai-music-source-kg-toskysun-v0.0.6.js` | 星海kg | 0.0.6 | 万去了了 | music / album / artist / sheet | 酷狗分支；支持 `kugou.com/special/detail/xxx` 歌单链接导入；0.0.6 补了 atmos / dolby / tape 音质直通 |
| `xinghai-music-source-kw-toskysun-v1.1.4.js` | 星海音乐源kuwo | 1.1.4 | 万去了了 | music / album / sheet / artist / lyric | 酷我分支；搜索、歌单、歌词走 `kuwo.cn` 官方接口，播放直链走自建后端；功能与官方酷我插件重合，可互为备份 |
| `xinghai-music-source-qs-v1.2.1.js` | 星海音乐源-汽水 | 1.2.1 | 万去了了 | music | 汽水分支；播放、逐字歌词、榜单、评论；已针对新版运行环境修掉 `require is not defined` |
| `xinghai-radio-browser.infov0.2.js` | RadioBrowser | 0.0.2 | 星海 & 万去了了 | music | 不是音乐平台，是**全球电台**：走 `radio-browser.info` 镜像，支持中文台名翻译；用户变量可设流格式（1=MP3 / 2=AAC / 3=HLS）和「连续失败 N 首自动停止」 |

几点说明：

- 四个 `xinghai-music-source-*` 是 **MusicFree 版**（和 `../XHmusic/` 里的洛雪版星海不是同一个文件），文件名带作者后缀 `toskysun` 的是二改分发版。
- 混淆插件（`酷狗1.js`、`汽水音乐.js`）的平台名和版本是从 `module.exports` 里读出来的，不是看文件名猜的。想自己改功能请拿 `酷我.js` 或星海系列当底版。
- `xinghai-music-source-wy-v1.8.js` 的版本号以导出值 `1.7` 为准，文件名/注释里的 1.8 是上游没同步；`xinghai-radio-browser.infov0.2.js` 同理，文件名写 `v0.2`、实际导出 `0.0.2`。
- `酷狗.js` 与 `酷狗1.js` 是两个不同插件（一个 Thomas喲 的 2025.10.01 版，一个 xixi 的 0.0.1 版），可以同时装、按需切换。
- `RadioBrowser` 是电台源，搜索/播放逻辑与专辑歌手那套不同：搜索结果的「歌手」是电台国家/语种，播放的是直播流，拖动进度条无效属正常。

## 后端与风险

14 个插件背后其实只有 6 套后端，同域名的会一起失效，装多个同源插件并不会更稳：

| 后端 | 域名 | 依赖插件 |
|:--|:--|:--|
| 星海自建 | `yy.zddyr.top`(6) / `zrcdy.dpdns.org`(5) / `gc.kxwa.top` | 星海 kw/wy/kg/qs/radio |
| 海棠 | `music.haitangw.cc`、`musicapi.haitangw.net` | 网易、腾讯、酷狗 |
| ikun 卡密 | `api.ikunshare.com` | 网易、腾讯、酷狗 |
| 元力 | `13413.kstore.vip` | 网易、腾讯、酷狗 |
| 免费聚合 | `lxmusicapi.onrender.com` | 网易、腾讯、酷狗（免费实例会休眠，首播超时多半是它） |
| 平台官方 | `*.kuwo.cn`、`*.kugou.com`、`music.163.com`、`y.qq.com`、`missevan.com`、`bilibili.com` | 酷我、千千、猫耳FM、bilibili |

需要知道的几点：

- **内置共享凭证**：`网易音乐.js` 兜底写死 `MUSIC_U=0034B44F…`，`腾讯音乐.js` 兜底写死 `qm_keyst=Q_H_L_5FBM…`。不填自己的 cookie 时所有人生成的是同一个账号的登录态，有风控/封号风险，而这份凭证还公开在仓库里。建议填自己的，或把兜底值清空。
- **两个不可审的**：`酷狗1.js`、`汽水音乐.js`（jsjiami 混淆）。`酷狗1.js` 的 `srcUrl` 指向 `js.258008.xyz`，另连 `ksdjskdsd1123.nnice.cn`；`汽水音乐.js` 连 `srcUrl` 都是混淆字符串，读不出更新源。这两个的「提示更新」等于从随机域名拉新脚本，供应链面最大，建议不装或关掉自动更新。
- **远端更新面**：14 个里 13 个带 `srcUrl`（只有星海 kg 的 `UPDATE_URL` 为空），意味着作者服务器随时能向客户端推新代码。只从本仓库更新能规避一半。
- **能审、走官方接口的**：`酷我.js`、`千千.js`、`猫耳FM.js`、`bilibili.js`、`RadioBrowser`、星海系列（`music_u` 只发 `music.163.com`，第三方 `apiwy.php` 只收 song id，不发 cookie）。想稳就留这几个 + 1 个聚合同路。

## 音质档位

MusicFree 的音质只有四档，各插件自行映射到平台自己的档位：

| MusicFree | 酷我 | 网易 | 腾讯 | 星海系列 |
|:--|:--|:--|:--|:--|
| `low` | 128k | standard | M500 | 对应最低档 |
| `standard` | 320k | exhigh | M800 | 对应 320k |
| `high` | flac | lossless | 无损档 | 对应 flac |
| `super` | 同 high | hires | 高解析档 | 对应 hires / 无损 |

- `千千` 只支持 `standard`；`猫耳FM` 音质取决于源站。
- 选到插件不支持的档位时会降级或拿不到地址，这属于正常行为，不是插件坏了。
- VIP 曲目缺登录态（`music_u` 之类没填）时通常只能拿到低档或空地址。

## XHMusic.json 说明

订阅 / 索引清单，当前 **14 条 = 本目录全部插件**，`name` 取插件导出的 `platform`，`version` 取导出值（不是文件名）：

| 条目 | 文件 | 版本 |
|:--|:--|:--|
| 网易音乐 / 腾讯音乐 / 酷狗音乐 / 开心汽水 | `网易音乐.js` / `腾讯音乐.js` / `酷狗.js` / `汽水音乐.js` | 2025.09.14 / 2025.09.13 / 2025.10.01 / 0.1.5 |
| 酷我 / 千千 / 猫耳FM / bilibili / 酷狗 | `酷我.js` / `千千.js` / `猫耳FM.js` / `bilibili.js` / `酷狗1.js` | 1.0.0 / 0.1.3 / 0.1.4 / 0.3.0 / 0.0.1 |
| 星海音乐源kuwo / wy / kg / -汽水 | `xinghai-music-source-kw-toskysun-v1.1.4.js` / `-wy-v1.8.js` / `-kg-toskysun-v0.0.6.js` / `-qs-v1.2.1.js` | 1.1.4 / 1.7 / 0.0.6 / 1.2.1 |
| RadioBrowser | `xinghai-radio-browser.infov0.2.js` | 0.0.2 |

几个约定：

- **全部走本仓库直链**，不再引用 `51.195.241.253:8080` 那种第三方代理，也不再依赖 upstream 的 `raw.githubusercontent.com`（原来的 `酷狗音乐` 条目就是代理，已换成本地 `酷狗.js`）。
- `星海音乐源wy` 的 `version` 写 `1.7`（插件导出值），文件名 `…-wy-v1.8.js` 是上游没同步的旧标注；`开心汽水` 与 `酷狗` 两条分别对应混淆插件的真实平台名。
- 新增或替换插件时，`name` / `url` / `version` 三处一起改，避免客户端因版本比对失败反复提示更新。

## 常见问题

**安装后插件报错 / 显示不可用**
→ 先看 `appVersion`：`网易音乐`、`腾讯音乐`、`酷狗` 要求 `>0.4.0-alpha.0`，`猫耳FM`、`酷我` 要求 `>0.1.0-alpha.0`，客户端太旧会直接拒绝加载。

**提示 `require is not defined`**
→ 新版 MusicFree 运行环境不再注入 `require`，插件里直接 `const axios = require("axios")` 会炸。星海 qs 已用「探测 + fetch 兜底」修过；其它插件遇到同样报错只能等作者更新或自己改。

**搜不到 / 播放报错**
→ 上游接口变了。先换平台试；网易/腾讯/酷狗/星海wy 可填 `music_u` 之类用户变量提升成功率。

**歌单导入是 0 首**
→ 各平台规则不同：酷狗只认酷狗码；网易/腾讯/酷我要分享链接；bilibili 要**公开**收藏夹。私密歌单导入一律失败。

**把 `../XHmusic/` 的 js 装进来，加载失败**
→ 那是洛雪（`globalThis.lx`）协议。判断方法：文件里出现 `globalThis.lx` 就是洛雪源，出现 `module.exports = { platform:` 才是 MusicFree 插件。

**能不能改插件里的接口地址**
→ 混淆的（`酷狗1.js`、`汽水音乐.js`）改不了；源码可读的（`酷我.js`、星海系列、官方三个）可以，但注意插件自带的 `srcUrl` 会让客户端下次启动时提示更新，更新后改动会被覆盖。

## 维护说明

1. 新插件放进本目录，命名 `<音源名>` 或 `<音源名>v<版本>`，别留多个同名不同版本。
2. 装好插件后用客户端的「导出插件」拿到的 `platform` / `version` 为准更新本表，不要手抄文件名。
3. 同步更新 `XHMusic.json`（`name` / `url` / `version` 三个字段都要对）。
4. 提交前做一次语法/加载检查：

   ```powershell
   node --check ".\MusicFree\酷我.js"
   ```

   混淆脚本 `--check` 也能过，但只能验证语法，不能验证接口。

## 免责声明

- 插件与接口均来自互联网公开分享，版权归原作者；本仓库只做归档，不对可用性与安全性作保证。
- 音频内容版权归各唱片公司及平台所有，请支持正版，勿用于商业用途。
- 第三方插件可能触及平台用户协议，账号风险由使用者自行承担。
- 原作者如不希望被收录，请提 Issue 移除。

## Credits

| 插件 | 作者 / 上游 |
|:--|:--|
| 千千 / 猫耳FM / bilibili | 猫头猫 · <https://github.com/maotoumao/MusicFreePlugins> |
| 网易音乐 / 腾讯音乐 / 酷狗音乐 | Thomas喲 · <https://github.com/ThomasBy2025/musicfree> |
| 酷我 | 玥然OvO · <https://raw.gitcode.com/Crystim/mfp> |
| 汽水音乐（开心汽水） | 鸿蒙 · <https://gitee.com/hongmengv5/musicfree> |
| 酷狗（0.0.1） | xixi |
| 星海系列（kw / wy / kg / qs）+ RadioBrowser | 万去了了 · <https://zddyr.top/> |

相关目录：[`../XHmusic/`](../XHmusic/README.md)（洛雪音源合集）。
