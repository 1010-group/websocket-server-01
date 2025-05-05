// server.js или app.js
const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const cors = require('cors')

const app = express()
app.use(cors())
const server = http.createServer(app)

const io = new Server(server, {
  cors: {
    origin: '*', // фронт адрес
    methods: ['GET', 'POST'],
  },
})



server.listen(5000, () => {
  console.log('🚀 Сервер запущен на http://localhost:5000')
})
