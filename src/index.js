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

  socket.on("user_joined", async (user) => {
    onlineUsers = onlineUsers.map((u) =>
      u._id === user._id
        ? { ...u, status: true, socketId: socket.id, image: user.image }
        : u
    );

    io.emit("online_users", onlineUsers);
  });

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

  socket.on("make_admin", async ({ userId, SelectedId, role }) => {
    try {
      const issuer = await userModel.findById(userId);
      const target = await userModel.findById(SelectedId);

      if (!issuer || !target) {
        return socket.emit("admin_result", {
          success: false,
          message: "Foydalanuvchi topilmadi",
        });
      }

      if (!["user", "admin", "moderator"].includes(role)) {
        return socket.emit("admin_result", {
          success: false,
          message: "Noto‘g‘ri rol tanlandi",
        });
      }
      // PAWNO
      // 🔒 faqat admin va owner
      if (
        !["owner"].includes(issuer.role) ||
        issuer._id === "682abf284c0a33a2571ac20f"
      ) {
        return socket.emit("admin_result", {
          success: false,
          message: "Sizda ruxsat yo‘q",
        });
      }

      // 🔐 owner ga tegmaysan
      if (target.role === "owner") {
        return socket.emit("admin_result", {
          success: false,
          message: "Owner rolini o‘zgartirish mumkin emas",
        });
      }

      // ❌ Agar allaqachon shu rol bo‘lsa
      if (target.role === role) {
        return socket.emit("admin_result", {
          success: false,
          message: `U foydalanuvchi allaqachon ${role} bo‘lgan`,
        });
      }

      // ✅ Bazani yangilaymiz
      target.role = role;
      await target.save();

      // 🔄 onlineUsers list'ini yangilaymiz (agar bor bo‘lsa)
      onlineUsers = onlineUsers.map((u) =>
        u._id === target._id.toString() ? { ...u, role: role } : u
      );
      io.emit("online_users", onlineUsers);

      // 🔔 Hamma userlarga umumiy e'lon
      const roleNameUz = {
        user: "oddiy foydalanuvchi",
        admin: "administrator",
        moderator: "moderator",
      }[role];

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
            message: `[System] ${fromName} ${toName} ni ${roleNameUz} qildi`,
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
          message: `[System] Sizning rolingiz ${roleNameUz} qilib o‘zgartirildi`,
        });
      }

      // 🔙 Issuerga natijani qaytaramiz
      socket.emit("admin_result", {
        success: true,
        message: `Siz ${toName} ni ${roleNameUz} qildingiz`,
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

  socket.on("ban_user", async ({ userId, SelectedId, reason }) => {
    try {
      console.log("ban_user", { userId, SelectedId, reason });
      const issuer = await userModel.findById(userId);
      const target = await userModel.findById(SelectedId);

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

      // 🔐 owner ga tegmaysan
      if (target.role === "owner") {
        return socket.emit("ban_result", {
          success: false,
          message: "Ownerga Ban berish mumkin emas",
        });
      }

      // 🔐 owner ga tegmaysan
      if (target.role === "admin" && issuer.role === "admin") {
        return socket.emit("ban_result", {
          success: false,
          message: "Admin Adminga Ban berish mumkin emas",
        });
      }

      // ❌ Agar allaqachon shu akkaunt ban olgan bo‘lsa
      if (target.isBanned) {
        return socket.emit("ban_result", {
          success: false,
          message: `U foydalanuvchi allaqachon ban bo‘lgan`,
        });
      }

      // ✅ Bazani yangilaymiz
      target.isBanned = true;
      target.isWarn = 0; // Reset warnings on ban
      await target.save();

      // 🔄 onlineUsers list'ini yangilaymiz (agar bor bo‘lsa)
      onlineUsers = onlineUsers.map((u) =>
        u._id === target._id.toString() ? { ...u, isBanned: true } : u
      );

      io.emit("online_users", onlineUsers);

      // 🔔 Hamma userlarga umumiy e'lon
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
          message: `[System] Siz ${issuer?.username} tomonidan ban qilindingiz`,
        });
      }

      // 🔙 Issuerga natijani qaytaramiz
      socket.emit("ban_result", {
        success: true,
        message: `Siz ${toName} ni ban qildingiz`,
        user: {
          _id: target._id.toString(),
          username: target.username,
          role: target.role,
          image: target.image,
        },
      });
    } catch (e) {
      console.log("SERVER ERROR", e);
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