// [WebCiv]
// A Strategy Game Engine in JavaScript.
//
// [License]
// MIT - See LICENSE.md file in the package.

// Loader used only by node.js
"use strict";

const webciv = require("./webciv-core");
webciv.defs = require("./webciv-defs");
webciv.mapgen = require("./webciv-mapgen");
module.exports = webciv;
