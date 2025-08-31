/*
@header({
  searchable: 1,
  filterable: 1,
  quickSearch: 1,
  title: '追剧狂人',
  logo: 'https://i-blog.csdnimg.cn/blog_migrate/2621e710a94ab40ba66645d47f296aaf.gif'
})
*/

var rule = {
  类型: "影视",
  title: "追剧狂人",
  author: "不告诉你",
  logo:'https://i-blog.csdnimg.cn/blog_migrate/2621e710a94ab40ba66645d47f296aaf.gif',
  host: "https://www.zjkrmv.vip",
  url: "/vodshow/fyfilter.html",
  searchUrl: "/vodsearch/**----------fypage---",
  searchable:1,quickSearch:1,double:true,timeout:10000,play_parse:true,filterable:1,invalid:true,
  class_name: "电影&连续剧&动漫&综艺&短剧",
  class_url: "1&2&4&3&23",
  filter_url:'{{fl.类型}}-{{fl.地区}}-{{fl.by}}-{{fl.剧情}}-----fypage---{{fl.年份}}.html',
  filter_def:{1:{类型:'1'},2:{类型:'2'},3:{类型:'3'},4:{类型:'4'},23:{类型:'23'}},
  推荐: async function (tid, pg, filter, extend) {
    const { input, pdfa, pdfh, pd } = this;
    const html = await request(input);
    const d = [];
    const data = pdfa(html, ".myui-vodbox-content");
    data.forEach((it) => {
      d.push({
        title: pdfh(it, ".title&&Text"),
        pic_url: pd(it, "img&&src"),
        desc: pdfh(it, ".tag&&Text"),
        url: pd(it, "a&&href"),
      });
    });
    return setResult(d);
  },
  一级: async function (tid, pg, filter, extend) {
    const { input, pdfa, pdfh, pd } = this;
    const html = await request(input);
    const d = [];
    const data = pdfa(html, ".show-vod-list&&a");
    data.forEach((it) => {
      d.push({
        title: pdfh(it, ".title&&Text"),
        pic_url: pd(it, "img&&src"),
        desc: pdfh(it, ".tag&&Text"),
        url: pd(it, "a&&href"),
      });
    });
    return setResult(d);
  },
  二级: async function (ids) {
    const { input, pdfa, pdfh, pd } = this;
    const html = await request(input);
    const playlist = pdfa(html, ".tab-pane");
    const tabs = pdfa(html, ".player-box&&ul li");
    let playmap = {};
    tabs.map((item, i) => {
      const form = pdfh(item, "Text");
      const list = playlist[i];
      const a = pdfa(list, "body&&a:not(:contains(排序))");
      a.map((it) => {
        let title = pdfh(it, "Text");
        let urls = pd(it, "a&&href", input);
        if (!playmap.hasOwnProperty(form)) {
          playmap[form] = [];
        }
        playmap[form].push(title + "$" + urls);
      });
    });
    const urls = Object.values(playmap);
    const playUrls = urls.map((urllist) => urllist.join("#"));
    const VOD = {
      vod_name: pdfh(html, "h1&&Text"), // 名称
      vod_actor: pdfh(html, ".director:eq(1)&&Text"), // 演员
      vod_director: pdfh(html, ".director:eq(0)&&Text"), // 导演
      vod_remarks: pdfh(html, ".bottom:eq(1)&&Text"), // 备注
      vod_content: pdfh(html, ".wrapper_more_text&&Text"), // 简介p:eq(0)&&Text 
      vod_play_from: Object.keys(playmap).join("$$$"), // 线路
      vod_play_url: playUrls.join("$$$"), // 播放地址
    };
    return VOD;
  },
  搜索: async function (wd, quick, pg) {
    const homeFn = rule.一级.bind(this);
    return await homeFn();
  },
  lazy: async function (flag, id, flags) {
        let {input, pdfa, pdfh, pd} = this;
        let html = await request(input);
        html = JSON.parse(html.match(/r player_.*?=(.*?)</)[1]);
        let url = html.url;
        if (html.encrypt == "1") {
            url = unescape(url)
            return {parse: 0, url: url}
        } else if (html.encrypt == "2") {
            url = unescape(base64Decode(url))
            return {parse: 0, url: url}
        }
        if (/m3u8|mp4/.test(url)) {
            input = url
            return {parse: 0, url: input}
        } else {
            return {parse: 1, url: input}
        }
    },
    filter:{"1":[{"key":"类型","name":"类型","value":[{"n":"全部","v":"1"},{"n":"动作片","v":"6"},{"n":"喜剧片","v":"7"},{"n":"爱情片","v":"8"},{"n":"科幻片","v":"9"},{"n":"恐怖片","v":"10"},{"n":"剧情片","v":"11"},{"n":"战争片","v":"12"},{"n":"动画片","v":"19"},{"n":"奇幻片","v":"20"},{"n":"悬疑片","v":"21"},{"n":"纪录片","v":"22"}]},{"key":"地区","name":"地区","value":[{"n":"全部","v":""},{"n":"大陆","v":"大陆"},{"n":"香港","v":"香港"},{"n":"台湾","v":"台湾"},{"n":"美国","v":"美国"},{"n":"法国","v":"法国"},{"n":"英国","v":"英国"},{"n":"日本","v":"日本"},{"n":"韩国","v":"韩国"},{"n":"德国","v":"德国"},{"n":"泰国","v":"泰国"},{"n":"印度","v":"印度"},{"n":"意大利","v":"意大利"},{"n":"西班牙","v":"西班牙"},{"n":"加拿大","v":"加拿大"},{"n":"其他","v":"其他"}]},{"key":"年份","name":"年份","value":[{"n":"全部","v":""},{"n":"2025","v":"2025"},{"n":"2024","v":"2024"},{"n":"2023","v":"2023"},{"n":"2022","v":"2022"},{"n":"2021","v":"2021"},{"n":"2020","v":"2020"},{"n":"2019","v":"2019"},{"n":"2018","v":"2018"},{"n":"2017","v":"2017"},{"n":"2016","v":"2016"},{"n":"2015","v":"2015"},{"n":"2014","v":"2014"}]},{"key":"剧情","name":"剧情","value":[{"n":"全部","v":""},{"n":"喜剧","v":"喜剧"},{"n":"爱情","v":"爱情"},{"n":"恐怖","v":"恐怖"},{"n":"动作","v":"动作"},{"n":"科幻","v":"科幻"},{"n":"剧情","v":"剧情"},{"n":"战争","v":"战争"},{"n":"警匪","v":"警匪"},{"n":"犯罪","v":"犯罪"},{"n":"动画","v":"动画"},{"n":"奇幻","v":"奇幻"},{"n":"武侠","v":"武侠"},{"n":"冒险","v":"冒险"},{"n":"枪战","v":"枪战"},{"n":"恐怖","v":"恐怖"},{"n":"悬疑","v":"悬疑"},{"n":"惊悚","v":"惊悚"},{"n":"经典","v":"经典"},{"n":"青春","v":"青春"},{"n":"文艺","v":"文艺"},{"n":"微电影","v":"微电影"},{"n":"古装","v":"古装"},{"n":"历史","v":"历史"},{"n":"运动","v":"运动"},{"n":"农村","v":"农村"},{"n":"儿童","v":"儿童"},{"n":"网络电影","v":"网络电影"}]},{"key":"by","name":"排序","value":[{"n":"新上线","v":"time"},{"n":"热榜","v":"hits"},{"n":"好评","v":"score"}]}],
    "2":[{"key":"类型","name":"类型","value":[{"n":"全部","v":"2"},{"n":"国产剧","v":"13"},{"n":"港台剧","v":"14"},{"n":"日韩剧","v":"15"},{"n":"欧美剧","v":"16"}]},{"key":"地区","name":"地区","value":[{"n":"全部","v":""},{"n":"内地","v":"内地"},{"n":"韩国","v":"韩国"},{"n":"香港","v":"香港"},{"n":"台湾","v":"台湾"},{"n":"日本","v":"日本"},{"n":"美国","v":"美国"},{"n":"泰国","v":"泰国"},{"n":"英国","v":"英国"},{"n":"新加坡","v":"新加坡"},{"n":"其他","v":"其他"}]},{"key":"年份","name":"年份","value":[{"n":"全部","v":""},{"n":"2025","v":"2025"},{"n":"2024","v":"2024"},{"n":"2023","v":"2023"},{"n":"2022","v":"2022"},{"n":"2021","v":"2021"},{"n":"2020","v":"2020"},{"n":"2019","v":"2019"},{"n":"2018","v":"2018"},{"n":"2017","v":"2017"},{"n":"2016","v":"2016"},{"n":"2015","v":"2015"},{"n":"2014","v":"2014"}]},{"key":"剧情","name":"剧情","value":[{"n":"全部","v":""},{"n":"古装","v":"古装"},{"n":"战争","v":"战争"},{"n":"青春偶像","v":"青春偶像"},{"n":"喜剧","v":"喜剧"},{"n":"家庭","v":"家庭"},{"n":"犯罪","v":"犯罪"},{"n":"动作","v":"动作"},{"n":"奇幻","v":"奇幻"},{"n":"剧情","v":"剧情"},{"n":"历史","v":"历史"},{"n":"经典","v":"经典"},{"n":"乡村","v":"乡村"},{"n":"情景","v":"情景"},{"n":"商战","v":"商战"},{"n":"网剧","v":"网剧"},{"n":"其他","v":"其他"}]},{"key":"by","name":"排序","value":[{"n":"新上线","v":"time"},{"n":"热榜","v":"hits"},{"n":"好评","v":"score"}]}],
    "3":[{"key":"类型","name":"类型","value":[{"n":"全部","v":"2"},{"n":"国产剧","v":"13"},{"n":"港台剧","v":"14"},{"n":"日韩剧","v":"15"},{"n":"欧美剧","v":"16"}]},{"key":"地区","name":"地区","value":[{"n":"全部","v":""},{"n":"内地","v":"内地"},{"n":"韩国","v":"韩国"},{"n":"香港","v":"香港"},{"n":"台湾","v":"台湾"},{"n":"日本","v":"日本"},{"n":"美国","v":"美国"},{"n":"泰国","v":"泰国"},{"n":"英国","v":"英国"},{"n":"新加坡","v":"新加坡"},{"n":"其他","v":"其他"}]},{"key":"年份","name":"年份","value":[{"n":"全部","v":""},{"n":"2025","v":"2025"},{"n":"2024","v":"2024"},{"n":"2023","v":"2023"},{"n":"2022","v":"2022"},{"n":"2021","v":"2021"},{"n":"2020","v":"2020"},{"n":"2019","v":"2019"},{"n":"2018","v":"2018"},{"n":"2017","v":"2017"},{"n":"2016","v":"2016"},{"n":"2015","v":"2015"},{"n":"2014","v":"2014"}]},{"key":"剧情","name":"剧情","value":[{"n":"全部","v":""},{"n":"古装","v":"古装"},{"n":"战争","v":"战争"},{"n":"青春偶像","v":"青春偶像"},{"n":"喜剧","v":"喜剧"},{"n":"家庭","v":"家庭"},{"n":"犯罪","v":"犯罪"},{"n":"动作","v":"动作"},{"n":"奇幻","v":"奇幻"},{"n":"剧情","v":"剧情"},{"n":"历史","v":"历史"},{"n":"经典","v":"经典"},{"n":"乡村","v":"乡村"},{"n":"情景","v":"情景"},{"n":"商战","v":"商战"},{"n":"网剧","v":"网剧"},{"n":"其他","v":"其他"}]},{"key":"by","name":"排序","value":[{"n":"新上线","v":"time"},{"n":"热榜","v":"hits"},{"n":"好评","v":"score"}]}],
    "4":[{"key":"类型","name":"类型","value":[{"n":"全部","v":"4"},{"n":"国产动漫","v":"28"},{"n":"日韩动漫","v":"29"},{"n":"港台动漫","v":"30"},{"n":"欧美动漫","v":"31"}]},{"key":"地区","name":"地区","value":[{"n":"全部","v":""},{"n":"国产","v":"国产"},{"n":"日本","v":"日本"},{"n":"欧美","v":"欧美"},{"n":"其他","v":"其他"}]},{"key":"年份","name":"年份","value":[{"n":"全部","v":""},{"n":"2025","v":"2025"},{"n":"2024","v":"2024"},{"n":"2023","v":"2023"},{"n":"2022","v":"2022"},{"n":"2021","v":"2021"},{"n":"2020","v":"2020"},{"n":"2019","v":"2019"},{"n":"2018","v":"2018"},{"n":"2017","v":"2017"},{"n":"2016","v":"2016"},{"n":"2015","v":"2015"},{"n":"2014","v":"2014"}]},{"key":"剧情","name":"剧情","value":[{"n":"全部","v":""},{"n":"情感","v":"情感"},{"n":"科幻","v":"科幻"},{"n":"热血","v":"热血"},{"n":"推理","v":"推理"},{"n":"搞笑","v":"搞笑"},{"n":"冒险","v":"冒险"},{"n":"萝莉","v":"萝莉"},{"n":"校园","v":"校园"},{"n":"动作","v":"动作"},{"n":"机战","v":"机战"},{"n":"运动","v":"运动"},{"n":"战争","v":"战争"},{"n":"少年","v":"少年"},{"n":"少女","v":"少女"},{"n":"社会","v":"社会"},{"n":"原创","v":"原创"},{"n":"亲子","v":"亲子"},{"n":"益智","v":"益智"},{"n":"励志","v":"励志"},{"n":"其他","v":"其他"}]},{"key":"by","name":"排序","value":[{"n":"新上线","v":"time"},{"n":"热榜","v":"hits"},{"n":"好评","v":"score"}]}],
    "23":[{"key":"by","name":"排序","value":[{"n":"新上线","v":"time"},{"n":"热榜","v":"hits"},{"n":"好评","v":"score"}]}]
    }
}