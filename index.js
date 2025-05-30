const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const connectDB = require("./src/config/database");
const userModel = require("./models/userModel");
const Message = require("./models/messageModel");

connectDB();

const app = express();
app.use(cors());
app.use(express.json());

const userRouter = require("./src/routers/userRouter");
const messageRouter = require("./src/routers/messageRouter");
app.use("/api/users", userRouter);
app.use("/api/messages", messageRouter);

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:5174"],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Глобальный список онлайн-пользователей
let onlineUsers = [];

(async () => {
  const allUsers = await userModel.find({});
  onlineUsers = allUsers.map((user) => ({
    _id: user._id.toString(),
    username: user.username,
    phone: user.phone,
    profilePic: user.image,       // <-- исправлено на image
    description: user.description, // добавлено
    birthDate: user.birthDate,    // добавлено
    status: false,
    typing: false,
  }));
})();

io.on("connection", (socket) => {
  console.log("🔌 Подключился:", socket.id);

  socket.on("get_history", async ({ from, to }) => {
    try {
      const messages = await Message.find({
        $or: [
          { from: from, to: to },
          { from: to, to: from },
        ],
      }).sort({ timestamp: 1 });

      socket.emit("chat_history", messages);
    } catch (err) {
      console.error("❌ Ошибка истории:", err);
    }
  });

  socket.on("delete_message", async ({ messageId }) => {
    try {
      const deleted = await Message.findByIdAndDelete(messageId);
      if (deleted) {
        io.emit("message_deleted", messageId);
      }
    } catch (err) {
      console.error("Ошибка при удалении сообщения:", err);
    }
  });

  // Пользователь присоединился
 socket.on("user_joined", async (user) => {
  try {
    const dbUser = await userModel.findById(user._id);

    if (!dbUser) return;

    const fullUser = {
      _id: dbUser._id.toString(),
      username: dbUser.username,
      nickname: dbUser.nickname,
      phone: dbUser.phone,
      profilePic: dbUser.image,
      description: dbUser.description || "",
      birthDate: dbUser.birthDate || null,
      status: true,
      socketId: socket.id,
      typing: false,
    };

    const existing = onlineUsers.find((u) => u._id === fullUser._id);

    if (existing) {
      onlineUsers = onlineUsers.map((u) =>
        u._id === fullUser._id ? { ...fullUser } : u
      );
    } else {
      onlineUsers.push(fullUser);
    }

    io.emit("online_users", onlineUsers);
  } catch (err) {
    console.error("Ошибка при user_joined:", err);
  }
});


  // Получение сообщения
  socket.on("send_message", async (data) => {
    const receiver = onlineUsers.find((u) => u._id === data.to);

    try {
      const savedMessage = await Message.create({
        from: data.from,
        to: data.to,
        text: data.text,
        timestamp: data.timestamp || new Date(),
      });

      if (receiver?.socketId) {
        io.to(receiver.socketId).emit("receive_message", {
          ...data,
          _id: savedMessage._id,
        });
      }
    } catch (err) {
      console.error("❌ Ошибка при сохранении:", err);
    }
  });

  // Когда кто-то печатает
  socket.on("typing", (data) => {
    const receiver = onlineUsers.find((u) => u._id === data.to);
    if (receiver?.socketId) {
      io.to(receiver.socketId).emit("typed", {
        from: data.from,
        typing: true,
      });
    }
  });

  // При отключении
  socket.on("disconnect", () => {
    onlineUsers = onlineUsers.map((u) =>
      u.socketId === socket.id ? { ...u, status: false, socketId: null } : u
    );
    io.emit("online_users", onlineUsers);
  });
});

server.listen(5000, () => {
  console.log("🚀 Сервер запущен: http://localhost:5000");
});
