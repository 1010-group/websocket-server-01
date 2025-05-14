const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const userRoutes = require("./routes/userRouter");

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());



// API yo‘llar
app.use("/api/users", userRoutes);

// Socket.io ulanish
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("Yangi foydalanuvchi ulandi:", socket.id);

  socket.on("send_message", (data) => {
    console.log("Xabar:", data);
    io.emit("message", data);
  });
});

// Serverni ishga tushirish
server.listen(5000, () => {
  console.log("🚀 Server ishga tushdi: http://localhost:5000");
});
