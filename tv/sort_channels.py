import requests
import re
import os

def normalize_channel_name(name):
    """
    频道名标准化函数，与前端HTML保持一致
    规则：
    1. 去除所有空格、横线(-)、下划线(_)
    2. 去除清晰度/类型词：频道、普清、高清、HD（不区分大小写）
    3. 将所有英文字母转为大写
    """
    if not name:
        return ''

    # 1. 去除空格、横线、下划线
    normalized = re.sub(r'[-\s_]+', '', name)

    # 2. 去除清晰度/类型词（不区分大小写）
    remove_words = ['频道', '普清', '高清', 'HD']
    for word in remove_words:
        normalized = re.sub(word, '', normalized, flags=re.IGNORECASE)

    # 3. 英文字母转大写
    normalized = normalized.upper()

    # 4. 去除首尾空白
    return normalized.strip()

def load_source_urls():
    """从文件加载源地址列表"""
    source_path = "tv/sources.txt"
    urls = []

    if not os.path.exists(source_path):
        print(f"警告：未找到源地址文件 {source_path}，使用默认源")
        return ["https://live.fanmingming.com/tv/m3u/ipv6.m3u"]

    try:
        with open(source_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                if line.startswith('http'):
                    urls.append(line)
                    print(f"加载源地址: {line}")
    except Exception as e:
        print(f"读取源地址文件失败: {e}")
        return ["https://live.fanmingming.com/tv/m3u/ipv6.m3u"]

    if not urls:
        print("警告：源地址文件为空，使用默认源")
        return ["https://live.fanmingming.com/tv/m3u/ipv6.m3u"]

    return urls

def load_categories_from_template():
    """从模板文件加载分类和频道信息"""
    categories = {}
    current_category = None

    template_path = tv/moban.txt"
    if not os.path.exists(template_path):
        print(f"错误：未找到模板文件 {template_path}")
        return categories

    try:
        with open(template_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue

                if ",#genre#" in line:
                    current_category = line.split(",")[0].strip()
                    categories[current_category] = []
                elif current_category:
                    channel = line.strip()
                    if channel:
                        categories[current_category].append(channel)
    except Exception as e:
        print(f"读取模板文件出错: {e}")

    return categories

def load_channel_mapping():
    """加载频道名称映射表，并对key进行标准化"""
    mapping = {}
    mapping_path = tv/channel_mapping.txt"
    if not os.path.exists(mapping_path):
        return mapping

    try:
        with open(mapping_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or "," not in line:
                    continue
                old_name, new_name = line.split(",", 1)
                # 标准化key，value也可以标准化
                std_key = normalize_channel_name(old_name.strip())
                std_value = normalize_channel_name(new_name.strip())
                mapping[std_key] = std_value
        print(f"加载映射表成功，共 {len(mapping)} 条映射")
    except Exception as e:
        print(f"加载映射表失败: {e}")
    return mapping

def parse_content(content, is_m3u=False):
    """解析内容（自动识别M3U或TXT格式），返回(内容, 频道数)"""
    mapping = load_channel_mapping()

    # 自动检测格式
    if '#EXTM3U' in content or '#EXTINF' in content:
        is_m3u = True

    lines = content.split('\n')
    channels = {}
    current_group = '未分组'
    channel_count = 0

    if is_m3u:
        # 解析M3U格式
        for i in range(len(lines)):
            line = lines[i].strip()
            if line.startswith('#EXTINF:'):
                group_match = re.search(r'group-title="([^"]*)"', line)
                group = group_match.group(1) if group_match else current_group

                name_match = re.search(r'tvg-name="([^"]*)"', line)
                name = name_match.group(1) if name_match else line.split(',')[-1].strip()

                # 标准化频道名
                name = normalize_channel_name(name)
                # 应用映射表
                name = mapping.get(name, name)

                if i + 1 < len(lines):
                    url = lines[i + 1].strip()
                    if url and not url.startswith('#'):
                        if group not in channels:
                            channels[group] = []
                        channels[group].append(f"{name},{url}")
                        channel_count += 1
                        current_group = group
    else:
        # 解析TXT格式
        for line in lines:
            line = line.strip()
            if not line:
                continue

            if ",#genre#" in line:
                current_group = line.split(",")[0].strip()
                if current_group not in channels:
                    channels[current_group] = []
            elif ',' in line and not line.startswith('#'):
                parts = line.split(',', 1)
                if len(parts) == 2:
                    name = parts[0].strip()
                    url = parts[1].strip()
                    if url and not url.startswith('#'):
                        # 标准化频道名
                        name = normalize_channel_name(name)
                        # 应用映射表
                        name = mapping.get(name, name)
                        if current_group not in channels:
                            channels[current_group] = []
                        channels[current_group].append(f"{name},{url}")
                        channel_count += 1

    # 转换为TXT格式输出
    txt_content = ""
    for group, channel_list in channels.items():
        txt_content += f"{group},#genre#\n"
        txt_content += "\n".join(channel_list) + "\n\n"
    return txt_content.strip(), channel_count

def fetch_content(url):
    """从URL获取内容，自动识别格式并转换，返回(内容, 频道数)"""
    try:
        print(f"正在获取: {url}")

        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        response = requests.get(url, timeout=15, headers=headers)
        response.raise_for_status()

        content = response.text
        return parse_content(content)
    except requests.exceptions.RequestException as e:
        print(f"请求失败: {e}")
        return "", 0
    except Exception as e:
        print(f"处理内容时出错: {e}")
        return "", 0

def main():
    # 确保tv目录存在
    if not os.path.exists("tv"):
        os.makedirs("tv")

    # 从文件加载源地址
    source_urls = load_source_urls()
    print(f"\n共加载 {len(source_urls)} 个源地址")

    # 获取并合并内容
    all_content = ""
    total_channels = 0
    success_count = 0

    for idx, url in enumerate(source_urls, 1):
        print(f"\n--- 处理第 {idx}/{len(source_urls)} 个源 ---")
        content, channel_count = fetch_content(url)
        if content:
            all_content += content + "\n\n"
            total_channels += channel_count
            success_count += 1
            print(f"✅ 源 {idx} 获取成功，频道数: {channel_count}")
        else:
            print(f"❌ 源 {idx} 获取失败或内容为空")

    print(f"\n📊 成功获取 {success_count}/{len(source_urls)} 个源")
    print(f"📊 总计频道数: {total_channels}")

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
            # 标准化模板中的频道名
            std_channel = normalize_channel_name(channel)
            channel_pattern = re.escape(std_channel)
            for line in all_lines:
                # 提取行中的频道名（逗号前的内容）进行标准化匹配
                parts = line.split(',', 1)
                if len(parts) >= 2:
                    line_channel = normalize_channel_name(parts[0])
                    if re.match(rf"^{channel_pattern}$", line_channel, re.IGNORECASE):
                        if line not in matched_lines:
                            sorted_content.append(line)
                            matched_lines.add(line)
        sorted_content.append("")

    # 剩余未匹配的归入"其它"
    other_lines = [line for line in all_lines if line not in matched_lines]

    # 去重：保留顺序，去除完全重复的行
    seen = set()
    other_lines_unique = []
    for line in other_lines:
        if line not in seen:
            other_lines_unique.append(line)
            seen.add(line)

    if other_lines_unique:
        sorted_content.append("其它,#genre#")
        sorted_content.extend(other_lines_unique)
        sorted_content.append("")

    # 保存结果
    output_path = "tv/live.txt"
    try:
        with open(output_path, "w", encoding="utf-8") as f:
            f.write("\n".join(sorted_content))
        print(f"\n✅ 多源合并完成，已保存为 {output_path}")
        print(f"📊 统计: {len(matched_lines)}个匹配频道, {len(other_lines_unique)}个未分类频道")
        print(f"📊 总计写入频道数: {len(matched_lines) + len(other_lines_unique)}")
    except Exception as e:
        print(f"保存文件时出错: {e}")

if __name__ == "__main__":
    main()