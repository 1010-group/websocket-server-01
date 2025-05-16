const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    await mongoose.connect("mongodb+srv://polatbek2010:polatbek909872777@useer.wcdenxp.mongodb.net/?retryWrites=true&w=majority&appName=useer");
    console.log('MongoDB connected!');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

module.exports = connectDB;