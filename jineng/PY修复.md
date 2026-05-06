# Python 环境修复指南

如果备份功能无法正常使用（如技能没有自动同步、更新后没有生效），很可能是 Python 环境缺少必要的组件。

***

## 一分钟检测

打开命令行（Win+R → 输入 `cmd` → 回车），依次运行：

```bash
python --version
```

```bash
pip --version
```

如果都能显示版本号，说明 Python 和 pip 已安装，跳到第二章。

如果提示"不是内部或外部命令"，说明 Python 没加入 PATH，需要重新安装 Python（勾选 "Add to PATH"）。

***

## 第一步：安装 pip

如果 `pip --version` 提示不存在，运行：

```bash
python -m ensurepip
```

如果提示权限错误，以管理员身份运行命令行（右键 → "以管理员身份运行"）。

***

## 第二步：安装所需模块

复制以下命令，粘贴到命令行，回车运行：

```bash
pip install requests js2py
```

看到 "Successfully installed xxx" 即表示成功。

***

## 第三步：验证是否修复成功

运行：

```bash
python -c "import requests; import js2py; print('模块检测通过')"
```

如果输出 "模块检测通过"，说明环境已就绪，备份功能应该可以正常使用了。

***

## 常见问题

**Q：提示 "Fatal error in launcher"**

> 运行 `python -m pip install requests js2py` 代替

**Q：提示权限不足**

> 以管理员身份运行命令行后再试

**Q：安装很慢或失败**

> 可以换国内源：`pip install requests js2py -i https://pypi.tuna.tsinghua.edu.cn/simple`

***

修复完成后，重新启动小端，技能备份功能应该就能正常工作了。
