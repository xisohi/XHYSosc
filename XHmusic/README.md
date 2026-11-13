# XHmusic · 洛雪音源合集

本目录收录可直接导入 **洛雪音乐助手（LX Music）** 的自定义音源脚本。

- 脚本协议：`globalThis.lx`（`EVENT_NAMES` / `request` / `on` / `send`），即洛雪桌面版与移动版通用的自定义源格式。
- 与 `../MusicFree/` **不是同一套东西**：那边是 MusicFree 插件（`module.exports` 协议），两者互相导入都会加载失败，不要混用。

> 所有脚本均为网络公开分享的第三方音源，本仓库只做归档与整理，版权归各自作者所有。仅供个人学习交流，请支持正版。

## 目录

- [快速开始](#快速开始)
- [音源清单](#音源清单)
- [平台代号与音质档位](#平台代号与音质档位)
- [需要自己填的配置](#需要自己填的配置)
- [常见问题](#常见问题)
- [免责声明](#免责声明)

## 快速开始

1. 安装洛雪音乐助手（LX Music）桌面版或移动版，版本需支持「自定义源」。
2. 导入（两种方式任选）
   - **在线导入**：设置 → 自定义源 → 导入 → 粘贴 js 直链；
   - **本地导入**：先把 js 下载到本地，同样在「自定义源」里选择文件导入。
3. 导入成功后，自定义源列表里会显示音源名称。再到 **设置 → 音质** 选定目标音质，客户端会向音源请求该档音质，取不到时按音源自身的降级顺序回退（通常落到 128k 或 320k）。
4. 可以同时启用多个音源。注意部分音源共用同一套公益后端，往往会在同一时间段一起失效。

直链前缀：

```text
https://xhys.xisohi.dpdns.org/XHmusic/
```

即 `<前缀><文件名>`。文件名含中文或空格时需做 URL 编码，最省事的做法是打开下表对应文件的 GitHub 页面，复制文件链接让客户端自行编码；也可以走 raw 地址：

```text
https://raw.githubusercontent.com/xisohi/XHYSosc/master/XHmusic/<文件名>
```

## 音源清单

| 文件 | 出处                     | 作者 | 支持平台 | 音质上限 | 备注 |
|:--|:-----------------------|:--|:--|:--|:--|
| `HelloWorld音源.js` | 𝖧౿ᥣᥣ𝗈 Ԝ𝗈𝗋ᥣᑯ        | hello world | kw / kg / tx / wy / mg（另含本地音乐） | 128k → flac，部分后端可到 master / atmos | 内置多后端池（海棠 musicserver、酷我 mobi 直连），默认 20 分钟缓存；顶部 `RACE_APIS` 控制并发竞速，`TIMEOUT` 可调 |
| `HYWmusic_公益版V1.2.0.js` | https://github.com/Macrohard0001/HYWmusic_source           | Ryn | kw / tx / wy / mg / qs / bili / ytb / xm / kg | 128k / 320k / flac / flac24bit | 统一走 `API_BASE`（103.79.184.97）+ `CARD_KEY`，MIT 协议，带自动更新检查 |
| `回避聚合V0.0.1.js` | 回避聚合 (HuiBi Aggregate) | 回避 | tx / wy / kw / kg / mg | tx、wy、kg 可到 master，tx 另有 atmos / atmos_plus | LRU 缓存 + 并发/顺序 fallback；音质智能降级；可选填酷我代理解密与 ChKSz apikey |
| `墨澜音乐源v2.3.6.js` | https://github.com/baiji6/molanyinyueyuan                | 白姬9527 | qq / wy / kw / kg / mg + 汽水音乐 | 全平台 flac，qq/wy/kw/kg/mg 支持母带 | 2026-11-06 修复 QQ；脚本已混淆；可填 `tx_cookie` / `wy_cookie`（默认 `null`） |
| `安妮独家音源 v5.js` | 安妮独家音源                 | 公益 API 收集整理 by 电狗（QQ 群 912385038） | kg / tx / kw / wy | kg：到 master / atmos；wy：到 jymaster / sky / jyeffect；tx：到 flac24bit / hires；kw：到 flac24bit | 后端为海棠 `musicserver` 公益接口，源码可读，适合作为二改底版 |
| `星海音乐源 v2.3.19.js` | https://zrcdy.dpdns.org/lx/vers.php                 | 万去了了 / 科学大魔王 | wy / tx / kw / kg / mg / qs | wy、tx、kg 到 master / atmos，kw 已收敛到 flac，mg 到 flac，qs 到 hires | 2026-11-12 更换域名修复部分地区 DNS 解析错误；`actions` 含 `musicUrl` / `lyric` / `pic`；可选填卡密、ChKSz apikey、酷我代理解密 |
| `独家音源-v7.js` | 独家音源                   | w | 未标注（脚本混淆，以加载后客户端显示为准） | 未标注 | 配置由服务端下发（`SERVER_SCRIPT_CONFIG`）；更新关注微信公众号「洛雪科技」 |
| `裤佬SVIP音源(二改整合版) v3.0.0.js` | 👖裤佬SVIP音源（二改整合版）      | 裤佬 / 安妮 / 星海 | wy / tx / kw / kg / mg | wy 到 jymaster / sky / jyeffect，tx 到 master，kw、kg 到 hires，mg 到 flac24bit | 基于安妮 v4 + 星海 v3.2.12 重构；`actions` 含 `search` / `musicUrl` / `lyric` / `pic`；可选填 `CHKSZ_APIKEY` 与 `KW_DECRYPT_PROXY` |
| `长青SVIP音源.js` | https://13413.kstore.vip/lxmusic/changqing.json              | SVIP | kg / tx / kw / wy / mg | 未标注（脚本混淆） | 带 `update_url` 更新清单；更新关注微信公众号「元力菌」 |


## 平台代号与音质档位

平台代号（脚本里 `source` 的取值，音源只支持其中一部分）：

| 代号 | 平台 |
|:--|:--|
| `kw` | 酷我音乐 |
| `kg` | 酷狗音乐 |
| `tx` | QQ 音乐 |
| `wy` | 网易云音乐 |
| `mg` | 咪咕音乐 |
| `qs` | 汽水音乐 |
| `xm` | 虾米音乐 |
| `bili` / `ytb` | 哔哩哔哩 / YouTube |
| `local` | 本地音乐 |

音质键（`qualitys` 的取值，从低到高）：

| 音质键 | 含义 |
|:--|:--|
| `128k` / `192k` / `320k` | 有损，常见档位 |
| `flac` | 无损 |
| `flac24bit` | 24bit 无损 |
| `hires` | 高解析 |
| `atmos` / `atmos_plus` | 全景声 |
| `master` | 母带 |
| `jyeffect` / `sky` / `jymaster` | 网易云侧的音效 / 沉浸声 / 母带键名 |

客户端的「音质」设置是全局的，各音源支持的档位不同：请求的档位该源没有时，会按源内的降级顺序往下退，所以选了母带只出 128k 属于正常现象（VIP 曲目、冷门曲目尤其常见）。

## 需要自己填的配置

大多数音源开箱即用，下面这些是可选项，改脚本顶部的常量即可。填与不填的差别主要在「能不能拿到少数高音质 / 冷门曲目」，不填不影响基本播放。

| 文件 | 配置项 | 作用 |
|:--|:--|:--|
| `星海音乐源 v2.3.17.js` | `KW_DECRYPT_PROXY.url`、`allowEncryptedLossless` | 酷我加密无损走代理解密；留空则跳过 |
| `星海音乐源 v2.3.17.js` | ChKSz apikey | 启用 ChKSz 后端，部分平台高音质依赖它 |
| `回避聚合V0.0.1.js` | `CHKSZ_CONFIG.apikey`、`KW_DECRYPT_PROXY` | 同上 |
| `裤佬SVIP音源(二改整合版) v3.0.0.js` | `CHKSZ_APIKEY`、`KW_DECRYPT_PROXY` | 同上，留空自动跳过该后端 |
| `墨澜音乐源v2.3.6.js` | `@tx_cookie` / `@wy_cookie` | 携带登录态，提升 VIP 曲目可用率（默认 `null`） |
| `HYWmusic_公益版V1.2.0.js` | `API_BASE`、`CARD_KEY` | 服务端地址与卡密，**不要**改成 `localhost`，否则必然失败 |
| `HelloWorld音源.js` | `RACE_APIS`、`TIMEOUT`、`CACHE_TTL` | 后端并发竞速 / 请求超时 / 缓存时长 |
| `长青SVIP音源.js`、`独家音源-v7.js` | — | 无可改配置（服务端统一下发） |


## 常见问题

**导入后提示脚本加载失败 / 列表里没有音源**
→ 基本是协议错配：把 MusicFree 插件导进了洛雪（或反之）。确认文件里出现 `globalThis.lx` 才是洛雪音源。

**音源在列表里，但搜索没结果，或播放报 403 / 超时**
→ 后端域名失效。这类公益接口换域名很频繁，先换一个音源试，能播就说明是单个源的问题，等作者更新或自己替换后端。

**选了母带 / 无损，实际只有 128k**
→ 该源无此档、曲目本身无高音质、或 VIP 曲目缺少登录态（`cookie` 类配置没填）。客户端会自动降级，不算错误。

**所有音源一起变灰**
→ 先确认能否访问脚本里的后端域名（部分域名需要换 DNS 或走代理），再看脚本头部 `@lastUpdate` 是否已经很久没更新。

**移动版能用吗**
→ 大部分可以，但个别源依赖桌面版才有的能力（本地文件、代理解密），移动端会静默跳过。

**要不要直接改脚本内部逻辑**
→ 不建议。每个脚本头部都有 `@updateUrl` / `@update_url`，作者更新时会整份覆盖，改过的内容会丢。

## 免责声明

- 本目录所有脚本均来自互联网公开分享，版权归原作者；本仓库仅提供归档，不对脚本的可用性、安全性作任何保证。
- 脚本会向第三方服务器请求音频直链，音频内容版权归各唱片公司及音乐平台所有，请支持正版。
- 使用第三方音源可能触及平台用户协议（如会员权益限制），由此产生的账号风险与后果由使用者自行承担；请勿用于任何商业用途。
- 若原作者不希望被收录，请提 Issue，会尽快移除。