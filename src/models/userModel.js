// models/userModel.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    unique: true
  },
  username: {
    type: String,
    required: true
  },
  image: {
    type: String,
    required: false
  },
  password: {
    type: String,
    required: true
  },
  confirmPassword: {
    type: String,
    required: true,
    validate: {
      validator: function (value) {
        return value === this.password;
      },
      message: 'Пароли не совпадают'
    }
  }
}, {
  timestamps: true
});

// Убираем confirmPassword перед сохранением
userSchema.pre('save', function (next) {
  this.confirmPassword = undefined;
  next();
});

const User = mongoose.model('User', userSchema);
module.exports = User;
