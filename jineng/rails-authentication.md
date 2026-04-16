# Rails Authentication 认证系统

## 核心概念
Rails提供多种认证方案，包括Session认证、JWT认证、OAuth等。

## Devise认证

### 安装
```ruby
# Gemfile
gem 'devise'

bundle install
rails generate devise:install
rails generate devise User
rails db:migrate
```

### 模型配置
```ruby
# app/models/user.rb
class User < ApplicationRecord
  devise :database_authenticatable, :registerable,
         :recoverable, :rememberable, :validatable,
         :confirmable, :lockable
end
```

### 控制器
```ruby
class RegistrationsController < Devise::RegistrationsController
  private
  
  def sign_up_params
    params.require(:user).permit(:email, :password, :password_confirmation)
  end
end
```

## 手写认证

### 用户模型
```ruby
class User < ApplicationRecord
  has_secure_password
  
  validates :email, presence: true, uniqueness: true
  
  def authenticate(password)
    BCrypt::Password.new(password_digest) == password ? self : false
  end
end
```

### Session认证
```ruby
class SessionsController < ApplicationController
  def create
    user = User.find_by(email: params[:email])
    
    if user&.authenticate(params[:password])
      session[:user_id] = user.id
      redirect_to root_path, notice: '登录成功'
    else
      flash.now[:alert] = '邮箱或密码错误'
      render :new
    end
  end
  
  def destroy
    session.delete(:user_id)
    redirect_to root_path, notice: '已退出登录'
  end
end
```

### 密码重置
```ruby
class PasswordResetsController < ApplicationController
  def create
    user = User.find_by(email: params[:email])
    
    if user
      user.generate_reset_token!
      UserMailer.password_reset(user).deliver_now
    end
    
    redirect_to root_path, notice: '如果邮箱存在，已发送重置链接'
  end
  
  def update
    user = User.find_by(reset_token: params[:token])
    
    if user&.token_valid?
      user.update(password: params[:password])
      redirect_to login_path, notice: '密码已重置'
    else
      redirect_to root_path, alert: '重置链接已过期'
    end
  end
end
```

## JWT认证

```ruby
# Gemfile
gem 'jwt'
gem 'devise-jwt'

# config/initializers/devise.rb
Devise.setup do |config|
  config.jwt do |jwt|
    jwt.secret_key = Rails.application.credentials.secret_key_base
    jwt.expiration_time = 1.week
  end
end

# 使用 JWT
class JwtService
  def self.encode(user_id)
    JWT.encode(
      { user_id: user_id, exp: 1.week.from_now.to_i },
      Rails.application.credentials.secret_key_base
    )
  end
  
  def self.decode(token)
    JWT.decode(token, Rails.application.credentials.secret_key_base)[0]
  rescue
    nil
  end
end
```

## OAuth认证

```ruby
# Gemfile
gem 'omniauth'
gem 'omniauth-github'
gem 'omniauth-facebook'

# config/initializers/omniauth.rb
Rails.application.config.middleware.use OmniAuth::Builder do
  provider :github, ENV['GITHUB_KEY'], ENV['GITHUB_SECRET']
  provider :facebook, ENV['FACEBOOK_KEY'], ENV['FACEBOOK_SECRET']
end

# 回调路由
# config/routes.rb
get '/auth/:provider/callback', to: 'sessions#create'

# 控制器
class SessionsController < ApplicationController
  def create
    auth = request.env['omniauth.auth']
    user = User.find_or_create_from_auth(auth)
    session[:user_id] = user.id
    redirect_to root_path
  end

  def password=(password)
    @password = password
    self.password_digest = BCrypt::Password.create(password)
  end
  
  def password
    @password
  end
end

# 使用 Argon2
gem 'argon2'
```

## 双因素认证

```ruby
gem 'rotp'
gem 'rqrcode'

class User < ApplicationRecord
  def two_factor_secret
    totp = ROTP::TOTP.new(secret)
    totp.now
  end
  
  def verify_code(code)
    totp = ROTP::TOTP.new(secret)
    totp.verify(code)
  end
end
```

## 关键词
Rails认证, Devise, JWT, OAuth, Session认证, 密码加密, BCrypt, 双因素认证, Ruby on Rails
