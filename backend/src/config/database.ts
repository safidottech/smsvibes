import mongoose from 'mongoose';

/**
 * Initializes the MongoDB connection using Mongoose ODM.
 * Loads the connection string from MONGODB_URI environment variable.
 */
const connectDB = async (): Promise<void> => {
  try {
    const connString = process.env.MONGODB_URI;

    if (!connString) {
      console.error('Error: MONGODB_URI is not defined in environment variables.');
      process.exit(1);
    }

    // Attempt to connect to MongoDB Atlas
    const conn = await mongoose.connect(connString);

    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error connecting to MongoDB: ${error.message}`);
    } else {
      console.error('An unknown error occurred during MongoDB connection.');
    }
    process.exit(1);
  }
};

// Event Listeners for connection lifecycle management
mongoose.connection.on('error', (err) => {
  console.error(`Mongoose connection error: ${err}`);
  // Future implementation: Trigger Redis Circuit Breaker if necessary
});

mongoose.connection.on('disconnected', () => {
  console.warn('Mongoose disconnected from MongoDB Atlas');
});

export default connectDB;
