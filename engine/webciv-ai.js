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
const Neighbors = Brush.Neighbors;

const TerrainType = core.TerrainType;
const TerrainCategory = core.TerrainCategory;
const TerrainModifier = core.TerrainModifier;

const TC_Land = TerrainCategory.Land;
const TC_Ocean = TerrainCategory.Ocean;

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
    const game = this.game;
    const defs = game.defs;
    const map = this.map;
    const player = this.player;

    const units = player.units;
    const possible = [];

    var i = 0;
    while (i < units.length) {
      const unit = units[i];
      const x = unit.x;
      const y = unit.y;

      const tile = map.getTile(unit.x, unit.y);
      possible.length = 0;

      if (unit.id === defs.units.byName("Settlers").id && tile.preventCity === 0) {
        game.buildCity(unit);
      }
      else {
        for (var n = 0; n < Neighbors.length; n++) {
          const nx = map.normX(unit.x + Neighbors[n].x);
          const ny = map.normX(unit.y + Neighbors[n].y);

          // Clipped coordinate.
          if (x === nx && y === ny)
            continue;
          
          const nTile = map.getTile(nx, ny);
          if (nTile.category === TC_Land)
            possible.push(nTile);
        }

        if (possible.length) {
          const n = this.game.random.irand(possible.length);
          const nTile = possible[n];

          this.map.moveUnit(unit, nTile.x, nTile.y);
        }
      }

      if (!unit.deleted)
        i++;
    }

    game.endOfTurn();
  }
}
ai.SimpleAI = SimpleAI;

$export[$as] = ai;

}).apply(null, typeof this.webciv === "object"
  ? [this.webciv, this.webciv, "ai"] : [require("./webciv-core"), module, "exports"]);
