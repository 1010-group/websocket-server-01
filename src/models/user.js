const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  profilePic: { type: String, default: '' },
  description: { type: String, default: '' },
  phone: { type: String, required: true, unique: true },
  birthDate: { type: Date, required: true },
}, { timestamps: true });

module.exports = mongoose.model('useer', UserSchema);