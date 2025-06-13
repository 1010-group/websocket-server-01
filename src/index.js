const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const connectDB = require("./config/database");
const userModel = require("./models/userModel");
const Message = require("./models/messageModel");
const Notification = require("./models/notificationModel");

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
const notificationRouter = require("./routers/notificationRouter");
app.use("/api/users", userRouter);
app.use("/api/messages", messageRouter);
app.use("/api/notifications", notificationRouter);

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

// Global list of online users
let onlineUsers = [];

(async () => {
  const allUsers = await userModel.find({});
  onlineUsers = allUsers.map((user) => ({
    _id: user._id.toString(),
    username: user.username,
    phone: user.phone,
    image: user.image,
    role: user.role,
    status: false,
    typing: false,
  }));
})();

io.on("connection", (socket) => {
  console.log("🔌 Connected:", socket.id);

  socket.on("check_warns", async ({ userId }) => {
    try {
      const user = await userModel.findById(userId);
      if (!user) return;

      socket.emit("warn_status", {
        isWarn: user.isWarn,
        isBanned: user.isBanned,
      });
    } catch (err) {
      console.error("Error checking warnings:", err);
    }
  });

  socket.on("warn_user", async ({ userId }) => {
    try {
      const user = await userModel.findById(userId);
      if (!user) {
        return socket.emit("warn_result", {
          success: false,
          message: "User not found",
        });
      }

      if (user.isBanned) {
        return socket.emit("warn_result", {
          success: false,
          message: "User is already banned",
        });
      }

      // ❌ Блокируем предупреждение для owner
      if (user.role === "owner") {
        return socket.emit("warn_result", {
          success: false,
          message: "You are not allowed to warn an owner",
        });
      }

      user.isWarn = (user.isWarn || 0) + 1;
      if (user.isWarn >= 3) {
        user.isBanned = true;
      }

      await user.save();

      // Create notification for warned user
      const notification = await Notification.create({
        userId: user._id,
        type: user.isBanned ? "ban" : "warning",
        message: user.isBanned
          ? `You have been banned due to receiving 3 warnings`
          : `You received a warning (${user.isWarn}/3)`,
        fromUser: { _id: null, username: "System", image: null },
        read: false,
      });

      // Notify the admin who issued the warning
      socket.emit("warn_result", {
        success: true,
        message: user.isBanned
          ? "User received 3/3 warnings and was banned"
          : `Warning: ${user.isWarn}/3`,
        user: {
          _id: user._id.toString(),
          username: user.username,
          isWarn: user.isWarn,
          isBanned: user.isBanned,
          image: user.image,
          phone: user.phone,
        },
      });

      // Notify the warned user if they are online
      const warnedUser = onlineUsers.find((u) => u._id === userId);
      if (warnedUser?.socketId) {
        io.to(warnedUser.socketId).emit("warn_status", {
          isWarn: user.isWarn,
          isBanned: user.isBanned,
        });
        io.to(warnedUser.socketId).emit("new_notification", notification);
      }
    } catch (err) {
      console.error("Error issuing warning:", err);
      socket.emit("warn_result", {
        success: false,
        message: "Server error while issuing warning",
      });
    }
  });

  // Get message history between two users
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
      console.error("❌ History error:", err);
    }
  });

  // User joined
  socket.on("user_joined", async (user) => {
    onlineUsers = onlineUsers.map((u) =>
      u._id === user._id
        ? { ...u, status: true, socketId: socket.id, image: user.image }
        : u
    );
    io.emit("online_users", onlineUsers);

    // Notify friends (assuming friends are stored in user model)
    // const currentUser = await userModel.findById(user._id);
    // if (currentUser?.friends) {
    //   for (const friendId of currentUser?.friends) {
    //     const friend = onlineUsers.find((u) => u._id === friendId.toString());
    //     if (friend?.socketId) {
    //       const notification = await Notification.create({
    //         userId: friendId,
    //         type: 'message',
    //         message: `${user.username} is now online`,
    //         fromUser: {
    //           _id: user._id,
    //           username: user.username,
    //           image: user.image,
    //         },
    //         read: false,
    //       });
    //       io.to(friend.socketId).emit("new_notification", notification);
    //     }
    //   }
    // }
  });

  // Send message
  socket.on("send_message", async (data) => {
    const receiver = onlineUsers.find((u) => u._id === data.to);

    try {
      const savedMessage = await Message.create({
        from: data.from,
        to: data.to,
        text: data.text,
        timestamp: data.timestamp || new Date(),
      });

      const sender = await userModel.findById(data.from);

      // Create notification for receiver
      const notification = await Notification.create({
        userId: data.to,
        type: "message",
        message: `New message from ${sender.username}`,
        fromUser: {
          _id: sender._id.toString(),
          username: sender.username,
          image: sender.image,
        },
        read: false,
      });

      if (receiver?.socketId) {
        io.to(receiver.socketId).emit("receive_message", {
          ...data,
          _id: savedMessage._id,
        });
        io.to(receiver.socketId).emit("new_notification", notification);
      }
    } catch (err) {
      console.error("❌ Error saving message:", err);
    }
  });

  // Typing event
  socket.on("typing", (data) => {
    const receiver = onlineUsers.find((u) => u._id === data.to);
    if (receiver?.socketId) {
      io.to(receiver.socketId).emit("typed", {
        from: data.from,
        typing: true,
      });
    }
  });

  // User left
  socket.on("user_left", (user) => {
    onlineUsers = onlineUsers.map((u) =>
      u._id === user._id ? { ...u, status: false, socketId: null } : u
    );
    io.emit("online_users", onlineUsers);
  });

  // On disconnect
  socket.on("disconnect", () => {
    onlineUsers = onlineUsers.map((u) =>
      u.socketId === socket.id ? { ...u, status: false, socketId: null } : u
    );
    io.emit("online_users", onlineUsers);
    console.log("🔌 Disconnected:", socket.id);
  });

  socket.on("make_admin", async ({ userId, SelectedId, role }) => {
    try {
      const issuer = await userModel.findById(userId);
      const target = await userModel.findById(SelectedId);

      if (!issuer || !target) {
        return socket.emit("admin_result", {
          success: false,
          message: "Пользователь не найден",
        });
      }

      // 🔐 Защита: нельзя менять роль владельца
      if (target.role === "owner") {
        return socket.emit("admin_result", {
          success: false,
          message: "Роль владельца нельзя изменить",
        });
      }

      // 🔒 Только owner и admin могут менять роли
      if (issuer.role !== "owner" && issuer.role !== "admin") {
        return socket.emit("admin_result", {
          success: false,
          message: "У вас нет прав для изменения ролей",
        });
      }

      // 🛠 Изменяем роль
      target.role = role;
      await target.save();

      const fromName = `${issuer.role === "owner" ? "Owner" : "Admin"} ${
        issuer.username
      }`;
      const toName = `${target.username}`;
      const roleRus =
        role === "admin"
          ? "Администратором"
          : role === "moderator"
          ? "Модератором"
          : "Пользователем";

      // ✅ 1. Отправляем всем (кроме назначившего и назначенного)
      onlineUsers.forEach((u) => {
        if (
          u._id !== issuer._id.toString() &&
          u._id !== target._id.toString() &&
          u.socketId
        ) {
          io.to(u.socketId).emit("broadcast_message", {
            type: "info",
            message: `[Всем] ${fromName} назначил(-а) ${toName} на роль ${roleRus}`,
          });
        }
      });

      // ✅ 2. Отправляем назначенному
      const targetSocket = onlineUsers.find(
        (u) => u._id === target._id.toString()
      )?.socketId;
      if (targetSocket) {
        io.to(targetSocket).emit("personal_message", {
          type: "warning",
          message: `[SelectedUser] ${fromName} изменил вашу роль: ${roleRus}`,
        });
      }

      // ✅ 3. Отправляем назначившему
      socket.emit("admin_result", {
        success: true,
        message: `[Мне] Вы изменили игроку ${toName} роль: ${roleRus}`,
        user: {
          _id: target._id.toString(),
          username: target.username,
          role: target.role,
          image: target.image,
        },
      });

      // (Опционально) создаём запись в Notification:
      // await Notification.create({
      //   userId: target._id,
      //   type: "role_change",
      //   message: `${fromName} изменил вашу роль: ${roleRus}`,
      //   fromUser: {
      //     _id: issuer._id,
      //     username: issuer.username,
      //     image: issuer.image,
      //   },
      //   read: false,
      // });
    } catch (err) {
      console.error("❌ Ошибка в make_admin:", err);
      socket.emit("admin_result", {
        success: false,
        message: "Ошибка сервера при смене роли",
      });
    }
  });
});

server.listen(5000, () => {
  console.log("🚀 Server started: http://localhost:5000");
});
