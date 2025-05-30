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
    nickname: {
      type: String,
      required: true, // отображаемое имя
      unique: true, // как @id
    },
    image: {
      type: String,
      required: true,
    },
    password: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: "",
    },
    birthDate: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model("Users1010", userSchema);
module.exports = User;
