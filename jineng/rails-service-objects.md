# Rails Service Objects 服务对象

## 技能简介
Service Objects（服务对象）是Rails中用于封装复杂业务逻辑的设计模式，将控制器中的臃肿代码分离到独立的服务类中。

## 基本结构
```ruby
# app/services/create_order.rb
class CreateOrder
  def initialize(user, params)
    @user = user
    @params = params
  end

  def call
    ActiveRecord::Base.transaction do
      order = Order.create!(user: @user, status: :pending)
      @params[:items].each do |item_params|
        OrderItem.create!(order: order, product_id: item_params[:product_id], quantity: item_params[:quantity])
      end
      order.update!(total: calculate_total(order))
      SendOrderConfirmation.call(order)
      order
    end
  end

  private

  def calculate_total(order)
    order.order_items.sum { |item| item.product.price * item.quantity }
  end
end
```

## 使用方式
```ruby
# 控制器中调用
class OrdersController < ApplicationController
  def create
    result = CreateOrder.call(current_user, order_params)
    if result.success?
      redirect_to result.order, notice: 'Order created!'
    else
      @error = result.error
      render :new
    end
  end
end
```

## 命名规范
| 类型 | 示例 |
|------|------|
| 动作类 | CreateOrder, UpdateUser, DestroyPost |
| 查询类 | FindUser, SearchProducts, GetUserOrders |
| 业务类 | ChargePayment, SendNewsletter, ImportData |

## 关键词
Rails Service Objects, 服务对象, 业务逻辑封装, 领域驱动设计, Ruby on Rails
