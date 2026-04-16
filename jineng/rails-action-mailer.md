# Rails Action Mailer 邮件发送

## 技能简介
Action Mailer是Rails内置的邮件发送解决方案，支持SMTP、SendGrid、AWS SES等，支持邮件模板和预览。

## 安装配置
```ruby
# config/environments/development.rb
config.action_mailer.perform_caching = false
config.action_mailer.delivery_method = :letter_opener
config.action_mailer.default_url_options = { host: 'localhost:3000' }

# config/environments/production.rb
config.action_mailer.perform_caching = false
config.action_mailer.delivery_method = :smtp
config.action_mailer.smtp_settings = {
  address:              'smtp.gmail.com',
  port:                 587,
  domain:               'example.com',
  user_name:            ENV['SMTP_USERNAME'],
  password:             ENV['SMTP_PASSWORD'],
  authentication:       'plain',
  enable_starttls_auto: true
}
config.action_mailer.default_url_options = { host: 'example.com', protocol: 'https' }
```

```ruby
# config/environments/production.rb (SendGrid)
config.action_mailer.delivery_method = :smtp
config.action_mailer.smtp_settings = {
  address: 'smtp.sendgrid.net',
  port: 587,
  domain: 'example.com',
  user_name: 'apikey',
  password: ENV['SENDGRID_API_KEY'],
  authentication: :plain
}
```

## 创建邮件类
```bash
rails generate mailer UserMailer welcome_email order_confirmation
```

```ruby
# app/mailers/user_mailer.rb
class UserMailer < ApplicationMailer
  default from: 'noreply@example.com'
  layout 'mailer'  # 使用 mailer layout

  def welcome_email(user)
    @user = user
    @login_url = root_url
    mail(to: @user.email, subject: 'Welcome to My App')
  end

  def order_confirmation(order)
    @order = order
    @user = order.user
    attachments['invoice.pdf'] = PDFGenerator.generate(@order)
    mail(to: @user.email, subject: "Order ##{@order.number} Confirmed")
  end

  def password_reset(user)
    @user = user
    @reset_url = edit_password_reset_url(@user.reset_token)
    mail(to: @user.email, subject: 'Reset Your Password')
  end
end
```

## 邮件视图
```erb
<%# app/views/user_mailer/welcome_email.html.erb %>
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <title>Welcome</title>
    <style>
      .btn { background: #007bff; color: white; padding: 10px 20px; text-decoration: none; }
    </style>
  </head>
  <body>
    <h1>Welcome, <%= @user.name %>!</h1>
    <p>Thank you for joining us.</p>
    <%= link_to 'Get Started', @login_url, class: 'btn' %>
  </body>
</html>
```

```erb
<%# app/views/user_mailer/welcome_email.text.erb %>
Welcome, <%= @user.name %>!

Thank you for joining us.

Get started: <%= @login_url %>
```

## 邮件布局
```erb
<%# app/views/layouts/mailer.html.erb %>
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <%= yield %>
  </head>
  <body>
    <div class="email-wrapper">
      <%= yield %>
    </div>
    <footer>
      <p>© 2024 My App</p>
    </footer>
  </body>
</html>
```

## 发送邮件
```ruby
# 立即发送
UserMailer.welcome_email(@user).deliver_now
UserMailer.order_confirmation(@order).deliver_later  # 使用Active Job异步

# 批量发送
UserMailer.welcome_email(@users).deliver_later

# 带选项
mail = UserMailer.welcome_email(@user)
mail.to = ['user@example.com', 'another@example.com']
mail.cc = 'admin@example.com'
mail.bcc = 'system@example.com'
mail.reply_to = 'support@example.com'
mail.subject = 'Custom Subject'
mail.deliver_now
```

## 邮件预览
```ruby
# spec || User.new(name: 'John', email: 'john@example.com')
    UserMailer.welcome_email(user)
  end

  def password_reset
    user = User.first || User.new(
      name: 'John',
      email: 'john@example.com',
      reset_token: 'abc123'
    )
    UserMailer.password_reset(user)
  end
end
```

访问 `http://localhost:3000/rails/mailers`

## 内部类邮件
```ruby
class OrderMailer < ApplicationMailer
  def shipping_notification(order)
    @order = order
    @user = order.user
    @items = @order.items
    
    mail to: @user.email,
         subject: "Your Order ##{@order.number} Has Shipped",
         template_name: 'shipping_notification',
         template_path: 'order_mailer'
  end
end
```

## 附件处理
```ruby
class ReportsMailer < ApplicationMailer
  def weekly_report(user, report_file)
    @user = user
    attachments['weekly_report.pdf'] = File.read(report_file)
    attachments['data.csv'] = {
      mime_type: 'text/csv',
      content: ReportGenerator.csv(user)
    }
    attachments.inline['logo.png'] = File.read(Rails.root.join('app/assets/images/logo.png'))
    
    mail(to: @user.email, subject: 'Weekly Report')
  end
end
```

```erb
<%# 邮件中显示内联图片 %>
<%= image_tag attachments['logo.png'].url, alt: 'Logo' %>
```

## SMTP开发邮件服务
```ruby
# Letter Opener (本地预览)
gem 'letter_opener', group: :development

# Mailhog (本地SMTP服务器)
# config/development.rb
config.action_mailer.delivery_method = :smtp
config.action_mailer.smtp_settings = {
  address: 'localhost',
  port: 1025
}
```

## 测试
```ruby
# spec/mailers/user_mailer_spec.rb
require 'rails_helper'

RSpec.describe UserMailer, type: :mailer do
  describe 'welcome_email' do
    let(:user) { create(:user, email: 'test@example.com', name: 'John') }
    let(:mail) { described_class.welcome_email(user) }

    it 'sends to the user email' do
      expect(mail.to).to eq(['test@example.com'])
    end

    it 'has the correct subject' do
      expect(mail.subject).to eq('Welcome to My App')
    end

    it 'contains user name in body' do
      expect(mail.body).to include('John')
    end

    it 'uses correct from address' do
      expect(mail.from).to eq(['noreply@example.com'])
    end
  end
end
```

## 关键词
Rails Action Mailer, 邮件发送, SMTP, SendGrid, 邮件模板, 邮件预览, 附件, Rails邮件
