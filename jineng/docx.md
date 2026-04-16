# docx - Word文档自动化

## 技能简介

此技能用于创建、编辑和管理Word文档（.docx格式），使用python-docx库进行程序化文档生成。

## 核心关键词

Word文档自动化，python-docx，docx.js，文档模板，批量生成，办公自动化，程序化文档处理

## 核心能力

- 创建/编辑Word文档（.docx）
- 模板填充
- 样式管理
- 数据导出到Word格式
- 办公自动化工作流

## 安装依赖

```bash
pip install python-docx
```

## 基础用法

### 1. 创建文档

```python
from docx import Document

doc = Document()
doc.add_heading('标题', level=1)
doc.add_paragraph('这是正文内容')
doc.save('output.docx')
```

### 2. 添加格式化文本

```python
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH

# 添加标题
doc.add_heading('第一章', 1)

# 添加段落
para = doc.add_paragraph('这是普通段落')

# 添加带格式的文本
run = para.add_run('这是加粗的文本')
run.bold = True
run.font.size = Pt(14)

# 对齐
para.alignment = WD_ALIGN_PARAGRAPH.CENTER
```

### 3. 添加表格

```python
table = doc.add_table(rows=3, cols=3)
table.style = 'Light Grid Accent 1'

# 填充数据
cells = table.rows[0].cells
cells[0].text = '姓名'
cells[1].text = '年龄'
cells[2].text = '城市'
```

### 4. 模板填充

```python
from docx import Document

doc = Document('template.docx')

# 替换占位符
for paragraph in doc.paragraphs:
    if '{{name}}' in paragraph.text:
        paragraph.text = paragraph.text.replace('{{name}}', '张三')

doc.save('filled.docx')
```

### 5. 批量生成

```python
from docx import Document

template = Document('template.docx')

data = [
    {'name': '张三', 'age': '25', 'city': '北京'},
    {'name': '李四', 'age': '30', 'city': '上海'},
]

for item in data:
    doc = Document()
    
    # 复制模板内容
    for element in template.element.body:
        doc.element.body in para.text:
                para.text = para.text.replace(f'{{{{{key}}}}}', value)
    
    doc.save(f"{item['name']}_report.docx")
```

### 6. 添加图片

```python
from docx.shared import Inches

doc.add_picture('image.png', width=Inches(2))
```

## 常用场景

### 场景1：批量生成报告

```python
from docx import Document
from datetime import datetime

def generate_report(title, content, output_path):
    doc = Document()
    doc.add_heading(title, 0)
    doc.add_paragraph(f'生成时间：{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
    doc.add_paragraph(content)
    doc.save(output_path)

# 批量生成
reports = [
    {'title': '日报', 'content': '今日工作内容...'},
    {'title': '周报', 'content': '本周工作内容...'},
]

for r in reports:
    generate_report(r['title'], r['content'], f"{r['title']}.docx")
```

### 场景2：数据导出到Word

```python
from docx import Document
from docx.shared import Pt

def export_to_word(data, filename):
    doc = Document()
    doc.add_heading('数据导出报告', 1)
    
    # 创建表格
    table = doc.add_table(rows=len(data)+1, cols=len(data[0]))
    
    # 表头
    headers = list(data[0].keys())
    for i, h in enumerate(headers):
        table.rows[0].cells[i].text = h
    
    # 数据行
    for row_idx, row in enumerate(data, 1):
        for col_idx, key in enumerate(headers):
            table.rows[row_idx].cells[col_idx].text = str(row[key])
    
    doc.save(filename)
```

## 注意事项

1. **python-docx** 主要用于处理 `.docx` 格式（旧版 `.doc` 不支持）
2. 模板文件需要先保存为 `.docx` 格式
3. 复杂样式建议使用模板+代码替换的方式
4. 批量生成时注意文件命名避免覆盖

## 相关资源

- 官方文档：https://python-docx.readthedocs.io/
- GitHub：https://github.com/python-openxml/python-docx
