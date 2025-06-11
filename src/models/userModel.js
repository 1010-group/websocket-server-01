const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
    },
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
      default:
        "https://cdn3d.iconscout.com/3d/premium/thumb/user-3d-illustration-download-in-png-blend-fbx-gltf-file-formats--avatar-profile-account-objects-pack-tools-equipment-illustrations-3408818@0.png?f=webp",
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
    role: {
      type: String,
      default: "user",
      enum: ["user", "admin", "moderator", "owner"],
    },
    isBanned: {
      type: Boolean,
      default: false,
    },
    isMuted: {
      type: Boolean,
      default: false,
    },
    isWarn: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model("Users1010", userSchema);
module.exports = User;