const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-Memory Database State (Supports 100+ concurrent connections)
let talents = {}; // uid -> { uid, ign, secret, group, status, streamState, socketId, customUrl }
let groups = {
  "Group 1": { name: "BANGLADESH TOPI", members: [] },
  "Group 2": { name: "DARK VORTEX", members: [] }
};

// Admin Credentials
const ADMIN_CREDENTIALS = {
  email: "tyronex.tanim@tyronex.com",
  pass: "2011.01.09"
};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Client Login with UID & Secret Number
  socket.param('talent-login', (data, callback) => {
    const { uid, ign, secret } = data;
    talents[uid] = {
      uid,
      ign,
      secret,
      group: talents[uid]?.group || "Unassigned",
      status: "OFFLINE", // OFFLINE, ON AIR, NO FRAME
      streamState: { mic: true, cam: true, crop: {x:0, y:0, w:100, h:100} },
      socketId: socket.id,
      customUrl: uuidv4().substring(0, 9)
    };
    socket.join(uid);
    io.emit('update-dashboard', { talents, groups });
    callback({ success: true, customUrl: talents[uid].customUrl });
  });

  // Handle WebRTC Signaling Offer/Answer/ICE
  socket.on('offer', (data) => {
    socket.to(data.target).emit('offer', { offer: data.offer, sender: socket.id });
  });

  socket.on('answer', (data) => {
    socket.to(data.target).emit('answer', { answer: data.answer, sender: socket.id });
  });

  socket.on('ice-candidate', (data) => {
    socket.to(data.target).emit('ice-candidate', { candidate: data.candidate, sender: socket.id });
  });

  // Admin Login Verification
  socket.on('admin-login', (credentials, callback) => {
    if (credentials.email === ADMIN_CREDENTIALS.email && credentials.pass === ADMIN_CREDENTIALS.pass) {
      callback({ success: true });
    } else {
      callback({ success: false, message: "Invalid Admin Credentials!" });
    }
  });

  // Admin Control: Crop, Mute Mic, Mute Cam, Switch
  socket.on('admin-command', (data) => {
    const { uid, command, value } = data;
    if (talents[uid]) {
      if (command === 'toggle-mic') talents[uid].streamState.mic = value;
      if (command === 'toggle-cam') talents[uid].streamState.cam = value;
      if (command === 'crop') talents[uid].streamState.crop = value;
      
      io.to(talents[uid].socketId).emit('execute-command', { command, value });
      io.emit('update-dashboard', { talents, groups });
    }
  });

  // Admin Management: Add/Update Talents & Grouping
  socket.on('admin-save-talent', (data) => {
    const { uid, ign, secret, groupName } = data;
    if (!talents[uid]) {
      talents[uid] = {
        uid, ign, secret, group: groupName, status: "OFFLINE",
        streamState: { mic: true, cam: true }, customUrl: uuidv4().substring(0, 9)
      };
    } else {
      talents[uid].ign = ign;
      talents[uid].secret = secret;
      talents[uid].group = groupName;
    }
    io.emit('update-dashboard', { talents, groups });
  });

  // Send Alarm / Custom Message with Sound Alert
  socket.on('send-alarm', (data) => {
    const { uid, message } = data;
    if (talents[uid]) {
      io.to(talents[uid].socketId).emit('trigger-alarm', { message });
    }
  });

  socket.on('disconnect', () => {
    for (let uid in talents) {
      if (talents[uid].socketId === socket.id) {
        talents[uid].status = "OFFLINE";
      }
    }
    io.emit('update-dashboard', { talents, groups });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`TYRONEX PRODUCTION server running on port ${PORT}`);
});