import fs from 'fs';
import express from 'express';
import bodyParser from 'body-parser';
import got from 'got';

// 加载配置文件
const conf = JSON.parse(
    fs.readFileSync(
        'config.json'
    ).toString()
);

const password   = conf.password  || ""; // 请求的密码，防止恶意请求，可以留空
const tgBotToken = conf.bot.token || ""; // Telegram Bot Token，可以向BotFather申请
const tgChatId   = conf.bot.chat  || ""; // Telegram Chat ID，用@或是数值的方式来传递
const port       = process.env.PORT || conf.port || 0;
const debugMode  = process.env.debug || process.argv.includes('--debug');

debugMode && console.log('调试模式已启用');

// 校验配置文件
debugMode && console.log('开始校验配置文件');
if (!tgBotToken || !tgChatId || !port) {
    throw new Error('Configuration error, please check the manual carefully.');
}
debugMode && console.log('配置文件校验完成');

const reqPath = process.env.REQUEST_PATH || "/"; // 请求路径，防止恶意请求，可以留空

const app = express();

debugMode && console.log('开始初始化请求进程');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));

app.post(reqPath, async (req, res) => {
    debugMode && console.log('接收到了一个新请求');
    debugMode && console.log(req.body);
    res.status(await handleRequest(req.body))
        .end();
});

/**
 * 检测密码是否正确
 * @param {String} reqPwd 请求的密码
 */
const verifyPassword = (reqPwd) => {
    if (password && reqPwd && reqPwd === password) {
        // 有密码且正确
        return true;
    } else {
        return !password;
    }
}
/**
 * 处理请求
 * @param {Object} params 请求参数
 * @return {Number} StatusCode
 */
const handleRequest = async (params) => {
    if (!verifyPassword(params.password)) {
        debugMode && console.log('密码错误');
        return 401;
    }

    return await sendEventMsg(params.monitorFriendlyName, params.alertType, params.alertDuration);
};

/**
 * 将经过的时间（秒）调整成用户友好的字符串
 * @param {Number} tSec 秒
 */
const getTimeString = (tSec) => {

    const dt = new Date(tSec * 1000);

    let timeStr = '';
    const hours = dt.getUTCHours();
    const minutes = dt.getUTCMinutes();
    const seconds = dt.getUTCSeconds();
    if (hours) {
        timeStr += `${hours}小时`;
    }
    if (minutes) {
        timeStr += `${minutes}分钟`;
    }
    if (seconds) {
        timeStr += `${seconds}秒`;
    }
    return timeStr;
};

const botApi = `https://api.telegram.org/bot${tgBotToken}/sendMessage`;

/**
 * 发送消息
 * @param {String} serverName 服务器名
 * @param {Number} eventType 事件名
 * @param {Number} eventDuration 持续时间(s)
 */
const sendEventMsg = async (serverName, eventType, eventDuration) => {

    const symbolsReg = /([.+-])/g;
    const serverNameEscaped = serverName.replace(symbolsReg, '\\$&');

    let info;

    // 准备消息
    switch (eventType) {
        // 1: down, 2: up, 3: SSL expiry notification
        case "1": // Boom!
            info = `坏耶， *${serverNameEscaped}* 出问题了欸\\.\\.\\.`;
            break;
        case "2": // 恢复
            info = `好耶，经过 _${getTimeString(eventDuration)}_ 的维护， *${serverNameEscaped}* 恢复上线啦～`;
            break;
        case "3": // 证书过期
            info = `要注意哦， *${serverNameEscaped}* 的证书过期啦\\.\\.`;
            break;
        default: // 错误
            info = `出现了一个异常的请求类型 *${eventType}* ，是什么新的特性吗？`;
            break;
    }

    // 准备发送
    const data = {
        chat_id: tgChatId,
        text: info,
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true
    };

    // 发送消息
    const result = await got.post(botApi, {
        json: data
    });
    if (result.statusMessage !== 'OK') {
        console.error(result);
    }
    return result.statusCode;
};
debugMode && console.log('请求进程初始化完成');

// Server start
debugMode && console.log('正在启动服务');
const server = app.listen(port, process.env.HOSTNAME || 'localhost', () => {
    const addr = server.address();
    const host = addr.address;
    const port = addr.port;

    console.log(`服务已启动在 ${host}:${port}`);
});
