// [WebCiv]
// A Strategy Game Engine in JavaScript.
//
// [License]
// MIT - See LICENSE.md file in the package.
(function(core, $export, $as) {
"use strict";

const mindom = Object.create(null);

mindom.create = function(tag, args) {
  const element = document.createElement(tag);
  if (args)
    mindom.setAttributes(element, args);
  return element;
}

mindom.setAttributes = function(element, args) {
  for (var k in args) {
    const v = args[k];
    switch (k) {
      case "style":
        mindom.setStyle(element, v)
        break;

      default:
        element.setAttribute(k, v);
        break;
    }
  }
};

mindom.setStyle = function(element, args) {
  const style = element.style;
  if (arguments.length === 3) {
    const v = arguments[2];
    style[args] = v;
  }
  else {
    for (var k in args) {
      const v = args[k];
      style[k] = args[k];
    }
  }
}

$export[$as] = mindom;

}).apply(null, typeof this.webciv === "object"
  ? [this.webciv, this.webciv, "mindom"] : [require("./webciv-core"), module, "exports"]);
