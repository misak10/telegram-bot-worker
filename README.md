# Telegram 私聊转发机器人

这是一个基于 Cloudflare Workers 的 Telegram 机器人，可以将用户的私聊消息转发到指定群组的话题中，并支持管理员回复。

## 主要功能

- 🔄 自动将私聊消息转发到群组话题
- 👥 为每个用户创建独立话题
- 💬 支持多种类型消息的转发和回复
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
  - 消息广播
  - 统计信息

## 部署方法

1. 在 Cloudflare Workers 中创建新的 Worker
2. 创建两个 KV 命名空间:
   - `USER_TOPICS`: 存储用户话题关联
   - `USER_BLOCKS`: 存储用户屏蔽状态
3. 在 Worker 设置中绑定上述两个 KV 命名空间:
   - 变量名: `USER_TOPICS`, 命名空间: 选择 `USER_TOPICS`
   - 变量名: `USER_BLOCKS`, 命名空间: 选择 `USER_BLOCKS`
4. 将 `worker.js` 的内容复制到 Worker 编辑器中
5. 在 Worker 设置中添加以下环境变量：
   - `ENV_BOT_TOKEN`: Telegram 机器人的 token
   - `ENV_BOT_SECRET`: Webhook 的密钥（可选但建议设置）
   - `ENV_ADMIN_UID`: 管理员的 Telegram ID
   - `ENV_GROUP_ID`: 目标群组的 ID（需要是超级群组）
6. 部署完成后访问 `https://你的域名/registerWebhook` 来设置 Webhook

## 使用说明

### 普通用户命令
- `/start` - 开始使用机器人
- `/help` - 显示帮助信息
- `/me` - 查看我的信息

### 管理员命令
- `/help` - 显示帮助信息
- `/block` - 屏蔽用户 (回复消息或输入用户ID)
- `/unblock` - 解除屏蔽 (回复消息或输入用户ID)
- `/info` - 查看用户信息
- `/list` - 列出所有用户
- `/broadcast` - 向所有用户发送消息
- `/status` - 显示统计信息

## 使用要求

1. 目标群组必须是超级群组，并启用话题功能
2. 机器人需要具有以下权限：
   - 发送消息
   - 创建话题
   - 管理话题
   - 删除消息
3. 机器人必须是群组管理员

## 注意事项

- 确保环境变量正确设置
- 群组 ID 必须是超级群组
- 管理员 ID 必须是数字格式
- Webhook 密钥建议设置，以增加安全性
- 确保 KV 命名空间正确创建并绑定

## 支持

如果遇到问题，可以：
1. 提交 Issue
2. 通过 Telegram 联系我：[@akikawa_bot](https://t.me/akikawa_bot)

## 赞助

如果您觉得这个项目对您有帮助，欢迎通过以下方式支持我们：

[![爱发电](https://img.shields.io/badge/爱发电-支持我们-946ce6?style=for-the-badge)](https://afdian.com/a/misak10)

## 感谢

[NFD](https://github.com/LloydAsp/nfd)
[telegram-bot-cloudflare](https://github.com/cvzi/telegram-bot-cloudflare)
