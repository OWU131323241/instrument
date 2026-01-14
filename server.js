require('dotenv').config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const MODEL = 'o1';
const OPENAI_API_ENDPOINT = "https://openai-api-proxy-746164391621.us-west1.run.app";

let promptTemplate;
try {
    promptTemplate = fs.readFileSync('prompt.md', 'utf8');
} catch (error) {
    console.error('Error reading prompt.md:', error);
    process.exit(1);
}

// 楽譜生成API
app.post("/api/generate-score", async (req, res) => {
    try {
        const { songName } = req.body;
        // プロンプト内の ${songName} を置換
        const finalPrompt = promptTemplate.replace(/\${songName}/g, songName);

        // --- 以前成功した「fetch」による通信方式 ---
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

        const response = await fetch(OPENAI_API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    // o1モデルの場合、'system' よりも 'user' メッセージに指示をまとめるのが推奨される場合があります
                    { role: 'user', content: finalPrompt }
                ],
                // o1モデルは現在 response_format: { type: "json_object" } をサポートしていますが、
                // temperature の設定は不要（自動で最適化される）な場合が多いです。
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || 'OpenAI API error');
        }

        const data = await response.json();
        const responseText = data.choices[0].message.content;
        
        // JSONを解析して配列を取り出す
        const parsedData = JSON.parse(responseText);
        const arrayData = Object.values(parsedData).find(Array.isArray);
        
        if (!arrayData) throw new Error('No array found in response');
        
        // 配列を改行でつなげてテキストとして返す
        res.json({ text: arrayData.join('\n') });

    } catch (error) {
        console.error("API Error:", error.message);
        res.status(500).json({ error: error.message });
    }
});

// Socket.io 通信
io.on("connection", (socket) => {
  console.log("デバイス接続中:", socket.id);
  socket.on("sensor", (data) => {
    io.emit("sensor", data); 
  });
});

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "instrument.html")));
app.get("/smart", (req, res) => res.sendFile(path.join(__dirname, "public", "smart.html")));

const PORT = 8081;
server.listen(PORT, () => console.log(`Server running: http://localhost:${PORT}`));
