const express = require("express");
const Message = require("../models/messageModel");
const router = express.Router();

// Получить историю между двумя пользователями
router.get("/:user1/:user2", async (req, res) => {
  const { user1, user2 } = req.params;

  try {
    const messages = await Message.find({
      $or: [
        { from: user1, to: user2 },
        { from: user2, to: user1 },
      ],
    }).sort({ timestamp: 1 });

    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: "Ошибка сервера" });
  }
});

router.delete("/:messageId", async (req, res) => {
  const { messageId } = req.params;

  try {
    const deleted = await Message.findByIdAndDelete(messageId);
    if (!deleted) {
      return res.status(404).json({ message: "Сообщение не найдено" });
    }
    res.json({ message: "Сообщение удалено", deleted });
  } catch (err) {
    res.status(500).json({ message: "Ошибка сервера" });
  }
});





module.exports = router;
