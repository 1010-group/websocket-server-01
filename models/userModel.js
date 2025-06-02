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
    fullName: {
      type: String,
      required: true, // отображаемое имя
      unique: true, // как @id
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
