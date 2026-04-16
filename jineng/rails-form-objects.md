# Rails Form Objects 表单对象

## 技能简介
Form Objects（表单对象）用于处理复杂表单提交和验证，将表单逻辑从模型和控制器中分离出来。

## 基本结构
```ruby
# app/forms/signup_form.rb
class SignupForm
  include ActiveModel::Model
  include ActiveModel::Attributes

  attribute :email, :string
  attribute :password, :string
  attribute :password_confirmation, :string
  attribute :terms_of_service, :boolean

  validates :email, presence: true, format: { with: /\A[\w+\-.]+@[a-z\d\-.]+\.[a-z]+\z/i }
    create_user
  end

  private

  def create_user
    User.create!(
      email: email,
      password: password,
      password_confirmation: password_confirmation
    )
  end
end
```

## 控制器使用
```ruby
# app/controllers/signup_controller.rb
class SignupController < ApplicationController
  def new
    @form = SignupForm.new
  end

  def create
    @form = SignupForm.new(user_params)
    if @form.save
      redirect_to @form.user, notice: 'Welcome!'
    else
      render :new
    end
  end

  private

  def user_params
    params.require(:signup_form).permit(:email, :password, :password_confirmation, :terms_of_service)
  end
end
```

## 嵌套属性
```ruby
class OrderForm
  include ActiveModel::Model

  attr_accessor :order, :line_items

  def initialize(order = Order.new)
    @order = order
    @line_items = @order.line_items.map { |item| LineItemForm.new(item) }
  end

  def submit(params)
    @order.attributes = params.require(:order).permit(:customer_email, :shipping_address)
    # 处理嵌套属性...
  end
end
```

## 关键词
Rails Form Objects, 表单对象, ActiveModel, 复杂表单验证, Ruby on Rails
