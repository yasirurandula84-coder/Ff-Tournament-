const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Front-end files public කරන්න
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDB Connected..."))
    .catch(err => console.log(err));

// Player Schema
const playerSchema = new mongoose.Schema({
    whatsapp: { type: String, required: true, unique: true },
    ff_name: { type: String, required: true },
    ff_id: { type: String, required: true },
    points: { type: Number, default: 0 },
    reg_fee: { type: Number, default: 200 },
    registered_at: { type: Date, default: Date.now }
});

const Player = mongoose.model('Player', playerSchema);

// REGISTER API
app.post('/api/register', async (req, res) => {
    try {
        const { whatsapp, ff_name, ff_id } = req.body;
        let existingPlayer = await Player.findOne({ whatsapp });
        if (existingPlayer) return res.status(400).json({ message: "දැනටමත් මේ අංකයෙන් Register වී ඇත!" });

        const playerCount = await Player.countDocuments();
        let fee = 200;
        if (playerCount < 10) fee = 0;

        const newPlayer = new Player({ whatsapp, ff_name, ff_id, reg_fee: fee });
        await newPlayer.save();

        res.status(201).json({ 
            message: fee === 0 ? "සුභ පැතුම්! ඔබ මුල් සාමාජිකයින් 10 දෙනා අතර වේ. ලියාපදිංචිය නොමිලේ!" : "ලියාපදිංචිය සාර්ථකයි! කරුණාකර රු. 200 ක මුදල ගෙවන්න.",
            fee: fee
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// LEADERBOARD API
app.get('/api/leaderboard', async (req, res) => {
    try {
        const leaderboard = await Player.find().sort({ points: -1 });
        res.json(leaderboard);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
