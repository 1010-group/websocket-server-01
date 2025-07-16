const express = require("express");
const router = express.Router();
const User = require("../models/userModel");

// POST /api/users/register
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

    console.log("req.body", req.body); // Debug log

    // Check required fields
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

    // Create user
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

// POST /api/users/warn/:id — issue a warning
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

// POST /api/users/login
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

// POST /api/users/unban/:id
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


  


module.exports = router;