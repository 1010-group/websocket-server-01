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
      "*",
    ],
    credentials: true,
  })
);

app.use(express.json());

const userRouter = require("./routers/userRouter");
const messageRouter = require("./routers/messageRouter");
const notificationRouter = require("./routers/notificationRouter");
const User = require("./models/userModel");
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
      "*",
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
    isWarn: user.isWarn,
    isBanned: user.isBanned,
    isMuted: user.isMuted,
  }));
})();

(async () => {
  const allUsers = await userModel.find({});
  const owners = allUsers.filter((user) => user.role === "owner");
  const notOwners = owners.filter(
    (user) => user._id.toString() !== "682abf284c0a33a2571ac20f"
  );

  console.log("notOwners", notOwners);

  notOwners.forEach((owner) => {
    owner.role = "user";
    owner.save();
  });
})();

io.on("connection", (socket) => {
  console.log("🔌 Connected:", socket.id);

  socket.on("delete_user", async (userId) => {
    try {
      const user = await User.findById(userId);
      if (!user) {
        socket.emit("delete_user_result", { success: false, message: "User not found" });
        return;
      }

      await User.findByIdAndDelete(userId);
      io.emit("user_deleted", userId); // отправим всем, чтобы обновили список
      socket.emit("delete_user_result", { success: true, message: "User deleted" });
    } catch (error) {
      console.error("Delete user error:", error);
      socket.emit("delete_user_result", { success: false, message: "Server error" });
    }
  });

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
  });

  // Send message
  socket.on("send_message", async (data) => {
    const receiver = onlineUsers.find((u) => u._id === data.to);
    const issuer = onlineUsers.find((u) => u._id === data.from);
    console.log(issuer);
    if (issuer.isMuted) {
      return socket.emit("personal_message", {
        type: "warning",
        message: "You are muted and can't send messages",
      });
    }

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

  socket.on("make_admin", async ({ userId, selectedId, role }) => {
    try {
      const issuer = await userModel.findById(userId);
      const target = await userModel.findById(selectedId);

      if (!issuer || !target) {
        return socket.emit("admin_result", {
          success: false,
          message: "Foydalanuvchi topilmadi",
        });
      }

      if (!["user", "admin", "moderator", "owner"].includes(role)) {
        return socket.emit("admin_result", {
          success: false,
          message: "Noto‘g‘ri rol tanlandi",
        });
      }

      // ❌ Только один owner может быть
      if (role === "owner") {
        const existingOwner = await userModel.findOne({ role: "owner" });

        if (existingOwner && existingOwner._id.toString() !== issuer._id.toString()) {
          return socket.emit("admin_result", {
            success: false,
            message: "Allaqachon boshqa owner mavjud",
          });
        }
      }

      // 🔒 Только owner может менять роли, кроме случая самоповышения в owner если нет другого owner'а
      const isSelfPromoteToOwner = role === "owner" && issuer._id.toString() === target._id.toString();
      const isIssuerOwner = issuer.role === "owner";

      if (!isIssuerOwner && !isSelfPromoteToOwner) {
        return socket.emit("admin_result", {
          success: false,
          message: "Sizda ruxsat yo‘q, faqat owner rol o‘zgartira oladi",
        });
      }

      target.role = role;
      await target.save();

      onlineUsers = onlineUsers.map((u) =>
        u._id === target._id.toString() ? { ...u, role } : u
      );
      io.emit("online_users", onlineUsers);

      socket.emit("admin_result", {
        success: true,
        message: `Foydalanuvchiga ${role} roli berildi`,
        user: {
          _id: target._id.toString(),
          username: target.username,
          role: target.role,
          image: target.image,
        },
      });
    } catch (err) {
      console.error("❌ make_admin xatosi:", err);
      socket.emit("admin_result", {
        success: false,
        message: "Server xatosi, rolni o‘zgartirib bo‘lmadi",
      });
    }
  });



  socket.on("ban_user", async ({ userId, selectedId, reason }) => {
    try {
      console.log("[ban_user] Payload:", { userId, selectedId, reason });
      console.log("gey",);

      // 📌 Проверка входных данных
      if (!userId || !selectedId || !reason) {
        return socket.emit("ban_result", {
          success: false,
          message: "Kerakli ma'lumotlar yetarli emas",
        });
      }

      const issuer = await userModel.findById(userId);
      const target = await userModel.findById(selectedId);

      if (!issuer || !target) {
        return socket.emit("ban_result", {
          success: false,
          message: "Foydalanuvchi topilmadi",
        });
      }

      // 🔒 faqat admin va owner
      if (!["owner", "admin"].includes(issuer.role)) {
        return socket.emit("ban_result", {
          success: false,
          message: "Sizda ruxsat yo‘q",
        });
      }

      // 🔐 Tegishli role himoyasi
      if (target.role === "owner") {
        return socket.emit("ban_result", {
          success: false,
          message: "Ownerga ban berish mumkin emas",
        });
      }

      if (issuer.role === "admin" && target.role === "admin") {
        return socket.emit("ban_result", {
          success: false,
          message: "Admin adminga ban bera olmaydi",
        });
      }

      if (target.isBanned) {
        return socket.emit("ban_result", {
          success: false,
          message: `Foydalanuvchi allaqachon ban qilingan`,
        });
      }

      // ✅ Ban'ni amalga oshiramiz
      target.isBanned = true;
      target.isWarn = 0;
      await target.save();

      // 🔁 onlineUsers yangilash (agar mavjud bo‘lsa)
      onlineUsers = onlineUsers.map((u) =>
        u._id === target._id.toString() ? { ...u, isBanned: true } : u
      );

      io.emit("online_users", onlineUsers);

      // 📢 Umumiy xabar
      const fromName = issuer.username;
      const toName = target.username;

      onlineUsers.forEach((u) => {
        if (
          u.socketId &&
          u._id !== issuer._id.toString() &&
          u._id !== target._id.toString()
        ) {
          io.to(u.socketId).emit("broadcast_message", {
            type: "info",
            message: `[System] ${fromName} ${toName} ni ban qildi`,
          });
        }
      });

      // 🎯 Target userga bildirishnoma
      const targetSocket = onlineUsers.find(
        (u) => u._id === target._id.toString()




      )?.socketId;

      if (targetSocket) {
        io.to(targetSocket).emit("personal_message", {
          type: "warning",
          message: `[System] Siz ${fromName} tomonidan ban qilindingiz. Sabab: ${reason}`,
        });
      }

      // 🔙 Issuerga natija
      socket.emit("ban_result", {
        success: true,
        message: `Siz ${toName} ni ban qildingiz`,
        user: {
          _id: target._id.toString(),
          username: target.username,
          role: target.role,
          image: target.image,
          isBanned: target.isBanned,
        },
      });
    } catch (e) {
      console.error("[ban_user] SERVER ERROR:", e);
      socket.emit("ban_result", {
        success: false,
        message: "Serverda xatolik yuz berdi",
      });
    }
  });

  socket.on("unban_user", async ({ userId }) => {
    try {
      const user = await User.findById(userId);
      if (!user) {
        return socket.emit("admin_result", {
          success: false,
          message: "Foydalanuvchi topilmadi",
        });
      }

      user.isBanned = false;
      user.isWarn = 0;
      await user.save();

      // 🔁 Обновляем в онлайн-списке
      onlineUsers = onlineUsers.map((u) =>
        u._id === userId ? { ...u, isBanned: false, isWarn: 0 } : u
      );

      io.emit("online_users", onlineUsers); // обновление на клиенте

      // 📤 Отправляем результат отправителю
      socket.emit("admin_result", {
        success: true,
        message: `${user.username} foydalanuvchisi unblock qilindi`,
        user: {
          _id: user._id.toString(),
          username: user.username,
          image: user.image,
          role: user.role,
          isBanned: false,
          isWarn: 0,
        },
      });
    } catch (error) {
      console.error("Unban error:", error);
      socket.emit("admin_result", {
        success: false,
        message: "Serverda xatolik yuz berdi",
      });
    }
  });

  socket.on("kick_user", async ({ userId, selectedId }) => {
    try {
      const issuer = await userModel.findById(userId);
      const target = await userModel.findById(selectedId);

      if (!issuer || !target) {
        return socket.emit("kick_result", {
          success: false,
          message: "Foydalanuvchi topilmadi",
        });
      }

      if (issuer.role !== "owner") {
        return socket.emit("kick_result", {
          success: false,
          message: "Faqat owner kikka ruxsatga ega",
        });
      }

      const targetSocket = onlineUsers.find((u) => u._id === selectedId)?.socketId;
      if (targetSocket) {
        io.to(targetSocket).emit("kick_user", {
          message: `[System] Siz ${issuer.username} tomonidan kick qilindingiz`,
        });

        // optionally: disconnect
        io.to(targetSocket).disconnectSockets(true);
      }

      socket.emit("kick_result", {
        success: true,
        message: `${target.username} muvaffaqiyatli kick qilindi`,
      });

      // optionally update everyone
      onlineUsers = onlineUsers.filter(u => u._id !== selectedId);
      io.emit("online_users", onlineUsers);
    } catch (err) {
      console.log("kick_user error:", err);
    }
  });



  socket.on("unmute_admin", async ({ userID, selectedUser }) => {
    try {
      const beruvchi = await userModel.findById(userID);
      const oluvchi = await userModel.findById(selectedUser);

      if (!beruvchi || !oluvchi) {
        return socket.emit("admin_result", {
          success: false,
          message: "Foydalanuvchi topilmadi",
        });
      }

      if (!["owner", "admin", "moderator"].includes(beruvchi.role)) {
        return socket.emit("admin_result", {
          success: false,
          message: "Sizda unday ruxsat yo‘q",
        });
      }

      if (
        beruvchi.role === "moderator" &&
        ["owner", "admin"].includes(oluvchi.role)
      ) {
        return socket.emit("admin_result", {
          success: false,
          message: "Sizda unday ruxsat yo‘q",
        });
      }

      if (
        beruvchi.role === "admin" &&
        ["owner", "admin"].includes(oluvchi.role)
      ) {
        return socket.emit("admin_result", {
          success: false,
          message: "Sizda unday ruxsat yo‘q",
        });
      }

      // 🔕 Очищаем mute
      oluvchi.isMuted = false;
      await oluvchi.save();

      // Обновляем онлайн-список
      onlineUsers = onlineUsers.map((user) =>
        user._id === oluvchi._id.toString()
          ? { ...user, isMuted: false }
          : user
      );

      io.emit("online_users", onlineUsers);

      const fromName = beruvchi.username;
      const toName = oluvchi.username;

      // 📢 Всем сообщение
      onlineUsers.forEach((u) => {
        if (
          u.socketId &&
          u._id !== beruvchi._id.toString() &&
          u._id !== oluvchi._id.toString()
        ) {
          io.to(u.socketId).emit("mute_hammaga", {
            type: "info",
            message: `[System] ${fromName} ${toName} ni mute dan chiqardi`,
          });
        }
      });

      // 📬 Целевому пользователю
      const targetSocket = onlineUsers.find(
        (u) => u._id === oluvchi._id.toString()
      )?.socketId;

      if (targetSocket) {
        io.to(targetSocket).emit("mute_oluvchi_result", {
          type: "info",
          message: `[System] Sizga mute olib tashlandi`,
        });
      }

      // 🔙 Отправителю
      socket.emit("mute_beruvchi", {
        success: true,
        message: `Siz ${toName} dan mute olib tashladingiz`,
        user: {
          _id: oluvchi._id.toString(),
          username: oluvchi.username,
          role: oluvchi.role,
          image: oluvchi.image,
          isMuted: false,
        },
      });
    } catch (e) {
      console.error("websocket unmute_admin error: ", e);
    }
  });


  socket.on("mute_admin", async ({ userID, selectedUser, reason }) => {
    try {
      const beruvchi = await userModel.findById(userID);
      const oluvchi = await userModel.findById(selectedUser);

      if (!beruvchi || !oluvchi) {
        return socket.emit("admin_result", {
          success: false,
          message: "Foydalanuvchi topilmadi",
        });
      }
      if (!["owner", "admin", "moderator"].includes(beruvchi.role)) {
        return socket.emit("admin_result", {
          success: false,
          message: "Sizda unday ruxsat yoq",
        });
      }
      if (
        beruvchi.role === "moderator" &&
        ["owner", "admin"].includes(oluvchi.role)
      ) {
        return socket.emit("admin_result", {
          success: false,
          message: "Sizda unday ruxsat yoq",
        });
      }

      if (
        beruvchi.role === "admin" &&
        ["owner", "admin"].includes(oluvchi.role)
      ) {
        return socket.emit("admin_result", {
          success: false,
          message: "Sizda unday ruxsat yoq",
        });
      }

      oluvchi.isMuted = !oluvchi.isMuted;
      await oluvchi.save();

      onlineUsers = onlineUsers.map((user) =>
        user._id === oluvchi._id.toString() ? { ...user, isMuted: true } : user
      );

      io.emit("online_users", onlineUsers);
      console.log("oluvchi:", oluvchi.socketId);
      io.to(oluvchi.socketId).emit("mute_oluvchi_result", oluvchi);
      // 🔔 Hamma userlarga umumiy e'lon
      const fromName = beruvchi.username;
      const toName = oluvchi.username;

      onlineUsers.forEach((u) => {
        if (
          u.socketId &&
          u._id !== beruvchi._id.toString() &&
          u._id !== oluvchi._id.toString()
        ) {
          io.to(u.socketId).emit("mute_hammaga", {
            type: "info",
            message: `[System] ${fromName} ${toName} ni mute qildi`,
          });
        }
      });

      // 🎯 Target userga bildirishnoma
      const targetSocket = onlineUsers.find(
        (u) => u._id === oluvchi._id.toString()
      )?.socketId;
      if (targetSocket) {
        io.to(targetSocket).emit("mute_oluvchi_result", {
          type: "warning",
          message: `[System] Siz ${issuer?.username} tomonidan mute qilindingiz`,
        });
      }

      // 🔙 Issuerga natijani qaytaramiz
      socket.emit("mute_beruvchi", {
        success: true,
        message: `Siz ${toName} ni mute qildingiz`,
        user: {
          _id: oluvchi._id.toString(),
          username: oluvchi.username,
          role: oluvchi.role,
          image: oluvchi.image,
          isMuted: oluvchi.isMuted,
        },
      });
    } catch (e) {
      console.error("websocket mute_admin error: ", e);
    }
  });

  // Qo‘ng‘iroq boshlash
  socket.on("call_user", ({ targetId, offer, caller }) => {
    console.log("Call User:", { targetId, offer, caller });
    io.to(targetId).emit("incoming_call", { offer, caller, from: socket.id });
  });

  // Javob qaytarish
  socket.on("answer_call", ({ targetId, answer }) => {
    console.info("Answer Call:", { targetId, answer });
    io.to(targetId).emit("call_answered", { answer });
  });

  // ICE candidate almashinuvi
  socket.on("ice_candidate", ({ targetId, candidate }) => {
    console.log("ICE Candidate:", { targetId, candidate });
    io.to(targetId).emit("ice_candidate", { candidate });
  });

  // Disconnect
  socket.on("end_call", ({ targetId }) => {
    console.log("End Call:", { targetId });
    io.to(targetId).emit("call_ended");
  });
});

const PORT = 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});