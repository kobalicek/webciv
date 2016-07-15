// [WebCiv]
// A Strategy Game Engine in JavaScript.
//
// [License]
// MIT - See LICENSE.md file in the package.

// This is just a minimal HTTP server to serve static files - there is no server code atm.
"use strict";

const express = require("express");

const server = express();
const port = 8001;

server.get('/', function(req, res) { res.sendFile(__dirname + '/index.html'); });
server.use("/assets", express.static(__dirname + "/assets"));
server.use("/engine", express.static(__dirname + "/engine"));

server.listen(port, function(err) {
  if (err) throw err;

  console.log(`Listening on port ${port}`);
});
