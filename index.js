//Creates an express app
//It wraps the express app in a Http server and attaches Socket.Io to that same server

const express = require('express')
const app = express()
const https = require('https');
const fs = require('fs');
const os = require('os');

const options = {
  key: fs.readFileSync('localhost.key'),
  cert: fs.readFileSync('localhost.crt')
};

const server = https.Server(options, app)
const port = process.env.PORT || 443;

const { Server } = require("socket.io");
const io = new Server(server);

const clients = {};

// Creates a unique socket.id every time someone connects (desktop or phone)
// unique socket.id gets storred in a clients object
io.on("connection", (socket) => {
  clients[socket.id] = { id: socket.id };
  console.log("Socket connected", socket.id);

  // When someone disconnects, remove them from the clients list.
  socket.on("disconnect", () => {
    delete clients[socket.id];
    console.log("Socket disconnected", socket.id);
    // broadcast when somebody disconnects
    io.emit("clients", clients);
  });

  socket.on('signal', (peerId, signal) => {
    console.log("yeeahhaha")
    io.to(peerId).emit('signal', peerId, signal, socket.id);
  });

  //broadcast client list
  io.emit("clients", clients);
});

app.use(express.static("public"));

server.listen(port, () => {
  const networkInterfaces = os.networkInterfaces();
  for (const interfaceName in networkInterfaces) {
    for (const iface of networkInterfaces[interfaceName]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(
          `Link to project: https://${iface.address}:${port}`,
        );
      }
    }
  }
});