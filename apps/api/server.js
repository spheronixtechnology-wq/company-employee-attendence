require('dotenv').config();
const http = require('http');
const app = require('./src/app');
const connectDB = require('./src/config/db');
const { initCronJobs } = require('./src/jobs/allJobs');
const { initSocket } = require('./src/socket');

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// Attach Socket.io
initSocket(server);

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`╔══════════════════════════════════════════════════════════╗`);
    console.log(`║   Attendance & Performance Tracking System — API         ║`);
    console.log(`║   Mode: ${process.env.NODE_ENV?.padEnd(42) || 'development'.padEnd(42)} ║`);
    console.log(`║   Port: ${String(PORT).padEnd(42)} ║`);
    console.log(`║   WebSocket: Active (Socket.io)                          ║`);
    console.log(`╚══════════════════════════════════════════════════════════╝`);
  });
  
  // Initialize cron jobs
  initCronJobs();
}).catch((err) => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});
// Server entry point - Spheronix Technology
