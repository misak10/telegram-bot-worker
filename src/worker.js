const TOKEN = ENV_BOT_TOKEN
const WEBHOOK = '/webhook'
const SECRET = ENV_BOT_SECRET
const ADMIN_UID = ENV_ADMIN_UID
const GROUP_ID = ENV_GROUP_ID

const commands = {
  admin: [
    {command: 'help', description: '显示帮助信息'},
    {command: 'block', description: '屏蔽用户 (回复消息或输入用户ID)'},
    {command: 'unblock', description: '解除屏蔽 (回复消息或输入用户ID)'},
    {command: 'info', description: '查看用户信息'},
    {command: 'list', description: '列出所有用户'},
    {command: 'broadcast', description: '向所有用户发送消息'},
    {command: 'status', description: '显示统计信息'}
  ],
  guest: [
    {command: 'start', description: '开始使用机器人'},
    {command: 'help', description: '显示帮助信息'},
    {command: 'me', description: '查看我的信息'}
  ]
}

const API_BASE = 'https://api.telegram.org/bot' + TOKEN

const KV_KEYS = {
  TOPIC: (userId) => `${userId}`,
  BLOCK: (userId) => `block:${userId}`
}

const templates = {
  userInfo: (user, threadId) => {
    const idText = `<code>${user.id}</code>`
    const username = user.username ? `@${user.username}` : '未设置'
    const name = [user.first_name || '', user.last_name || ''].filter(Boolean).join(' ')
    return `
👤 用户信息
━━━━━━━━━━━━━━━━
🆔 ID: ${idText}
👤 用户名: ${username}
📋 姓名: ${name || '未设置'}
💬 话题: ${threadId || '未创建'}
`
  },

  error: (title, error) => {
    const date = new Date()
    return `
❌ ${title}
━━━━━━━━━━━━━━━━
⚠️ 错误: ${error}
🕒 时间: ${date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}
`
  },

  success: (title, details) => {
    const date = new Date()
    return `
✅ ${title}
━━━━━━━━━━━━━━━━
📝 详情: ${details}
🕒 时间: ${date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}
`
  },
  
  status: (total, blocked, active) => `
📊 统计信息
━━━━━━━━━━━━━━━━
👥 总用户数: ${total}
🚫 已屏蔽: ${blocked}
✅ 活跃用户: ${active}
`
}

addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (url.pathname === WEBHOOK) {
    event.respondWith(handleWebhook(event))
  } else if (url.pathname === '/registerWebhook') {
    event.respondWith(registerWebhook(event, url, WEBHOOK, SECRET))
  } else if (url.pathname === '/unRegisterWebhook') {
    event.respondWith(unRegisterWebhook(event))
  } else {
    event.respondWith(new Response('No handler for this request'))
  }
})

async function handleWebhook(event) {
  try {
    if (SECRET && event.request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== SECRET) {
      return new Response('Unauthorized', { status: 403 })
    }

    const update = await event.request.json()
    console.log('Received webhook update:', update)

    await setCommands()
    
    await handleUpdate(update)

    return new Response('Ok')
  } catch (error) {
    console.error('Webhook Error:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}

async function handleUpdate(update) {
  try {
    if ('message' in update) {
      return await handleMessage(update.message)
    } else if ('callback_query' in update) {
      return await handleCallbackQuery(update.callback_query)
    }
  } catch (error) {
    console.error('Update handling error:', error)
    throw error
  }
}

async function handleMessage(message) {
  if (message.chat.type === 'private') {
    const isBlocked = await USER_BLOCKS.get(KV_KEYS.BLOCK(message.from.id))
    if (isBlocked) {
      await sendMessage(message.from.id, '您已被管理员屏蔽')
      return
    }

    if (message.from.id.toString() === ADMIN_UID && message.reply_to_message) {
      return await handleAdminReply(message)
    }

    if (message.text?.startsWith('/')) {
      try {
        if (message.from.id.toString() === ADMIN_UID) {
          const isAdminCommand = commands.admin.some(cmd => message.text.startsWith('/' + cmd.command))
          if (isAdminCommand) {
            await deleteMessage(message.chat.id, message.message_id)
            return await handleAdminCommand(message)
          }
        }
      } catch (error) {
        console.error('Failed to delete command message:', error)
      }

      const command = message.text.split(' ')[0]
      if (command === '/start') {
        const userId = message.from.id.toString()
        const username = message.from.username ? `@${message.from.username}` : '未设置'
        const name = [message.from.first_name || '', message.from.last_name || ''].filter(Boolean).join(' ')
        const idText = `<code>${userId}</code>`
        
        const keyboard = {
          inline_keyboard: [
            [
              {
                text: '📝 使用帮助',
                callback_data: 'help'
              },
              {
                text: '❌ 关闭',
                callback_data: 'close_message'
              }
            ]
          ]
        }

        const messageText = `
用户信息
━━━━━━━━━━━━━━━━
ID: ${idText}
用户名: ${username}
姓名: ${name || '未设置'}

您可以直接发送消息给我，我会将消息转发给管理员。
管理员会在看到消息后尽快回复您。
`
        return await sendMessage(message.from.id, messageText, {
          parse_mode: 'HTML',
          reply_markup: keyboard
        })
      } else if (command === '/help') {
        return await sendMessage(message.from.id, `
使用帮助
━━━━━━━━━━━━━━━━
1. 直接发送消息即可与管理员对话
2. 支持发送以下类型消息：
   - 文字
   - 图片
   - 文件
   - 语音
   - 视频
   - 贴纸
3. 管理员看到消息后会尽快回复

可用命令：
${commands.guest.map(cmd => `/${cmd.command} - ${cmd.description}`).join('\n')}
`)
      } else if (command === '/me') {
        const userId = message.from.id.toString()
        const isBlocked = await USER_BLOCKS.get(KV_KEYS.BLOCK(userId))
        
        const idText = `<code>${userId}</code>`
        const username = message.from.username ? `\n用户名: @${message.from.username}` : ''
        const name = [message.from.first_name || '', message.from.last_name || ''].filter(Boolean).join(' ')
        const nameText = name ? `\n姓名: ${name}` : ''
        const statusText = isBlocked ? '\n状态: 🚫 已屏蔽' : '\n状态: ✅ 正常'
        
        return await sendMessage(message.from.id, `
我的信息
━━━━━━━━━━━━━━━━
ID: ${idText}${username}${nameText}${statusText}
`)
      }
      return
    }

    return await handlePrivateMessage(message)
  } else if (message.chat.id.toString() === GROUP_ID && 
             message.from.id.toString() === ADMIN_UID) {
    if (message.text?.startsWith('/')) {
      const fullCommand = message.text.split(' ')[0]
      const command = fullCommand.split('@')[0]
      const args = message.text.split(' ').slice(1)
      
      const processedMessage = {
        ...message,
        text: [command, ...args].join(' ')
      }
      
      return await handleAdminCommand(processedMessage, message.message_thread_id)
    } else if (message.message_thread_id) {
      return await handleAdminReply(message)
    }
  }
}

async function handlePrivateMessage(message) {
  try {
    const userId = message.from.id.toString()
    let threadId = await USER_TOPICS.get(userId)

    if (threadId) {
      const result = await forwardMessage(GROUP_ID, message.chat.id, message.message_id, { 
        message_thread_id: threadId 
      })
      if (result.ok) {
        return new Response('OK', { status: 200 })
      }
      await USER_TOPICS.delete(userId)
      threadId = null
    }

    const firstName = message.from.first_name || ''
    const lastName = message.from.last_name || ''
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || '未设置姓名'
    const topicName = `${fullName} (${userId})`
    
    const topic = await createForumTopic(GROUP_ID, topicName)
    if (!topic.ok) {
      console.error('Failed to create topic:', topic)
      throw new Error('Failed to create forum topic')
    }

    threadId = topic.result.message_thread_id
    await USER_TOPICS.put(userId, threadId)

    const inlineKeyboard = [
      [
        {
          text: '👤 查看用户资料',
          url: `tg://user?id=${userId}`
        }
      ],
      [
        {
          text: '🚫 屏蔽该用户',
          callback_data: `block_${userId}`
        },
        {
          text: '✏️ 重命名话题',
          callback_data: `rename_${threadId}`
        }
      ],
      [
        {
          text: '❌ 删除话题',
          callback_data: `delete_${userId}`
        }
      ]
    ]

    const photos = await getUserProfilePhotos(userId)
    if (photos.ok && photos.result.total_count > 0) {
      await sendPhoto(GROUP_ID, photos.result.photos[0][0].file_id, {
        message_thread_id: threadId,
        caption: templates.userInfo(message.from, threadId),
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: inlineKeyboard
        }
      })
    } else {
      await sendMessage(GROUP_ID, templates.userInfo(message.from, threadId), {
        message_thread_id: threadId,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: inlineKeyboard
        }
      })
    }

    const forwardResult = await forwardMessage(GROUP_ID, message.chat.id, message.message_id, { 
      message_thread_id: threadId 
    })

    if (!forwardResult.ok) {
      throw new Error('Failed to forward message to new topic')
    }

    return new Response('OK', { status: 200 })
  } catch (error) {
    console.error('Error handling private message:', error)
    if (threadId) {
      await USER_TOPICS.delete(userId)
    }
    return new Response('Internal Server Error: ' + error.message, { status: 500 })
  }
}

async function handleCallbackQuery(query) {
  try {
    const [action, param] = query.data.split('_')
    const chatId = query.message.chat.id
    const messageId = query.message.message_id
    const threadId = query.message.message_thread_id?.toString()

    switch (action) {
      case 'block':
      case 'unblock': {
        const isBlock = action === 'block'
        await USER_BLOCKS.put(KV_KEYS.BLOCK(param), isBlock ? 'true' : '')

        const newInlineKeyboard = {
          inline_keyboard: [
            [
              {
                text: '👤 查看用户资料',
                url: `tg://user?id=${param}`
              }
            ],
            [
              {
                text: isBlock ? '✅ 解除屏蔽' : '🚫 屏蔽该用户',
                callback_data: isBlock ? `unblock_${param}` : `block_${param}`
              },
              {
                text: '✏️ 重命名话题',
                callback_data: `rename_${threadId}`
              }
            ],
            [
              {
                text: '❌ 删除话题',
                callback_data: `delete_${param}`
              }
            ]
          ]
        }

        await editMessageReplyMarkup(chatId, messageId, newInlineKeyboard)
        await answerCallbackQuery(query.id, isBlock ? '已屏蔽该用户' : '已解除屏蔽该用户')
        break
      }

      case 'delete': {
        try {
          const userId = param
          await USER_BLOCKS.delete(KV_KEYS.BLOCK(userId))
          await USER_TOPICS.delete(userId)
          
          try {
            await fetch(`${API_BASE}/deleteForumTopic`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                chat_id: GROUP_ID,
                message_thread_id: threadId
              })
            })
          } catch (error) {
            console.error('Failed to delete forum topic:', error)
          }
          
          await sendMessage(GROUP_ID, templates.success('话题已删除', `用户 ${userId} 的话题已被删除`), { message_thread_id: threadId })
          
          try {
            await deleteMessage(chatId, messageId)
          } catch (error) {
            console.error('Failed to delete message:', error)
          }
        } catch (error) {
          await sendMessage(GROUP_ID, templates.error('删除话题失败', error.message), { message_thread_id: threadId })
        }
        break
      }

      case 'help': {
        const helpText = `
使用帮助
━━━━━━━━━━━━━━━━
1. 直接发送消息即可与管理员对话
2. 支持发送以下类型消息：
   - 文字
   - 图片
   - 文件
   - 语音
   - 视频
   - 贴纸
3. 管理员看到消息后会尽快回复

可用命令：
${commands.guest.map(cmd => `/${cmd.command} - ${cmd.description}`).join('\n')}
`
        await answerCallbackQuery(query.id)
        await sendMessage(query.from.id, helpText)
        break
      }

      case 'me': {
        const userId = query.from.id.toString()
        const isBlocked = await USER_BLOCKS.get(KV_KEYS.BLOCK(userId))
        
        const idText = `<code>${userId}</code>`
        const username = query.from.username ? `\n用户名: @${query.from.username}` : ''
        const name = [query.from.first_name || '', query.from.last_name || ''].filter(Boolean).join(' ')
        const nameText = name ? `\n姓名: ${name}` : ''
        const statusText = isBlocked ? '\n状态: 🚫 已屏蔽' : '\n状态: ✅ 正常'
        
        await answerCallbackQuery(query.id)
        await sendMessage(query.from.id, `
我的信息
━━━━━━━━━━━━━━━━
ID: ${idText}${username}${nameText}${statusText}
`)
        break
      }

      case 'notify_on':
      case 'notify_off': {
        const isOn = action === 'notify_on'
        await answerCallbackQuery(query.id, isOn ? '已开启通知' : '已关闭通知')
        
        const newInlineKeyboard = {
          inline_keyboard: query.message.reply_markup.inline_keyboard.map(row =>
            row.map(btn => {
              if (btn.callback_data === 'notify_on' || btn.callback_data === 'notify_off') {
                return {
                  text: isOn ? '🔕 关闭通知' : '🔔 开启通知',
                  callback_data: isOn ? 'notify_off' : 'notify_on'
                }
              }
              return btn
            })
          )
        }
        
        await editMessageReplyMarkup(query.message.chat.id, query.message.message_id, newInlineKeyboard)
        break
      }

      case 'refresh': {
        const userId = query.from.id.toString()
        const username = query.from.username ? `@${query.from.username}` : '未设置'
        const name = [query.from.first_name || '', query.from.last_name || ''].filter(Boolean).join(' ')
        const idText = `<code>${userId}</code>`
        
        await editMessageText(query.message.chat.id, query.message.message_id, `
👤 用户信息
━━━━━━━━━━━━━━━━
🆔 ID: ${idText}
👤 用户名: ${username}
📋 姓名: ${name || '未设置'}

您可以直接发送消息给我，我会将消息转发给管理员。
管理员会在看到消息后尽快回复您。
`, {
          reply_markup: query.message.reply_markup,
          parse_mode: 'HTML'
        })
        
        await answerCallbackQuery(query.id, '信息已更新')
        break
      }

      case 'close_message': {
        try {
          await deleteMessage(query.message.chat.id, query.message.message_id)
        } catch (error) {
          console.error('Failed to delete message:', error)
          await answerCallbackQuery(query.id, '关闭失败')
        }
        break
      }
    }
  } catch (error) {
    console.error('Callback query error:', error)
    await answerCallbackQuery(query.id, '操作失败，请重试')
  }
}

async function sendMessage(chatId, text, options = {}) {
  const params = {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML',
    ...options
  }
  
  const response = await fetch(`${API_BASE}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params)
  })
  
  return response.json()
}

async function forwardMessage(chatId, fromChatId, messageId, options = {}) {
  const params = {
    chat_id: chatId,
    from_chat_id: fromChatId,
    message_id: messageId,
    ...options
  }
  
  const response = await fetch(`${API_BASE}/forwardMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params)
  })
  
  return response.json()
}

async function createForumTopic(chatId, name) {
  const response = await fetch(`${API_BASE}/createForumTopic`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      name: name
    })
  })
  
  return response.json()
}

async function getUserProfilePhotos(userId) {
  const response = await fetch(`${API_BASE}/getUserProfilePhotos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      user_id: userId,
      limit: 1
    })
  })
  
  return response.json()
}

async function sendPhoto(chatId, photo, options = {}) {
  return sendMedia('sendPhoto', chatId, { photo }, options)
}

async function deleteMessage(chatId, messageId) {
  const response = await fetch(`${API_BASE}/deleteMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId
    })
  })
  
  return response.json()
}

async function answerCallbackQuery(callbackQueryId, text) {
  const response = await fetch(`${API_BASE}/answerCallbackQuery`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text: text
    })
  })
  
  return response.json()
}

async function registerWebhook(event, requestUrl, suffix, secret) {
  try {
    const webhookUrl = `${requestUrl.protocol}//${requestUrl.hostname}${suffix}`
    const response = await fetch(`${API_BASE}/setWebhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: secret,
        allowed_updates: ['message', 'callback_query'],
        max_connections: 100,
        drop_pending_updates: true
      })
    })
    
    const result = await response.json()
    return new Response(result.ok ? 
      `Webhook设置成功: ${webhookUrl}` : 
      JSON.stringify(result, null, 2), 
      {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      }
    )
  } catch (error) {
    return new Response(
      `Webhook设置失败: ${error.message}`, 
      {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      }
    )
  }
}

async function unRegisterWebhook(event) {
  try {
    const response = await fetch(`${API_BASE}/deleteWebhook`)
    const result = await response.json()
    return new Response(result.ok ? 
      '已成功移除Webhook' : 
      JSON.stringify(result, null, 2),
      {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      }
    )
  } catch (error) {
    return new Response(
      `移除Webhook失败: ${error.message}`,
      {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      }
    )
  }
}

async function handleAdminReply(message) {
  try {
    const threadId = message.message_thread_id
    if (!threadId) return

    const list = await USER_TOPICS.list()
    let userId = null
    for (const key of list.keys) {
      const value = await USER_TOPICS.get(key.name)
      if (value === threadId.toString()) {
        userId = key.name
        break
      }
    }
    
    if (!userId) {
      await sendMessage(GROUP_ID, '无法确定回复对象', {
        message_thread_id: threadId
      })
      return
    }

    try {
      let result
      if (message.text) {
        result = await sendMessage(userId, message.text)
      } else if (message.photo) {
        result = await sendPhoto(userId, message.photo[message.photo.length - 1].file_id, {
          caption: message.caption
        })
      } else if (message.document) {
        result = await sendDocument(userId, message.document.file_id, {
          caption: message.caption
        })
      } else if (message.video) {
        result = await sendVideo(userId, message.video.file_id, {
          caption: message.caption
        })
      } else if (message.voice) {
        result = await sendVoice(userId, message.voice.file_id, {
          caption: message.caption
        })
      } else if (message.sticker) {
        result = await sendSticker(userId, message.sticker.file_id)
      } else {
        result = await copyMessage(userId, message.chat.id, message.message_id)
      }

      if (!result?.ok) {
        throw new Error(result?.description || '发送失败')
      }
    } catch (error) {
      console.error('Failed to send message:', error)
      await sendMessage(GROUP_ID, 
        error.message.includes('bot was blocked') ? '用户已屏蔽机器人' : 
        error.message.includes('chat not found') ? '找不到用户' : 
        `发送失败: ${error.message}`, 
        { message_thread_id: threadId }
      )
    }
  } catch (error) {
    console.error('Admin reply error:', error)
  }
}

async function setCommands() {
  try {
    await fetch(`${API_BASE}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: commands.admin,
        scope: { type: 'chat', chat_id: ADMIN_UID },
        language_code: 'zh'
      })
    })

    await fetch(`${API_BASE}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: commands.admin,
        scope: { type: 'chat', chat_id: GROUP_ID },
        language_code: 'zh'
      })
    })

    await fetch(`${API_BASE}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: commands.guest,
        scope: { type: 'all_private_chats' },
        language_code: 'zh'
      })
    })

    await fetch(`${API_BASE}/deleteMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: { type: 'default' }
      })
    })
  } catch (error) {
    console.error('Failed to set commands:', error)
  }
}

async function handleAdminCommand(message, threadId = null) {
  try {
    const command = message.text.split(' ')[0]
    const args = message.text.split(' ').slice(1)

    try {
      await deleteMessage(message.chat.id, message.message_id)
    } catch (error) {
      console.error('Failed to delete command message:', error)
    }

    switch (command) {
      case '/help':
        const helpText = `
管理员命令列表
━━━━━━━━━━━━━━━━
${commands.admin.map(cmd => `/${cmd.command} - ${cmd.description}`).join('\n')}
`
        await sendMessage(message.chat.id, helpText, threadId ? { message_thread_id: threadId } : {})
        break

      case '/block':
        if (args.length > 0) {
          const userId = args[0]
          const isBlocked = await USER_BLOCKS.get(KV_KEYS.BLOCK(userId))
          if (isBlocked) {
            await sendMessage(GROUP_ID, `用户 ${userId} 已经处于屏蔽状态`, threadId ? { message_thread_id: threadId } : {})
            break
          }
          await USER_BLOCKS.put(KV_KEYS.BLOCK(userId), 'true')
          await sendMessage(GROUP_ID, templates.success('用户已被屏蔽', `用户 ${userId} 已被屏蔽`), threadId ? { message_thread_id: threadId } : {})
        } else if (message.reply_to_message) {
          const replyThreadId = message.reply_to_message.message_thread_id
          if (replyThreadId) {
            const list = await USER_TOPICS.list()
            for (const key of list.keys) {
              const value = await USER_TOPICS.get(key.name)
              if (value === replyThreadId.toString()) {
                const isBlocked = await USER_BLOCKS.get(KV_KEYS.BLOCK(key.name))
                if (isBlocked) {
                  await sendMessage(GROUP_ID, `用户 ${key.name} 已经处于屏蔽状态`, threadId ? { message_thread_id: threadId } : {})
                  break
                }
                await USER_BLOCKS.put(KV_KEYS.BLOCK(key.name), 'true')
                await sendMessage(GROUP_ID, templates.success('用户已被屏蔽', `用户 ${key.name} 已被屏蔽`), threadId ? { message_thread_id: threadId } : {})
                break
              }
            }
          }
        } else {
          await sendMessage(GROUP_ID, '请指定用户ID或回复用户消息', threadId ? { message_thread_id: threadId } : {})
        }
        break
      
      case '/unblock':
        if (args.length > 0) {
          const userId = args[0]
          const isBlocked = await USER_BLOCKS.get(KV_KEYS.BLOCK(userId))
          if (!isBlocked) {
            await sendMessage(GROUP_ID, `用户 ${userId} 未被屏蔽`, threadId ? { message_thread_id: threadId } : {})
            break
          }
          await USER_BLOCKS.delete(KV_KEYS.BLOCK(userId))
          await sendMessage(GROUP_ID, templates.success('用户已解除屏蔽', `用户 ${userId} 已解除屏蔽`), threadId ? { message_thread_id: threadId } : {})
        } else if (message.reply_to_message) {
          const replyThreadId = message.reply_to_message.message_thread_id
          if (replyThreadId) {
            const list = await USER_TOPICS.list()
            for (const key of list.keys) {
              const value = await USER_TOPICS.get(key.name)
              if (value === replyThreadId.toString()) {
                const isBlocked = await USER_BLOCKS.get(KV_KEYS.BLOCK(key.name))
                if (!isBlocked) {
                  await sendMessage(GROUP_ID, `用户 ${key.name} 未被屏蔽`, threadId ? { message_thread_id: threadId } : {})
                  break
                }
                await USER_BLOCKS.delete(KV_KEYS.BLOCK(key.name))
                await sendMessage(GROUP_ID, templates.success('用户已解除屏蔽', `用户 ${key.name} 已解除屏蔽`), threadId ? { message_thread_id: threadId } : {})
                break
              }
            }
          }
        } else {
          await sendMessage(GROUP_ID, '请指定用户ID或回复用户消息', threadId ? { message_thread_id: threadId } : {})
        }
        break
      
      case '/info':
        let targetId = args[0]
        if (!targetId && message.reply_to_message) {
          const replyThreadId = message.reply_to_message.message_thread_id
          if (replyThreadId) {
            const list = await USER_TOPICS.list()
            for (const key of list.keys) {
              const value = await USER_TOPICS.get(key.name)
              if (value === replyThreadId.toString()) {
                targetId = key.name
                break
              }
            }
          }
        }
        
        if (targetId) {
          const isBlocked = await USER_BLOCKS.get(KV_KEYS.BLOCK(targetId))
          const idText = `<code>${targetId}</code>`
          await sendMessage(message.chat.id, `
用户状态
━━━━━━━━━━━━━━━━
用户ID: ${idText}
状态: ${isBlocked ? '🚫 已屏蔽' : '✅ 正常'}
`, threadId ? { message_thread_id: threadId } : {})
        } else {
          await sendMessage(GROUP_ID, '请指定用户ID或回复用户消息', threadId ? { message_thread_id: threadId } : {})
        }
        break

      case '/list': {
        const userList = await USER_TOPICS.list()
        let userCount = 0
        let userText = '👥 用户列表\n━━━━━━━━━━━━━━━━\n'
        
        const userPromises = userList.keys.map(async key => {
          const topicId = await USER_TOPICS.get(key.name)
          const isBlocked = await USER_BLOCKS.get(KV_KEYS.BLOCK(key.name))
          return {
            userId: key.name,
            topicId,
            isBlocked
          }
        })
        
        const users = await Promise.all(userPromises)
        
        const activeUsers = users.filter(u => !u.isBlocked)
        const blockedUsers = users.filter(u => u.isBlocked)
        
        if (activeUsers.length > 0) {
          userText += '\n✅ 活跃用户:\n'
          userText += activeUsers.map(user => 
            `• <a href="tg://user?id=${user.userId}">${user.userId}</a>\n` +
            `  💬 话题: ${user.topicId}`
          ).join('\n\n')
        }
        
        if (blockedUsers.length > 0) {
          userText += '\n\n🚫 已屏蔽用户:\n'
          userText += blockedUsers.map(user => 
            `• <a href="tg://user?id=${user.userId}">${user.userId}</a>\n` +
            `  💬 话题: ${user.topicId}`
          ).join('\n\n')
        }
        
        userText += `\n\n📊 统计:\n总用户: ${users.length}\n活跃: ${activeUsers.length}\n已屏蔽: ${blockedUsers.length}`
        
        await sendMessage(message.chat.id, userText, {
          parse_mode: 'HTML',
          ...(threadId ? { message_thread_id: threadId } : {})
        })
        break
      }

      case '/broadcast': {
        if (args.length === 0) {
          await sendMessage(GROUP_ID, '❌ 请输入要广播的消息', threadId ? { message_thread_id: threadId } : {})
          break
        }

        const broadcastMsg = args.join(' ')
        const usersList = await USER_TOPICS.list()
        const results = {
          success: [],
          failed: [],
          blocked: []
        }
        
        for (const key of usersList.keys) {
          const isBlocked = await USER_BLOCKS.get(KV_KEYS.BLOCK(key.name))
          if (isBlocked) {
            results.blocked.push(key.name)
            continue
          }
          
          try {
            const result = await sendMessage(key.name, broadcastMsg)
            if (result.ok) {
              results.success.push(key.name)
            } else {
              results.failed.push(key.name)
            }
          } catch (error) {
            results.failed.push(key.name)
          }
        }
        
        const details = `
📊 发送结果:
✅ 成功: ${results.success.length}
❌ 失败: ${results.failed.length}
🚫 已屏蔽: ${results.blocked.length}

${results.failed.length > 0 ? `\n❌ 发送失败的用户:\n${results.failed.map(id => 
  `• <a href="tg://user?id=${id}">${id}</a>`
).join('\n')}` : ''}`

        await sendMessage(message.chat.id, templates.success('广播完成', details), {
          parse_mode: 'HTML',
          ...(threadId ? { message_thread_id: threadId } : {})
        })
        break
      }

      case '/status': {
        const stats = await USER_TOPICS.list()
        let totalUsers = 0
        let blockedUsers = 0
        
        for (const key of stats.keys) {
          totalUsers++
          const isBlocked = await USER_BLOCKS.get(KV_KEYS.BLOCK(key.name))
          if (isBlocked) blockedUsers++
        }
        
        await sendMessage(message.chat.id, templates.status(
          totalUsers,
          blockedUsers,
          totalUsers - blockedUsers
        ), threadId ? { message_thread_id: threadId } : {})
        break
      }
    }
  } catch (error) {
    console.error('Admin command error:', error)
    await sendMessage(GROUP_ID, templates.error('命令执行失败', error.message), 
      threadId ? { message_thread_id: threadId } : {}
    )
  }
}

async function sendDocument(chatId, document, options = {}) {
  return sendMedia('sendDocument', chatId, { document }, options)
}

async function sendVideo(chatId, video, options = {}) {
  return sendMedia('sendVideo', chatId, { video }, options)
}

async function sendVoice(chatId, voice, options = {}) {
  return sendMedia('sendVoice', chatId, { voice }, options)
}

async function sendSticker(chatId, sticker, options = {}) {
  return sendMedia('sendSticker', chatId, { sticker }, options)
}

async function sendMedia(method, chatId, media, options = {}) {
  const params = {
    chat_id: chatId,
    ...media,
    ...options
  }
  
  const response = await fetch(`${API_BASE}/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params)
  })
  
  return response.json()
}

async function copyMessage(chatId, fromChatId, messageId, options = {}) {
  const params = {
    chat_id: chatId,
    from_chat_id: fromChatId,
    message_id: messageId,
    ...options
  }
  
  const response = await fetch(`${API_BASE}/copyMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params)
  })
  
  return response.json()
}

async function editMessageReplyMarkup(chatId, messageId, replyMarkup) {
  const response = await fetch(`${API_BASE}/editMessageReplyMarkup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      reply_markup: replyMarkup
    })
  })
  
  return response.json()
}

async function editMessageText(chatId, messageId, text, options = {}) {
  const response = await fetch(`${API_BASE}/editMessageText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text: text,
      ...options
    })
  })
  
  return response.json()
}
