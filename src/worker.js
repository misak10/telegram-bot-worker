const TOKEN = BOT_TOKEN
const WEBHOOK = '/webhook'
const SECRET = BOT_SECRET
const ADMIN_UID = ADMIN_UID
const GROUP_ID = GROUP_ID

const commands = {
  admin: [
    {command: 'help', description: '显示帮助信息'},
    {command: 'block', description: '屏蔽用户 (回复消息或输入用户ID)'},
    {command: 'unblock', description: '解除屏蔽 (回复消息或输入用户ID)'},
    {command: 'info', description: '查看用户信息'},
    {command: 'list', description: '列出所有用户'},
    {command: 'clean', description: '清理无效话题'},
    {command: 'broadcast', description: '向所有用户发送消息'},
    {command: 'status', description: '显示统计信息'}
  ],
  guest: [
    {command: 'start', description: '开始使用机器人'},
    {command: 'help', description: '显示帮助信息'}
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
    return `
用户信息
━━━━━━━━━━━━━━━━
ID: ${idText}
用户名: @${user.username || '未设置'}
姓名: ${user.first_name || ''} ${user.last_name || ''}
话题ID: ${threadId || '未创建'}
`
  },

  error: (title, error) => `
${title}
━━━━━━━━━━━━━━━━
错误: ${error}
时间: ${new Date().toLocaleString()}
`,

  success: (title, details) => `
${title}
━━━━━━━━━━━━━━━━
详情: ${details}
时间: ${new Date().toLocaleString()}
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
    
    event.waitUntil(handleUpdate(update))

    return new Response('Ok')
  } catch (error) {
    console.error('Webhook Error:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}

async function handleUpdate(update) {
  try {
    if ('message' in update) {
      await handleMessage(update.message)
    } else if ('callback_query' in update) {
      await handleCallbackQuery(update.callback_query)
    }
  } catch (error) {
    console.error('Update handling error:', error)
  }
}

async function handleMessage(message) {
  if (message.chat.type === 'private') {
    if (message.from.id.toString() === ADMIN_UID && message.text?.startsWith('/')) {
      return handleAdminCommand(message)
    }

    if (message.from.id.toString() === ADMIN_UID && message.reply_to_message) {
      return handleAdminReply(message)
    }

    const isBlocked = await USER_BLOCKS.get(KV_KEYS.BLOCK(message.from.id))
    if (isBlocked) {
      await sendMessage(message.from.id, '您已被管理员屏蔽')
      return
    }

    if (message.text?.startsWith('/')) {
      if (message.text === '/start') {
        const idText = `<code>${message.from.id}</code>`
        await sendMessage(message.from.id, `
欢迎使用机器人！
━━━━━━━━━━━━━━━━
您的用户ID: ${idText}

您可以直接发送消息给我，我会将消息转发给管理员。
管理员会在看到消息后尽快回复您。

注意事项：
1. 请勿发送垃圾消息
2. 请保持礼貌友好
3. 支持发送文字、图片、文件等各种类型的消息
`)
      }
      return
    }

    return handlePrivateMessage(message)
  } else if (message.chat.id.toString() === GROUP_ID && 
             message.from.id.toString() === ADMIN_UID) {
    if (message.text?.startsWith('/')) {
      return handleAdminCommand(message, message.message_thread_id)
    } else if (message.message_thread_id) {
      return handleAdminReply(message)
    }
  }
}

async function handlePrivateMessage(message) {
  try {
    let threadId = await USER_TOPICS.get(message.from.id.toString())

    if (threadId) {
      try {
        const forwardResult = await forwardMessage(GROUP_ID, message.chat.id, message.message_id, { 
          message_thread_id: threadId 
        })
        
        if (forwardResult.ok) {
          return new Response('OK', { status: 200 })
        } else {
          console.log('Topic not usable, will create new one')
          threadId = null
          await USER_TOPICS.delete(message.from.id.toString())
        }
      } catch (error) {
        if (error.message.includes('message thread not found') || error.message.includes('chat not found')) {
          console.log('Topic not found, will create new one')
          threadId = null
          await USER_TOPICS.delete(message.from.id.toString())
        } else {
          console.error('Failed to forward message:', error)
          throw error
        }
      }
    }

    if (!threadId) {
      const firstName = message.from.first_name || ''
      const lastName = message.from.last_name || ''
      const fullName = [firstName, lastName].filter(Boolean).join(' ') || '未设置姓名'
      const topicName = `${fullName} (${message.from.id})`
      
      const topic = await createForumTopic(GROUP_ID, topicName)
      if (!topic.ok) {
        console.error('Failed to create forum topic:', topic)
        return new Response('Failed to create topic', { status: 500 })
      }
      
      threadId = topic.result.message_thread_id
      await USER_TOPICS.put(message.from.id.toString(), threadId)

      const photos = await getUserProfilePhotos(message.from.id)

      const inlineKeyboard = [
        [
          {
            text: '👤 查看用户资料',
            url: `tg://user?id=${message.from.id}`
          }
        ],
        [
          {
            text: '🚫 屏蔽该用户',
            callback_data: `block_${message.from.id}`
          },
          {
            text: '✅ 解除屏蔽',
            callback_data: `unblock_${message.from.id}`
          }
        ]
      ]

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

      await forwardMessage(GROUP_ID, message.chat.id, message.message_id, { 
        message_thread_id: threadId 
      })
    }
    
    return new Response('OK', { status: 200 })
  } catch (error) {
    console.error('Error handling private message:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}

async function handleCallbackQuery(query) {
  try {
    if (query.data.startsWith('block_')) {
      const userId = query.data.split('_')[1]

      await USER_BLOCKS.put(KV_KEYS.BLOCK(userId), 'true')

      const threadId = await USER_TOPICS.get(userId)
      if (threadId) {
        await sendMessage(GROUP_ID, templates.success(
          '用户已被屏蔽',
          `用户 ${userId} 已被屏蔽，该用户将无法发送新消息`
        ), {
          message_thread_id: threadId
        })
      }
      
      await answerCallbackQuery(query.id, `用户 ${userId} 已被屏蔽`)
    } else if (query.data.startsWith('unblock_')) {
      const userId = query.data.split('_')[1]

      await USER_BLOCKS.delete(KV_KEYS.BLOCK(userId))

      const threadId = await USER_TOPICS.get(userId)
      if (threadId) {
        await sendMessage(GROUP_ID, templates.success(
          '用户已解除屏蔽',
          `用户 ${userId} 已解除屏蔽，可以继续发送消息`
        ), {
          message_thread_id: threadId
        })
      }
      
      await answerCallbackQuery(query.id, `用户 ${userId} 已解除屏蔽`)
    }
    
    return new Response('OK', { status: 200 })
  } catch (error) {
    console.error('Error handling callback query:', error)
    return new Response('Internal Server Error', { status: 500 })
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
        allowed_updates: ['message'],
        max_connections: 100
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
        scope: { type: 'chat', chat_id: ADMIN_UID }
      })
    })

    await fetch(`${API_BASE}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: commands.guest,
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
          await USER_BLOCKS.put(KV_KEYS.BLOCK(userId), 'true')
          await sendMessage(GROUP_ID, `用户 ${userId} 已被屏蔽`, threadId ? { message_thread_id: threadId } : {})
        } else if (message.reply_to_message) {
          const replyThreadId = message.reply_to_message.message_thread_id
          if (replyThreadId) {
            const list = await USER_TOPICS.list()
            for (const key of list.keys) {
              const value = await USER_TOPICS.get(key.name)
              if (value === replyThreadId.toString()) {
                await USER_BLOCKS.put(KV_KEYS.BLOCK(key.name), 'true')
                await sendMessage(GROUP_ID, `用户 ${key.name} 已被屏蔽`, threadId ? { message_thread_id: threadId } : {})
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
          await USER_BLOCKS.delete(KV_KEYS.BLOCK(userId))
          await sendMessage(GROUP_ID, `用户 ${userId} 已解除屏蔽`, threadId ? { message_thread_id: threadId } : {})
        } else if (message.reply_to_message) {
          const replyThreadId = message.reply_to_message.message_thread_id
          if (replyThreadId) {
            const list = await USER_TOPICS.list()
            for (const key of list.keys) {
              const value = await USER_TOPICS.get(key.name)
              if (value === replyThreadId.toString()) {
                await USER_BLOCKS.delete(KV_KEYS.BLOCK(key.name))
                await sendMessage(GROUP_ID, `用户 ${key.name} 已解除屏蔽`, threadId ? { message_thread_id: threadId } : {})
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

      case '/list':
        const userList = await USER_TOPICS.list()
        let userCount = 0
        let userText = '用户列表\n━━━━━━━━━━━━━━━━\n'
        
        for (const key of userList.keys) {
          const threadId = await USER_TOPICS.get(key.name)
          const isBlocked = await USER_BLOCKS.get(KV_KEYS.BLOCK(key.name))
          const idText = `<code>${key.name}</code>`
          userText += `ID: ${idText}\n话题: ${threadId}\n状态: ${isBlocked ? '🚫 已屏蔽' : '✅ 正常'}\n\n`
          userCount++
        }
        
        userText += `\n共 ${userCount} 个用户`
        await sendMessage(message.chat.id, userText, threadId ? { message_thread_id: threadId } : {})
        break

      case '/clean':
        let cleanCount = 0
        const topicList = await USER_TOPICS.list()
        
        for (const key of topicList.keys) {
          const threadId = await USER_TOPICS.get(key.name)
          try {
            const testResult = await sendMessage(GROUP_ID, '测试消息', { message_thread_id: threadId })
            if (!testResult.ok) {
              await USER_TOPICS.delete(key.name)
              cleanCount++
            } else {
              await deleteMessage(GROUP_ID, testResult.result.message_id)
            }
          } catch (error) {
            if (error.message.includes('message thread not found')) {
              await USER_TOPICS.delete(key.name)
              cleanCount++
            }
          }
        }
        
        await sendMessage(message.chat.id, `清理完成，共删除 ${cleanCount} 个无效话题`, threadId ? { message_thread_id: threadId } : {})
        break

      case '/broadcast':
        if (args.length === 0) {
          await sendMessage(GROUP_ID, '请输入要广播的消息', threadId ? { message_thread_id: threadId } : {})
          break
        }

        const broadcastMsg = args.join(' ')
        const usersList = await USER_TOPICS.list()
        let successCount = 0
        let failCount = 0
        
        for (const key of usersList.keys) {
          const isBlocked = await USER_BLOCKS.get(KV_KEYS.BLOCK(key.name))
          if (!isBlocked) {
            try {
              const result = await sendMessage(key.name, broadcastMsg)
              if (result.ok) {
                successCount++
              } else {
                failCount++
              }
            } catch (error) {
              failCount++
            }
          }
        }
        
        await sendMessage(message.chat.id, `广播完成\n成功: ${successCount}\n失败: ${failCount}`, threadId ? { message_thread_id: threadId } : {})
        break

      case '/status':
        const stats = await USER_TOPICS.list()
        let totalUsers = 0
        let blockedUsers = 0
        
        for (const key of stats.keys) {
          totalUsers++
          const isBlocked = await USER_BLOCKS.get(KV_KEYS.BLOCK(key.name))
          if (isBlocked) blockedUsers++
        }
        
        await sendMessage(message.chat.id, `
统计信息
━━━━━━━━━━━━━━━━
总用户数: ${totalUsers}
已屏蔽: ${blockedUsers}
活跃用户: ${totalUsers - blockedUsers}
`, threadId ? { message_thread_id: threadId } : {})
        break
    }
  } catch (error) {
    console.error('Admin command error:', error)
    await sendMessage(GROUP_ID, `命令执行失败: ${error.message}`, threadId ? { message_thread_id: threadId } : {})
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