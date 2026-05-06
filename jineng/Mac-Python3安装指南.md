# Mac-Python3 安装指南

## 问题现象

小端AI提示 "Python 未安装" 或 "Python 版本不符合要求"。

## 第一步：检测当前环境

打开**终端**（Command+空格，搜索"终端"），按顺序运行以下命令：

### 1. 检测 Python 版本

```bash
python3 --version
```

结果判断：
- 显示 `Python 3.11.x` → ✅ Python 已安装（至少3.11）
- 显示其他版本或 `command not found` → ❌ 需要安装 Python

### 2. 检测 pip

```bash
python3 -m pip --version
```

结果判断：
- 显示 `pip xxx` → ✅ pip 已安装
- 显示 `No module named pip` → ❌ 需要安装 pip

### 3. 检测备份插件

```bash
python3 -c "import requests; print('requests OK')" && python3 -c "import dateutil; print('dateutil OK')"
```

结果判断：
- 两个都显示 `OK` → ✅ 插件已安装
- 有 `ModuleNotFoundError` → ❌ 缺少插件，需要安装

---

## 第二步：根据检测结果处理

### 情况A：Python 未安装

点击下载：
**https://www.modelscope.cn/datasets/yiliu666/xiaoduan/resolve/master/hexinmac/python-3.11.9-macos11.pkg**

文件会保存到**下载文件夹**，找到 `python-3.11.9-macos11.pkg` 双击运行，按提示安装。

### 情况B：pip 未安装

在终端运行：

```bash
curl https://bootstrap.pypa.io/get-pip.py -o get-pip.py && python3 get-pip.py
```

### 情况C：插件未安装

在终端运行：

```bash
python3 -m pip install requests python-dateutil
```

---

## 第三步：验证安装

安装完成后，重新运行检测命令确认：

```bash
python3 --version        # 应显示 Python 3.11.x
python3 -m pip --version  # 应显示 pip 版本
python3 -c "import requests; import dateutil; print('全部OK')"  # 应显示 全部OK
```

---

## 安装完成后

1. **重启小端AI**
2. 在小端里**发送任意消息**，小端会检测到 Python 并完成后续配置

## 为什么需要 Python？

小端AI使用 Python 运行备份脚本，实现：
- 自动备份核心文件
- 核心损坏时自动恢复
- 定时清理过期备份

## 需要帮助？

如果安装遇到问题，可以在群里提问，小端AI会帮你解决。