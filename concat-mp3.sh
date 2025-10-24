#!/usr/bin/env bash

INPUT_DIR="$1"
OUTPUT_DIR="$2"

mkdir -p "$OUTPUT_DIR"

if ! command -v ffmpeg &> /dev/null; then
    echo "❌ 错误: 未找到ffmpeg，请先安装ffmpeg"
    echo "安装命令: brew install ffmpeg"
    exit -1
fi

# 查找所有mp3文件，排序后分组拼接
find -d ${INPUT_DIR} -maxdepth 1 -name '*.mp3' -print \
| sed -E -e 's/(.*第([[:digit:]]+)期.*)/\2 \1/' \
| sort -k1n \
| sed -E -e 's/.*第[[:digit:]]+期-//' -e 's/(\([[:digit:]]+\))?\.mp3//' \
| uniq \
| while IFS= read -r title; do
    num=$((num+1))
    output_file="${OUTPUT_DIR}/`printf '%03d' $num`-${title}.mp3"

    echo "开始拼接: ${num} $title"
    ffmpeg -f concat -safe 0 -i <(
        find -d ${INPUT_DIR} -maxdepth 1 -name "第*期-$title*\.mp3" -print \
        | sed -E -e 's/(.*第([[:digit:]]+)期.*)/\2 \1/' \
        | sort -k1n \
        | sed -E -e 's/^[[:digit:]]+/file/'
    ) -c copy "$output_file"
    echo "✅ 拼接完成: $output_file"
done
echo "✅ 全部拼接完成！输出目录: $OUTPUT_DIR"
