const express = require("express");
const router = express.Router();
const User = require("../models/userModel");

router.post("/register", async (req, res) => {
  try {
    const {
      phone,
      username,
      image,
      fullName,
      birthDate,
      description,
      password,
      confirmPassword,
    } = req.body;

    console.log("req.body", req.body);

    if (!phone || !username || !password || !confirmPassword || !fullName) {
      return res
        .status(400)
        .json({ message: "All required fields must be filled" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "This phone number is already registered" });
    }

    const user = new User({
      phone,
      username,
      image,
      fullName,
      birthDate,
      description,
      password,
    });

    await user.save();

    res.status(201).json({ message: "User created", user });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

router.post("/warn/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.isWarn += 1;

    if (user.isWarn >= 3) {
      user.isBanned = true;
      await user.save();
      return res.status(200).json({ message: "User received 3 warnings and was banned", banned: true });
    }

    await user.save();
    res.status(200).json({ message: `Warning issued. Total: ${user.isWarn}/3` });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ message: "Phone and password are required" });
    }

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    if (user.isBanned) {
      return res.status(403).json({ message: "This user is banned" });
    }

    if (user.password !== password) {
      return res.status(400).json({ message: "Incorrect password" });
    }

    res.status(200).json({ message: "Login successful", user });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

router.post("/unban/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.isBanned = false;
    user.isWarn = 0;
    await user.save();

    res.json({ message: "User unbanned", user });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});
router.put('/mute/:id', async (req, res) => {
  try {
    const user = await userModel.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.isMuted = true;
    await user.save();

    res.json({ success: true, message: 'User muted', user });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/users/unmute/:id
router.put('/unmute/:id', async (req, res) => {
  try {
    const user = await userModel.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.isMuted = false;
    await user.save();

    res.json({ success: true, message: 'User unmuted', user });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;