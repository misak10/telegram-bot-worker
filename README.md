# Telegram 私聊转发机器人

这是一个基于 Cloudflare Workers 的 Telegram 机器人，可以将用户的私聊消息转发到指定群组的话题中，并支持管理员回复。

## 特性

- 🔄 自动将私聊消息转发到群组话题
- 👥 为每个用户创建独立话题
- 💬 支持所有类型消息的转发和回复
  - 文本
  - 图片
  - 文件
  - 视频
  - 语音
  - 贴纸
- 🛡️ 管理功能
  - 用户屏蔽/解除屏蔽
  - 用户信息查看
  - 用户列表管理
  - 话题清理
  - 消息广播
  - 统计信息

## 一键部署

1. 点击下方按钮一键部署到 Cloudflare Workers

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/misak10/telegram-bot-worker)

2. 在 Cloudflare Workers 设置以下环境变量：
   - `ENV_BOT_TOKEN`: Telegram 机器人的 token
   - `ENV_BOT_SECRET`: Webhook 的密钥（可选，建议设置）
   - `ENV_ADMIN_UID`: 管理员的 Telegram ID
   - `ENV_GROUP_ID`: 目标群组的 ID（需要是超级群组）

3. 访问 `https://你的域名/registerWebhook` 来设置 Webhook

## 手动部署

1. 克隆仓库
```bash
git clone https://github.com/misak10/telegram-bot-worker.git
cd telegram-bot-worker
```

2. 安装依赖
```bash
npm install
```

3. 创建 `.dev.vars` 文件并填写以下内容：
```
BOT_TOKEN=你的机器人token
BOT_SECRET=你设置的密钥
ADMIN_UID=管理员ID
GROUP_ID=群组ID
```

4. 本地开发
```bash
npm run dev
```

5. 部署到 Cloudflare Workers
```bash
npm run deploy
```

## 使用方法

### 用户

1. 直接向机器人发送消息
2. 机器人会自动创建话题并转发消息
3. 等待管理员回复

### 管理员

在群组中可以使用以下命令：

- `/help` - 显示帮助信息
- `/block` - 屏蔽用户 (回复消息或输入用户ID)
- `/unblock` - 解除屏蔽 (回复消息或输入用户ID)
- `/info` - 查看用户信息
- `/list` - 列出所有用户
- `/clean` - 清理无效话题
- `/broadcast` - 向所有用户发送消息
- `/status` - 显示统计信息

## 注意事项

1. 群组必须是超级群组，并启用话题功能
2. 机器人需要是群组管理员
3. 机器人需要有以下权限：
   - 发送消息
   - 创建话题
   - 管理话题
   - 删除消息

## 贡献

欢迎提交 Issue 和 Pull Request！

## 支持

如果遇到问题，可以：
1. 提交 Issue
2. 通过 Telegram 联系我：[@akikawa_bot](https://t.me/akikawa_bot)

## 赞助

如果您觉得这个项目对您有帮助，欢迎通过以下方式支持我们：

[![爱发电](https://img.shields.io/badge/爱发电-支持我们-946ce6?style=for-the-badge)](https://afdian.com/a/misak10)
