# QQ邮件自动化技能

## 简介
QQ邮件自动化包含两个部分：
1. **SMTP发送邮件** - 发送邮件、附件
2. **IMAP管理邮件** - 读取、搜索、删除、移动、标记邮件

---

## 一、前置条件

### 1. 开启QQ邮箱SMTP/IMAP服务
1. 登录QQ邮箱：https://mail.qq.com
2. 点击「设置」→「账户」
3. 往下滚动找到「POP3/IMAP/SMTP/Exchange/CardDAV/CalDAV服务」
4. 开启「POP3/SMTP服务」和「IMAP/SMTP服务」
5. 按提示发送短信验证
6. 获取**16位授权码**（注意保存，只显示一次）

### 2. 配置信息
| 项目 | 值 |
|------|-----|
| QQ邮箱地址 | `你的QQ邮箱@qq.com` |
| SMTP授权码 | `你的16位授权码` |
| SMTP服务器 | smtp.qq.com |
| SMTP端口 | 465（SSL）或 587（TLS） |
| IMAP服务器 | imap.qq.com |
| IMAP端口 | 993（SSL） |

> ⚠️ **授权码 ≠ QQ密码**，是专门用于第三方登录的专用密码

---

## 二、SMTP发送邮件

### 1. 发送纯文本邮件

```python
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

def send_email(sender, auth_code, receiver, subject, body):
    """发送纯文本邮件"""
    try:
        # 创建邮件
        msg = MIMEMultipart()
        msg['From'] = sender
        msg['To'] = receiver
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'plain', 'utf-8'))
        
        # 连接SMTP服务器并发送
        server = smtplib.SMTP_SSL("smtp.qq.com", 465)
        server.login(sender, auth_code)
        server.sendmail(sender, receiver, msg.as_string())
        server.quit()
        
        print("[成功] 邮件发送成功！")
        return True
    except Exception as e:
        print(f"[失败] 邮件发送失败: {e}")
        return False

# 使用示例
send_email(
    sender="你的QQ邮箱@qq.com",
    auth_code="你的16位授权码",
    receiver="收件人@example.com",
    subject="测试邮件",
    body="这是一封测试邮件"
)
```

### 2. 发送带附件的邮件

```python
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders

def send_email_with_attachment(sender, auth_code, receiver, subject, body, attachment_path):
    """发送带附件的邮件"""
    try:
        # 创建邮件
        msg = MIMEMultipart()
        msg['From'] = sender
        msg['To'] = receiver
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'plain', 'utf-8'))
        
        # 添加附件
        with open(attachment_path, 'rb') as f:
            attachment = MIMEBase('application', 'octet-stream')
            attachment.set_payload(f.read())
        encoders.encode_base64(attachment)
        attachment.add_header('Content-Disposition', f'attachment; filename="{attachment_path.split("/")[-1]}"')
        msg.attach(attachment)
        
        # 连接SMTP服务器并发送
        server = smtplib.SMTP_SSL("smtp.qq.com", 465)
        server.login(sender, auth_code)
        server.sendmail(sender, receiver, msg.as_string())
        server.quit()
        
        print("[成功] 带附件的邮件发送成功！")
        return True
    except Exception as e:
        print(f"[失败] 邮件发送失败: {e}")
        return False

# 使用示例
send_email_with_attachment(
    sender="你的QQ邮箱@qq.com",
    auth_code="你的16位授权码",
    receiver="收件人@example.com",
    subject="带附件的邮件",
    body="请查收附件",
    attachment_path="C:/path/to/file.pdf"
)
```

### 3. 发送HTML格式邮件

```python
def send_html_email(sender, auth_code, receiver, subject, html_body):
    """发送HTML格式邮件"""
    try:
        msg = MIMEMultipart()
        msg['From'] = sender
        msg['To'] = receiver
        msg['Subject'] = subject
        msg.attach(MIMEText(html_body, 'html', 'utf-8'))
        
        server = smtplib.SMTP_SSL("smtp.qq.com", 465)
        server.login(sender, auth_code)
        server.sendmail(sender, receiver, msg.as_string())
        server.quit()
        
        print("[成功] HTML邮件发送成功！")
        return True
    except Exception as e:
        print(f"[失败] 邮件发送失败: {e}")
        return False

# 使用示例
html_content = """
<html>
<body>
<h1>这是一封HTML邮件</h1>
<p>支持<strong>加粗</strong>、<em>斜体</em>等格式</p>
</body>
</html>
"""

send_html_email(
    sender="你的QQ邮箱@qq.com",
    auth_code="你的16位授权码",
    receiver="收件人@example.com",
    subject="HTML邮件测试",
    html_body=html_content
)
```

---

## 三、IMAP管理邮件

### 1. 连接IMAP服务器

```python
import imaplib
import email
from email.header import decode_header

def connect_imap(email_address, auth_code):
    """连接QQ邮箱IMAP服务器"""
    try:
        mail = imaplib.IMAP4_SSL("imap.qq.com", 993)
        mail.login(email_address, auth_code)
        print("[成功] IMAP连接成功！")
        return mail
    except Exception as e:
        print(f"[失败] IMAP连接失败: {e}")
        return None
```

### 2. 列出邮箱文件夹

```python
def list_folders(mail):
    """列出所有邮箱文件夹"""
    try:
        status, folders = mail.list()
        if status == 'OK':
            print("邮箱文件夹：")
            for folder in folders:
                print(f"  - {folder.decode()}")
        return folders
    except Exception as e:
        print(f"[失败] 获取文件夹失败: {e}")
        return []
```

### 3. 获取邮件数量

```python
def get_mail_count(mail, folder="INBOX"):
    """获取指定文件夹的邮件数量"""
    try:
        status, data = mail.select(folder, readonly=True)
        if status == 'OK':
            count = int(data[0])
            print(f"[结果] {folder} 有 {count} 封邮件")
            return count
        return 0
    except Exception as e:
        print(f"[失败] 获取邮件数量失败: {e}")
        return 0
```

### 4. 搜索邮件

```python
def search_emails(mail, criteria='ALL', folder="INBOX"):
    """搜索邮件"""
    try:
        mail.select(folder, readonly=True)
        status, data = mail.search(None, criteria)
        if status == 'OK':
            email_ids = data[0].split()
            print(f"[结果] 找到 {len(email_ids)} 封邮件")
            return email_ids
        return []
    except Exception as e:
        print(f"[失败] 搜索邮件失败: {e}")
        return []
```

**常用搜索条件：**
| 条件 | 说明 |
|------|------|
| `ALL` | 所有邮件 |
| `UNSEEN` | 未读邮件 |
| `SEEN` | 已读邮件 |
| `FROM "xxx"` | 来自某人的邮件 |
| `SUBJECT "xxx"` | 主题包含某关键词 |
| `SINCE "01-Jan-2024"` | 某日期之后的邮件 |

### 5. 读取邮件内容

```python
def read_email(mail, email_id):
    """读取指定邮件的内容"""
    try:
        status, data = mail.fetch(email_id, '(RFC822)')
        if status == 'OK':
            msg = email.message_from_bytes(data[0][1])
            
            # 解码邮件主题
            subject = decode_header(msg["Subject"])[0][0]
            if isinstance(subject, bytes):
                subject = subject.decode()
            
            # 获取发件人和日期
            from_ = msg.get("From")
            date_ = msg.get("Date")
            
            # 获取邮件内容
            body = ""
            if msg.is_multipart():
                for part in msg.walk():
                    content_type = part.get_content_type()
                    if content_type == "text/plain":
                        body = part.get_payload(decode=True).decode()
                        break
            else:
                body = msg.get_payload(decode=True).decode()
            
            return {
                "id": email_id,
                "subject": subject,
                "from": from_,
                "date": date_,
                "body": body[:500] + "..." if len(body) > 500 else body
            }
        return None
    except Exception as e:
        print(f"[失败] 读取邮件失败: {e}")
        return None
```

### 6. 标记邮件为已读

```python
def mark_as_read(mail, email_id):
    """标记邮件为已读"""
    try:
        mail.store(email_id, '+FLAGS', '\\Seen')
        print(f"[成功] 邮件 {email_id.decode()} 已标记为已读")
        return True
    except Exception as e:
        print(f"[失败] 标记邮件失败: {e}")
        return False
```

### 7. 删除邮件

```python
def delete_email(mail, email_id):
    """删除邮件（谨慎操作）"""
    try:
        mail.store(email_id, '+FLAGS', '\\Deleted')
        mail.expunge()
        print(f"[成功] 邮件 {email_id.decode()} 已删除")
        return True
    except Exception as e:
        print(f"[失败] 删除邮件失败: {e}")
        return False
```

### 8. 移动邮件到其他文件夹

```python
def move_email(mail, email_id, target_folder):
    """移动邮件到目标文件夹"""
    try:
        mail.copy(email_id, target_folder)
        mail.store(email_id, '+FLAGS', '\\Deleted')
        mail.expunge()
        print(f"[成功] 邮件已移动到 {target_folder}")
        return True
    except Exception as e:
        print(f"[失败] 移动邮件失败: {e}")
        return False
```

---

## 四、完整示例

### 示例1：发送邮件并确认

```python
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# 配置
SENDER = "你的QQ邮箱@qq.com"
AUTH_CODE = "你的16位授权码"
RECEIVER = "收件人@example.com"

# 发送邮件
msg = MIMEMultipart()
msg['From'] = SENDER
msg['To'] = RECEIVER
msg['Subject'] = "测试邮件 - 来自小端AI"
msg.attach(MIMEText("这是一封测试邮件，用于验证QQ邮件自动化功能。", 'plain', 'utf-8'))

server = smtplib.SMTP_SSL("smtp.qq.com", 465)
server.login(SENDER, AUTH_CODE)
server.sendmail(SENDER, RECEIVER, msg.as_string())
server.quit()

print("[成功] 邮件发送成功！")
```

### 示例2：读取最新5封邮件

```python
import imaplib
import email
from email.header import decode_header

# 配置
EMAIL = "你的QQ邮箱@qq.com"
AUTH_CODE = "你的16位授权码"

# 连接
mail = imaplib.IMAP4_SSL("imap.qq.com", 993)
mail.login(EMAIL, AUTH_CODE)
mail.select("INBOX", readonly=True)

# 搜索所有邮件
status, data = mail.search(None, "ALL")
email_ids = data[0].split()

# 读取最新5封
print("最新5封邮件：")
for eid in email_ids[-5:]:
    status, msg_data = mail.fetch(eid, "(RFC822)")
    msg = email.message_from_bytes(msg_data[0][1])
    
    subject = decode_header(msg["Subject"])[0][0]
    if isinstance(subject, bytes):
        subject = subject.decode()
    
    from_ = msg.get("From")
    print(f"  - {subject} (来自: {from_})")

# 关闭连接
mail.close()
mail.logout()
```

### 示例3：搜索特定发件人的邮件

```python
import imaplib

# 配置
EMAIL = "你的QQ邮箱@qq.com"
AUTH_CODE = "你的16位授权码"
TARGET_SENDER = "目标发件人@example.com"

# 连接
mail = imaplib.IMAP4_SSL("imap.qq.com", 993)
mail.login(EMAIL, AUTH_CODE)
mail.select("INBOX", readonly=True)

# 搜索特定发件人
status, data = mail.search(None, f'FROM "{TARGET_SENDER}"')
email_ids = data[0].split()

print(f"[结果] 找到 {len(email_ids)} 封来自 {TARGET_SENDER} 的邮件")

# 关闭连接
mail.close()
mail.logout()
```

---

## 五、常见错误及解决方案

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `Authentication failed` | 授权码错误或过期 | 重新获取授权码 |
| `Connection refused` | 网络问题或服务器不可达 | 检查网络连接 |
| `Permission denied` | 未开启IMAP/SMTP服务 | 在QQ邮箱设置中开启服务 |
| `SSL: CERTIFICATE_VERIFY_FAILED` | SSL证书问题 | 更新Python或使用`ssl._create_unverified_context()` |
| `Too many connections` | 连接数过多 | 关闭其他邮件客户端 |

---

## 六、注意事项

1. **授权码安全**：不要将授权码硬编码在代码中，建议使用环境变量或配置文件
2. **操作不可逆**：IMAP的删除操作会直接删除服务器上的邮件，谨慎使用
3. **只读模式**：建议先使用`readonly=True`参数进行只读操作
4. **频率限制**：QQ邮箱有发送频率限制，避免短时间内大量发送
5. **附件大小**：QQ邮箱单个附件限制50MB，总附件限制50MB

---

## 七、常用文件夹名称

| 文件夹 | 说明 |
|--------|------|
| `INBOX` | 收件箱 |
| `Sent Messages` | 已发送 |
| `Drafts` | 草稿 |
| `Deleted Messages` | 已删除 |
| `Junk` | 垃圾邮件 |

---

## 八、快速测试脚本

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""QQ邮件自动化快速测试"""

import smtplib
import imaplib
from email.mime.text import MIMEText

# 配置（请替换为你的信息）
EMAIL = "你的QQ邮箱@qq.com"
AUTH_CODE = "你的16位授权码"
TEST_RECEIVER = "测试收件人@example.com"

def test_smtp():
    """测试SMTP发送"""
    print("\n[测试] SMTP发送邮件...")
    try:
        msg = MIMEText("这是一封测试邮件", 'plain', 'utf-8')
        msg['From'] = EMAIL
        msg['To'] = TEST_RECEIVER
        msg['Subject'] = "SMTP测试邮件"
        
        server = smtplib.SMTP_SSL("smtp.qq.com", 465)
        server.login(EMAIL, AUTH_CODE)
        server.sendmail(EMAIL, TEST_RECEIVER, msg.as_string())
        server.quit()
        
        print("[成功] SMTP发送成功！")
        return True
    except Exception as e:
        print(f"[失败] SMTP发送失败: {e}")
        return False

def test_imap():
    """测试IMAP连接"""
    print("\n[测试] IMAP连接...")
    try:
        mail = imaplib.IMAP4_SSL("imap.qq.com", 993)
        mail.login(EMAIL, AUTH_CODE)
        
        # 获取收件箱邮件数
        status, data = mail.select("INBOX", readonly=True)
        count = int(data[0])
        print(f"[成功] IMAP连接成功！收件箱有 {count} 封邮件")
        
        mail.close()
        mail.logout()
        return True
    except Exception as e:
        print(f"[失败] IMAP连接失败: {e}")
        return False

if __name__ == "__main__":
    print("=" * 50)
    print("QQ邮件自动化快速测试")
    print("=" * 50)
    
    smtp_ok = test_smtp()
    imap_ok = test_imap()
    
    print("\n" + "=" * 50)
    print(f"测试结果: SMTP={'通过' if smtp_ok else '失败'}, IMAP={'通过' if imap_ok else '失败'}")
    print("=" * 50)
```

---

## 九、技能总结

| 功能 | 协议 | 用途 |
|------|------|------|
| 发送邮件 | SMTP | 发送文本、HTML、带附件的邮件 |
| 读取邮件 | IMAP | 读取邮件内容、附件 |
| 搜索邮件 | IMAP | 按发件人、主题、日期搜索 |
| 管理邮件 | IMAP | 标记已读、删除、移动邮件 |

**完整流程：**
1. 开启QQ邮箱SMTP/IMAP服务
2. 获取16位授权码
3. 使用Python的`smtplib`发送邮件
4. 使用Python的`imaplib`管理邮件

---

*最后更新：2026年5月*
*技能状态：已跑通 ✅*
