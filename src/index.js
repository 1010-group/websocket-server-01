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

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  console.log('Новый пользователь', socket.id);

  socket.on('send_message', (data) => {
    console.log(data);
    io.emit('message', data);
  });
});

app.use('/api/users', userRouter);

server.listen(5000, () => {
  console.log('🚀 Сервер запущен на http://localhost:5000');
});
