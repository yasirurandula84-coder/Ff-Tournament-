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

// === 💾 PLAYER REGISTRATION ROUTE ===
app.post('/api/register', async (req, res) => {
    try {
        const { uid, nickname } = req.body;

        if (!uid || !nickname) {
            return res.status(400).json({ message: "UID and Nickname are required!" });
        }

        // 1. එකම UID එකෙන් දෙපාරක් රෙජිස්ටර් වෙන්න බැරි වෙන්න චෙක් කරනවා
        const existingPlayer = await Player.findOne({ uid: uid });
        if (existingPlayer) {
            return res.status(400).json({ message: "This Player ID is already registered!" });
        }

        // 2. අලුත් ප්ලේයර්ව ඩේටාබේස් එකට සේව් කරනවා
        const newPlayer = new Player({
            uid: uid,
            nickname: nickname
        });

        await newPlayer.save();
        res.status(201).json({ message: "Registration Successful!" });

    } catch (error) {
        console.error("Registration Error:", error);
        res.status(500).json({ message: "Server error! Please try again." });
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
