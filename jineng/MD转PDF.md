# MD转PDF技能

## 简介
将Markdown文件转换为PDF，支持中文显示。

## 依赖库
```bash
pip install reportlab
```

## 固定脚本路径
`C:\Users\nuoyan\.xiaoduan\work\md_to_pdf.py`

## 执行流程

### 第一步：修改脚本中的输入输出路径
用 `edit` 工具修改脚本中的两个变量：
```python
md_file = r"你的MD文件路径"
pdf_file = r"输出PDF路径"
```

### 第二步：执行脚本
```bash
python C:\Users\nuoyan\.xiaoduan\work\md_to_pdf.py
```

## 脚本模板

```python
# -*- coding: utf-8 -*-
"""
MD转PDF脚本 - 支持中文
"""
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os

# 注册中文字体
font_paths = [
    r"C:\Windows\Fonts\msyh.ttc",  # 微软雅黑
    r"C:\Windows\Fonts\simsun.ttc",  # 宋体
    r"C:\Windows\Fonts\simhei.ttf",  # 黑体
]

font_name = None
for fp in font_paths:
    if os.path.exists(fp):
        try:
            pdfmetrics.registerFont(TTFont('ChineseFont', fp))
            font_name = 'ChineseFont'
            print(f"[OK] 使用字体: {fp}")
            break
        except:
            continue

if not font_name:
    print("[警告] 未找到中文字体，使用默认字体")
    font_name = 'Helvetica'

# 输入输出文件 - 修改这两个变量即可
md_file = r"你的MD文件路径"
pdf_file = r"输出PDF路径"

# 读取MD文件
with open(md_file, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 创建PDF文档
doc = SimpleDocTemplate(pdf_file, pagesize=A4, leftMargin=2*cm, rightMargin=2*cm)
styles = getSampleStyleSheet()

# 创建中文样式
style_normal = ParagraphStyle('ChineseNormal', parent=styles['Normal'], fontName=font_name, fontSize=11, leading=16)
style_h1 = ParagraphStyle('ChineseH1', parent=styles['Heading1'], fontName=font_name, fontSize=18, leading=24)
style_h2 = ParagraphStyle('ChineseH2', parent=styles['Heading2'], fontName=font_name, fontSize=15, leading=20)
style_h3 = ParagraphStyle('ChineseH3', parent=styles['Heading3'], fontName=font_name, fontSize=13, leading=18)

# 构建PDF内容
story = []
for line in lines:
    line = line.rstrip()
    if not line:
        story.append(Spacer(1, 0.3*cm))
    elif line.startswith('# '):
        story.append(Paragraph(line[2:], style_h1))
    elif line.startswith('## '):
        story.append(Paragraph(line[3:], style_h2))
    elif line.startswith('### '):
        story.append(Paragraph(line[4:], style_h3))
    elif line.startswith('- '):
        story.append(Paragraph("• " + line[2:], style_normal))
    elif line.startswith('**') and line.endswith('**'):
        story.append(Paragraph(line, style_normal))
    else:
        # 转义特殊字符
        line = line.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        story.append(Paragraph(line, style_normal))

# 生成PDF
doc.build(story)
print(f"[成功] PDF生成成功: {pdf_file}")
print(f"[大小] {os.path.getsize(pdf_file)} 字节")
```

## 使用示例

```python
# 将 md_file 和 pdf_file 改为：
md_file = r"D:\Documents\readme.md"
pdf_file = r"D:\Documents\readme.pdf"
```

## 注意事项
- 中文字体自动检测：微软雅黑 > 宋体 > 黑体
- 支持Markdown标题（# ## ###）、列表（-）、加粗（**...**）
- 特殊字符自动转义（& < >）
