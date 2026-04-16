# Rails Background Jobs 后台任务

## 核心概念
Rails支持多种后台任务处理：ActiveJob、Sidekiq、DelayedJob、Resque等。

## ActiveJob

### 基本用法
```ruby
# 创建任务
class SendEmailJob < ApplicationJob
  queue_as :default
  
  def perform(user_id)
    user = User.find(user_id)
    UserMailer.welcome(user).deliver_later
  end
end

# 入队
SendEmailJob.perform_later(user.id)
SendEmailJob.set(wait: 5.minutes).perform_later(user.id)
SendEmailJob.set(wait_until: 1.hour.from_now).perform_later(user.id)
```

### 适配器
```ruby
# config/application.rb
module MyApp
  class Application < Rails::Application
    config.active_job.queue_adapter = :sidekiq
  end
end
```

## Sidekiq

### 安装
```ruby
# Gemfile
gem 'sidekiq'
gem 'sinatra' # 用于监控面板

# config/routes.rb
require 'sidekiq/web'
mount Sidekiq::Web => '/sidekiq'
```

### 任务定义
```ruby
# app/workers/email_worker.rb
class EmailWorker
  include Sidekiq::Worker
  
  def perform(user_id, email_type)
    user = User.find(user_id)
    
    case email_type
    when 'welcome'
      UserMailer.welcome(user).deliver
    when 'password_reset'
      UserMailer.password_reset(user).deliver
    end
  end
end

# 入队
EmailWorker.perform_async(user.id, 'welcome')
EmailWorker.perform_in(5.minutes, user.id, 'welcome')
```

### 定时任务
```ruby
# config/sidekiq.yml
:schedule:
  cleanup_job:
    cron: '0 0 * * *'
    class: CleanupWorker
```

### Redis配置
```ruby
# config/initializers/sidekiq.rb
Sidekiq.configure_server do |config|
  config.redis = { url: ENV['REDIS_URL'] }
end

Sidekiq.configure_client do |config|
  config.redis = { url: ENV['REDIS_URL'] }
end
```

## DelayedJob

### 安装
```ruby
# Gemfile
gem 'delayed_job'
gem 'delayed_job_active_record'

rails generate delayed_job:active_record
rails db:migrate
```

### 使用
```ruby
class TaskJob < ApplicationJob
  def perform
    # 耗时任务
    HeavyProcessing.run
  end
end

# 入队
TaskJob.perform_later
TaskJob.delay(run_at: 5.minutes.from_now).perform
```

## Resque

### 安装
```ruby
# Gemfile
gem 'resque'
gem 'resque-scheduler'
```

### 任务
```ruby
# app/jobs/heavy_task_job.rb
class HeavyTaskJob
  @queue = :heavy_tasks
  
  def self.perform(task_id)
    task = Task.find(task_id)
    task.process!
  end
end

# 入队
Resque.enqueue(HeavyTaskJob, task.id)
```

## 任务监控

### Sidekiq Web
```ruby
# config/routes.rb
require 'sidekiq/web'
mount Sidekiq::Web => '/sidekiq'

# 添加认证
Sidekiq::Web.use Rack::Auth::Basic do |username, password|
  username == Sidekiq::Worker
  sidekiq_options retry: 0
  
  def perform(*args)
    begin
      # 任务逻辑
    rescue => e
      ErrorNotifier.notify(e)
      raise
    end
  end
end
```

## 队列管理

```ruby
# 队列优先级
# config/application.rb
config.active_job.queue_name_prefix = ENV['QUEUE_PREFIX']

# 任务队列
class ImportantJob < ApplicationJob
  queue_as :high_priority
end
```

## 失败重试

```ruby
class RetryJob < ApplicationJob
  retry_on CustomError, wait: :exponentially_longer, attempts: 5
  
  def perform
    # 可能失败的任务
  end
end

# Sidekiq重试
class SidekiqRetryJob
  include Sidekiq::Worker
  sidekiq_options retry: 5, dead: true
  
  def perform(*args)
    # 任务逻辑
  end
end
```

## 任务测试

```ruby
# spec/jobs/email_worker_spec.rb
require 'rails_helper'

RSpec.describe EmailWorker, type: :worker do
  let(:user) { create(:user) }
  
  it 'sends welcome email' do
    expect {
      described_class.perform_async(user.id, 'welcome')
    }.to change(Sidekiq::Queues['default'].size, by: 1)
  end
end
```

## 关键词
Rails后台任务, ActiveJob, Sidekiq, DelayedJob, Resque, Redis, 队列, 重试机制, Ruby on Rails
