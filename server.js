const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDB Connected..."))
    .catch(err => console.log(err));

// Player Schema
const playerSchema = new mongoose.Schema({
    whatsapp: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    ff_name: { type: String, required: true },
    ff_id: { type: String, required: true },
    points: { type: Number, default: 0 },
    reg_fee: { type: Number, default: 200 },
    registered_at: { type: Date, default: Date.now }
});

const Player = mongoose.model('Player', playerSchema);

// === 🎯 NEW RAPIDAPI INTEGRATION FOR FREE FIRE ID CHECK ===
app.post('/api/check-uid', async (req, res) => {
    try {
        const { uid } = req.body;
        if (!uid) return res.status(400).json({ message: "UID එක ඇතුළත් කරන්න!" });

        // ඔයා දුන්න නිවැරදිම RapidAPI එකේ විස්තර මෙතනට සෙට් කලා
        const options = {
            method: 'GET',
            url: `https://check-id-game3.p.rapidapi.com/game/free-fire?id=${uid}`,
            headers: {
                'x-rapidapi-host': 'check-id-game3.p.rapidapi.com',
                'x-rapidapi-key': process.env.RAPIDAPI_KEY // අපි මේක ආරක්ෂිතව Render Environment Variables වලට දාමු
            }
        };

        const response = await axios.request(options);
        
        // සාමාන්‍යයෙන් මේ API වලින් එන්නේ { nickname: "name" } හෝ { username: "name" } හෝ { data: { username: "name" } } වගේ
        // ඒ නිසා ආපු response එක පරීක්ෂා කරලා නම ගන්නවා:
        let nickname = null;
        if (response.data) {
            nickname = response.data.nickname || response.data.username || response.data.name || (response.data.data && response.data.data.username);
        }

        if (nickname) {
            res.json({ nickname: nickname });
        } else {
            res.status(404).json({ message: "Player කෙනෙක් සොයාගත නොහැකි විය! ID එක නිවැරදිදැයි බලන්න." });
        }

    } catch (err) {
        console.error("API Error:", err.message);
        res.status(500).json({ message: "ID එක පරීක්ෂා කිරීමට නොහැකි විය! කරුණාකර නැවත උත්සාහ කරන්න." });
    }
});

// 1. REGISTER API
app.post('/api/register', async (req, res) => {
    try {
        const { whatsapp, password, ff_name, ff_id } = req.body;
        
        let existingPlayer = await Player.findOne({ whatsapp });
        if (existingPlayer) return res.status(400).json({ message: "දැනටමත් මේ අංකයෙන් Register වී ඇත!" });

        const playerCount = await Player.countDocuments();
        let fee = 200;
        if (playerCount < 10) fee = 0;

        const newPlayer = new Player({ whatsapp, password, ff_name, ff_id, reg_fee: fee });
        await newPlayer.save();

        res.status(201).json({ 
            message: fee === 0 ? "සුභ පැතුම්! ඔබ මුල් සාමාජිකයින් 10 දෙනා අතර වේ. ලියාපදිංචිය නොමිලේ! දැන් Login වෙන්න." : "ලියාපදිංචිය සාර්ථකයි! කරුණාකර රු. 200 ගෙවා Login වෙන්න.",
            fee: fee
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. LOGIN API
app.post('/api/login', async (req, res) => {
    try {
        const { whatsapp, password } = req.body;
        const player = await Player.findOne({ whatsapp, password });

        if (!player) {
            return res.status(400).json({ message: "ඇතුළත් කළ දුරකථන අංකය හෝ මුරපදය (Password) වැරදියි!" });
        }

        res.json({
            message: "Login Successful",
            player: {
                whatsapp: player.whatsapp,
                ff_name: player.ff_name,
                ff_id: player.ff_id,
                points: player.points,
                reg_fee: player.reg_fee
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. LEADERBOARD API
app.get('/api/leaderboard', async (req, res) => {
    try {
        const leaderboard = await Player.find().sort({ points: -1 });
        res.json(leaderboard);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. ADMIN POINTS UPDATE API
app.post('/api/points', async (req, res) => {
    try {
        const { whatsapp, status } = req.body;
        let pointsToId = 0;
        if (status === 'win') pointsToId = 10;
        else if (status === 'defeat') pointsToId = -5;

        const player = await Player.findOne({ whatsapp });
        if (!player) return res.status(404).json({ message: "Player සොයාගත නොහැකි විය!" });

        player.points += pointsToId;
        if (player.points < 0) player.points = 0; 

        await player.save();
        res.json({ message: "Points Updated Successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. WEEKLY RESET API
app.post('/api/reset-weekly', async (req, res) => {
    try {
        await Player.updateMany({}, { $set: { points: 0 } });
        res.json({ message: "සතිපතා ලකුණු නැවත 0 කරන ලදී!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
