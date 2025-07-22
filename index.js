import { Client, GatewayIntentBits, EmbedBuilder, ActivityType } from 'discord.js';
import OpenAI from 'openai';
import dotenv from 'dotenv';

// 載入環境變數
dotenv.config();

// 初始化 Discord 客戶端
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
    ],
});

// 初始化 OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// 加爾文機器人配置
const CALVIN_CONFIG = {
    promptId: "pmpt_687f16ce57548195a6ebbf149f2adc5907ded20c34b488e2",
    version: "1",
    maxResponseLength: 2000,
    responseDelay: 2000, // 回應延遲 (毫秒)
    blacklistedChannels: [], // 可以添加不想回應的頻道 ID
    stopCommand: "/stop", // 停止指令
};

// 機器人狀態管理
const botStatus = {
    isActive: true, // 機器人是否啟用
    adminUsers: new Set(), // 管理員用戶 ID
};

// 儲存最近的對話上下文
const conversationHistory = new Map();
const MAX_HISTORY_LENGTH = 5;

// 機器人準備就緒事件
client.once('ready', () => {
    console.log(`✅ 約翰·加爾文機器人已上線！登入為 ${client.user.tag}`);
    console.log(`🔗 機器人 ID: ${client.user.id}`);
    console.log(`📺 已加入 ${client.guilds.cache.size} 個伺服器`);
    
    // 從環境變數讀取管理員 ID
    if (process.env.ADMIN_USER_IDS) {
        const adminIds = process.env.ADMIN_USER_IDS.split(',').map(id => id.trim());
        adminIds.forEach(id => botStatus.adminUsers.add(id));
        console.log(`👑 已設定 ${adminIds.length} 位管理員`);
    }
    
    // 設置機器人狀態
    updateBotPresence();
});

// 更新機器人狀態顯示
function updateBotPresence() {
    const activity = botStatus.isActive ? 
        '研讀基督教要義與改革神學' : '已暫停回應 (!stop)';
    const status = botStatus.isActive ? 'online' : 'idle';
    
    client.user.setPresence({
        activities: [{
            name: activity,
            type: ActivityType.Watching
        }],
        status: status
    });
}

// 訊息處理
client.on('messageCreate', async (message) => {
    try {
        // 忽略自己的訊息
        if (message.author.id === client.user.id) return;
        
        // 檢查是否為停止/啟動指令
        if (message.content.trim() === CALVIN_CONFIG.stopCommand) {
            await handleStopCommand(message);
            return;
        }
        
        // 檢查是否為啟動指令
        if (message.content.trim() === "!start") {
            await handleStartCommand(message);
            return;
        }
        
        // 如果機器人被停止，不回應其他訊息
        if (!botStatus.isActive) return;
        
        // 檢查是否在黑名單頻道
        if (CALVIN_CONFIG.blacklistedChannels.includes(message.channel.id)) return;
        
        console.log(`📨 收到訊息 from ${message.author.tag}: ${message.content.substring(0, 100)}...`);
        
        // 更新對話歷史
        updateConversationHistory(message);
        
        // 顯示正在輸入狀態
        await message.channel.sendTyping();
        
        // 延遲回應讓對話更自然
        setTimeout(async () => {
            try {
                // 獲取加爾文的回應
                const response = await getCalvinResponse(message);
                
                if (response && response.trim()) {
                    await sendCalvinResponse(message, response);
                    console.log(`✅ 已回應 ${message.author.tag} 的訊息`);
                }
            } catch (error) {
                console.error('回應訊息時發生錯誤:', error);
                await handleResponseError(message, error);
            }
        }, CALVIN_CONFIG.responseDelay);
        
    } catch (error) {
        console.error('處理訊息時發生錯誤:', error);
    }
});

// 處理停止指令
async function handleStopCommand(message) {
    if (!isAuthorized(message.author.id)) {
        await message.reply('🔒 只有授權用戶可以停止機器人。');
        return;
    }
    
    botStatus.isActive = false;
    updateBotPresence();
    
    console.log(`⏸️ 機器人已被 ${message.author.tag} 停止`);
    await message.reply('⏸️ 約翰·加爾文機器人已停止回應。使用 `!start` 重新啟動。');
}

// 處理啟動指令
async function handleStartCommand(message) {
    if (!isAuthorized(message.author.id)) {
        await message.reply('🔒 只有授權用戶可以啟動機器人。');
        return;
    }
    
    if (botStatus.isActive) {
        await message.reply('✅ 機器人已經在運行中。');
        return;
    }
    
    botStatus.isActive = true;
    
    // 清空對話歷史，避免繼續之前的話題
    conversationHistory.clear();
    console.log('🗑️ 已清空對話歷史');
    
    updateBotPresence();
    
    console.log(`▶️ 機器人已被 ${message.author.tag} 啟動`);
    await message.reply('▶️ 約翰·加爾文機器人已重新啟動，將繼續回應訊息。對話歷史已清空。');
}

// 檢查用戶是否有權限
function isAuthorized(userId) {
    // 如果沒有設定管理員，任何人都可以控制
    if (botStatus.adminUsers.size === 0) return true;
    
    // 檢查是否為授權管理員
    return botStatus.adminUsers.has(userId);
}

// 更新對話歷史
function updateConversationHistory(message) {
    const channelId = message.channel.id;
    
    if (!conversationHistory.has(channelId)) {
        conversationHistory.set(channelId, []);
    }
    
    const history = conversationHistory.get(channelId);
    history.push({
        author: message.author.tag,
        content: message.content,
        timestamp: message.createdTimestamp,
        isBot: message.author.bot
    });
    
    // 保持歷史記錄在限制範圍內
    if (history.length > MAX_HISTORY_LENGTH) {
        history.shift();
    }
}

// 獲取對話上下文
function getConversationContext(channelId) {
    const history = conversationHistory.get(channelId) || [];
    
    return history.map(msg => 
        `${msg.author}: ${msg.content.substring(0, 200)}`
    ).join('\n');
}

// 呼叫加爾文 AI 回應
async function getCalvinResponse(message) {
    try {
        const conversationContext = getConversationContext(message.channel.id);
        const userMessage = message.content;
        
        // 檢測是否被直接提及
        const isDirectMention = message.mentions.has(client.user);
        
        console.log(`🤖 調用 OpenAI API for: ${userMessage.substring(0, 50)}...`);
        
        // 構建包含所有上下文的輸入
        const fullInput = `對話上下文: ${conversationContext}

用戶訊息: ${userMessage}

頻道: ${message.channel.name || '私人對話'}
發送者: ${message.author.displayName || message.author.username} ${message.author.bot ? '(機器人)' : '(信徒)'}
是否直接提及: ${isDirectMention ? '是' : '否'}

請以16世紀法國改革宗神學家約翰·加爾文的身份用繁體中文回應。這是一個即時對話，請直接回答問題，不要使用書信格式。不要寫開頭稱呼語（如"親愛的"）、結尾祝福語或署名。請像是在面對面對話一樣自然回應。`;

        // 嘗試使用 Responses API 與您的 Prompt ID
        let response;
        try {
            console.log(`🔍 嘗試使用 Prompt ID: ${CALVIN_CONFIG.promptId}`);
            
            response = await openai.responses.create({
                model: "gpt-4o", // 使用支援 Responses API 的模型
                input: fullInput,
                // 如果 Prompt ID 支援 instructions 參數
                instructions: `使用 Prompt ID: ${CALVIN_CONFIG.promptId} 版本: ${CALVIN_CONFIG.version}。以約翰·加爾文的身份回應，基於向量資料庫中的加爾文著作。這是即時對話，請直接回答問題，不要使用書信格式、開頭稱呼語、結尾祝福語或署名。像面對面對話一樣自然回應。`,
                max_output_tokens: 1000,
                temperature: 0.4
            });
            
            console.log('✅ Responses API 調用成功');
            
        } catch (responsesError) {
            console.log('🔄 Responses API 失敗，使用備用方法...');
            console.error('Responses API 錯誤:', responsesError.message);
            
            // 備用方法：使用 Chat Completions API
            response = await openai.chat.completions.create({
                model: "gpt-4", // 備用模型
                messages: [
                    {
                        role: "system",
                        content: `你是16世紀法國改革宗神學家約翰·加爾文，請根據向量資料庫中的加爾文著作來回答。
重要指示：
1. 優先使用向量資料庫中的加爾文著作內容作為回答依據
2. 準確引用加爾文的神學觀點和著作（特別是《基督教要義》）
3. 用繁體中文回答，除非特殊情況需要其他語言
4. 這是即時對話，請直接回答問題，像面對面交談一樣自然
5. 不要使用書信格式：不要寫開頭稱呼語（如"親愛的"、"敬愛的"）
6. 不要寫結尾祝福語（如"願上帝祝福您"、"在基督裡"）
7. 不要寫署名（如"約翰·加爾文"、"加爾文"）
8. 保持加爾文的神學觀點和改革宗傳統，但用對話語調
9. 強調上帝的主權、預定論、唯獨恩典等改革宗核心教義
10. 回答長度適中，避免過於冗長

Prompt 參考 ID: ${CALVIN_CONFIG.promptId}
版本: ${CALVIN_CONFIG.version}`
                    },
                    {
                        role: "user",
                        content: fullInput
                    }
                ],
                max_tokens: 1000,
                temperature: 0.4
            });
            
            console.log('✅ Chat Completions API 調用成功');
        }

        // 處理不同 API 的回應格式
        let responseContent;
        
        if (response.output_text) {
            // Responses API 格式
            responseContent = response.output_text;
        } else if (response.choices?.[0]?.message?.content) {
            // Chat Completions API 格式
            responseContent = response.choices[0].message.content;
        } else {
            console.log('🔍 未知回應格式:', JSON.stringify(response, null, 2));
            responseContent = null;
        }

        // 清理書信格式的後處理
        if (responseContent) {
            responseContent = cleanLetterFormat(responseContent);
        }

        return responseContent;
        
    } catch (error) {
        console.error('OpenAI API 調用失敗:', error);
        throw error;
    }
}

// 清理書信格式的後處理函數
function cleanLetterFormat(text) {
    if (!text || typeof text !== 'string') return text;
    
    let cleaned = text.trim();
    
    // 移除開頭的稱呼語
    const greetingPatterns = [
        /^親愛的[^，。！？\n]*[，。！？\n]/,
        /^敬愛的[^，。！？\n]*[，。！？\n]/,
        /^我的[^，。！？\n]*[，。！？\n]/,
        /^在基督裡的[^，。！？\n]*[，。！？\n]/,
        /^弟兄[^，。！？\n]*[，。！？\n]/,
        /^姊妹[^，。！？\n]*[，。！？\n]/,
        /^朋友[^，。！？\n]*[，。！？\n]/
    ];
    
    for (const pattern of greetingPatterns) {
        cleaned = cleaned.replace(pattern, '');
    }
    
    // 移除結尾的祝福語和署名
    const endingPatterns = [
        /\n*願上帝[^。！]*[。！]?\s*$/,
        /\n*在基督裡[^。！]*[。！]?\s*$/,
        /\n*主內[^。！]*[。！]?\s*$/,
        /\n*祝福您[^。！]*[。！]?\s*$/,
        /\n*願主[^。！]*[。！]?\s*$/,
        /\n*約翰[·・\s]*加爾文\s*$/,
        /\n*加爾文\s*$/,
        /\n*您的僕人[^。！]*[。！]?\s*$/,
        /\n*在主裡[^。！]*[。！]?\s*$/,
        /\n*神的僕人[^。！]*[。！]?\s*$/
    ];
    
    for (const pattern of endingPatterns) {
        cleaned = cleaned.replace(pattern, '');
    }
    
    // 移除多餘的換行和空格
    cleaned = cleaned.replace(/\n\s*\n/g, '\n').trim();
    
    return cleaned;
}

// 發送加爾文回應
async function sendCalvinResponse(message, response) {
    try {
        // 處理過長的回應
        if (response.length > CALVIN_CONFIG.maxResponseLength) {
            const chunks = splitMessage(response, CALVIN_CONFIG.maxResponseLength);
            
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                
                if (chunks.length > 1) {
                    // 多段訊息標記
                    const partIndicator = `(${i + 1}/${chunks.length})`;
                    await message.channel.send(`${chunk} ${partIndicator}`);
                } else {
                    await message.channel.send(chunk);
                }
                
                // 避免發送過快
                if (i < chunks.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        } else {
            // 創建嵌入式回應 (較正式的回應)
            if (message.mentions.has(client.user) || response.length > 500) {
                const embed = createCalvinEmbed(response, message.author);
                await message.channel.send({ embeds: [embed] });
            } else {
                // 簡單回應 (更自然的對話)
                await message.channel.send(response);
            }
        }
        
    } catch (error) {
        console.error('發送回應時發生錯誤:', error);
        // 如果嵌入式發送失敗，嘗試純文字
        try {
            await message.channel.send(response.substring(0, CALVIN_CONFIG.maxResponseLength));
        } catch (fallbackError) {
            console.error('備援發送也失敗:', fallbackError);
        }
    }
}

// 創建嵌入式回應
function createCalvinEmbed(response, author) {
    return new EmbedBuilder()
        .setColor(0x2F4F4F) // 深灰色，象徵加爾文的嚴謹
        .setAuthor({
            name: '約翰·加爾文 (John Calvin)',
            iconURL: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/John_Calvin_by_Holbein.jpg/256px-John_Calvin_by_Holbein.jpg'
        })
        .setDescription(response)
        .setFooter({
            text: `回應給 ${author.displayName || author.username} • 基於加爾文神學著作`,
            iconURL: author.displayAvatarURL({ dynamic: true })
        })
        .setTimestamp()
        .addFields({
            name: '💡 提醒',
            value: '此回應基於約翰·加爾文的神學著作和改革宗傳統',
            inline: false
        });
}

// 分割長訊息
function splitMessage(text, maxLength) {
    const chunks = [];
    let currentChunk = '';
    
    // 優先按句號分割
    const sentences = text.split(/(?<=[。！？.!?])\s*/);
    
    for (const sentence of sentences) {
        const potentialChunk = currentChunk + sentence;
        
        if (potentialChunk.length > maxLength) {
            if (currentChunk) {
                chunks.push(currentChunk.trim());
                currentChunk = sentence;
            } else {
                // 單句過長，強制分割
                const words = sentence.split('');
                let tempChunk = '';
                
                for (const char of words) {
                    if ((tempChunk + char).length > maxLength - 3) {
                        chunks.push(tempChunk + '...');
                        tempChunk = char;
                    } else {
                        tempChunk += char;
                    }
                }
                
                if (tempChunk) {
                    currentChunk = tempChunk;
                }
            }
        } else {
            currentChunk = potentialChunk;
        }
    }
    
    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }
    
    return chunks.length > 0 ? chunks : [text.substring(0, maxLength)];
}

// 處理回應錯誤
async function handleResponseError(message, error) {
    console.error('API 錯誤詳情:', error);
    
    let errorMessage = '🙏 弟兄姊妹，我現在無法回應您的問題。';
    
    if (error.status === 429) {
        errorMessage += '請稍候片刻再詢問。';
    } else if (error.status === 401) {
        errorMessage += '我的認證出現問題。';
    } else if (error.code === 'ENOTFOUND') {
        errorMessage += '網路連線出現問題。';
    } else {
        errorMessage += '請稍後再試。';
    }
    
    try {
        // 只在被直接提及時才發送錯誤訊息
        if (message.mentions.has(client.user)) {
            await message.channel.send(errorMessage);
        }
    } catch (sendError) {
        console.error('發送錯誤訊息失敗:', sendError);
    }
}

// 優雅關閉處理
process.on('SIGINT', async () => {
    console.log('🔄 正在優雅關閉約翰·加爾文機器人...');
    
    try {
        await client.user.setStatus('invisible');
        client.destroy();
        console.log('✅ 機器人已安全關閉');
    } catch (error) {
        console.error('關閉時發生錯誤:', error);
    }
    
    process.exit(0);
});

// 錯誤處理
process.on('unhandledRejection', (error) => {
    console.error('未處理的 Promise 拒絕:', error);
});

process.on('uncaughtException', (error) => {
    console.error('未捕獲的異常:', error);
    process.exit(1);
});

// 登入 Discord
console.log('🚀 正在啟動約翰·加爾文機器人...');
client.login(process.env.DISCORD_TOKEN)
    .then(() => {
        console.log('🔐 Discord 登入成功');
    })
    .catch((error) => {
        console.error('❌ Discord 登入失敗:', error);
        process.exit(1);
    });
