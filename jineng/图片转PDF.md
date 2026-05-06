# 图片转PDF技能

## 简介
将文件夹中的多张图片合并成一个PDF文件，支持自定义顺序和新增图片。

## 依赖库
```bash
pip install Pillow
```

## 固定脚本路径
`C:\Users\nuoyan\.xiaoduan\work\images_to_pdf.py`

## 执行流程

### 第一步：修改脚本中的参数
用 `edit` 工具修改脚本中的变量：
```python
IMAGE_DIR = r"图片文件夹路径"
OUTPUT_PDF = r"输出PDF路径"
```

### 第二步：如需调整顺序，修改图片列表
```python
# 自定义顺序（可选）
custom_order = [
    "图片3.jpg",  # 第一张
    "图片1.png",  # 第二张
    "图片2.jpg",  # 第三张
]
```

### 第三步：执行脚本
```bash
python C:\Users\nuoyan\.xiaoduan\work\images_to_pdf.py
```

## 脚本模板

```python
# -*- coding: utf-8 -*-
"""
图片转PDF脚本 - 支持中文文件名
"""
from PIL import Image
import os

# 配置
IMAGE_DIR = r"图片文件夹路径"
OUTPUT_PDF = r"输出PDF路径"

# 支持的图片格式
SUPPORTED_FORMATS = ('.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp')

def get_image_list(image_dir):
    """获取文件夹中的所有图片"""
    images = []
    for f in os.listdir(image_dir):
        if f.lower().endswith(SUPPORTED_FORMATS):
            images.append(os.path.join(image_dir, f))
    return images

def images_to_pdf(image_paths, output_pdf):
    """将多张图片合并成PDF"""
    if not image_paths:
        print("[错误] 没有找到图片文件")
        return False
    
    # 打开所有图片
    image_list = []
    for img_path in image_paths:
        try:
            img = Image.open(img_path)
            # 转换为RGB模式（PDF不支持RGBA）
            if img.mode == 'RGBA':
                img = img.convert('RGB')
            elif img.mode != 'RGB':
                img = img.convert('RGB')
            image_list.append(img)
            print(f"[处理] {os.path.basename(img_path)}")
        except Exception as e:
            print(f"[警告] 跳过 {img_path}: {e}")
    
    if not image_list:
        print("[错误] 没有成功加载任何图片")
        return False
    
    # 保存为PDF
    first_image = image_list[0]
    other_images = image_list[1:]
    
    first_image.save(
        output_pdf,
        "PDF",
        save_all=True,
        append_images=other_images
    )
    
    print(f"\n[成功] PDF生成成功: {output_pdf}")
    print(f"[大小] {os.path.getsize(output_pdf)} 字节 ({os.path.getsize(output_pdf)/1024:.1f} KB)")
    return True

if __name__ == "__main__":
    print("=" * 50)
    print("图片转PDF工具")
    print("=" * 50)
    
    # 获取图片列表
    images = get_image_list(IMAGE_DIR)
    print(f"[信息] 找到 {len(images)} 张图片")
    
    # 按文件名排序（默认）
    images.sort()
    
    # 生成PDF
    images_to_pdf(images, OUTPUT_PDF)
```

## 高级用法

### 自定义图片顺序
```python
# 在脚本中添加自定义顺序
custom_order = [
    "微信图片_20260502215658_306_80.jpg",  # 第一张
    "wechat_2026-05-02_220055_261.png",     # 第二张
    "微信图片_20260502215657_305_80.jpg",  # 第三张
]

# 替换 images.sort() 为：
ordered_images = []
for name in custom_order:
    path = os.path.join(IMAGE_DIR, name)
    if os.path.exists(path):
        ordered_images.append(path)
    else:
        print(f"[警告] 文件不存在: {name}")

# 添加未在列表中的图片
for img in images:
    if img not in ordered_images:
        ordered_images.append(img)

images = ordered_images
```

### 新增图片到末尾
```python
# 在 custom_order 末尾添加新图片
custom_order.append("新图片.jpg")
```

## 使用示例

```python
# 基本用法
IMAGE_DIR = r"D:\Photos\vacation"
OUTPUT_PDF = r"D:\Photos\vacation.pdf"

# 自定义顺序
custom_order = [
    "cover.jpg",
    "photo1.png",
    "photo2.jpg",
    "ending.png"
]
```

## 注意事项
- 支持格式：PNG、JPG、JPEG、BMP、GIF、WEBP
- RGBA图片自动转换为RGB（PDF不支持透明通道）
- 中文文件名完全支持
- 图片按原始比例显示，不拉伸变形
