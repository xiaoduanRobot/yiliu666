# Phoenix Plugs 中间件

## 技能简介
Plugs是Elixir/Phoenix中的中间件模式，用于请求/响应处理的模块化、可组合的抽象。

## 基础Plug
```elixir
# lib/hello_web/plugs/logger.ex
defmodule HelloWeb.Plugs.Logger do
  import Plug.Conn

  def init(opts), do: opts

  def call(conn, _opts) do
    start_time = System.system_time(:millisecond)
    
    conn
    |> register_before_send(&log_request(&1, start_time))
  end

  defp log_request(conn, start_time) {
    duration = System.system_time(:millisecond) - start_time
    IO.puts("#{conn.method} #{conn.request_path} - #{duration}ms")
    conn
  end
end
```

## 路由器级Plug
```elixir
# router.ex
defmodule HelloWeb.Router do
  use HelloWeb, :router

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :protect_from_forgery
    plug :put_layout, {HelloWeb.LayoutView, :app}
  end

  pipeline :api do
    plug :accepts, ["json"]
    plug HelloWeb.Plugs.Logger
  end

  scope "/api", HelloWeb do
    pipe_through :api
    resources "/users", UserController, except: [:new, :edit]
  end
end
```

## 控制器级Plug
```elixir
# controller.ex
defmodule HelloWeb.UserController do
  use HelloWeb, :controller

  plug :authenticate when action in [:edit, :update, :delete]
  plug :load_user when not action in [:index, :new, :create]

  def index(conn, _params) do
    # ...
  end

  defp authenticate(conn, _opts) do
    if conn.assigns.current_user do
      conn
    else
      conn
      |> halt()
      |> redirect(to: "/login")
    end
  end

  defp load_user(conn, _opts) do
    case Github.get_user!(conn.params["id"]) do
      nil -> 
        conn
        |> put_status(:not_found)
        |> render(HelloWeb.ErrorView, "404.html")
        |> halt()
      user -> 
        assign(conn, :user, user)
    end
  end
end
```

## 认证Plug
```elixir
defmodule HelloWeb.Plugs.Authenticate do
  import Plug.Conn
  import Phoenix.Controller, only: [put_flash: 3, redirect: 2]

  def init(opts), do: opts

  def call(conn, _opts) do
    user_id = get_session(conn, :user_id)
    
    if user = user_id && Hello.Accounts.get_user(user_id) do
      assign(conn, :current_user, user)
    else
      conn
      |> put_flash(:error, "请先登录")
      |> redirect(to: "/login")
      |> halt()
    end
  end
end
```

## 速率限制Plug
```elixir
defmodule HelloWeb.Plugs.RateLimiter do
  import Plug.Conn

  def init(opts) do
    %{max_requests: opts[:max_requests] || 100, window_ms: opts[:window_ms] || 60_000}
  end

  def call(conn, %{max_requests: max, window_ms: window}) do
    key = "rate_limit:#{conn.remote_ip}"
    
    case Redix.command(:, div(window, 1000), "1"])
        conn
      {:ok, count} when count < max ->
        Redix.command(:redix, ["INCR", key])
        conn
      {:ok, _} ->
        conn
        |> put_status(:too_many_requests)
        |> halt()
    end
  end
end
```

## 自定义响应格式
```elixir
defmodule HelloWeb.Plugs.JsonResponse do
  import Plug.Conn

  def init(opts), do: opts

  def call(conn, _opts) do
    conn
    |> put_resp_content_type("application/json")
    |> assign(:json_response, fn data -> 
      Jason.encode!(data)
    end)
  end
end
```

## 关键词
Phoenix Plugs, 中间件, 请求处理, 认证, 速率限制, Elixir, 函数式编程
