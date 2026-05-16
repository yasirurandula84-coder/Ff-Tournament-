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

// === 💾 PLAYER SCHEMA ===
const playerSchema = new mongoose.Schema({
    whatsapp: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    ff_name: { type: String, required: true },
    ff_id: { type: String, required: true },
    points: { type: Number, default: 0 },
    reg_fee: { type: Number, default: 200 },
    registered_at: { type: Date, default: Date.now },
    isBanned: { type: Boolean, default: false },
    payment_slip: { type: String, default: "" },   
    payment_status: { type: String, default: "Pending" } 
});

const Player = mongoose.model('Player', playerSchema);

// === 💾 1. PLAYER REGISTRATION ROUTE ===
app.post('/api/register', async (req, res) => {
    try {
        const { whatsapp, password, ff_name, ff_id } = req.body;

        if (!whatsapp || !password || !ff_name || !ff_id) {
            return res.status(400).json({ message: "All fields are required! ❌" });
        }

        const existingPlayer = await Player.findOne({ whatsapp: whatsapp });
        if (existingPlayer) {
            return res.status(400).json({ message: "This WhatsApp number is already registered! ❌" });
        }

        const existingFF = await Player.findOne({ ff_id: ff_id });
        if (existingFF) {
            return res.status(400).json({ message: "This Free Fire ID is already registered! ❌" });
        }

        const playerCount = await Player.countDocuments({});
        let finalFee = 200;
        let finalStatus = "Pending";

        if (playerCount < 10) {
            finalFee = 0;
            finalStatus = "Free";
        }

        const newPlayer = new Player({ 
            whatsapp, 
            password, 
            ff_name, 
            ff_id,
            reg_fee: finalFee,
            payment_status: finalStatus
        });
        
        await newPlayer.save();
        
        if (finalFee === 0) {
            res.status(201).json({ message: `Registration Successful! ඔයා මුල්ම 10 දෙනා අතර සිටින බැවින් ලියාපදිංචිය නොමිලේ (Free)! 🔥 Slot: ${playerCount + 1}/10` });
        } else {
            res.status(201).json({ message: "Registration Successful! කරුණාකර ලියාපදිංචි ගාස්තුව (Rs.200) ගෙවා රිසිට්පත අප්ලෝඩ් කරන්න. 💸" });
        }

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
                reg_fee: player.reg_fee,
                payment_status: player.payment_status, 
                payment_slip: player.payment_slip,
                isBanned: player.isBanned 
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// === 🛡️ 2.1 [UPDATED FIXED] ⚡ AUTO-REFRESH PLAYER STATUS CHECK API ===
// Frontend එකෙන් තත්පර 10න් 10ට කෝල් කරද්දී ප්ලේයර්ගේ නම, පොයින්ට්ස් සේරම අප්ඩේට් වෙන්න මෙතනින් හැම ඩේටා එකක්ම යවනවා.
app.get('/api/players/:whatsapp', async (req, res) => {
    try {
        const { whatsapp } = req.params;
        const player = await Player.findOne({ whatsapp });
        
        if (!player) {
            return res.status(404).json({ isBanned: true, message: "Account deleted by Admin" });
        }
        
        // ✨ මෙන්න මෙතනට අපි අනෙක් හැම විස්තරයක්ම එකතු කරා (එතකොට undefined වෙන්නේ නෑ)
        res.json({
            whatsapp: player.whatsapp,
            ff_name: player.ff_name,
            ff_id: player.ff_id,
            points: player.points,
            reg_fee: player.reg_fee,
            payment_status: player.payment_status,
            isBanned: player.isBanned
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// === 👥 3. සේරම ප්ලේයර්ස්ලාගේ ලිස්ට් එක ඇඩ්මින්ට ලබාදෙන API එක ===
app.post('/api/admin/players', async (req, res) => {
    const { adminPassword } = req.body;
    if (adminPassword !== "admin123") return res.status(403).json({ message: "Invalid Admin Password!" });

    try {
        const players = await Player.find({}, 'whatsapp ff_name ff_id points reg_fee registered_at isBanned payment_slip payment_status').sort({ points: -1 });
        res.json(players);
    } catch (err) {
        res.status(500).json({ message: "Database error!" });
    }
});

// === 🏆 4. LEADERBOARD API ===
app.get('/api/leaderboard', async (req, res) => {
    try {
        const players = await Player.find().sort({ points: -1 }).limit(10);
        res.json(players);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// === ⚙️ 5. GET SETTINGS API ===
app.get('/api/settings', (req, res) => {
    res.json(tournamentSettings);
});

// === 🔐 6. UPDATE SETTINGS API (ADMIN ONLY) ===
app.post('/api/settings/update', (req, res) => {
    const { adminPassword, nextMatchTime, liveStatus, matchMessage, matchMap } = req.body;

    if (adminPassword !== "admin123") {
        return res.status(403).json({ success: false, message: "Wrong Admin Password! ❌" });
    }

    if (nextMatchTime) tournamentSettings.nextMatchTime = nextMatchTime;
    if (liveStatus) tournamentSettings.liveStatus = liveStatus;
    if (matchMessage) tournamentSettings.matchMessage = matchMessage;
    if (matchMap) tournamentSettings.matchMap = matchMap;

    res.json({ success: true, message: "Tournament Settings Updated Successfully! 🔥", settings: tournamentSettings });
});

// === 🌐 7. ADMIN HTML ROUTE ===
app.get('/sudda', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'sudda.html'));
});

// === 📈 8. ප්ලේයර් කෙනෙක්ගේ Points වෙනස් කිරීමේ API එක ===
app.post('/api/admin/update-points', async (req, res) => {
    const { adminPassword, whatsapp, newPoints } = req.body;
    if (adminPassword !== "admin123") return res.status(403).json({ message: "Invalid Admin Password!" });

    try {
        const player = await Player.findOneAndUpdate({ whatsapp }, { points: parseInt(newPoints) }, { new: true });
        if (!player) return res.status(404).json({ message: "Player not found!" });
        res.json({ message: `Points updated successfully for ${player.ff_name}!`, player });
    } catch (err) {
        res.status(500).json({ message: "Database error!" });
    }
});

// === 🚫 9. ප්ලේයර් කෙනෙක්ව Ban කිරීම හෝ Unban කිරීමේ API එක ===
app.post('/api/admin/toggle-ban', async (req, res) => {
    const { adminPassword, whatsapp, isBanned } = req.body;
    if (adminPassword !== "admin123") return res.status(403).json({ message: "Invalid Admin Password!" });

    try {
        const player = await Player.findOneAndUpdate({ whatsapp }, { isBanned: isBanned }, { new: true });
        if (!player) return res.status(404).json({ message: "Player not found!" });
        
        const statusText = isBanned ? "BANNED 🚫" : "UNBANNED ✅";
        res.json({ message: `Player ${player.ff_name} has been ${statusText}!` });
    } catch (err) {
        res.status(500).json({ message: "Database error!" });
    }
});

// === ✅ 💸 10. ප්ලේයර්ගේ Payment එක Approve කරන නව API එක ===
app.post('/api/admin/approve-payment', async (req, res) => {
    const { adminPassword, whatsapp } = req.body;
    if (adminPassword !== "admin123") return res.status(403).json({ message: "Invalid Admin Password!" });

    try {
        const player = await Player.findOneAndUpdate(
            { whatsapp: whatsapp },
            { payment_status: "Approved" },
            { new: true }
        );

        if (!player) return res.status(404).json({ message: "Player not found!" });

        res.json({ message: `${player.ff_name}ගේ ලියාපදිංචි ගාස්තුව සාර්ථකව Approve කරන ලදී! ✅` });
    } catch (err) {
        res.status(500).json({ message: "Database error!" });
    }
});

// === 🚀 SERVER LISTEN ===
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
