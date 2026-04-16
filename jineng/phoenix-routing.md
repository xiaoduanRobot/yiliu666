# Phoenix路由定义

## 技能简介
该技能专注于在Phoenix Web框架中定义和管理路由，包括基本路由声明、资源路由、作用域、管道和验证路由。

## 基本路由
```elixir
# router.ex
scope "/", MyAppWeb do
  pipe_through :browser

  get "/", PageController, :index
  get "/hello", HelloController, :index
end
```

## 资源路由
```elixir
resources "/users", UserController
# 生成: index, show, new, create, edit, update, destroy

resources "/posts", PostController do
  resources "/comments", CommentController
end
```

## 自定义动作
```elixir
resources "/users", UserController do
  get "/premium", UserController, :premium
end
```

## 作用域
```elixir
scope "/api", MyAppWeb do
  pipe_through :api
  resources "/articles", ArticleController, only: [:index, :show]
end
```

## 管道
```elixir
pipeline :browser do
  plug :accepts, ["html"]
  plug :fetch_session
  plug :protect_from_forgery
end

pipeline :api do
  plug :accepts, ["json"]
end
```

## 路由辅助函数
```elixir
# 生成路径辅助函数
user_path(@conn, :index)   # => "/users"
user_path(@conn, :show, 1) # => "/users/1"
```

## 关键词
Phoenix路由、Elixir、Web开发、后端开发、RESTful API、路由配置、编译时验证

---
**来源**: SkillsBot新品技能
