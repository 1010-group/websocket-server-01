const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const connectDB = require("./config/database");
const userModel = require("./models/userModel");
const Message = require("./models/messageModel");

connectDB();

const app = express();
app.use(
  cors({
    origin: [
      "https://websocket-client-01.onrender.com",
      "http://localhost:5173",
      "http://localhost:5174",
    ],
    credentials: true,
  })
);

app.use(express.json());

const userRouter = require("./routers/userRouter");
const messageRouter = require("./routers/messageRouter");
app.use("/api/users", userRouter);
app.use("/api/messages", messageRouter);

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [
      "https://websocket-client-01.onrender.com",
      "http://localhost:5173",
      "http://localhost:5174",
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// ⬇ Глобальный список онлайн-пользователей
let onlineUsers = [];

(async () => {
  const allUsers = await userModel.find({});
  onlineUsers = allUsers.map((user) => ({
    _id: user._id.toString(),
    username: user.username,
    phone: user.phone,
    profilePic: user.profilePic,
    status: false,
    typing: false,
  }));
})();

io.on("connection", (socket) => {
  console.log("🔌 Подключился:", socket.id);

  // ⬇ Получение истории сообщений между двумя пользователями
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

  // ⬇ Пользователь присоединился
  socket.on("user_joined", (user) => {
    onlineUsers = onlineUsers.map((u) =>
      u._id === user._id ? { ...u, status: true, socketId: socket.id } : u
    );
    io.emit("online_users", onlineUsers);
  });

  // ⬇ Получение сообщения
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

  // ⬇ Когда кто-то печатает
  socket.on("typing", (data) => {
    const receiver = onlineUsers.find((u) => u._id === data.to);
    if (receiver?.socketId) {
      io.to(receiver.socketId).emit("typed", {
        from: data.from,
        typing: true,
      });
    }
  });

  // ⬇ При отключении
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
