# Rails Hotwire 开发

## 技能简介
Rails Hotwire 是一种用于在 Ruby on Rails 框架中构建现代反应式 Web 应用程序的技术，通过 Turbo 实现页面加速和实时更新，Stimulus 处理 JavaScript 交互。

## Turbo
```ruby
# 页面片段缓存
<%= turbo_frame_tag "comment", src: new_comment_path(@post) %>

# 表单提交不刷新
<%= turbo_frame_tag "new_comment" do %>
  <%= form_with model: [@post, Comment.new] do |f| %>
    <%= f.text_field :body %>
    <%= f.submit %>
  <% end %>
<% end %>
```

## Stimulus
```javascript
// app/javascript/controllers/hello_controller.js
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["name"]

  greet() {
    this.nameTarget.textContent = `Hello, ${this.nameTarget.value}!`
  }
}
```

```html
<div data-controller="hello">
  <input data-hello-target="name" type="text">
  <button data-action="click->hello#greet">Greet</button>
  <span data-hello-target="output"></span>
</div>
```

## Streams
```ruby
# 实时广播
class CommentsChannel < ApplicationCable::Channel
  def subscribed
    stream_for @post
  end
end
```

## 关键词
Rails, Hotwire, Turbo, Stimulus, 前端开发, 实时更新, Web 应用, Ruby on Rails, 反应式界面

---
**来源**: SkillsBot新品技能
