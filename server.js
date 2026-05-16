const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

// 🌍 CORS Setup - Network Errors නැති වෙන්නම හැදුවා
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

// 📁 Public Folder Static Link
app.use(express.static(path.join(__dirname, 'public')));

// === 💾 TOURNAMENT SETTINGS (MEMORY STORAGE) ===
let tournamentSettings = {
    nextMatchTime: "2026-05-20T20:30", 
    liveStatus: "UPCOMING", 
    matchMessage: "WEEKLY GRAND FINALS: MATCH ROOM IS FORMING SOON!",
    matchMap: "BERMUDA (CLASSIC)"
};

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

// === 💾 1. PLAYER REGISTRATION ROUTE ===
app.post('/api/register', async (req, res) => {
    try {
        const { whatsapp, password, ff_name, ff_id } = req.body;

        if (!whatsapp || !password || !ff_name || !ff_id) {
            return res.status(400).json({ message: "All fields are required! ❌" });
        }

        // එකම WhatsApp අංකයකින් දෙපාරක් රෙජිස්ටර් වෙන්න බෑ
        const existingPlayer = await Player.findOne({ whatsapp: whatsapp });
        if (existingPlayer) {
            return res.status(400).json({ message: "This WhatsApp number is already registered! ❌" });
        }

        // එකම FF ID එකෙන් දෙපාරක් රෙජිස්ටර් වෙන්න බෑ
        const existingFF = await Player.findOne({ ff_id: ff_id });
        if (existingFF) {
            return res.status(400).json({ message: "This Free Fire ID is already registered! ❌" });
        }

        // අලුත් ප්ලේයර්ව සේව් කිරීම
        const newPlayer = new Player({ whatsapp, password, ff_name, ff_id });
        await newPlayer.save();
        
        res.status(201).json({ message: "Registration Successful! 🔥" });

    } catch (error) {
        console.error("Registration Error:", error);
        res.status(500).json({ message: "Server error! Please try again." });
    }
});

// === 🔐 2. LOGIN API ===
app.post('/api/login', async (req, res) => {
    try {
        const { whatsapp, password } = req.body;
        const player = await Player.findOne({ whatsapp, password });

        if (!player) {
            return res.status(400).json({ message: "ඇතුළත් කළ දුරකථන අංකය හෝ මුරපදය (Password) වැරදියි! ❌" });
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

// === 🏆 3. LEADERBOARD API ===
app.get('/api/leaderboard', async (req, res) => {
    try {
        const players = await Player.find().sort({ points: -1 }).limit(10);
        res.json(players);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// === ⚙️ 4. GET SETTINGS API ===
app.get('/api/settings', (req, res) => {
    res.json(tournamentSettings);
});

// === 🔐 5. UPDATE SETTINGS API (ADMIN ONLY) ===
app.post('/api/settings/update', (req, res) => {
    const { adminPassword, nextMatchTime, liveStatus, matchMessage, matchMap } = req.body;

    // ඔයාගේ රහස් Password එක (admin123)
    if (adminPassword !== "admin123") {
        return res.status(403).json({ success: false, message: "Wrong Admin Password! ❌" });
    }

    if (nextMatchTime) tournamentSettings.nextMatchTime = nextMatchTime;
    if (liveStatus) tournamentSettings.liveStatus = liveStatus;
    if (matchMessage) tournamentSettings.matchMessage = matchMessage;
    if (matchMap) tournamentSettings.matchMap = matchMap;

    res.json({ success: true, message: "Tournament Settings Updated Successfully! 🔥", settings: tournamentSettings });
});

// === 🌐 6. ADMIN HTML ROUTE ===
app.get('/sudda', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'sudda.html'));
});

// === 🚀 SERVER LISTEN ===
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
