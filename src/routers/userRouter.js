const express = require("express");
const router = express.Router();
const User = require("../models/userModel");

// POST /api/users/register
router.post("/register", async (req, res) => {
  try {
    const { phone, username, image, password, confirmPassword } = req.body;
    console.log("req", req.body)
    if (!phone || !username || !password || !confirmPassword) {
      return res
        .status(400)
        .json({ message: "Barcha majburiy maydonlarni to‘ldiring" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Parollar mos emas" });
    }

    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "Bu telefon raqam allaqachon ro‘45yxatdan o‘tgan" });
    }

    const user = new User({ phone, username, image, password });
    await user.save();

    res.status(201).json({ message: "Foydalanuvchi yaratildi", user });
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik", error });
  }
});

// POST /api/users/login
router.post("/login", async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ message: "Telefon va parol majburiy" });
    }

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(400).json({ message: "Foydalanuvchi topilmadi" });
    }

    if (user.password !== password) {
      return res.status(400).json({ message: "Parol noto‘g‘ri" });
    }

    res.status(200).json({ message: "Login muvaffaqiyatli", user });
  } catch (error) {
    res.status(500).json({ message: "Server xatosi", error });
  }
});


module.exports = router;
