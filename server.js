const express = require("express");
const cors = require("cors");
const http = require("http");
const connectDB = require("./backend/config/db");
require("dotenv").config();

const authRoutes = require('./backend/routes/authRoutes');
const courseRoutes = require('./backend/routes/courseRoutes');
const taskRoutes = require('./backend/routes/taskRoutes');

const app = express();
const server = http.createServer(app);
const { Server } = require("socket.io");

const io = new Server(server, {
    cors: { origin: process.env.CLIENT_URLs || "*" }
});

connectDB();

// Configure CORS for production
const corsOptions = {
    origin: process.env.CLIENT_URLs ? process.env.CLIENT_URLs.split(',') : "*",
    credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());
app.locals.io = io;

app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/tasks', taskRoutes);


const courseOnlineUsers = {};           
const socketCourses = {};              

io.on('connection', (socket) => {
  console.log('New socket', socket.id);

  socketCourses[socket.id] = socketCourses[socket.id] || new Set();

  socket.on('joinCourse', (courseId) => {
    if (!courseId) return;

    if (socketCourses[socket.id].has(courseId)) {
      return;
    }

    socket.join(courseId);
    socketCourses[socket.id].add(courseId);

    courseOnlineUsers[courseId] = (courseOnlineUsers[courseId] || 0) + 1;
    io.to(courseId).emit('onlineUsersUpdate', courseOnlineUsers[courseId]);
  });

  socket.on('leaveCourse', (courseId) => {
    if (!courseId) return;

    if (socketCourses[socket.id] && socketCourses[socket.id].has(courseId)) {
      socket.leave(courseId);
      socketCourses[socket.id].delete(courseId);

      courseOnlineUsers[courseId] = Math.max((courseOnlineUsers[courseId] || 1) - 1, 0);

      io.to(courseId).emit('onlineUsersUpdate', courseOnlineUsers[courseId]);
    }
  });

  socket.on('disconnect', () => {
    const joined = socketCourses[socket.id];
    if (joined && joined.size) {
      for (const courseId of joined) {
        courseOnlineUsers[courseId] = Math.max((courseOnlineUsers[courseId] || 1) - 1, 0);
        io.to(courseId).emit('onlineUsersUpdate', courseOnlineUsers[courseId]);
      }
    }
    delete socketCourses[socket.id];
  });
});


const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server started on port ${PORT}`));

