// [WebCiv]
// A Strategy Game Engine in JavaScript.
//
// [License]
// MIT - See LICENSE.md file in the package.
(function($webciv, $export, $as) {
"use strict";

const webciv = $webciv;

const slice = Array.prototype.slice;
const isArray = Array.isArray;

const freeze = Object.freeze;
const hasOwn = Object.prototype.hasOwnProperty;

function newDict(data) {
  const dict = Object.create(null);
  if (data) {
    for (var k in data)
      dict[k] = data[k];
  }
  return dict;
}

const NoMap = freeze(new Map());
const NoArray = freeze([]);
const NoObject = freeze(newDict());

// ============================================================================
// [Observable]
// ============================================================================

/**
 * A class that provides event-driven programming.
 */
class Observable {
  constructor() {
    this.$eventHandlers = NoMap;
  }

  on(event, func, thisArg) {
    var map = this.$eventHandlers;
    if (map === NoMap) map = this.$eventHandlers = new Map();

    const listener = { func: func, this: thisArg };
    var arr = map.get(event);
    if (arr) {
      arr.push(listener);
    }
    else {
      arr = [listener];
      arr.emitting = 0;
      map.set(event, arr);
    }

    return this;
  }

  off(event, func, thisArg) {
    const map = this.$eventHandlers;
    const arr = map.get(event);
    if (arr === undefined) return false;

    var i = 0, len = arr.length;
    var result = false;

    if (arr.emitting === 0) {
      while (i < len) {
        const listener = arr[i];
        if (listener.func === func && listener.this === thisArg) {
          listener.splice(i, 1);
          result = true;
          len--;
          continue;
        }
        i++;
      }
    }
    else {
      while (i < len) {
        const listener = arr[i];
        if (listener && listener.func === func && listener.this === thisArg) {
          arr[i] = null;
          result = true;
        }
        i++;
      }
    }

    return result;
  }

  emit(event /* ... */) {
    const map = this.$eventHandlers;
    const arr = map.get(event);
    if (arr === undefined) return false;

    var didEmit = false;
    var hasNullListeners = false;

    var i = 0, len = arr.length;
    const args = slice.call(arguments, 1);

    arr.emitting++;
    while (i < len) {
      const listener = arr[i++];
      if (!listener) {
        hasNullListeners = true;
        continue;
      }

      listener.func.apply(listener.this, args);
      didEmit = true;
    }

    if (--arr.emitting === 0 && hasNullListeners) {
      i = 0;
      while (i < len) {
        if (arr[i] === null) {
          arr.splice(i, 1);
          len--;
          continue;
        }
        i++;
      }
    }

    return didEmit;
  }
}
webciv.Observable = Observable;

// ============================================================================
// [GameError]
// ============================================================================

/**
 * Game error, thrown by the engine.
 *
 * This error is thrown when something got wrong. For example bad data links,
 * invalid arguments to core functions, etc. If this is thrown the engine has
 * been misused or contain bugs and should be terminated.
 */
class GameError extends Error {
  constructor(message) {
    super(message);
    this.name = "GameError";
    this.message = message;
  }

  static throw(message) {
    throw new GameError(message);
  }
}
webciv.GameError = GameError;

function FAILED(message) {
  throw new GameError(message);
}
webciv.FAILED = FAILED;

// ============================================================================
// [GameUtils]
// ============================================================================

/**
 * Basic utilities used across the engine.
 */
class GameUtils {
  /**
   * Clamp `x` to fit within `[min...max]`.
   */
  static clamp(x, min, max) {
    return x < min ? min : x > max ? max : x;
  }

  /**
   * Repeat `x` from `[0..y]`.
   *
   * Some examples:
   *   - `repeat(-1, 4) == 3`
   *   - `repeat( 3, 4) == 3`
   *   - `repeat( 9, 4) == 1`
   */
  static repeat(x, y) {
    if ((x < 0 && (x += y) < 0) || (x >= y && (x -= y) >= y)) {
      x = Math.floor(x % y);
      if (x < 0) x += y;
    }

    return x;
  }

  static distance(a, b, size) {
    const d = Math.abs(a - b);
    return Math.min(d, Math.abs(d - size));
  }

  static cloneDeep(x) {
    return (!x || typeof x !== "object") ? x : GameUtils._cloneDeep(x);
  }

  static _cloneDeep(x) {
    if (isArray(x)) {
      const arr = x.slice();
      for (var i = 0, len = arr.length; i < len; i++) {
        const child = arr[i];
        if (child && typeof child === "object")
          arr[i] = GameUtils._cloneDeep(child);
      }
      return arr;
    }
    else {
      const obj = Object.assign(Object.create(x instanceof Object ? {} : null), x);
      for (var k in obj) {
        const child = obj[k];
        if (child && typeof child === "object")
          obj[k] = GameUtils._cloneDeep(child);
      }
      return obj;
    }
  }

  static makeLink(name, linkAs) {
    return linkAs.replace("<name>", name);
  }
}
webciv.GameUtils = GameUtils;

// ============================================================================
// [Random]
// ============================================================================

/**
 * Pseudo-random number generator.
 *
 * @class
 */
const Random = (function() {
  const kA = 48271;
  const kM = 2147483647;
  const kQ = Math.floor(kM / kA);
  const kR = Math.floor(kM % kA);

  const kSeedInit = 2345678901;
  const kOneOverM = 1.0 / kM;

  return class Random {
    constructor(seed) {
      this.$seed = 0;
      this.$sval = 0;
      this.$index = 0;

      this.reset(seed);
    }

    // Reset the random number generator.
    //
    // This function always resets the internal seed to `seed` and position
    // to zero. Consider using `rewind()` if you only need to rewind the
    // random number generator.
    reset(seed) {
      if (seed == null)
        seed = (kSeedInit + (+new Date())) | 0;

      this.$seed = seed;
      this.$sval = seed;
      this.$index = 0;
      return this;
    }

    // Rewind, sets seed to initial value.
    rewind() {
      return this.reset(this.$seed);
    }

    // Get the current seed.
    getSeed() {
      return this.$seed;
    }

    // Get pseudo-random number generator `index`.
    getIndex() {
      return this.$index;
    }

    // Get the next pseudo-random number in range [0, 1] or [0, max], inclusive.
    drand(max) {
      var s = this.$sval;
      const lo = Math.floor(s % kQ);
      const hi = Math.floor(s / kQ);

      const t = kA * lo - kR * hi;
      s = t > 0 ? t : t + kM;

      this.$sval = s;
      this.$index++;

      s *= kOneOverM;
      if (s === 1.0) s = 0.99999;

      return max !== undefined ? s * max : s;
    }

    irand(max) {
      return Math.floor(this.drand(max));
    }
  };
})();
webciv.Random = Random;

// ============================================================================
// [GameTimer]
// ============================================================================

/**
 * GameTimer - a javascript timer encapsulation.
 */
class GameTimer extends Observable {
  constructor() {
    super();
    this.timerId = null;
    this.interval = 0;
  }

  getInterval() {
    return this.interval;
  }

  setInterval(interval) {
    if (this.interval === interval)
      return this;
    this.interval = interval;

    // Restart the timer if active.
    if (this.timerId !== null)
      this.start();
    return this;
  }

  isRunning() {
    return this.timerId !== null;
  }

  start() {
    const timerId = this.timerId;
    const interval = this.interval;

    if (timerId !== null)
      clearInterval(timerId);

    if (interval)
      this.timerId = setInterval(GameTimer.$onTimerStatic, interval, this);
    return this;
  }

  stop() {
    const timerId = this.timerId;
    if (timerId !== null) {
      this.timerId = null;
      clearInterval(timerId);
    }
    return this;
  }

  static $onTimerStatic(self) {
    self.emit("timer");
  }
}
webciv.GameTimer = GameTimer;

// ============================================================================
// [Brush]
// ============================================================================

/**
 * Creates a frozen object having `x` and `y` properties.
 *
 * This function is used to create arrays that have coordinates (brushes) that
 * can be used to iterate over neighboring tiles, over city-accessible tiles,
 * etc...
 */
function POINT(x, y) {
  return Object.freeze({ x: x, y: y });
}
webciv.POINT = POINT;

/**
 * Various brushes that can be used by random map generators.
 */
const Brush = (function() {
  const Brush = newDict();

  Brush.Dot  = freeze([POINT(0, 0)]);
  Brush.Horz = freeze([POINT(-1, 0), POINT(0, 0), POINT( 1, 0)]);
  Brush.Vert = freeze([POINT( 0,-1), POINT(0, 0), POINT( 0, 1)]);

  Brush.Sides = freeze([
    POINT( 0,-1),
    POINT( 1, 0),
    POINT( 0, 1),
    POINT(-1, 0)
  ]);

  Brush.Plus = freeze([
    POINT( 0, 0),
    POINT(-1, 0),
    POINT( 1, 0),
    POINT( 0,-1),
    POINT( 0, 1)
  ]);

  Brush.Square2x2 = freeze([
    POINT( 0, 0), POINT( 1, 0),
    POINT( 0, 1), POINT( 1, 1)
  ]);

  Brush.Square3x3 = freeze([
    POINT(-1,-1), POINT( 0,-1), POINT( 1,-1),
    POINT(-1, 0), POINT( 0, 0), POINT( 1, 0),
    POINT(-1, 1), POINT( 0, 1), POINT( 1, 1)
  ]);

  Brush.Diamond = freeze(Brush.Square3x3.concat(
    POINT( 0,-2), POINT( 2, 0),
    POINT( 0, 2), POINT(-2, 0)
  ));

  Brush.City = freeze(Brush.Square3x3.concat(
    POINT(-1,-2), POINT( 0,-2), POINT( 1,-2),
    POINT(-1, 2), POINT( 0, 2), POINT( 1, 2),
    POINT(-2,-1), POINT(-2, 0), POINT(-2, 1),
    POINT( 2,-1), POINT( 2, 0), POINT( 2, 1)
  ));

  Brush.Neighbors = freeze([
    POINT(-1,-1), POINT( 0,-1), POINT( 1,-1),
    POINT(-1, 0),               POINT( 1, 0),
    POINT(-1, 1), POINT( 0, 1), POINT( 1, 1)
  ]);

  return Brush;
})();
webciv.Brush = Brush;

// Used by the core.
const Neighbors = Brush.Neighbors;

// ============================================================================
// [EdgeFlags]
// ============================================================================

/**
 * Bits representing surrounding things of the same type (terrain, road, etc).
 */
const EdgeFlags = freeze({
  None       : 0x0000,

  Top        : 0x0001,
  Right      : 0x0002,
  Bottom     : 0x0004,
  Left       : 0x0008,
  TopRight   : 0x0010,
  BottomRight: 0x0020,
  BottomLeft : 0x0040,
  TopLeft    : 0x0080,

  Sides      : 0x000F,
  Corners    : 0x00F0
});
webciv.EdgeFlags = EdgeFlags;

/**
 * Terrain type.
 */
const TerrainType = freeze({
  Desert     : 0,
  Plains     : 1,
  Grassland  : 2,
  Forest     : 3,
  Hills      : 4,
  Mountains  : 5,
  Tundra     : 6,
  Arctic     : 7,
  Swamp      : 8,
  Jungle     : 9,
  Ocean      : 10
});
webciv.TerrainType = TerrainType;

const TerrainCategory = freeze({
  Ocean      : 0,
  Land       : 1
});
webciv.TerrainCategory = TerrainCategory;

/**
 * Terrain modifiers.
 */
const TerrainModifier = {
  kRiver      : 0x0001,
  kRoad       : 0x0010,
  kRailroad   : 0x0020,
  kIrrigation : 0x0040,
  kMine       : 0x0080
};
webciv.TerrainModifier = TerrainModifier;

// ============================================================================
// [GameLimits]
// ============================================================================

/**
 * Engine limitations.
 */
const GameLimits = freeze({
  MaxPlayers: 30,
  MaxAssets: 999
});
webciv.GameLimits = GameLimits;

// ============================================================================
// [GameDataItem]
// ============================================================================

class GameDataItem {
  constructor(info, kind) {
    if (!info) info = NoObject;

    const id = typeof info.id === "number" ? info.id : -1;
    const asset = info.asset;

    this.id       = id;                    // Item id.
    this.name     = info.name || "";       // Item name.
    this.kind     = kind;                  // Item kind (like "Terrain", "Resource", ...).
    this.link     = "";                    // Item link name, created by `GameDefs.$finalizeItems`.

    this.asset    = "";                    // Asset referenced by the item (if any).
    this.assetId  = -1;                    // Calculated by `this.finalize()`.
    this.assetX   = 0;                     // Resource x-index in the referenced asset (if any).
    this.assetY   = 0;                     // Resource y-index in the referenced asset (if any).

    if (isArray(asset)) {
      if (asset.length !== 1 && asset.length !== 3)
        FAILED(`${this.kind} '${this.name}' contains an invalid asset array, it must have 1 or 3 elements`);

      info.asset = String(asset[0]);
      info.assetX = asset.length >= 3 ? Number(asset[1]) : 0;
      info.assetY = asset.length >= 3 ? Number(asset[2]) : 0;
    }
    else {
      if (info.asset) this.asset = info.asset;
      if (info.assetX) this.assetX = info.assetX;
      if (info.assetY) this.assetY = info.assetY;
    }
  }

  finalize(defs) {
    // Asset should be valid. However, `assetX` and `assetY` are not validated
    // as it's not possible to do it here (definitions have no access to asset
    // files, which is correct).
    if (this.asset) this.assetId = defs.verifiedLink(this.asset, "Asset").id;
  }
}
webciv.GameDataItem = GameDataItem;

// ============================================================================
// [AssetData]
// ============================================================================

function INFO_ID(id) { return typeof id === "number" ? id : -1; }
function INFO_ARRAY(obj) { return isArray(obj) ? obj.slice() : []; }

/**
 * Asset information.
 */
class AssetData {
  constructor(info) {
    if (!info) info = NoObject;

    this.id        = INFO_ID(info.id);     // Asset id.
    this.name      = info.name || "";      // Asset name.
    this.kind      = "Asset";
    this.link      = "";                   // Asset link name.

    this.flags     = info.flags || 0;      // Asset flags.
    this.file      = info.file  || "";     // Asset file.
    this.type      = info.type  || "";     // Asset type.

    this.dominance = info.dominance || 0;  // Dominance, used to render terrain.
    this.blendmap  = info.blendmap  || ""; // Blendmap, used to render terrain.

    // Autogenerated properties.
    this.blendmapId = -1;
  }

  finalize(defs) {
    if (this.blendmap) this.blendmapId = defs.verifiedLink(this.blendmap, "Asset").id;
  }
}
webciv.AssetData = AssetData;

// ============================================================================
// [TerrainData]
// ============================================================================

/**
 * Terrain information.
 */
class TerrainData extends GameDataItem {
  constructor(info) {
    super(info, "Terrain");
    if (!info) info = NoObject;

    this.flags      = info.flags      || 0;// Terrain flags.
    this.category   = info.category   || 0;// Terrain category.
    this.defense    = info.defense    || 0;// Defense bonus (100 == 100%, etc).

    this.food       = info.food       || 0;// Base food.
    this.production = info.production || 0;// Base production.
    this.commerce   = info.commerce   || 0;// Base commerce.

    // Autogenerated properties:
    this.resources = [];                   // Calculated by `GameDefs.$rebuildTerrainResourcesInfo`.
  }
}
webciv.TerrainData = TerrainData;

// ============================================================================
// [ResourceData]
// ============================================================================

/**
 * Resource information.
 */
class ResourceData extends GameDataItem {
  constructor(info) {
    super(info, "Resource");
    if (!info) info = NoObject;

    const terrain = INFO_ARRAY(info.terrain);

    this.terrain    = terrain;             // Terrain requirements (OR).
    this.flags      = info.flags      || 0;// Resource flags.
    this.mask       = 0;                   // Resource mask.

    this.food       = info.food       || 0;// Bonus food.
    this.production = info.production || 0;// Bonus production.
    this.commerce   = info.commerce   || 0;// Bonus commerce.

    this.assetX     = info.assetX;         // Position in assets.
    this.assetY     = info.assetY;         // Position in assets.
  }
}
webciv.ResourceData = ResourceData;

// ============================================================================
// [ModifierData]
// ============================================================================

/**
 * Modifier information.
 */
class ModifierData extends GameDataItem {
  constructor(info) {
    super(info, "Modifier");
    if (!info) info = NoObject;

    this.flags    = info.flags || 0;       // Modifier flags.
    this.mask     = 0;                     // Modifier mask.
  }
}
webciv.ModifierData = ModifierData;

// ============================================================================
// [UnitData]
// ============================================================================

/**
 * Unit information.
 */
class UnitData extends GameDataItem {
  constructor(info) {
    super(info, "Unit");
    if (!info) info = NoObject;

    this.flags    = info.flags   || 0;     // Unit flags.
    this.prereq   = info.prereq  || [];    // Unit prerequisites.

    this.cost     = info.cost    || 0;     // Unit cost (production).
    this.moves    = info.moves   || 0;     // Count of moves.
    this.attack   = info.attack  || 0;     // Attack strength.
    this.defense  = info.defense || 0;     // Defense strength.
  }
}
webciv.UnitData = UnitData;

// ============================================================================
// [BuildingData]
// ============================================================================

/**
 * Building information.
 */
class BuildingData extends GameDataItem {
  constructor(info) {
    super(info, "Building");
    if (!info) info = NoObject;

    this.flags    = info.flags   || 0;     // Building flags.
    this.prereq   = info.prereq  || [];    // Building prerequisites.

    this.cost     = info.cost    || 0;     // Building cost (production).
    this.upkeep   = info.upkeep  || 0;     // Building upkeep per turn.
  }
}
webciv.BuildingData = BuildingData;

// ============================================================================
// [TechnologyData]
// ============================================================================

/**
 * Technology information.
 */
class TechnologyData extends GameDataItem {
  constructor(info) {
    super(info, "Technology");
    if (!info) info = NoObject;

    this.flags    = info.flags   || 0;     // Technology flags.
    this.prereq   = info.prereq  || [];    // Technology prerequisites.
  }
}
webciv.TechnologyData = TechnologyData;

// ============================================================================
// [CivilizationData]
// ============================================================================

/**
 * Civilization information.
 */
class CivilizationData extends GameDataItem {
  constructor(info) {
    super(info, "Civilization");
    if (!info) info = NoObject;

    const colorSlot = INFO_ID(info.colorSlot);
    const cityNames = INFO_ARRAY(info.cityNames);

    this.adjective = info.adjective || ""; // Civilization name as adjective.
    this.colorSlot = colorSlot;            // Coloring information (first color).
    this.cityNames = cityNames;            // List of city names of this civ.
  }
}
webciv.CivilizationData = CivilizationData;

// ============================================================================
// [ColorData]
// ============================================================================

/**
 * Color information.
 */
class ColorData extends GameDataItem {
  constructor(info) {
    super(info, "Color");
    if (!info) info = NoObject;

    this.primary    = info.primary    || "";
    this.secondary  = info.secondary  || "";
    this.text       = info.text       || "";
    this.textStroke = info.textStroke || "";

    this.$resolveColorRefs();
  }

  $resolveColorRefs() {
    this.primary    = this.$resolveColor(this.primary);
    this.secondary  = this.$resolveColor(this.secondary);
    this.text       = this.$resolveColor(this.text);
    this.textStroke = this.$resolveColor(this.textStroke);
  }

  $resolveColor(color) {
    if (/^(?:primary|secondary|text|textStroke)$/.test(color))
      return this[color];
    return color;
  }
}
webciv.ColorData = ColorData;

// ============================================================================
// [IconData]
// ============================================================================

/**
 * Icon information.
 */
class IconData extends GameDataItem {
  constructor(info) {
    super(info, "Icon");
    if (!info) info = NoObject;

    this.assetX   = info.assetX;           // Position in assets.
    this.assetY   = info.assetY;           // Position in assets.
    this.width    = info.width;            // Icon width.
    this.height   = info.height;           // Icon height.
  }
}
webciv.IconData = IconData;

// ============================================================================
// [RuleData]
// ============================================================================

class RuleData extends GameDataItem {
  constructor(info) {
    super(info, "Rule");
    if (!info) info = NoObject;

    this.value = info.value;               // Value.
  }
}
webciv.RuleData = RuleData;

// ============================================================================
// [GameItems]
// ============================================================================

class GameItems extends Array {
  constructor(name, class_, linkAs) {
    super();

    this.name = name;                      // Name of the definition and its items.
    this.$class = class_;                  // Class object of the Item.
    this.$linkAs = linkAs;                 // Link format.
    this.$itemNames = [];                  // Maps item-index to item-name.
    this.$itemMap = new Map();             // Maps item-name to item-definition.
  }

  byName(name) {
    return this.$itemMap.get(name);
  }

  byNameOrId(nameOrId) {
    if (typeof nameOrId === "number") {
      const count = this.$itemNames.length;
      if (nameOrId < 0 || nameOrId >= count)
        FAILED(`Id '${nameOrId}' of '${this.name}' out of range (0..${count - 1})`);
      return nameOrId;
    }
    else if (typeof nameOrId === "string") {
      const info = this.$itemMap.get(nameOrId);
      if (info == null)
        FAILED(`Failed to get id '${nameOrId}' of '${this.name}'`);
      return info.id;
    }
    else {
      FAILED(`Failed to get '${nameOrId}' of '${this.name}'`);
    }
  }
}

// ============================================================================
// [GameDefs]
// ============================================================================

/**
 * Game definitions.
 */
class GameDefs {
  constructor(data) {
    this.name = "";                        // Name of definitions.
    this.version = "";                     // Version of definitions.
    this.finalized = false;                // If definitions are finalized.

    this.$defs = newDict();                // Maps a name to a type-definition and items.
    this.$links = new Map();               // Maps a link to a type.

    this.addDefinition({ class: AssetData        , property: "assets"        , link: "_[<name>]" });
    this.addDefinition({ class: TerrainData      , property: "terrains"      , link: "#[<name>]" });
    this.addDefinition({ class: ResourceData     , property: "resources"     , link: "$[<name>]" });
    this.addDefinition({ class: ModifierData     , property: "modifiers"     , link: "+[<name>]" });
    this.addDefinition({ class: UnitData         , property: "units"         , link: "*[<name>]" });
    this.addDefinition({ class: BuildingData     , property: "buildings"     , link: "%[<name>]" });
    this.addDefinition({ class: TechnologyData   , property: "technologies"  , link: "@[<name>]" });
    this.addDefinition({ class: CivilizationData , property: "civilizations" , link: "~[<name>]" });

    this.addDefinition({ class: ColorData        , property: "colors"        , link: "Color[<name>]" });
    this.addDefinition({ class: IconData         , property: "icons"         , link: "Icon[<name>]"  });
    this.addDefinition({ class: RuleData         , property: "rules"         , link: "Rule[<name>]"  });

    if (data) this.addData(data);
  }

  resolveLink(link) {
    return this.$links.get(link);
  }

  verifiedLink(link, kind) {
    const item = this.$links.get(link);
    if (item === undefined)
      FAILED(`Link '${link}' not found`);

    if (kind && item.kind !== kind)
      FAILED(`Link '${link}' must be of '${kind}' type, not ${item.kind}`);

    return item;
  }

  addDefinition(info) {
    var name = info.name;
    var class_ = info.class;
    var property = info.property;

    if (typeof class_ !== "function")
      FAILED(`Definition '${name}' didn't specify its '.class' property`);

    if (!name)
      name = class_.name;

    if (!property)
      FAILED(`Definition '${name}' didn't specify its '.property' property`);

    if (this.$defs[name] !== undefined)
      FAILED(`Definition '${name}' accessible as '${property}' already defined`);

    if (this[property] !== undefined)
      FAILED(`Definition '${name}' accessible as '${property}' collides with a built-in property`);

    const items = new GameItems(name, class_, info.link || "<name>");
    this[property] = items;
    this.$defs[name] = items;
    return this;
  }

  addData(data) {
    if (this.finalized)
      FAILED(`"The object was finalized and it's immutable now`);

    // These override the actual values, can be used to patch the original definitions.
    if (data.name) this.name = data.name;
    if (data.version) this.version = data.version;

    for (var k in data) {
      const val = data[k];
      const items = this[k];

      if (items instanceof GameItems) {
        const ItemData = items.$class;
        if (!isArray(val))
          FAILED(`Type data must be array, not ${typeof value}`);
        for (var i = 0; i < val.length; i++) items.push(new ItemData(val[i]));
      }
      else {
        switch (k) {
          case "name":
            this.name = val;
            break;
          case "version":
            this.version = val;
            break;
          default:
            FAILED(`Unknown key '${k}'`);
        }
      }
    }

    return this;
  }

  finalize() {
    if (this.finalized)
      return this;

    var k;
    const defs = this.$defs;

    for (k in defs) this.$finalizeItemLinks(defs[k]);
    for (k in defs) this.$finalizeItemInstances(defs[k]);
    this.$rebuildTerrainResourcesInfo();

    this.finalized = true;
    return this;
  }

  $finalizeItemLinks(items) {
    var i;

    var maxId = -1;
    var itemsHavingId = 0;

    var name = items.name;

    // If the info object contains a specific ID it has to be honored. This
    // loop checks how many items have a specific ID and a maximum ID value.
    //
    // There are two main cases that happen most of the time - all items have
    // a specific ID (then this functions as a validator) or none of them has.
    for (i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.id !== -1) {
        itemsHavingId++;
        maxId = Math.max(maxId, item.id);
      }
    }

    // If anything has a specific ID then there cannot be a gap between custom
    // IDs of all the items that have it. It would be dangerous for any consumer
    // of such data to skip null items, we simply want IDs in a sequential order.
    if (maxId !== itemsHavingId - 1)
      FAILED(`${name} contain identifiers that are not sequential`);

    // Create a new array having all items sorted in the correct order.
    const newItems = [];
    for (i = 0; i <= maxId; i++) newItems.push(null);

    for (i = 0; i < items.length; i++) {
      const item = items[i];
      const id = item.id;

      if (id !== -1) {
        if (newItems[id] !== null)
          FAILED(`${name} '${item.name}' identified as #${id} overlaps with '${newItems[id].name}'`);
        newItems[id] = item;
      }
      else {
        item.id = newItems.length;
        newItems.push(item);
      }
    }

    // Generate link names and add each item to the global link registry.
    const linkAs = items.$linkAs;
    for (i = 0; i < items.length; i++) {
      const item = items[i];
      const link = GameUtils.makeLink(item.name, linkAs);

      const obj = this.$links.get(link);
      if (obj !== undefined)
        FAILED(`${name} '${item.name}' already defined`);

      item.link = link;
      this.$links.set(link, item);
    }

    // Copy `newItems` to the original `defs` and establish name <-> def mappings.
    items.length = 0;

    const itemMap = items.$itemMap;
    const itemNames = items.$itemNames;

    for (i = 0; i < newItems.length; i++) {
      const item = newItems[i];
      const name = item.name;

      items.push(item);
      itemMap.set(name, item);
      itemNames.push(name);
    }

    // Make them immutable, finalized data shouldn't be changed during the game-play.
    freeze(items);
    freeze(itemMap);
    freeze(itemNames);
  }

  $finalizeItemInstances(items) {
    for (var i = 0; i < items.length; i++) {
      const item = items[i];
      item.finalize(this);
    }
  }

  /**
   * Rebuilds a `TerrainData.resources` for each registered terrain type
   * based on all resources registered.
   */
  $rebuildTerrainResourcesInfo() {
    const terrains = this.terrains;
    const resources = this.resources;

    var i, j;

    // Clear all `TerrainData.resources` first.
    for (i = 0; i < terrains.length; i++)
      terrains[i].resources.length = 0;

    // Rebuild the data.
    for (i = 0; i < resources.length; i++) {
      const resource = resources[i];
      const allowedArray = resource.terrain;

      for (j = 0; j < allowedArray.length; j++) {
        const link = allowedArray[j];
        const item = this.resolveLink(link);

        if (item === undefined)
          FAILED(`Resource '${resource.link}' link '${link}' not found`);

        if (item.kind !== "Terrain")
          FAILED(`Resource '${resource.link}' link '${link}' is not terrain`);

        item.resources.push(resource);
      }
    }
  }
}
webciv.GameDefs = GameDefs;

// ============================================================================
// [GameTile]
// ============================================================================

/**
 * Game tile.
 */
class GameTile {
  constructor(x, y) {
    this.x = x || 0;                       // Tile X coordinate.
    this.y = y || 0;                       // Tile Y coordinate.

    this.id = 0;                           // Terrain id.
    this.category = 0;                     // Terrain category.

    this.flags = 0;                        // Terrain flags.
    this.modifiers = 0;                    // Terrain modifiers' as bitfield.
    this.resource = -1;                    // Terrain resource id or -1 if none.

    this.deepness = -1;                    // Distance to closest land / ocean tile.
    this.oceanId = -1;                     // Ocean ID, see GameMap.oceans.
    this.continentId = -1;                 // Continent ID, see GameMap.continents.

    this.territory = -1;                   // Territory (player slot).

    this.city = null;                      // City that occupies this tile.
    this.units = null;                     // Units that occupy this tile (linked list).
    this.workedBy = null;                  // City that works this tile.
  }
}
webciv.GameTile = GameTile;

// ============================================================================
// [GameUnit]
// ============================================================================

/**
 * Game unit.
 */
class GameUnit {
  constructor(game, slot, info) {
    this.game = game;                      // Game that owns the unit.
    this.slot = slot;                      // Unit slot.
    this.uuid = 0;                         // Unique ID, will be set by the `Game`.

    this.x = info.x;                       // Unit X coordinate.
    this.y = info.y;                       // Unit Y coordinate.

    this.player = info.player || null;     // Player that owns the unit.
    this.deleted = false;                  // The unit was deleted.

    this.id = info.id || 0;                // Unit id, see UnitData.
    this.next = null;                      // Next unit on the tile (linked list).
  }
}
webciv.GameUnit = GameUnit;

// ============================================================================
// [GameCity]
// ============================================================================

/**
 * Game city.
 */
class GameCity {
  constructor(game, slot, info) {
    this.game = game;                      // Game that owns the city.
    this.slot = slot;                      // City slot.
    this.uuid = 0;                         // Unique ID, will be set by the `Game`.

    this.x = info.x;                       // City X coordinate.
    this.y = info.y;                       // City Y coordinate.

    this.player  = info.player  || null;   // Player that owns the city.
    this.deleted = false;                  // The city was deleted.

    this.name    = info.name    || null;   // City name.
    this.size    = info.size    || 1;      // City size.
    this.founded = info.founded || 0;      // Turn when the city was founded.

    this.buildings         = [];           // Array of buildings.
    this.buildingsBits     = [];           // Bit-array of all buildings built.
    this.workingTiles      = [];           // Working tiles.

    this.foodPerTurn       = 0;            // Food collected (per turn).
    this.productionPerTurn = 0;            // Production (per turn).
    this.commercePerTurn   = 0;            // Commerce (per turn).

    this.goldPerTurn       = 0;            // Gold (per turn).
    this.upkeepPerTurn     = 0;            // Upkeep (per turn).

    this.sciencePerTurn    = 0;            // Science (per turn).
    this.culturePerTurn    = 0;            // Culture (per turn).

    this.foodCount         = 0;            // Food (accumulated).
    this.productionCount   = 0;            // Production (accumulated).
    this.cultureCount      = 0;            // Culture (accumulated).

    const buildings = info.buildings;
    if (buildings) {
      for (var i = 0; i < buildings.length; i++)
        this.addBuilding(buildings[i]);
    }
  }

  hasBuilding(nameOrId) {
    const id = this.game.defs.buildings.byNameOrId(nameOrId);
    const bb = this.buildingsBits;

    const bbIdx = id >> 4;
    const bbBit = 1 << (id & 0x0F);
    return bbIdx < bb.length && (bb[bbIdx] & bbBit) !== 0;
  }

  addBuilding(nameOrId) {
    const id = this.game.defs.buildings.byNameOrId(nameOrId);
    const bb = this.buildingsBits;

    const bbIdx = id >> 4;
    const bbBit = 1 << (id & 0x0F);

    if (bbIdx < bb.length && (bb[bbIdx] & bbBit) !== 0)
      return null;

    while (bbIdx >= bb.length)
      bb.push(0);
    bb[bbIdx] |= bbBit;

    const building = Object.create(null);
    const info = this.game.defs.buildings[id];

    building.id = id;
    building.name = info.name;
    this.buildings.push(building);

    return building;
  }
}
webciv.GameCity = GameCity;

// ============================================================================
// [GamePlayer]
// ============================================================================

/**
 * Game player.
 */
class GamePlayer extends Observable {
  constructor(game, slot, info) {
    super();

    this.game = game;                      // Game that owns the player.
    this.slot = slot;                      // Player slot.
    this.uuid = 0;                         // Unique ID, will be set by the `Game`.

    this.name = info.name || "";           // Player name.
    this.civ = info.civ;                   // Player civilization.
    this.colorSlot = info.colorSlot || 0;  // Color slot the player is using.

    this.units = [];                       // Player units.
    this.cities = [];                      // Player cities.

    this.fog = null;                       // Fog of war, each bit represents one tile.
    this.uncovered = null;                 // Uncovered area, each bit represents one tile.

    this.ai = info.ai || null;             // AI attached to the player.
  }

  setAI(ai) {
    if (this.ai)
      this.ai.onDetach(this);

    this.ai = ai;
    if (this.ai)
      this.ai.onAttach(this);
  }

  assignUnit(unit) {
    this.units.push(unit);
  }

  removeUnit(unit) {
    this.units.splice(this.units.indexOf(unit), 1);
  }

  assignCity(city) {
    this.cities.push(city);
  }

  removeCity(city) {
    this.cities.splice(this.cities.indexOf(city), 1);
  }

  uncoverTile(mx, my) {
    const game = this.game;
    const map = game.map;

    const w = map.w;
    const h = map.h;

    if (mx < 0 || my < 0 || mx >= w || my >= h) {
      mx %= w; if (mx < 0) mx += w;
      my %= h; if (my < 0) my += h;
    }

    const pos = my * w + mx;
    const idx = pos >>> 5;
    const bit = 1 << (pos & 0x1F);

    const uncovered = this.uncovered;
    if (!(uncovered[idx] & bit)) {
      uncovered[idx] |= bit;

      game.emit("uncovered", mx, my, this);
    }
  }

  uncoverRect(rx, ry, rw, rh) {
    const game = this.game;
    const map = game.map;

    const w = map.w;
    const h = map.h;

    var x0 = rx;
    var y0 = ry;
    var x1 = x0 + rw;
    var y1 = y0 + rh;

    if (x0 < 0 || y0 < 0 || x1 >= w || y1 >= h) {
      x0 = map.normX(x0);
      y0 = map.normY(y0);
      x1 = map.normX(x1);
      y1 = map.normY(y1);
    }

    const uncovered = this.uncovered;

    var y = y0;
    while (y !== y1) {
      var x = x0;
      while (x !== x1) {
        const pos = y * w + x;
        const idx = pos >>> 5;
        const bit = 1 << (pos & 0x1F);

        if (!(uncovered[idx] & bit)) {
          uncovered[idx] |= bit;
          game.emit("uncovered", x, y, this);
        }

        if (++x === w) x = 0;
      }
      if (++y === h) y = 0;
    }
  }

  $subscribe() {
    this.game.on("mapResize", this.$onMapResize, this);
    this.$onMapResize();
  }

  $unsubscribe() {
    this.game.off("mapResize", this.$onMapResize, this);
  }

  $onMapResize() {
    const map = this.game.map;
    const w = map.w;
    const h = map.h;

    if (w && h) {
      const size = Math.floor((w * h + 31) / 32);
      this.fog       = new Int32Array(size);
      this.uncovered = new Int32Array(size);
    }
    else {
      this.fog       = null;
      this.uncovered = null;
    }
  }
}
webciv.GamePlayer = GamePlayer;

// ============================================================================
// [GameMap]
// ============================================================================

/**
 * Game map.
 */
class GameMap {
  constructor(game) {
    this.game = game;                      // Game or editor that owns the map.

    this.w = 0;                            // Map width (in tiles).
    this.h = 0;                            // Map height (in tiles).
    this.size = 0;                         // Map size - `width * height`.
    this.tiles = [];                       // One dimension array containing all tiles.

    this.flipX = true;                     // X coordinate flips.
    this.flipY = true;                     // Y coordinate flips.

    this.normX = null;                     // Normalize (flip or bound) X coordinate.
    this.normY = null;                     // Normalize (flip or bound) Y coordinate.

    this.supressNotifications = 0;         // Supress notifications about map changes.
    this.dirty = false;                    // The map is dirty and needs recalculation.
    this.oceans = [];                      // Array of separate oceans / lakes.
    this.continents = [];                  // Array of separate continents / islands.

    this._normSetup();
  }

  resize(w, h, initialId) {
    const tiles = this.tiles;

    const defs = this.game.defs;
    const category = defs.terrains[initialId].category;

    this.w = w;
    this.h = h;
    this.size = w * h;
    this.dirty = true;

    tiles.length = 0;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        const tile = new GameTile(x, y);

        tile.id = initialId;
        tile.category = category;
        tiles.push(tile);
      }
    }

    if (this.game)
      this.game.emit("mapResize");

    return this;
  }

  _normSetup() {
    this.normX = this.flipX ? this._flipX : this._clampX;
    this.normY = this.flipY ? this._flipY : this._clampY;
  }

  _flipX(x) {
    const w = this.w;
    if (x < 0 || x >= w) {
      x = Math.floor(x % w);
      if (x < 0) x += w;
    }
    return x;
  }

  _flipY(y) {
    const h = this.h;
    if (y < 0 || y >= h) {
      y = Math.floor(y % h);
      if (y < 0) y += h;
    }
    return y;
  }

  _clampX(x) {
    const w = this.w;
    return x < 0 ? 0 : x >= w ? w - 1 : x;
  }

  _clampY(y) {
    const h = this.h;
    return y < 0 ? 0 : y >= h ? h - 1 : y;
  }

  recalc() {
    this._recalcContinentsAndOceans();
    this._recalcDeepness();
    this.dirty = false;
  }

  _recalcContinentsAndOceans() {
    const w = this.w;
    const h = this.h;
    const tiles = this.tiles;

    const oceans = this.oceans;
    const continents = this.continents;

    // First clear all continent and ocean IDs.
    var i;
    for (i = 0; i < tiles.length; i++) {
      tiles[i].deepness = -1;
      tiles[i].oceanId = -1;
      tiles[i].continentId = -1;
    }

    oceans.length = 0;
    continents.length = 0;

    // Simple "recursive" implementation that locates all continents / islands
    // and oceans / lakes. It uses `stack` to save the previous location.
    //
    // Iterates over all tiles and tries to find a tile that doesn't have set
    // oceanId or continentId (depending on the tile itself). After the tile
    // is found then it uses a flood-fill approach to traverse the whole
    // continent or ocean. Previously traversed tiles are then skipped.
    const stack = [];

    var x, y;
    var tile;

    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        tile = tiles[y * w + x];
        if (tile.oceanId === -1 && tile.continentId === -1) {
          if (tile.id === TerrainType.Ocean)
            oceans.push(this._iterateOcean(x, y, oceans.length, stack));
          else
            continents.push(this._iterateContinent(x, y, continents.length, stack));
        }
      }
    }

    // Sort continents and oceans from biggest to smallest and fixup their IDs.
    function bySize(a, b) { return b.size - a.size; }

    const oceansRef = oceans.slice();
    const continentsRef = continents.slice();

    oceans.sort(bySize);
    continents.sort(bySize);

    for (i = 0; i < oceans.length; i++) oceans[i].id = i;
    for (i = 0; i < continents.length; i++) continents[i].id = i;

    for (i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      if (tile.oceanId     !== -1) tile.oceanId     = oceansRef[tile.oceanId].id;
      if (tile.continentId !== -1) tile.continentId = continentsRef[tile.continentId].id;
    }
  }

  // Calculate how much deep the tile is inside the ocean / continent. AI can
  // calculate the most important strategic points per ocean / continent based
  // on deepness and surrounding tiles.
  _recalcDeepness() {
    const w = this.w;
    const h = this.h;
    const tiles = this.tiles;

    for (var category = 0; category < 2; category++) {
      const objects = (category === TerrainCategory.Ocean) ? this.oceans : this.continents;

      for (var i = 0; i < objects.length; i++) {
        const object = objects[i];
        const coords = object.coords;

        var changed = true;
        while (changed) {
          changed = false;
          for (var j = 0; j < coords.length; j += 2) {
            const x = coords[j];
            const y = coords[j + 1];

            const tile = tiles[y * w + x];
            var deepness = -1;

            for (var s = 0; s < Neighbors.length; s++) {
              const nx = this.normX(x + Neighbors[s].x);
              const ny = this.normY(y + Neighbors[s].y);

              if (nx !== x || ny !== y) {
                const neighbor = tiles[ny * w + nx];
                if (neighbor.category !== category) {
                  deepness = 1;
                  break;
                }
                else {
                  if (neighbor.deepness !== -1)
                    deepness = deepness === -1 ? neighbor.deepness + 1 : Math.min(deepness, neighbor.deepness + 1);
                }
              }
            }

            if (tile.deepness !== deepness) {
              tile.deepness = deepness;
              changed = true;
            }
          }
        }
      }
    }
  }

  _iterateOcean(x, y, id, stack) {
    const w = this.w;
    const h = this.h;
    const tiles = this.tiles;

    const coords = [];
    const out = {
      id: id,
      size: 0,
      coords: coords
    };

    var i = 0;
    var iEnd = Neighbors.length;
    var size = 1;

    // The first tile is done outside the loop.
    var center = tiles[y * w + x];

    coords.push(x, y);
    center.oceanId = id;

    for (;;) {
      const x1 = this.normX(x + Neighbors[i].x, w);
      const y1 = this.normY(y + Neighbors[i].y, h);
      const tile = tiles[y1 * w + x1];

      if (tile.oceanId === -1 && tile.id === TerrainType.Ocean) {
        coords.push(x1, y1);
        tile.oceanId = id;
        size++;

        if (++i !== iEnd)
          stack.push(x, y, i);

        x = x1;
        y = y1;
        i = 0;
      }
      else if (++i >= iEnd) {
        if (stack.length === 0)
          break;

        i = stack.pop();
        y = stack.pop();
        x = stack.pop();
      }
    }

    out.size = size;
    return out;
  }

  _iterateContinent(x, y, id, stack) {
    const w = this.w;
    const h = this.h;
    const tiles = this.tiles;

    const coords = [];
    const out = {
      id: id,
      size: 0,
      coords: coords
    };

    var i = 0;
    var iEnd = Neighbors.length;
    var size = 1;

    // The first tile is done outside the loop.
    var center = tiles[y * w + x];

    coords.push(x, y);
    center.continentId = id;

    for (;;) {
      const x1 = this.normX(x + Neighbors[i].x, w);
      const y1 = this.normY(y + Neighbors[i].y, h);
      const tile = tiles[y1 * w + x1];

      if (tile.continentId === -1 && tile.id !== TerrainType.Ocean) {
        coords.push(x1, y1);
        tile.continentId = id;
        size++;

        if (++i !== iEnd)
          stack.push(x, y, i);

        x = x1;
        y = y1;
        i = 0;
      }
      else if (++i >= iEnd) {
        if (stack.length === 0)
          break;

        i = stack.pop();
        y = stack.pop();
        x = stack.pop();
      }
    }

    out.size = size;
    return out;
  }

  getTile(x, y) {
    const w = this.w;
    const h = this.h;

    // DEBUG:@{
    if (x < 0 || y < 0 || x >= this.w || y >= this.h)
      FAILED(`"Coordinate [${x}, ${y}] out of bounds`);
    // DEBUG:@}

    return this.tiles[y * this.w + x];
  }

  getTileSafe(x, y) {
    const w = this.w;
    const h = this.h;

    if (x < 0 || x >= this.w) x = this.normX(x);
    if (y < 0 || y >= this.h) y = this.normY(y);

    return this.tiles[y * this.w + x];
  }

  setTileId(x, y, id) {
    // DEBUG:@{
    if (x < 0 || y < 0 || x >= this.w || y >= this.h)
      FAILED(`"Coordinate [${x}, ${y}] out of bounds`);
    // DEBUG:@}

    const tile = this.tiles[y * this.w + x];
    if (tile.id === id) return;

    const defs = this.game.defs;

    // DEBUG:@{
    if (id >= defs.terrains.length)
      FAILED(`"Tile id '${id}' out of bounds`);
    // DEBUG:@}

    tile.id = id;
    tile.category = defs.terrains[id].category;

    if (this.supressNotifications === 0)
      this.game.invalidateTile(x, y);
  }

  setTileModifiers(x, y, modifiers) {
    const w = this.w;
    const h = this.h;

    // DEBUG:@{
    if (x < 0 || y < 0 || x >= w || y >= h)
      FAILED(`"Coordinate [${x}, ${y}] out of bounds`);
    // DEBUG:@}

    const tile = this.tiles[y * w + x];
    if (tile.modifiers === modifiers) return;

    tile.modifiers = modifiers;

    if (this.supressNotifications === 0)
      this.game.invalidateTile(x, y);
  }

  setTileIdAndModifiers(x, y, id, modifiers) {
    const w = this.w;
    const h = this.h;

    // DEBUG:@{
    if (x < 0 || y < 0 || x >= w || y >= h)
      FAILED(`"Coordinate [${x}, ${y}] out of bounds`);
    // DEBUG:@}

    const tile = this.tiles[y * w + x];
    if (tile.id === id && tile.modifiers === modifiers) return;

    const defs = this.game.defs;

    tile.id = id;
    tile.category = defs.terrains[id].category;
    tile.modifiers = modifiers;

    if (this.supressNotifications === 0)
      this.game.invalidateTile(x, y);
  }

  invalidateTile(x, y) {
    if (this.supressNotifications === 0)
      this.game.invalidateTile(x, y);
  }

  invalidateRect(x, y, w, h) {
    if (this.supressNotifications === 0)
      this.game.invalidateRect(x, y, w, h);
  }

  invalidateAll() {
    if (this.supressNotifications === 0)
      this.game.invalidateAll();
  }

  assignUnit(unit) {
    const tile = this.tiles[unit.y * this.w + unit.x];

    var cur = tile.units;
    if (cur === null) {
      tile.units = unit;
    }
    else {
      while (cur.next !== null)
        cur = cur.next;
      cur.next = unit;
    }
  }

  removeUnit(unit) {
    const tile = this.tiles[unit.y * this.w + unit.x];

    var cur = tile.units;
    var prev = null;

    for (;;) {
      if (cur === null)
        FAILED(`Unit '${unit.slot}' not found at [${unit.x}, ${unit.y}]`);

      if (cur === unit) {
        if (!prev)
          tile.units = cur.next;
        else
          prev.next = cur.next;
        cur.next = null;
        break;
      }

      prev = cur;
      cur = cur.next;
    }
  }

  moveUnit(unit, dstX, dstY) {
    const x = this.normX(dstX);
    const y = this.normY(dstY);

    if (unit.x === x && unit.y === y)
      return;

    this.removeUnit(unit);
    unit.x = x;
    unit.y = y;
    this.assignUnit(unit);
  }

  assignCity(city) {
    const tile = this.tiles[city.y * this.w + city.x];

    tile.city = city;
    tile.workedBy = city;
  }

  removeCity(city) {
    const tile = this.tiles[city.y * this.w + city.x];

    tile.city = null;
    tile.workedBy = null;
  }
}
webciv.GameMap = GameMap;

// ============================================================================
// [Game]
// ============================================================================

/**
 * Game engine.
 */
class Game extends Observable {
  constructor(defs) {
    super();

    if (defs === null || typeof defs !== "object")
      FAILED("The 'defs' argument must be GameDefs");

    if (!defs.finalized)
      FAILED("The 'defs' data must be finalized");

    this.defs = defs;                    // Game definitions.
    this.rules = null;                   // Game rules.

    this.map = new GameMap(this);        // Game map.

    this.turnIndex = 0;                  // Game turn (zero indexed).
    this.turnPlayerSlot = 0;             // Currently playing player.
    this.turnPendingId = null;           //

    this.players = [];                   // Game players.
    this.units = [];                     // Game units.
    this.cities = [];                    // Game cities.
    this.citiesByName = new Map();       // Maps city names to city objects.
    this.random = new Random();          // Random number generator.

    this.uuidGenerator = 0;              // UUID generator.
    this.unnamedCityGenerator = 0;       // Unnamed city generator.

    this.assets = null;                  // Game assets.
    this.renderer = null;                // Game renderer.

    this.rules = this.createRules();

    this.onTurn = this._onTurn.bind(this);
  }

  createRules() {
    const defs = this.defs;

    const src = defs.rules;
    const out = Object.create(null);

    for (var i = 0; i < src.length; i++) {
      const rule = src[i];
      out[rule.name] = rule.value;
    }

    return out;
  }

  createMap(w, h) {
    this.map.resize(w, h, TerrainType.Ocean);
    this.invalidateAll();
  }

  generateMap(info) {
    const Class = webciv.mapgen.generators[info.generator];
    if (typeof Class !== "function")
      FAILED(`Unknown 'generator' name '${info.generator}'`);

    const mapgen = new Class(this, info);
    mapgen.generate();

    this.map.recalc();
    this.invalidateAll();
  }

  invalidateTile(x, y) {
    this.emit("invalidateTile", x, y);
  }

  invalidateRect(x, y, w, h) {
    this.emit("invalidateRect", x, y, w, h);
  }

  invalidateAll() {
    this.emit("invalidateAll");
  }

  calcTile(dst, tile) {
    const defs = this.defs;
    const rules = this.rules;

    const terrainId = tile.id;
    const terrainInfo = defs.terrains[terrainId];

    var food       = terrainInfo.food;
    var production = terrainInfo.production;
    var commerce   = terrainInfo.commerce;
    var defense    = terrainInfo.defense;

    if (tile.city !== null) {
      const cityMinFood       = rules["CityMinFood"];
      const cityMinProduction = rules["CityMinProduction"];
      const cityMinCommerce   = rules["CityMinCommerce"];

      if (food       < cityMinFood      ) food       = cityMinFood;
      if (production < cityMinProduction) production = cityMinProduction;
      if (commerce   < cityMinCommerce  ) commerce   = cityMinCommerce;
    }

    const resourceId = tile.resource;
    const resourceInfo = resourceId !== -1 ? defs.resources[resourceId] : null;

    if (resourceInfo) {
      food       += resourceInfo.food;
      production += resourceInfo.production;
      commerce   += resourceInfo.commerce;
    }

    const modifiers = tile.modifiers;
    if (modifiers & TerrainModifier.kRiver) {
      commerce += rules["RiverCommerceBonus"];
      defense += rules["RiverDefenseBonus"];
    }

    dst.food       = food;
    dst.production = production;
    dst.commerce   = commerce;    
    dst.defense    = defense;
  }

  generateResources(info) {
    const map = this.map;
    const terrains = this.defs.terrains;

    const w = map.w;
    const h = map.h;

    for (var category = 0; category < 2; category++) {
      const objects = (category === TerrainCategory.Ocean) ? map.oceans : map.continents;

      for (var i = 0; i < objects.length; i++) {
        const object = objects[i];
        const coords = object.coords;

        const tiles = [];
        var j, n;

        for (j = 0; j < coords.length; j += 2) {
          const tile = map.getTile(coords[j], coords[j + 1]);
          if (tile.modifiers & TerrainModifier.kRiver)
            continue;
          if (category === TerrainCategory.Ocean && tile.deepness > 2)
            continue;
          tiles.push(tile);
        }

        const numResources = Math.min(
          tiles.length,
          Math.floor(tiles.length * 0.1 + this.random.drand(4.0)));
        
        for (n = 0; n < numResources; n++) {
          for (;;) {
            const index = this.random.irand(tiles.length);
            const tile = tiles[index];

            // Already contains resource.
            if (!tile) continue;

            const terrain = terrains[tile.id];
            const resources = terrain.resources;
            const at = this.random.irand(resources.length);

            tile.resource = resources[at].id;

            // If there is a lot of tiles it's faster to just try another
            // random number, instead of removing the tile from the array.
            if (tiles.length < 32)
              tiles.splice(index, 1);
            else
              tiles[index] = null;
            break;
          }
        }
      }
    }

    this.invalidateAll();
  }

  generatePlayers(count) {
    const locations = this.generateRandomPlayerLocations(count);

    for (var i = 0; i < locations.length; i++) {
      // Find a civilization that has a possible colorType that matches `i`.
      const player = this.createPlayer({
        civ: i,
        colorSlot: i
      });

      if (i > 0)
        player.setAI(new webciv.ai.SimpleAI());

      this.createUnit({
        player: player,
        type: 0,
        x: locations[i].x,
        y: locations[i].y
      });

      this.createUnit({
        player: player,
        type: 0,
        x: locations[i].x,
        y: locations[i].y
      });

      const city = this.createCity({
        player: player,
        size: 1,
        x: locations[i].x,
        y: locations[i].y
      });
    }
  }

  generateRandomPlayerLocations(count) {
    const map = this.map;
    const continents = map.continents;

    if (continents.length === 0)
      FAILED(`The map doesn't contain any continent`);

    const numTries = 255;                // Number of tries to get some locations.

    const minOverseaDistance = 6;        // Minimum distance between locations over sea.
    const minContinentDistance = 12;     // Minimum distance between locations on the same continent.
    const minContinentSize = 50;         // Skip the continent if possible, it's smaller than this.

    const minOverseaDistanceSq = Math.pow(minOverseaDistance, 2);
    const minContinentDistanceSq = Math.pow(minContinentDistance, 2);

    var continentId = 0;                 // Start from the largest continent.
    var result = [];

    function isGoodDistance(x0, y0) {
      for (var j = 0; j < result.length; j++) {
        const x1 = result[j].x;
        const y1 = result[j].y;

        const dx = GameUtils.distance(x0, x1, map.w);
        const dy = GameUtils.distance(y0, y1, map.h);

        const distance = dx * dx + dy * dy;

        const minDistanceSq = map.getTile(x1, y1).continentId !== continentId
          ? minOverseaDistanceSq
          : minContinentDistanceSq;

        if (distance < minDistanceSq)
          return false;
      }

      return true;
    }

    for (var i = 0; i < numTries; i++) {
      const continent = continents[continentId];

      const r = this.random.irand(continent.size) * 2;
      const x = continent.coords[r + 0];
      const y = continent.coords[r + 1];
      const tile = map.getTile(x, y);

      if (tile.id === TerrainType.Grassland && isGoodDistance(x, y)) {
        result.push({ x: x, y: y });
        if (result.length >= count) break;
      }

      if (continent.size < 100 || this.random.drand() < 0.4) {
        // Revert to the first continent if we reached the end.
        if (++continentId >= continents.length)
          continentId = 0;
        // Skip small islands if we still have half the tries.
        else if (continents[continentId].size < minContinentSize) {
          if (i * 2 < numTries)
            continentId = 0;
        }
      }
    }

    return result;
  }

  generateCityName(player) {
    const defs = this.defs;

    const civilization = defs.civilizations[player.civ];
    const cityNames = civilization.cityNames;

    for (var i = 0; i < cityNames.length; i++) {
      const cityName = cityNames[i];
      if (!this.citiesByName.has(cityName))
        return cityName;
    }

    return `Unnamed #${++this.unnamedCityGenerator}`;
  }

  createPlayer(info) {
    const slot = this.$findSlot(this.players);
    const player = new GamePlayer(this, slot, info);

    player.uuid = ++this.uuidGenerator;
    player.$subscribe();

    this.players[slot] = player;
    return player;
  }

  destroyPlayer(player) {
    const slot = player.slot;

    player.$unsubscribe();
    this.players[slot] = null;
  }

  createUnit(info) {
    const slot = this.$findSlot(this.units);
    const unit = new GameUnit(this, slot, info);
    const player = unit.player;

    unit.uuid = ++this.uuidGenerator;

    this.units[slot] = unit;
    this.map.assignUnit(unit);

    player.assignUnit(unit);
    player.uncoverRect(unit.x - 3, unit.y - 3, 7, 7);

    return unit;
  }

  destroyUnit(unit) {
    const slot = unit.slot;

    unit.player.removeUnit(unit);
    this.map.removeUnit(unit);

    this.units[slot] = null;
    unit.deleted = true;
  }

  createCity(info) {
    const player = info.player;

    const slot = this.$findSlot(this.cities);
    const city = new GameCity(this, slot, info);

    city.uuid = ++this.uuidGenerator;

    // If the city has no name assigned (no custom name) then use player's
    // civilization to get some.
    if (!city.name)
      city.name = this.generateCityName(player);

    this.cities[slot] = city;
    this.citiesByName[city.name] = city;

    this.map.assignCity(city);
    player.assignCity(city);

    // TODO: Remove, temporary.
    const Pos = Brush.City;
    for (var i = 0; i < Pos.length; i++) {
      const tile = this.map.getTileSafe(info.x + Pos[i].x, info.y + Pos[i].y);
      tile.territory = player.slot;
    }

    this.emit("invalidateRect", info.x - 2, info.y - 2, 5, 5);
    return city;
  }

  destroyCity(city) {
    const slot = city.slot;

    city.player.removeCity(city);
    this.map.removeCity(city);

    this.cities[slot] = null;
    city.deleted = true;
  }

  endOfTurn() {
    if (++this.turnPlayerSlot >= this.players.length) {
      this.turnPlayerSlot = 0;
      this.turnIndex++;
    }

    if (!this.turnPendingId) {
      this.turnPendingId = setTimeout(this.onTurn, 0);
    }
  }

  setAssetStore(store) {
    this.assetStore = store;
    this.emit("assetStoreAttached", store);
  }

  resetAssetStore() {
    this.assetStore = null;
    this.emit("assetStoreDetached");
  }

  setRenderer(renderer) {
    this.renderer = renderer;
    this.renderer.onAttach(this);
    this.emit("rendererAttached", renderer);
  }

  resetRenderer() {
    this.renderer.onDetach();
    this.renderer = null;
    this.emit("rendererDetached", null);
  }

  setUI(ui) {
    this.ui = ui;
    this.ui.onAttach(this);
    this.emit("uiAttached", ui);
  }

  resetUI() {
    this.ui.onDetach();
    this.ui = null;
    this.emit("uiDetached");
  }

  log() {
    console.log.apply(console, arguments);
    if (this.ui.debugElement) {
      var s = "";
      for (var i = 0; i < arguments.length; i++) {
        var arg = arguments[i];
        if (typeof arg !== "object")
          s += String(arg)
        else
          s += JSON.stringify(arg) + "\n";
      }
      this.ui.debugElement.textContent = s;
    }
  }

  $findSlot(array) {
    for (var i = 0, len = array.length; i < len; i++)
      if (array[i] === null)
        break;
    return i;
  }

  _onTurn(self) {
    this.turnPendingId = null;

    const player = this.players[this.turnPlayerSlot];
    if (player.ai) {
      player.ai.onTurn();
    }
  }

  _onUncovered(x, y, player) {
    var ui = this.ui;
    if (ui && ui.renderer._playerId === player.slot) {
      this.invalidateTile(x, y);
    }
  }
}
webciv.Game = Game;

if ($export)
  $export[$as] = webciv;

}).apply(this, typeof module === "object" && module && module.exports
  ? [Object.create(null), module, "exports"]
  : [this.webciv || (this.webciv = Object.create(null))]);
