# Mac 版小端AI安装指南

## ⚠️ 重要说明，请阅读完再下载
由于苹果安装后会检查应用是否签名（签名需要 99 美金/年），此为测试版，作者等正式版再缴费签名

## 第一步：下载
地址见底部。

## 第二步：安装
点击 xiaoduan.dmg，将"小端AI"图标拖到右侧"应用程序"文件夹。

## 第三步：打开终端
1. 按Command + 空格 打开搜索框
2. 输入"终端"
3. 双击"终端"应用
4. 复制以下命令（Command + C）

xattr -rd com.apple.quarantine /Applications/小端AI.app

5. 在终端里粘贴（Command + V）
6. 按回车键（此命令为跳过签名）

## 第四步：完成

命令执行后，关闭终端，找到访达/应用程序/小端，双击应用即可正常使用。

长期使用：可右键点击程序坞图标 → 选项 → 选择"在程序坞中保留"

下载地址：
https://www.modelscope.cn/datasets/yiliu666/xiaoduan/resolve/master/xiaoduan1.0.0.dmg

（如为2020年前intel处理器旧版mac,非通用mac芯片，请使用下方链接）
https://www.modelscope.cn/datasets/yiliu666/xiaoduan/resolve/master/xiaoduan1.0.0-intelmac.dmg

xiaoduan 核心文件目录

##步骤一：

1. 访达 → 菜单栏「前往」→ 「个人」
2. 找到「.xiaoduan」文件夹
##步骤二：显示隐藏文件
1. 按 `Command + Shift + .`
2. 访达里就能看到所有隐藏文件（包括 .xiaoduan）

---
## xiaoduan 目录结构

| 文件/目录 | 说明 |
|---------|------|
| agents` |  记忆数据 |
| hexinbeifen | 核心备份文件 |
| jineng | 技能库文件 |
| browser| 浏览器缓存 |
| xiaoduan.json| 配置文件 |



---