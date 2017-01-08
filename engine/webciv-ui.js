// [WebCiv]
// A Strategy Game Engine in JavaScript.
//
// [License]
// MIT - See LICENSE.md file in the package.
(function($webciv, $export, $as) {
"use strict";

const webciv = $webciv;
const GameUtils = webciv.GameUtils;

const TerrainType = webciv.TerrainType;
const TerrainModifier = webciv.TerrainModifier;

const window = this;
const document = window.document;

const ui = Object.create(null);

const UIHacks = new class {
  constructor() {
    this.refCount = 0;
  }

  init() {
    if (++this.refCount === 1)
      document.addEventListener("click", this.$onClick, true);
  }

  free() {
    if (--this.refCount === 0)
      document.removeEventListener("click", this.$onClick, true);
  }

  $onClick(event) {
    // Firefox always opens a link in clipboard on Linux when middle click is
    // pressed. I tried to call prevent default, but that had no effect on that.
    // Fix this if there is a better way as I don't like global handlers like this.
    if (event.button === 1)
      event.preventDefault();
  }
};

class CivUI {
  constructor() {
    this.game = null;

    this.animationFramePending = false;

    this.dirty = false;
    this.dirtyMessageId = "WebCiv$Update$" + (+Date());
    this.renderer = null;

    this.sideElement = null;
    this.debugElement = null;

    this.captured = false;

    this.activeTile = { x: -1, y: -1 };
    this.hoverTile  = { x: -1, y: -1 };

    this.mouseScroll = {
      active: "",
      worldX: -1,
      worldY: -1,
      initialX: -1,
      initialY: -1
    };

    // DOM events - we need to bind them here so we can easily remove them.
    this.onWindowResize = this.onWindowResize.bind(this);
    this.onContextMenu  = this.onContextMenu.bind(this);

    this.onMouseEnter   = this.onMouseEnter.bind(this);
    this.onMouseLeave   = this.onMouseLeave.bind(this);
    this.onMouseDown    = this.onMouseDown.bind(this);
    this.onMouseUp      = this.onMouseUp.bind(this);
    this.onMouseMove    = this.onMouseMove.bind(this);
    this.onClick        = this.onClick.bind(this);
    this.onTouch        = this.onTouch.bind(this);
    this.onKeyDown      = this.onKeyDown.bind(this);
    this.onKeyUp        = this.onKeyUp.bind(this);
    this.onRender       = this.onRender.bind(this);
  }

  setControlElement(element) { this.controlElement = element; }
  setDebugElement(element) { this.debugElement = element; }

  getTileAt(pixX, pixY) {
    const game = this.game;
    const renderer = this.renderer;

    if (game === null || renderer === null)
      return null;

    return game.map.getTileSafe(
      Math.floor((renderer.worldX + pixX) / renderer.tileSize),
      Math.floor((renderer.worldY + pixY) / renderer.tileSize));
  }

  makeDirty() {
    if (this.dirty !== true) {
      this.requestAnimationFrame();
      this.dirty = true;
    }
  }

  requestAnimationFrame() {
    if (!this.animationFramePending) {
      this.animationFramePending = true;
      window.requestAnimationFrame(this.onRender);
    }
  }

  updateCanvasSize() {
    const e = document.getElementById("Main");
    const w = e.clientWidth;
    const h = e.clientHeight;

    this.renderer.updateCanvasSize(w, h);
    this.makeDirty();
  }

  updateHoverTile(tile) {
    var x = -1;
    var y = -1;

    if (tile !== null) {
      x = tile.x;
      y = tile.y;
    }

    const hoverTile = this.hoverTile;
    if (x !== hoverTile.x || y !== hoverTile.y) {
      hoverTile.x = x;
      hoverTile.y = y;

      if (this.debugElement) {
        var debug = `Location: [${x}, ${y}]<br/>`;
        var defs = this.game.defs;

        if (tile !== null) {
          if (tile.continentId !== -1)
            debug += `Terrain: ${defs.terrains[tile.id].name} [continentId=${tile.continentId}]<br />`;
          else
            debug += `Terrain: ${defs.terrains[tile.id].name} [oceanId=${tile.oceanId}]<br />`;

          if (tile.resource !== -1)
            debug += `Resource: ${defs.resources[tile.resource].name}<br />`;

          if (tile.territory !== -1)
            debug += `Territory: ${defs.civilizations[this.game.players[tile.territory].civ].adjective}<br />`;
          else
            debug += `Territory: Neutral<br />`;

          var city = tile.city;
          var unit = tile.units;

          if (city)
            debug += `<br />City: ${city.name} (${defs.civilizations[city.player.civ].adjective})<br />`;

          if (unit)
            debug += "<br />";
          while (unit) {
            debug += `Unit: ${defs.units[unit.id].name} (${defs.civilizations[unit.player.civ].adjective})<br />`;
            unit = unit.next;
          }
        }
        this.debugElement.innerHTML = debug;
      }

      this.makeDirty();
    }
  }

  // --------------------------------------------------------------------------
  // [CaptureMouse / ReleaseMouse]
  // --------------------------------------------------------------------------

  captureMouse() {
    this.captured = true;

    const container = this.renderer.container;
    container.removeEventListener("mousemove", this.onMouseMove, true);

    window.addEventListener("mousemove", this.onMouseMove, true);
    window.addEventListener("mouseup"  , this.onMouseUp  , true);
  }

  releaseMouse() {
    if (this.captured) {
      this.captured = false;
      window.removeEventListener("mousemove", this.onMouseMove, true);
      window.removeEventListener("mouseup"  , this.onMouseUp  , true);

      const container = this.renderer.container;
      container.addEventListener("mousemove", this.onMouseMove, true);
    }
  }

  // --------------------------------------------------------------------------
  // [OnAttach / OnDetach]
  // --------------------------------------------------------------------------

  onAttach(game) {
    this.game = game;

    this.game.on("uncovered"       , this.onUncovered       , this);
    this.game.on("rendererAttached", this.onRendererAttached, this);
    this.game.on("rendererDetached", this.onRendererDetached, this);

    if (game.renderer !== null)
      this.onRendererAttached(game.renderer);
  }

  onDetach() {
    const game = this.game;
    if (game.renderer !== null)
      this.onRendererDetached(game.renderer);

    this.game.off("uncovered"       , this.onUncovered       , this);
    this.game.off("rendererAttached", this.onRendererAttached, this);
    this.game.off("rendererDetached", this.onRendererDetached, this);

    this.game = null;
  }

  // --------------------------------------------------------------------------
  // [OnRendererAttached / OnRendererDetached]
  // --------------------------------------------------------------------------

  onRendererAttached(renderer) {
    this.renderer = renderer;

    window.addEventListener("resize", this.onWindowResize, true);
    window.addEventListener("keydown", this.onKeyDown, true);
    window.addEventListener("keyup", this.onKeyUp, true);

    const container = renderer.container;
    container.addEventListener("contextmenu", this.onContextMenu, true);
    container.addEventListener("mouseenter" , this.onMouseEnter, true);
    container.addEventListener("mouseleave" , this.onMouseLeave, true);
    container.addEventListener("mousedown"  , this.onMouseDown, false);
    container.addEventListener("mousemove"  , this.onMouseMove, true);
    container.addEventListener("click"      , this.onClick, true);

    container.addEventListener("touchstart" , this.onTouch, false);
    container.addEventListener("touchend"   , this.onTouch, false);
    container.addEventListener("touchcancel", this.onTouch, false);
    container.addEventListener("touchmove"  , this.onTouch, false);

    this.updateCanvasSize();
    UIHacks.init();
  }

  onRendererDetached() {
    const renderer = this.renderer;
    const container = renderer.container;

    this.releaseMouse();
    this.renderer = null;

    window.removeEventListener("resize", this.onWindowResize, true);
    window.removeEventListener("keydown", this.onKeyDown, true);
    window.removeEventListener("keyup", this.onKeyUp, true);

    container.removeEventListener("contextmenu", this.onContextMenu, true);
    container.removeEventListener("mouseenter" , this.onMouseEnter, true);
    container.removeEventListener("mouseleave" , this.onMouseLeave, true);
    container.removeEventListener("mousedown"  , this.onMouseDown, false);
    container.removeEventListener("mousemove"  , this.onMouseMove, true);
    container.removeEventListener("click"      , this.onClick, true);

    container.removeEventListener("touchstart" , this.onTouch, false);
    container.removeEventListener("touchend"   , this.onTouch, false);
    container.removeEventListener("touchcancel", this.onTouch, false);
    container.removeEventListener("touchmove"  , this.onTouch, false);

    UIHacks.free();
  }

  // --------------------------------------------------------------------------
  // [onUncovered]
  // --------------------------------------------------------------------------

  onUncovered(x, y, player) {
    const renderer = this.renderer;
    if (renderer) {
      if (player.slot === renderer._playerId) {
        renderer.invalidateTile(x, y);
        this.makeDirty();
      }
    }
  }

  // --------------------------------------------------------------------------
  // [OnWindowResize / OnWindowMessage]
  // --------------------------------------------------------------------------

  onWindowResize(event) {
    this.updateCanvasSize();
  }

  // --------------------------------------------------------------------------
  // [OnContextMenu]
  // --------------------------------------------------------------------------

  onContextMenu(event) {
    event.preventDefault();
  }

  // --------------------------------------------------------------------------
  // [OnMouse...]
  // --------------------------------------------------------------------------

  onMouseEnter(event) {
    if (!this.captured)
      this.onMouseOver(event);
  }

  onMouseLeave(event) {
    if (!this.captured)
      this.updateHoverTile(null);
  }

  onMouseDown(event) {
    if (event.button === 0) {
      // Scrolling.
      const scroll = this.mouseScroll;
      if (!scroll.active) {
        scroll.active = "mouse";
        scroll.worldX = this.game.renderer.worldX;
        scroll.worldY = this.game.renderer.worldY;
        scroll.initialX = event.screenX;
        scroll.initialY = event.screenY;
      }
      // Prevent default must be called before capturing the mouse (if capturing).
      event.preventDefault();
      event.stopPropagation();

      this.captureMouse();
    }
  }

  onMouseUp(event) {
    if (event.button === 0) {
      const scroll = this.mouseScroll;

      if (scroll.active === "mouse") {
        scroll.active = "";
        scroll.worldX = -1;
        scroll.worldY = -1;
        scroll.initialX = -1;
        scroll.initialX = -1;
      }

      // Prevent default must be called before releasing the mouse.
      event.preventDefault();
      event.stopPropagation();

      this.releaseMouse();
    }
  }

  onMouseMove(event) {
    const game = this.game;
    const scroll = this.mouseScroll;

    if (scroll.active === "mouse") {
      // Mouse scroll.
      const renderer = game.renderer;

      const dx = Math.floor(event.screenX - scroll.initialX);
      const dy = Math.floor(event.screenY - scroll.initialY);

      const wx = GameUtils.repeat(scroll.worldX - dx, renderer.worldW);
      const wy = GameUtils.repeat(scroll.worldY - dy, renderer.worldH);

      renderer.worldX = wx;
      renderer.worldY = wy;

      this.makeDirty();
      event.preventDefault();
    }
    else {
      this.onMouseOver(event);
    }
  }

  onMouseOver(event) {
    const tile = this.getTileAt(event.clientX, event.clientY);
    this.updateHoverTile(tile);
  }

  onClick(event) {
    event.preventDefault();
    event.stopPropagation();
    event.returnValue = false;
  }

  // --------------------------------------------------------------------------
  // [OnTouch...]
  // --------------------------------------------------------------------------

  onTouch(event) {
    this.game.log(event);

    //if (event.touches.length > 1 || (event.type == "touchend" && event.touches.length > 0))
    //  return;

    const touch = event.changedTouches ? event.changedTouches[0] : null;
    const scroll = this.mouseScroll;
    const renderer = this.game.renderer;

    switch (event.type) {
      case "touchstart":
        if (!scroll.active) {
          scroll.active = "touch";
          scroll.worldX = renderer.worldX;
          scroll.worldY = renderer.worldY;
          scroll.initialX = touch.clientX;
          scroll.initialY = touch.clientY;
          
          event.preventDefault();
        }
        break;

      case "touchmove":
        if (scroll.active === "touch") {
          const dx = Math.floor(touch.clientX - scroll.initialX);
          const dy = Math.floor(touch.clientY - scroll.initialY);

          const wx = GameUtils.repeat(scroll.worldX - dx, renderer.worldW);
          const wy = GameUtils.repeat(scroll.worldY - dy, renderer.worldH);

          renderer.worldX = wx;
          renderer.worldY = wy;

          this.makeDirty();
          event.preventDefault();
        }
        break;

      case "touchend":
        if (scroll.active === "touch") {
          scroll.active = "";
          scroll.worldX = -1;
          scroll.worldY = -1;
          scroll.initialX = -1;
          scroll.initialX = -1;

          event.preventDefault();
        }
        break;
    }
  }

  // --------------------------------------------------------------------------
  // [OnKey...]
  // --------------------------------------------------------------------------

  onKeyDown(event) {
    this.game.log(event)
    const hoverTile = this.hoverTile;

    switch (event.key) {
      case "d":
        this.renderer.debug = Math.floor((this.renderer.debug + 1) % 5);
        this.renderer.invalidateAll();
        this.makeDirty();
        break;

      case "v":
        var id = this.renderer.playerId;
        if (++id >= this.game.players.length)
          id = -1;
        this.renderer.playerId = id;
        break;
      
      case "u":
        if (hoverTile.x !== -1 && this.renderer.playerId !== -1) {
          this.game.players[this.renderer.playerId].uncoverTile(hoverTile.x, hoverTile.y);

          //this.renderer.invalidateAll();
          //this.makeDirty();
        }
        break;

      case "e": {
        this.game.endOfTurn();
        break;
      }
    }

    if (hoverTile.x !== -1) {
      const map = this.game.map;
      const tile = map.getTile(hoverTile.x, hoverTile.y);

      var dirty = false;

      var tileId = tile.id;
      var tileModifiers = tile.modifiers;

      var addMod = 0;
      var delMod = 0;
      var toggleMod = 0;

      switch (event.key) {
        case "0": tileId = TerrainType.Ocean    ; break;
        case "1": tileId = TerrainType.Desert   ; break;
        case "2": tileId = TerrainType.Plains   ; break;
        case "3": tileId = TerrainType.Grassland; break;
        case "4": tileId = TerrainType.Jungle   ; tileModifiers &= ~TerrainModifier.kIrrigation; break;
        case "5": tileId = TerrainType.Tundra   ; tileModifiers &= ~TerrainModifier.kIrrigation; break;
        case "6": tileId = TerrainType.Arctic   ; tileModifiers &= ~TerrainModifier.kIrrigation; break;

        case "c":
          tileModifiers &= ~(TerrainModifier.kRoad |
                             TerrainModifier.kRailroad |
                             TerrainModifier.kIrrigation);
          break;

        case "r":
          if (tileId !== TerrainType.Ocean)
            tileModifiers |= (tileModifiers & TerrainModifier.kRoad) ? TerrainModifier.kRailroad : TerrainModifier.kRoad;
          break;

        case "i":
          if (tileId === TerrainType.Desert || 
              tileId === TerrainType.Plains ||
              tileId === TerrainType.Grassland)
            tileModifiers ^= TerrainModifier.kIrrigation;
          break;

        case "x":
          if (tileId !== TerrainType.Ocean)
            tileModifiers ^= TerrainModifier.kRiver;
          break;
      }

      if (tileId == TerrainType.Ocean) {
        tileModifiers &= ~(TerrainModifier.kRiver     |
                           TerrainModifier.kRoad      |
                           TerrainModifier.kRailroad  |
                           TerrainModifier.kIrrigation);
      }

      map.setTileIdAndModifiers(tile.x, tile.y, tileId, tileModifiers);
    }
  }

  onKeyUp(event) {

  }

  // --------------------------------------------------------------------------
  // [OnRender]
  // --------------------------------------------------------------------------

  onRender() {
    var dirty = this.dirty;

    this.dirty = false;
    this.animationFramePending = false;

    if (this.renderer && dirty) {
      this.renderer.render();
      this.renderOverlay();
    }

    if (dirty)
      this.requestAnimationFrame();
  }

  renderOverlay() {
    var ctx = this.renderer.overlayCanvas.getContext("2d");
    ctx.clearRect(0, 0, this.renderer.sceneW, this.renderer.sceneH);
    ctx.fillStyle = "rgba(255, 255, 255, 0.33)";

    const x = this.hoverTile.x;
    const y = this.hoverTile.y;

    if (x !== -1) {
      var dx = x * 32 - this.renderer.worldX;
      var dy = y * 32 - this.renderer.worldY;

      if (dx <= -32) dx += this.renderer.worldW;
      if (dy <= -32) dy += this.renderer.worldH;

      ctx.fillRect(dx, dy, 32, 32);
    }
  }
}
ui.CivUI = CivUI;

$export[$as] = ui;

}).apply(this, typeof this.webciv === "object"
  ? [this.webciv, this.webciv, "ui"] : [require("./webciv-core"), module, "exports"]);
