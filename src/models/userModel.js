const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: true,
      unique: true,
    },
    username: {
      type: String,
      required: true,
    },
    image: {
      type: String,
    },
    password: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    birthDate: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model("Users1010", userSchema);
module.exports = User;
