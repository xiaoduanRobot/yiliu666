# Rails Active Record Patterns

## 技能简介
关于Ruby on Rails框架中Active Record模式的使用，包括模型定义、关联、查询优化、验证、回调等。

## 模型定义
```ruby
class User < ApplicationRecord
  has_many :posts
  has_many :comments, through: :posts
  belongs_to :company

  validates :email, presence: true, uniqueness: true
  scope :active, -> { where(active: true) }
end
```

## 关联关系
```ruby
has_one :profile
has_many :posts
has_many :comments
has_and_belongs_to_many :tags
has_many :posts, -> { order(created_at: :desc) }
```

## 查询方法
```ruby
User.where(active: true).order(created_at: :desc)
User.find_by(email: "test@example.com")
User.select(:name, :email).limit(10)
User.includes_email
  after_save :send_welcome_email
  around_destroy :ensure_deletion
end
```

## 迁移
```ruby
class CreateUsers < ActiveRecord::Migration[7.0]
  def change
    create_table :users do |t|
      t.string :name
      t.string :email
      t.timestamps
    end
  end
end
```

## 关键词
Rails, Active Record, ORM, 数据库, 模型, 验证, 查询, 后端开发

---
**来源**: SkillsBot新品技能
