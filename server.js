const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const rateLimit = require('express-rate-limit'); // 👈 [NEW] Security Package එක එකතු කරා
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
    matchMap: "BERMUDA (CLASSIC)",
    ezCashNumber: "", // Frontend Input සඳහා Memory variables එකතු කරා
    bankDetails: ""
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

// === 🛡️ [NEW LOGIC] SPAM ANTI-BOT SECURITY CONTROLLER ===
// එකම IP එකකින් විනාඩි 15ක් ඇතුළත උපරිම 3 වතාවකට වඩා Register විය නොහැක.
const registerLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // විනාඩි 15 ක කාල සීමාවක්
    max: 3, // උපරිම අවස්ථා 3යි
    message: { message: "සීමාව ඉක්මවා ඇත! බොරු දත්ත ඇතුලත් කිරීමෙන් වළකින්න. කරුණාකර විනාඩි 15කින් නැවත උත්සාහ කරන්න. 🚫" },
    standardHeaders: true,
    legacyHeaders: false,
});


// === 💾 1. PLAYER REGISTRATION ROUTE (WITH ANTI-SPAM PROTECTION) ===
app.post('/api/register', registerLimiter, async (req, res) => { // 👈 registerLimiter එක මෙතනට දැම්මා
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
            res.status(201).json({ message: "Registration Successful! කරුණාකර ලියාපදිංචි ගාස්තුව (Rs.200) ගෙවා ਰਿਸිට්පත අප්ලෝඩ් කරන්න. 💸" });
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

// === 🛡️ 2.1 ⚡ AUTO-REFRESH PLAYER STATUS CHECK API ===
app.get('/api/players/:whatsapp', async (req, res) => {
    try {
        const { whatsapp } = req.params;
        const player = await Player.findOne({ whatsapp });
        
        if (!player) {
            return res.status(404).json({ isBanned: true, message: "Account deleted by Admin" });
        }
        
        res.json({
            whatsapp: player.whatsapp,
            ff_name: player.ff_name,
            ff_id: player.ff_id,
            points: player.points,
            reg_fee: player.reg_fee,
            payment_status: player.payment_status,
            payment_slip: player.payment_slip, 
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
    const { adminPassword, nextMatchTime, liveStatus, matchMessage, matchMap, ezCashNumber, bankDetails } = req.body;

    if (adminPassword !== "admin123") {
        return res.status(403).json({ success: false, message: "Wrong Admin Password! ❌" });
    }

    if (nextMatchTime) tournamentSettings.nextMatchTime = nextMatchTime;
    if (liveStatus) tournamentSettings.liveStatus = liveStatus;
    if (matchMessage) tournamentSettings.matchMessage = matchMessage;
    if (matchMap) tournamentSettings.matchMap = matchMap;
    if (ezCashNumber !== undefined) tournamentSettings.ezCashNumber = ezCashNumber;
    if (bankDetails !== undefined) tournamentSettings.bankDetails = bankDetails;

    res.json({ success: true, message: "Tournament Settings Updated Successfully! 🔥", settings: tournamentSettings });
});

// === 🌐 7. ADMIN HTML ROUTE ===
app.get('/sudda', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'sudda.html'));
});

// === 8. ප්ලේයර් කෙනෙක්ගේ Points වෙනස් කිරීමේ API එක ===
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

// === 🗑️ 10. ප්ලේයර් කෙනෙක්ව DATABASE එකෙන්ම DELETE කරන API එක ===
app.post('/api/admin/delete-player', async (req, res) => {
    const { adminPassword, whatsapp } = req.body;
    
    // Security check
    if (adminPassword !== "admin123") {
        return res.status(403).json({ message: "Invalid Admin Password! ❌" });
    }

    try {
        const player = await Player.findOneAndDelete({ whatsapp: whatsapp });
        
        if (!player) {
            return res.status(404).json({ message: "Player සොයා ගැනීමට නොහැකි වුණා! ❌" });
        }
        
        res.json({ message: `Player ${player.ff_name} can be deleted successfully! 🗑️` });
    } catch (err) {
        res.status(500).json({ message: "Database delete error!" });
    }
});

// =========================================================================
// === 📑 RECEIPT / APPROVAL SYSTEM ENDPOINTS FOR ADMIN PANEL ===
// =========================================================================

// 1. Pending තියෙන, රිසිට් එකක් upload කරපු ප්ලේයර්ස්ලා විතරක් ගන්න API එක
app.post('/api/admin/pending-receipts', async (req, res) => {
    const { adminPassword } = req.body;
    if (adminPassword !== "admin123") return res.status(403).json({ message: "Invalid Admin Password!" });

    try {
        const pendingPlayers = await Player.find({
            payment_status: "Pending",
            payment_slip: { $ne: "" }
        }, 'whatsapp ff_name ff_id payment_slip payment_status');
        
        const formattedPlayers = pendingPlayers.map(p => ({
            whatsapp: p.whatsapp,
            ff_name: p.ff_name,
            ff_id: p.ff_id,
            receipt_url: p.payment_slip, 
            payment_status: p.payment_status
        }));

        res.json(formattedPlayers);
    } catch (err) {
        res.status(500).json({ message: "Database error scanning receipts!" });
    }
});

// 2. රිසිට් එක Approve හෝ Reject කරන Main API එක
app.post('/api/admin/review-receipt', async (req, res) => {
    const { adminPassword, whatsapp, action } = req.body; 
    if (adminPassword !== "admin123") return res.status(403).json({ message: "Invalid Admin Password!" });

    try {
        let updateData = {};
        let successMessage = "";

        if (action === "APPROVE") {
            updateData = { payment_status: "Approved" };
            successMessage = "Payment Approved and Player Verified! ✅";
        } else if (action === "REJECT") {
            updateData = { payment_status: "Pending", payment_slip: "" };
            successMessage = "Receipt Rejected! Account set back to pending. ❌";
        } else {
            return res.status(400).json({ message: "Invalid Action!" });
        }

        const player = await Player.findOneAndUpdate({ whatsapp }, updateData, { new: true });
        if (!player) return res.status(404).json({ message: "Player not found!" });

        res.json({ message: `Player ${player.ff_name}: ${successMessage}` });
    } catch (err) {
        res.status(500).json({ message: "Database verification error!" });
    }
});

// === 🚀 SERVER LISTEN ===
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
