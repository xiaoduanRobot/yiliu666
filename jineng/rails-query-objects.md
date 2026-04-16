# Rails Query Objects 查询对象

## 技能简介
Query Objects（查询对象）用于封装复杂SQL查询逻辑，将查询代码从模型和控制器中分离出来。

## 基本结构
```ruby
# app/queries/active_users_query.rb
class ActiveUsersQuery
  def initialize(relation = User.all)
    @relation = relation
  end

  def call
    @relation
      .where(active: true)
      .where('last_login_at > ?', 30.days.ago)
      .order(last_login_at: :desc)
  end

  def with_orders
    @relation.where.exists(Order.arel_table)
  end

  def premium
    @relation.where(subscription: 'premium')
  end
end
```

## 链式调用
```ruby
# app/queries/filter_users_query.rb
class FilterUsersQuery
  def initialize(params = {})
    @params = params
  end

  def call
    relation = User.all

    relation = by_status(relation)
    relation = by_role(relation)
    relation = by_date_range(relation)
    relation = search(relation)

    relation
  end

  private

  def by_status(relation)
    return relation unless @params[:status]
    relation.where(status: @params[:status])
  end

  def by_role(relation)
    return relation unless @params[:role]
    relation.where(role: @params[:role])
  end

  def by_date_range(relation)
    return relation unless @params[:from_date] && @params[:to_date]
    relation.where(created_at: @params[:from_date]..@params[:to_date])
  end

  def search(relation)
    return relation unless @params[:q]
    relation.where('email LIKE ?', "%#{@params[:q]}%")
  end
end
```

## 控制器使用
```ruby
class UsersController < ApplicationController
  def index
    @users = FilterUsersQuery.new(filter_params).call
  end

  private

  def filter_params
    params.permit(:status, :role, :from_date, :to_date, :q)
  end
end
```

## 模型集成
```ruby
class User < ApplicationRecord
  def self.active
    ActiveUsersQuery.new(self).call
  end

  def self.filter(params)
    FilterUsersQuery.new(params).call
  end
end
```

## 关键词
Rails Query Objects, 查询对象, 复杂SQL, 链式查询, AREL, Ruby on Rails
