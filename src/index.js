const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const userModel = require("./models/userModel");
const connectDB = require("./config/database");
const userRouter = require("./routers/userRouter");

connectDB();

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/users", userRouter);

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:5174"],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// ❗ Global onlineUsers
let onlineUsers = [];
// IIFE - Immediately Invoked Function Expression
(async () => {
  // Server boshlanganda barcha userlarni olish
  const allUsers = await userModel.find({});
  onlineUsers = allUsers.map(user => ({
    _id: user._id.toString(),
    username: user.username,
    phone: user.phone,
    profilePic: user.profilePic,
    status: false,
  }));
})();

io.on("connection", (socket) => {
  console.log("🔌 Yangi ulanish:", socket.id);

  socket.on("user_joined", (user) => {
    console.log("✅ User joined:", user.phone);

    onlineUsers = onlineUsers.map((u) =>
      u._id === user._id ? { ...u, status: true, socketId: socket.id } : u
    );

    io.emit("online_users", onlineUsers);

    socket.on("disconnect", () => {
      console.log("❌ User disconnected:", user.phone);

      onlineUsers = onlineUsers.map((u) =>
        u._id === user._id ? { ...u, status: false } : u
      );

      io.emit("online_users", onlineUsers);
    });
  });

  socket.on("send_message", (data) => {
    console.log("ALI: ", data)
    io.emit("receive_message", data);
  });
});

server.listen(5000, () => {
  console.log("🚀 Server ishga tushdi: http://localhost:5000");
});
