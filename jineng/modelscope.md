# 魔搭(ModelScope) CLI 技能

> 小端的魔搭社区命令行工具技能，学会日期：2026-03-27

## 📌 核心命令

### 1. 安装
```bash
pip install modelscope
```

### 2. 上传数据集（重点！）
```bash
# 上传单个文件
modelscope upload 用户名/数据集名 /本地/文件路径 远程文件名 --repo-type dataset --token <Your Token>

# 示例：上传掘金技能文档
modelscope upload yiliu666/jineng "C:\path\to\juejin.md" juejinluntan.md --repo-type dataset --token <Your Token>
```

### 3. 下载数据集
```bash
modelscope download --dataset 用户名/数据集名 --local_dir ./下载目录 --token <Your Token>
```

### 4. 查看本地缓存
```bash
modelscope scan-cache
```

### 5. 清理缓存
```bash
modelscope clear-cache --dataset 用户名/数据集名
```

## 📋 常用参数

| 参数 | 说明 |
|------|------|
| `--repo-type {model,dataset}` | 仓库类型，上传数据集用 dataset |
| `--token` | 指定访问令牌（⚠️不要写进文档！） |
| `--include` | 指定上传包含的文件 |
| `--exclude` | 排除某些文件 |
| `--commit-message` | 提交信息 |

## 🗂️ 诺言的魔搭仓库

- 用户名：yiliu666
- Token：https://modelscope.cn/my/myaccesstoken

### 当前数据集
| 数据集 | 说明 | 状态 |
|--------|------|------|
| `yiliu666/xiaoduan` | 小端机器人AI伴侣 | 公开给人下载 |
| `yiliu666/jineng` | 技能库 | 里面放各种技能文档 |
| `yiliu666/zhenbenshi` | 历史 | 暂时保留 |

## 🎯 正确操作流程

### 创建技能数据集
```bash
# 1. 先创建数据集（会自动创建）
modelscope upload yiliu666/jineng /本地/文件路径 远程文件名 --repo-type dataset --token <Your Token>
```

### 上传技能文档
```bash
# 文件名用拼音，方便国内外用户下载
modelscope upload yiliu666/jineng "\main\skills\juejin-publish.md" juejinluntan.md --repo-type dataset --token <Your Token>
```

### 删除数据集（需手动）
- ⚠️ CLI删除经常失败，建议去网页端操作
- 地址：https://modelscope.cn/organization/yiliu666/datasets

## ⚠️ 注意事项

1. **Token不要写进文档** - Token是个人隐私
2. **先问用户确认** - 特别是删除操作！
3. **命名用拼音** - `jineng`（技能）、`juejinluntan`（掘金论坛）
4. **备份很重要** - 修改前先备份到workspace
5. **删除要谨慎** - `xiaoduan` 和 `zhenbenshi` 不能删！

## 🔗 相关链接

- CLI文档：https://www.modelscope.cn/docs/sdk/cli
- Token获取：https://modelscope.cn/my/myaccesstoken
- 数据集管理：https://modelscope.cn/organization/yiliu666/datasets
