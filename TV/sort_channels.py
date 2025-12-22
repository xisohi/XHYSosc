import requests
import re
import os

def load_categories_from_template():
    """从模板文件加载分类和频道信息"""
    categories = {}
    current_category = None

    # 确保模板文件存在
    template_path = "TV/moban.txt"
    if not os.path.exists(template_path):
        print(f"错误：未找到模板文件 {template_path}")
        return categories

    try:
        with open(template_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue

                # 处理分类行
                if ",#genre#" in line:
                    current_category = line.split(",")[0].strip()
                    categories[current_category] = []
                # 处理频道行
                elif current_category:
                    channel = line.strip()
                    if channel:
                        categories[current_category].append(channel)
    except Exception as e:
        print(f"读取模板文件出错: {e}")

    return categories

def fetch_m3u_content(url):
    """从URL获取M3U内容并转换为TXT格式"""
    try:
        # 从URL中提取实际的M3U URL
        m3u_url_match = re.search(r"https?://[^\s]+", url)
        if not m3u_url_match:
            print(f"无效的URL格式: {url}")
            return ""

        m3u_url = m3u_url_match.group(0)
        print(f"正在获取: {m3u_url}")

        response = requests.get(m3u_url, timeout=10)
        response.raise_for_status()

        # 解析M3U内容为TXT格式
        return parse_m3u_to_txt(response.text)
    except requests.exceptions.RequestException as e:
        print(f"请求失败: {e}")
        return ""
    except Exception as e:
        print(f"处理内容时出错: {e}")
        return ""

def load_channel_mapping():
    """加载频道名称映射表"""
    mapping = {}
    mapping_path = "TV/channel_mapping.txt"
    if not os.path.exists(mapping_path):
        return mapping

    try:
        with open(mapping_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or "," not in line:
                    continue
                old_name, new_name = line.split(",", 1)
                mapping[old_name.strip()] = new_name.strip()
    except Exception as e:
        print(f"加载映射表失败: {e}")
    return mapping

def parse_m3u_to_txt(m3u_content):
    mapping = load_channel_mapping()
    lines = m3u_content.split('\n')
    channels = {}
    current_group = '未分组'

    for i in range(len(lines)):
        line = lines[i].strip()
        if line.startswith('#EXTINF:-1'):
            group_match = re.search(r'group-title="([^"]*)"', line)
            group = group_match.group(1) if group_match else current_group

            name_match = re.search(r'tvg-name="([^"]*)"', line)
            name = name_match.group(1) if name_match else line.split(',')[-1].strip()

            # 使用映射表标准化名称
            name = mapping.get(name, name)

            if i + 1 < len(lines):
                url = lines[i + 1].strip()
                if url and not url.startswith('#'):
                    if group not in channels:
                        channels[group] = []
                    channels[group].append(f"{name},{url}")
                    current_group = group

    txt_content = ""
    for group, channel_list in channels.items():
        txt_content += f"{group},#genre#\n"
        txt_content += "\n".join(channel_list) + "\n\n"
    return txt_content.strip()

def main():
    # 创建TV目录（如果不存在）
    if not os.path.exists("TV"):
        os.makedirs("TV")

    # 源地址列表
    source_urls = [
        "https://live.ottiptv.cc/iptv.m3u?userid=423579792&sign=1b9178f4a3fd4e0dc2a385881904a9c386395595d36b90d423e45f229d17e15f6ecd846bcccc97d223b5f580369a9b4cc49617734e42ee735e107e554d04bd2eec14386a398b&auth_token=acb0c268be4342419aa3ba49796b45e0",
        "https://live.fanmingming.com/tv/m3u/ipv6.m3u"
    ]

    # 获取并合并内容
    all_content = ""
    for url in source_urls:
        content = fetch_m3u_content(url)
        if content:
            all_content += content + "\n\n"

    if not all_content:
        print("错误：未能获取任何有效内容")
        return

    # 加载模板分类
    categories = load_categories_from_template()
    if not categories:
        print("分类数据为空，请检查模板文件格式")
        return

    # 处理内容
    lines = all_content.splitlines()
    sorted_content = []
    all_lines = [line.strip() for line in lines if line.strip() and "#genre#" not in line]

    # 记录已匹配行
    matched_lines = set()

    # 按模板分类整理频道
    for category, channels in categories.items():
        sorted_content.append(f"{category},#genre#")
        for channel in channels:
            # 尝试匹配频道名称
            channel_pattern = re.escape(channel)
            for line in all_lines:
                # 检查频道名称是否在行首
                if re.match(rf"^\s*{channel_pattern}\s*,", line, re.IGNORECASE):
                    sorted_content.append(line)
                    matched_lines.add(line)
        sorted_content.append("")

    # 剩余未匹配的归入"其它"
    other_lines = [line for line in all_lines if line not in matched_lines]
    if other_lines:
        sorted_content.append("其它,#genre#")
        sorted_content.extend(other_lines)
        sorted_content.append("")

    # 保存结果
    output_path = "TV/live.txt"
    try:
        with open(output_path, "w", encoding="utf-8") as f:
            f.write("\n".join(sorted_content))
        print(f"✅ 多源合并完成，已保存为 {output_path}")
        print(f"统计: {len(matched_lines)}个匹配频道, {len(other_lines)}个未分类频道")
    except Exception as e:
        print(f"保存文件时出错: {e}")

if __name__ == "__main__":
    main()