const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect(
      "mongodb+srv://Alihan984442013@cluster0.qn6t2.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
    );
    console.log("MongoDB is connected✅");
  } catch (e) {
    console.log("error connection: ", e);
  }
};

module.exports = connectDB;
