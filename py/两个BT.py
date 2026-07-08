import sys
import urllib.parse
sys.path.append('..')
from base.spider import Spider

class Spider(Spider):
    def getName(self):
        return "两个BT影视"

    def init(self, extend=""):
        self.host = 'https://www.bttwo.life'
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Referer': self.host
        }

    def isVideoFormat(self, url):
        return False

    def manualVideoCheck(self):
        return False

    def homeContent(self, filter):
        result = {}
        result['class'] = [
            {'type_id': '1', 'type_name': '电影'},
            {'type_id': '2', 'type_name': '电视剧'},
            {'type_id': '3', 'type_name': '动漫'}
        ]
        result['filters'] = self._get_filters()
        return result

    def homeVideoContent(self):
        try:
            rsp = self.fetch(self.host, headers=self.headers)
            doc = self.html(rsp.text)
            return {'list': self._get_videos(doc)}
        except:
            return {'list': []}

    def categoryContent(self, tid, pg, filter, extend):
        try:
            path_map = {'1': 'movie', '2': 'tv', '3': 'anime'}
            path = path_map.get(tid, 'movie')
            
            params = extend if extend else {}
            url = f"{self.host}/{path}"
            query = []
            
            if 'area' in params:
                query.append(f"area={urllib.parse.quote(params['area'])}")
            if 'year' in params:
                query.append(f"year={params['year']}")
            if str(pg) != '1':
                query.append(f"page={pg}")
                
            if query:
                url += "?" + "&".join(query)
                
            rsp = self.fetch(url, headers=self.headers)
            doc = self.html(rsp.text)
            return {
                'list': self._get_videos(doc),
                'page': int(pg),
                'pagecount': 9999,
                'limit': 20
            }
        except:
            return {'list': []}

    def detailContent(self, ids):
        try:
            vid = ids[0]
            detail_url = f"{self.host}{vid}" if str(vid).startswith('/') else f"{self.host}/play/{vid}"
            
            rsp = self.fetch(detail_url, headers=self.headers)
            doc = self.html(rsp.text)
            
            title_nodes = doc.xpath('//h1[contains(@class,"text-lg")]/text() | //h2[contains(@class,"text-xl")]/text() | //title/text()')
            title = title_nodes[0].strip().replace(' - 两个BT', '') if title_nodes else "未知"
            
            img_nodes = doc.xpath('//div[contains(@class,"movie-poster")]//img/@src | //div[contains(@class,"movie-poster")]//img/@data-src | //meta[@property="og:image"]/@content')
            pic = ""
            for img in img_nodes:
                if "placeholder" not in img.lower():
                    pic = img
                    break
            if not pic and img_nodes:
                pic = img_nodes[0]
                
            remarks_nodes = doc.xpath('//span[contains(text(),"共") and contains(text(),"集")]/text()')
            remarks = remarks_nodes[0].strip() if remarks_nodes else ""
            
            director_nodes = doc.xpath('//div[text()="导演"]/following-sibling::div[1]/text()')
            director = director_nodes[0].strip() if director_nodes else ""
            
            actor_nodes = doc.xpath('//div[text()="主演"]/following-sibling::div[1]/text()')
            actor = actor_nodes[0].strip() if actor_nodes else ""
            
            content_nodes = doc.xpath('//h3[contains(text(),"剧情简介")]/parent::div/p/text()')
            content = content_nodes[0].strip() if content_nodes else ""
            
            episodes = []
            links = doc.xpath('//a[contains(@class, "episode-link")] | //a[contains(@href, "/play/")]')
            seen_hrefs = set()
            
            for link in links:
                href = link.xpath('./@href')[0]
                if href in seen_hrefs or not href.startswith('/play/'):
                    continue
                seen_hrefs.add(href)
                
                name = "".join(link.xpath('.//span/text()')).strip()
                if not name:
                    name = link.xpath('./@data-episode')[0] if link.xpath('./@data-episode') else f"第{len(episodes)+1}集"
                name = name.replace('第', '').replace('集', '').strip()
                
                episodes.append(f"{name}${href}")
                
            return {
                'list': [{
                    'vod_id': vid,
                    'vod_name': title,
                    'vod_pic': pic,
                    'vod_remarks': remarks,
                    'vod_director': director,
                    'vod_actor': actor,
                    'vod_content': content,
                    'vod_play_from': '两个BT',
                    'vod_play_url': '#'.join(episodes) if episodes else f"正片${detail_url.replace(self.host, '')}"
                }]
            }
        except:
            return {'list': []}

    def searchContent(self, key, quick, pg="1"):
        try:
            url = f"{self.host}/search?q={urllib.parse.quote(key)}"
            if pg != "1":
                url += f"&page={pg}"
            rsp = self.fetch(url, headers=self.headers)
            doc = self.html(rsp.text)
            return {
                'list': self._get_search_videos(doc),
                'page': int(pg),
                'pagecount': 9999,
                'limit': 20
            }
        except:
            return {'list': []}

    def playerContent(self, flag, id, vipFlags):
        # WASM 播放器直连
        play_url = id if id.startswith('http') else self.host + id
        return {'parse': 1, 'url': play_url, 'header': self.headers}

    def localProxy(self, param):
        return [200, "video/MP2T", ""]

    def _get_videos(self, doc):
        videos = []
        nodes = doc.xpath('//div[@data-vod-id] | //a[contains(@href, "/play/")]/ancestor::div[contains(@class, "group")][1]')
        seen_ids = set()
        
        for node in nodes:
            v_id = ""
            if node.xpath('./@data-vod-id'):
                v_id = f"/play/{node.xpath('./@data-vod-id')[0]}"
            else:
                hrefs = node.xpath('.//a[contains(@href, "/play/")]/@href')
                if hrefs:
                    v_id = hrefs[0]
            
            if not v_id or v_id in seen_ids:
                continue
            seen_ids.add(v_id)

            name_nodes = node.xpath('.//h3/text() | .//a[contains(@href, "/play/")]/@title | .//img/@alt')
            v_name = name_nodes[0].strip() if name_nodes else "未知"
            
            img_nodes = node.xpath('.//img/@src | .//img/@data-src | .//img/@data-original')
            v_pic = ""
            for img in img_nodes:
                if "placeholder" not in img.lower():
                    v_pic = img
                    break
            if not v_pic and img_nodes:
                v_pic = img_nodes[0]
                
            remarks_nodes = node.xpath('.//span[contains(@class,"text-text-secondary")]/text() | .//span[contains(text(),"更新")]/text() | .//span[contains(@class,"bg-gradient-to-r")]/text() | .//div[contains(@class,"text-green-500")]/text()')
            v_remarks = remarks_nodes[0].strip().replace('更新', '') if remarks_nodes else ""
            
            videos.append({
                'vod_id': v_id,
                'vod_name': v_name,
                'vod_pic': v_pic,
                'vod_remarks': v_remarks
            })
        return videos

    def _get_search_videos(self, doc):
        return self._get_videos(doc)

    def _get_filters(self):
        base = [
            {'key': 'area', 'name': '地区', 'value': [{'n': '全部', 'v': ''}, {'n': '中国大陆', 'v': '中国大陆'}, {'n': '美国', 'v': '美国'}, {'n': '香港', 'v': '香港'}, {'n': '台湾', 'v': '台湾'}, {'n': '韩国', 'v': '韩国'}, {'n': '日本', 'v': '日本'}]},
            {'key': 'year', 'name': '年份', 'value': [{'n': '全部', 'v': ''}, {'n': '2026', 'v': '2026'}, {'n': '2025', 'v': '2025'}, {'n': '2024', 'v': '2024'}, {'n': '2023', 'v': '2023'}, {'n': '2022', 'v': '2022'}]}
        ]
        return {'1': base, '2': base, '3': base}