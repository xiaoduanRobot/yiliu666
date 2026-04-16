# Phoenix LiveView 实时交互

## 核心概念
LiveView是Phoenix框架的核心功能，通过WebSocket实现服务器端的实时交互式UI，无需编写JavaScript。

## 基本结构

### LiveView模块
```elixir
defmodule MyAppWeb.ProductLive do
  use Phoenix.LiveView
  
  def render(assigns) do
    ~H"""
    <div>
      <h1><%= @product.name %></h1>
      <p>价格: ¥<%= @product.price %></p>
      <button phx-click="add_to_cart">加入购物车</button>
    </div>
    """
  end
  
  def mount(_params, _session, socket) do
    {:ok, assign(socket, :product, %{name: "iPhone", price: 6999})}
  end
  
  def handle_event("add_to_cart", _params, socket) do
    {:noreply, put_flash(socket, :info, "已加入购物车！")}
  end
end
```

### 路由配置
```elixir
# router.ex
defmodule MyAppWeb.Router do
  scope "/", MyAppWeb do
    live "/products/:id", ProductLive
  end
end
```

## 常用事件

| 事件 | 说明 |
|------|------|
| `phx-click` | 点击事件 |
| `phx-change` | 输入变化 |
| `phx-submit` | 表单提交 |
| `phx-keydown` | 键盘事件 |
| `phx-hook` | JS Hook交互 |

## 状态管理

```elixir
# 临时赋值（不持久化到URL）
def mount(_params, _session, socket) do
  {:ok, assign(socket, :temp_data, "临时数据")}
end

# 持久化到URL的参数
def handle_params(params, _uri, socket) do
  id = params["id"]
  {:noreply, assign(socket, :product_id, id)}
end
```

## 实时更新

```elixir
# 广播更新
MyAppWeb.Endpoint.broadcast!("product:#{product_id}", "update", %{price: new_price})

# 监听广播
def handle_info(%{event: "update", payload: payload}, socket) do
  {:noreply, assign(socket, :product, payload)}
end
```

## 关键词
Phoenix LiveView, 实时交互, WebSocket, 无JS前端, 实时表单, 实时更新
