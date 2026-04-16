# Phoenix 测试驱动开发

## 核心概念
Phoenix提供全面的测试支持，包括单元测试、集成测试和端到端测试。

## 测试结构

### 目录结构
```
test/
├── my_app_web/
│   ├── controllers/      # Controller测试
│   ├── channels/         # Channel测试
│   ├── live/             # LiveView测试
│   └── views/            # View测试
├── my_app/
│   └── contexts/         # Context测试
├── support/
│   ├── conn_case.ex      # Controller测试辅助
│   └── channel_case.ex   # Channel测试辅助
└── test_helper.exs
```

### 数据Case模板
```elixir
defmodule MyApp.DataCase do
  use ExUnit.CaseTemplate
  
  using do
    quote do
      alias MyApp.Repo
      import Ecto
      import Ecto.Changeset
      import MyApp.DataCase
    end
  end
  
  setup tags do
    MyApp.DataCase.setup_sandbox(tags)
    :ok
  end
  
  def setup_sandbox(tags) do
    pid = Ecto.Adapters.SQL.Sandbox.start_owner!(MyApp.Repo, shared: not tags[:async])
    on_errors(changeset, fn {message, opts} ->
      Regex.replace(~r"%{count}", message, to_string(opts[:count] || 1))
    end)
  end
end
```

## Context测试

```elixir
defmodule MyApp.BlogTest do
  use MyApp.DataCase, async: true
  alias MyApp.Blog
  
  describe "posts" do
    alias MyApp.Blog.Post
    
    @valid_attrs %{title: "标题", body: "内容"}
    @invalid_attrs %{title: nil, body: nil}
    
    test "list_posts/0 returns all posts" do
      post = insert(:post)
      assert Blog.list_posts() == [post]
    end
    
    test "get_post!/1 returns the post with given id" do
      post = insert(:post)
      assert Blog.get_post!(post.id) == post
    end
    
    test "create_post/1 with valid data creates a post" do
      assert {:ok, %Post{} = post} = Blog.create_post(@valid_attrs)
      assert post.title == "标题"
      assert post.body == "内容"
    end
    
    test "create_post/1 with invalid data returns error changeset" do
      assert {:error, %Ecto.Changeset{}} = Blog.create_post(@invalid_attrs)
    end
    
    test "update_post/2 with valid data updates the post" do
      post = insert(:post)
      update_attrs = %{title: "新标题"}
      assert {:ok, %Post{} = post} = Blog.update_post(post, update_attrs)
      assert post.title == "新标题"
    end
    
    test "delete_post/1 deletes the post" do
      post = insert(:post)
      assert {:ok, %Post{}} = Blog.delete_post(post)
      assert_raise Ecto.NoResultsError, fn -> Blog.get_post!(post.id) end
    end
  end
end
```

## Controller测试

```elixir
defmodule MyAppWeb.PostControllerTest do
  use MyAppWeb.ConnCase
  
  alias MyApp.Blog
  
  @create_attrs %{title: "测试标题", body: "测试内容"}
  
  describe "index" do
    test "lists all posts", %{conn: conn} do
      conn = get(conn, Routes.post_path(conn, :index))
      assert html_response(conn, 200) =~ "文章列表"
    end
  end
  
  describe "create post" do
    test "redirects to show when data is valid", %{conn: conn} do
      conn = post(conn, Routes.post_path(conn, :create), post: @create_attrs)
      
      assert %{id: id} = redirected_params(conn)
      assert redirected_to(conn) == Routes.post_path(conn, :show, id)
      
      conn = get(conn, Routes.post_path(conn, :show, id))
      assert html_response(conn, 200) =~ "测试标题"
    end
    
    test "renders errors when data is invalid", %{conn: conn} do
      conn = post(conn, Routes.post_path(conn, :create), post: @invalid_attrs)
      assert html_response(conn, 200) =~ "错误"
    end
  end
end
```

## Channel测试

```elixir
defmodule MyAppWeb.RoomChannelTest do
  use MyAppWeb.ChannelCase
  
  alias MyAppWeb.RoomChannel
  
  setup do
    {:ok, _, socket} =
      MyAppWeb.UserSocket
      |> socket("user_id", %{some: :assign})
      |> subscribeok, %{^"there"}
  end
  
  test "shout broadcasts to room", %{socket: socket} do
    push(socket, "shout", %{"hello" => "all"})
    assert_broadcast "shout", %{"hello" => "all"}
  end
end
```

## 关键词
Phoenix测试, ExUnit, 测试驱动开发, TDD, 单元测试, 集成测试, Elixir测试
