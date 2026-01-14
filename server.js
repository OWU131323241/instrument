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

const MODEL = 'o1-preview';
const OPENAI_API_ENDPOINT = "https://openai-api-proxy-746164391621.us-west1.run.app";

let promptTemplate;
try {
    promptTemplate = fs.readFileSync('prompt.md', 'utf8');
} catch (error) {
    console.error('Error reading prompt.md:', error);
    process.exit(1);
}

// 楽譜生成API
// --- server.js の API部分のみ抜粋 ---
app.post("/api/generate-score", async (req, res) => {
    try {
        const { songName } = req.body;
        const finalPrompt = promptTemplate.replace(/\${songName}/g, songName);

        const apiKey = process.env.OPENAI_API_KEY;
        
        // 安全のために gpt-4o を使用（o1が使える環境なら o1-mini に変更可）
        const MODEL = 'gpt-4o'; 

        const response = await fetch(OPENAI_API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    // system ではなく user に全ての指示（finalPrompt）を入れるのが最近の流行りです
                    { role: 'user', content: finalPrompt }
                ]
                // 500エラーを避けるため、一旦 response_format は外す
            })
        });

        const data = await response.json();

        // 500エラーが起きた場合に備えて中身をチェック
        if (!response.ok) {
            console.error("API Response Error:", data);
            throw new Error(data.error?.message || 'API Error');
        }

        const responseText = data.choices[0].message.content;
        
        // AIがJSON以外の余計な文字（```json ... ```など）を返してきた時のための対策
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        const cleanJson = jsonMatch ? jsonMatch[0] : responseText;
        
        const parsedData = JSON.parse(cleanJson);
        const arrayData = Object.values(parsedData).find(Array.isArray);
        
        if (!arrayData) throw new Error('No array found');
        
        res.json({ text: arrayData.join('\n') });

    } catch (error) {
        console.error("Server Error Log:", error.message);
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
