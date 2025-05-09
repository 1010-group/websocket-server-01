// server.js или app.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const connectDB = require("./config/db");

const app = express();
app.use(cors());
const server = http.createServer(app);

connectDB()

const io = new Server(server, {
  cors: {
    origin: "*", // фронт адрес
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("Новый пользователь: ", socket.id);

  socket.on("send_message", (data) => {
    console.log(data)
    io.emit("message", data)
  })
});

server.listen(5000, () => {
  console.log("🚀 Сервер запущен на http://localhost:5000");
});
