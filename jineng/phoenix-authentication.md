# Phoenix Authentication 认证系统

## 核心概念
Phoenix提供`mix phx.gen.auth`命令，自动生成完整的认证系统，包括用户注册、登录、登出、密码加密、会话管理等功能。

## 快速开始

### 生成认证模块
```bash
mix phx.gen.auth Accounts User users
```

### 运行迁移
```bash
mix ecto.migrate
```

## 数据库Schema

```elixir
# 典型的User Schema
defmodule MyApp.Accounts.User do
  use Ecto.Schema
  import Ecto.Changeset
  alias MyApp.Accounts.UserToken
  
  schema "users" do
    field :email, :string
    field :password, :string, virtual: true, redact: true
    field :hashed_password, :string, redact: true
    field :confirmed_at, :naive_datetime
    
    has_many :session_tokens, UserToken
    
    timestamps()
  end
  
  def registration_changeset(user, attrs, opts \\ []) do
    user
    |> cast(attrs, [:email, :password])
    |> validate_email()
    |> validate_password(opts[:password_length] || 8)
    |> put_password_hash()
  end
  
  defp validate_email(changeset) do
    changeset
    |> validate_required([:email])
    |> validate_format(:email, ~r/^[^\s]+@[^\s]+$/)
    |> unique_constraint(:email)
  end
  
  defp validate_password(changeset, min_len) do
    changeset
    |> validate_required([:password])
    |> validate_length(:password, min: min_len)
  end
  
  defp put_password_hash(changeset) do
    case changeset do
      %Ecto.Changeset{valid?: true, changes: %{password: password}} ->
        put_change(changeset, :hashed_password, Bcrypt.hash_pwd_salt(password))
      _ ->
        changeset
    end
  end
end
```

## Session Token管理

```elixir
defmodule MyApp.Accounts.UserToken do
  use Ecto.Schema
  alias MyApp.Accounts.User
  
  schema "users_tokens" do
    field :token, :binary
    field :context, :string
    field :sent_to, :string
    
    belongs_to :user, User
    
    timestamps(updated_at: false)
  end
  
  # 生成session token
  def build_session_token(user) do
    token = :crypto.strong_rand_bytes(32)
    {token, %__MODULE__{token: token, context: "session", sent_to: user.email}}
  end
  
  # 验证token
  def verify_session_token_query(token) do
    from t in __MODULE__,
      where: t.token == ^token and t.context == "session"
  end
end
```

## Context认证函数

```elixir
defmodule MyApp.Accounts do
  import Ecto.Query
  alias MyApp.Accounts.{User, UserToken}
  alias MyApp.Repo
  
  # 注册用户
  def register_user(attrs) do
    %User{}
    |> User.registration_changeset(attrs)
    |> Repo.insert()
  end
  
  #  user.hashed_password && Bcrypt.verify_pass(password, user.hashed_password) do
      {:ok, user}
    else
      {:error, :unauthorized}
    end
  end
  
  # 生成session
  def generate_user_session_token(user) do
    {token, user_token} = UserToken.build_session_token(user)
    Repo.insert!(user_token)
    token
  end
  
  # 获取用户 by session token
  def get_user_by_session_token(token) do
    with {:ok, query} <- UserToken.verify_session_token_query(token),
         %User{} = user <- Repo.one(query) do
      {:ok, user}
    else
      _ -> {:error, :not_found}
    end
  end
  
  # 删除session
  def delete_session_token(token) do
    Repo.delete_all(UserToken.verify_session_token_query(token))
    :ok
  end
end
```

## Plugs认证

```elixir
# lib/my_app_web/middleware/require_auth.ex
defmodule MyAppWeb.Plugs.RequireAuth do
  import Phoenix.Controller
  import Plug.Conn
  
  def init(opts), do: opts
  
  def call(conn, _opts) do
    if conn.assigns[:current_user] do
      conn
    else
      conn
      |> put_flash(:error, "请先登录")
      |> redirect(to: "/log_in")
      |> halt()
    end
  end
end

# router.ex 使用
defmodule MyAppWeb.Router do
  import Phoenix.Controller
  import Plug.Conn
  
  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :protect_from_forgery
    plug :fetch_current_user
  end
  
  scope "/", MyAppWeb do
    pipe_through :browser
    
    # 公开路由
    get "/log_in", SessionController, :new
    post "/log_in", SessionController, :create
    delete "/log_in", SessionController, :delete
    
    # 需要认证的路由
    scope "/" do
      pipe_through [:browser, MyAppWeb.Plugs.RequireAuth]
      get "/profile", ProfileController, :show
      resources "/posts", PostController
    end
  end
end
```

## Session控制器

```elixir
defmodule MyAppWeb.SessionController do
  use MyAppWeb, :controller
  alias MyApp.Accounts
  
  def new(conn, _params) do
    render(conn, "new.html")
  end
  
  def create(conn, %{"session" => %{"email" => email, "password" => password}}) do
    case Accounts.verify_user_email_password(email, password) do
      {:ok, user} ->
        token = Accounts.generate_user_session_token(user)
        
        conn
        |> put_session(:user_token, token)
        |> configure_session(renew: true)
        |> redirect(to: "/")
        
      {:error, _} ->
        conn
        |> put_flash(:error, "邮箱或密码错误")
        |> redirect(to: "/log_in")
    end
  end
  
  def delete(conn, _params) do
    token = get_session(conn, :user_token)
    
    if token do
      Accounts.delete_session_token(token)
    end
    
    conn
    |> configure_session(drop: true)
    |> redirect(to: "/")
  end
end
```

## 邮箱确认流程

```elixir
# 生成确认token
def generate_user_email_token(user, context) do
  token = :crypto.strong_rand_bytes(32)
  
  {token,
   %UserToken{
     token: token,
     context: context,
     sent_to: user.email,
     user_id: user.id
   }}
end

# 发送确认邮件
def deliver_user_confirmation_instructions(user, confirmation_url) do
  MyApp.Mailer.send_email(
    to: user.email,
    subject: "确认你的邮箱",
    html_body: ~E"<p><a href=\"<%= confirmation_url %>\">点击确认</a></p>"
  )
end

# 确认邮箱
def confirm_user(token) do
  with {:ok, query} <- UserToken.verify_change_email_token_query(token),
       user <- Repo.one(query),
       {:ok, _} <- Repo.transaction(user_email_update(user, token)) do
    {:ok, user}
  else
    _ -> :error
  end
end
```

## 关键词
Phoenix认证, mix