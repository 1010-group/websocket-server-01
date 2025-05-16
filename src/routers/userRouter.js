const express = require('express');
const User = require('../models/user');
const router = express.Router();

// Регистрация
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, profilePic, description, phone, birthDate } = req.body;

    const newUser = new User({
      username,
      email,
      password,
      profilePic,
      description,
      phone,
      birthDate,
    });

    await newUser.save();
    res.status(201).json({ message: 'Пользователь создан' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Логин
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (user && password === user.password) {
      res.json({ message: 'Успешный вход', user });
    } else {
      res.status(400).json({ message: 'Неверные данные' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Список всех пользователей
router.get('/users', async (req, res) => {
  try {
    const users = await User.find();
    res.json({ users });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Удаление пользователя по ID
router.delete('/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deletedUser = await User.findByIdAndDelete(id);

    if (!deletedUser) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    res.status(200).json({ message: 'Пользователь успешно удалён', user: deletedUser });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
