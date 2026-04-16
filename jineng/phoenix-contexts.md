# Phoenix Contexts 上下文

## 技能简介
Contexts（上下文）是Phoenix框架中封装业务逻辑的核心概念，将相关的功能和数据组织在一起。

## 基本结构
```elixir
# lib/hello_web/contexts/blog.ex
defmodule Hello.Blog do
  import Ecto.Query
  alias Hello.Repo
  alias Hello.Blog.Post

  def list_posts do
    Repo.all(Post)
  end

  def get_post!(id), do: Repo.get!(Post, id)

  def create_post(attrs \\ %{}) do
    %Post{}
    |> Post.changeset(attrs)
    |> Repo.insert()
  end

  def update_post(%Post{} = post, attrs) do
    post
    |> Post.changeset(attrs)
    |> Repo.update()
  end

  def delete_post(%Post{} = post) do
    Repo.delete(post)
  end
end
```

## Contexts之间的依赖
```elixir
# lib/hello_web/contexts/accounts.ex
defmodule Hello.Accounts do
  import Ecto.Query
  alias Hello.Repo
  alias Hello.Accounts.User

  def get_user!(id), do: Repo.get!(User, id)

  def get_user_by_email(email) do
    Repo.get_by(User, email: email)
  end

  def create_user(attrs \\ %{}) do
    %User{}
    |> User.changeset(attrs)
    |> Repo.insert()
  end
end

# Blog上下文依赖Accounts
defmodule Hello.Blog do
  alias Hello.Accounts
  alias Hello.Blog.Post

  def create_post(%Accounts.User{} = user, attrs) do
    %Post{user_id: user.id}
    |> Post.changeset(attrs)
    |> Repo.insert()
  end
end
```

## 关键词
Phoenix Contexts, 上下文, 业务逻辑, 模块化, Elixir, 函数式编程
