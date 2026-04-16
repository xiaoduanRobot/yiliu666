# Phoenix模式

## 技能简介
Phoenix模式是Phoenix框架的开发最佳实践，涵盖上下文设计、控制器模式、插件管道和应用架构。

## 上下文设计
```elixir
# 上下文封装业务逻辑
defmodule MyApp.Accounts do
  def get_user!(id), do: Repo.get!(User, id)
  
  def create_user(attrs) do
    %User{}
    |> User.changeset(attrs)
    |> Repo.insert()
  end
end
```

## 控制器模式
```elixir
defmodule MyAppWeb.UserController do
  use MyAppWeb, :controller
  
  def index(conn, _params) do
    users = Accounts.list_users()
    render(conn, "index.html", users: users)
  end
end
```

## 插件管道
```elixir
defmodule MyAppWeb.Plugs.RequireAdmin do
  import Plug.Conn
  
  def init(opts), do: opts
  
  def call(conn, _opts) do
    if conn.assigns.current_user.admin? do
      conn
    else
      conn
      |> put_status(:forbidden)
      |> halt()
    end
  end
end
```

## 应用架构
```
lib/
├── my_app/
│   ├── accounts/        # 上下文
│   │   ├── user.ex
│   │   └── user_notifier.ex
│   └── billing/
└── my_app_web/
    ├── controllers/     # 控制器
    ├── plugs/          # 插件
    └── views/          # 视图
```

## 关键词
Phoenix框架、Elixir、Web开发、上下文设计、控制器模式、插件、最佳实践、应用架构

---
**来源**: SkillsBot新品技能
