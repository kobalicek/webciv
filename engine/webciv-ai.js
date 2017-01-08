// [WebCiv]
// A Strategy Game Engine in JavaScript.
//
// [License]
// MIT - See LICENSE.md file in the package.
(function(core, $export, $as) {
"use strict";

const FAILED = core.FAILED;

const GameUtils = core.GameUtils;
const Random = core.Random;
const Brush = core.Brush;
const Sides = Brush.Sides;

const TerrainType = core.TerrainType;
const TerrainModifier = core.TerrainModifier;

const ai = Object.create(null);

// ============================================================================
// [BaseAI]
// ============================================================================

class BaseAI {
  constructor() {
    this.game = null;
    this.map = null;
    this.player = null;
  }

  onAttach(player) {
    const game = player.game; 

    this.game = game;
    this.map = game.map;
    this.player = player;
  }

  onDetach(player) {
    this.game = null;
    this.map = null;
    this.player = null;
  }

  onTurn() {
    FAILED("Abstract method called");
  }
}
ai.BaseAI = BaseAI;

class SimpleAI extends BaseAI {
  constructor() {
    super();
  }

  onTurn() {
    const player = this.player;
    var units = player.units;

    for (var i = 0; i < units.length; i++) {
      const unit = units[i];
      this.map.moveUnit(unit, unit.x + 1, unit.y);
    }
  }
}
ai.SimpleAI = SimpleAI;

$export[$as] = ai;

}).apply(null, typeof this.webciv === "object"
  ? [this.webciv, this.webciv, "ai"] : [require("./webciv-core"), module, "exports"]);
