const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const connectDB = require('./config/database');
const userRouter = require('./routers/userRouter');

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
    origin: "http://localhost:5173", // YOKI https://yourfrontenddomain.com
    methods: ["GET", "POST"],
    credentials: true
  }
});


const onlineUsers = []

io.on('connection', (socket) => {
  console.log('Новый пользователь', socket.id);

  socket.on("user_joined", (user) => {
    console.log("User joined", user);

    const checkUser = onlineUsers.find((u) => u.phone === user.phone);
    if (!checkUser) {
      onlineUsers.push(user);
    }

    io.emit("user_joined", user);
    io.emit("online_users", onlineUsers);
  })
});

app.use('/api/users', userRouter);

// Serverni ishga tushirish
server.listen(5000, () => {
  console.log('🚀 Сервер запущен на http://localhost:5000');
});
