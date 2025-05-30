const express = require("express");
const router = express.Router();
const User = require("../../models/userModel");

// POST /api/users/register
router.post("/register", async (req, res) => {
  try {
    const {
      phone,
      username,
      nickname,
      image,
      password,
      confirmPassword,
      birthDate,
      description,
    } = req.body;

    if (!phone || !username || !nickname || !password || !confirmPassword || !image || !birthDate) {
      return res.status(400).json({ message: "Barcha majburiy maydonlarni to‘ldiring" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Parollar mos emas" });
    }

    const existingPhone = await User.findOne({ phone });
    if (existingPhone) {
      return res.status(400).json({ message: "Bu telefon raqam allaqachon ro‘yxatdan o‘tgan" });
    }

    const existingNickname = await User.findOne({ nickname });
    if (existingNickname) {
      return res.status(400).json({ message: "Bu nickname band" });
    }

    const user = new User({
      phone,
      username,
      nickname,
      image,
      password,
      birthDate,
      description,
    });

    await user.save();

    res.status(201).json({
      message: "Foydalanuvchi yaratildi",
      user: {
        _id: user._id,
        phone: user.phone,
        username: user.username,
        nickname: user.nickname,
        image: user.image,
        description: user.description,
        birthDate: user.birthDate,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik", error });
  }
});

// POST /api/users/login
router.post("/login", async (req, res) => {
  const { phone, password } = req.body;

  try {
    const user = await User.findOne({ phone });

    if (!user || user.password !== password) {
      return res.status(400).json({ message: "Noto‘g‘ri telefon yoki parol" });
    }

    res.status(200).json({
      message: "Tizimga muvaffaqiyatli kirdingiz",
      token: "test-token", // или реальный JWT
      user: {
        _id: user._id,
        phone: user.phone,
        username: user.username,
        nickname: user.nickname,
        image: user.image,
        description: user.description,
        birthDate: user.birthDate,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server xatoligi", error });
  }
});

module.exports = router;
