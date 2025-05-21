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

const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

// API yo‘llar
app.use("/api/users", userRouter);

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:5174"], // YOKI https://yourfrontenddomain.com
    methods: ["GET", "POST"],
    credentials: true,
  },
});

let onlineUsers = [];

io.on("connection", async (socket) => {
  console.log("Новый пользователь", socket.id);
  const users = await userModel.find({});
  onlineUsers = users
  
  socket.on("user_joined", (user) => {
    console.log("User joined", user);

    const checkUser = onlineUsers.find((u) => u.phone === user.phone);
    if (!checkUser) {
      onlineUsers.push(user);
    }

    io.emit("user_joined", user);
    io.emit("online_users", onlineUsers);

    socket.on("disconnect", () => {
      console.log("User left: ", user.phone);
      const index = onlineUsers.findIndex((u) => u.phone === user.phone);
      if (index !== -1) {
        onlineUsers.splice(index, 1);
      }
      io.emit("online_users", onlineUsers);
    });
  });
});

app.use("/api/users", userRouter);

// Serverni ishga tushirish
server.listen(5000, () => {
  console.log("🚀 Сервер запущен на http://localhost:5000");
});
