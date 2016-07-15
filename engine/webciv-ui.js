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

    this.dirty = false;
    this.dirtyMessageId = "WebCiv$Update$" + (+Date());
    this.renderer = null;

    this.sideElement = null;
    this.debugElement = null;

    this.captured = false;

    this.activeTile = {
      x: -1,
      y: -1
    };

    this.mouseScroll = {
      active: false,
      worldX: -1,
      worldY: -1,
      initialX: -1,
      initialY: -1
    };

    // DOM events - we need to bind them here so we can easily remove them.
    this.onWindowResize = this.onWindowResize.bind(this);
    this.onContextMenu = this.onContextMenu.bind(this);

    this.onMouseEnter = this.onMouseEnter.bind(this);
    this.onMouseLeave = this.onMouseLeave.bind(this);
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onClick = this.onClick.bind(this);
    this.onRender = this.onRender.bind(this);
  }

  setControlElement(element) { this.controlElement = element; }
  setDebugElement(element) { this.debugElement = element; }

  getTileAt(pixX, pixY) {
    const game = this.game;
    const renderer = this.renderer;

    if (game === null || renderer === null)
      return null;

    return game.map.getTile(
      Math.floor((renderer.worldX + pixX) / renderer.tileSize),
      Math.floor((renderer.worldY + pixY) / renderer.tileSize));
  }

  makeDirty() {
    if (this.dirty !== true) {
      this.dirty = true;
      window.requestAnimationFrame(this.onRender);
    }
  }

  updateCanvasSize() {
    const e = document.getElementById("Main");
    const w = e.clientWidth;
    const h = e.clientHeight;

    const element = this.renderer.element;
    element.width = w;
    element.height = h;

    this.renderer.updateCanvasSize(w, h);
    this.makeDirty();
  }

  updateActiveTile(tile) {
    var x = -1;
    var y = -1;

    if (tile !== null) {
      x = tile.x;
      y = tile.y;
    }

    if (x !== this.activeTile.x || y !== this.activeTile.y) {
      this.activeTile.x = x;
      this.activeTile.y = y;
      // this.makeDirty();

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
    }
  }

  // --------------------------------------------------------------------------
  // [CaptureMouse / ReleaseMouse]
  // --------------------------------------------------------------------------

  captureMouse() {
    this.captured = true;

    const element = this.renderer.element;
    element.removeEventListener("mousemove", this.onMouseMove, true);

    window.addEventListener("mousemove", this.onMouseMove, true);
    window.addEventListener("mouseup"  , this.onMouseUp  , true);
  }

  releaseMouse() {
    if (this.captured) {
      this.captured = false;
      window.removeEventListener("mousemove", this.onMouseMove, true);
      window.removeEventListener("mouseup"  , this.onMouseUp  , true);

      const element = this.renderer.element;
      element.addEventListener("mousemove", this.onMouseMove, true);
    }
  }

  // --------------------------------------------------------------------------
  // [OnAttach / OnDetach]
  // --------------------------------------------------------------------------

  onAttach(game) {
    this.game = game;

    this.game.on("rendererAttached", this.onRendererAttached, this);
    this.game.on("rendererDetached", this.onRendererDetached, this);

    if (game.renderer !== null)
      this.onRendererAttached(game.renderer);
  }

  onDetach() {
    const game = this.game;
    if (game.renderer !== null)
      this.onRendererDetached(game.renderer);

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

    const element = renderer.element;
    element.addEventListener("contextmenu", this.onContextMenu, true);
    element.addEventListener("mouseenter", this.onMouseEnter, true);
    element.addEventListener("mouseleave", this.onMouseLeave, true);

    element.addEventListener("mousedown", this.onMouseDown, false);
    element.addEventListener("mousemove", this.onMouseMove, true);
    element.addEventListener("click", this.onClick, true);

    this.updateCanvasSize();
    UIHacks.init();
  }

  onRendererDetached() {
    const renderer = this.renderer;
    const element = renderer.element;

    this.releaseMouse();
    this.renderer = null;

    window.removeEventListener("resize", this.onWindowResize, true);

    element.removeEventListener("contextmenu", this.onContextMenu, true);
    element.removeEventListener("mouseenter", this.onMouseEnter, true);
    element.removeEventListener("mouseleave", this.onMouseLeave, true);

    element.removeEventListener("mousedown", this.onMouseDown, false);
    element.removeEventListener("mousemove", this.onMouseMove, true);
    element.removeEventListener("click", this.onClick, true);

    UIHacks.free();
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
      this.updateActiveTile(null);
  }

  onMouseDown(event) {
    // Prevent default must be called before capturing the mouse (if capturing).
    event.preventDefault();
    event.stopPropagation();

    if (event.button === 0) {
      if (this.activeTile.x !== -1) {
        const map = this.game.map;
        const tile = map.getTile(this.activeTile.x, this.activeTile.y);
        if (tile.id === TerrainType.Ocean) {
          tile.id = TerrainType.Grassland;
        }
        else {
          if (tile.id === TerrainType.Grassland)
            tile.id = TerrainType.Plains;
          else if (tile.id === TerrainType.Plains)
            tile.id = TerrainType.Desert;
          else if (tile.id === TerrainType.Desert)
            tile.id = TerrainType.Tundra;
          else if (tile.id === TerrainType.Tundra)
            tile.id = TerrainType.Arctic;
          else
            tile.id = TerrainType.Grassland;
        }
        this.game.emit("invalidateTile", tile.x, tile.y);
        this.makeDirty();
      }
    }
    else if (event.button === 2) {
      if (this.activeTile.x !== -1) {
        const map = this.game.map;
        const tile = map.getTile(this.activeTile.x, this.activeTile.y);
        if (tile.id !== TerrainType.Ocean) {
          tile.id = TerrainType.Ocean;
          tile.modifiers &= ~(TerrainModifier.kRoad | TerrainModifier.kIrrigation | TerrainModifier.kRiver);
          //tile.modifiers |= TerrainModifier.kIrrigation;
        }

        // tile.id = TerrainType.Grassland;
        this.game.emit("invalidateTile", tile.x, tile.y);
        this.makeDirty();
      }
    }
    else if (event.button === 1) {
      // Scrolling.
      const ms = this.mouseScroll;

      ms.active = true;
      ms.worldX = this.game.renderer.worldX;
      ms.worldY = this.game.renderer.worldY;
      ms.initialX = event.screenX;
      ms.initialY = event.screenY;

      this.captureMouse();
    }
  }

  onMouseUp(event) {
    // Prevent default must be called before releasing the mouse.
    event.preventDefault();
    event.stopPropagation();

    if (event.button === 1) {
      const ms = this.mouseScroll;

      ms.active = false;
      ms.worldX = -1;
      ms.worldY = -1;
      ms.initialX = -1;
      ms.initialX = -1;

      this.releaseMouse();
    }
  }

  onMouseMove(event) {
    const game = this.game;
    const ms = this.mouseScroll;

    if (ms.active) {
      // Mouse scroll.
      const renderer = game.renderer;

      const dx = event.screenX - ms.initialX;
      const dy = event.screenY - ms.initialY;

      const wx = GameUtils.repeat(ms.worldX - dx, renderer.worldW);
      const wy = GameUtils.repeat(ms.worldY - dy, renderer.worldH);

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
    this.updateActiveTile(tile);
  }

  onClick(event) {
    event.preventDefault();
    event.stopPropagation();
    event.returnValue = false;
  }

  // --------------------------------------------------------------------------
  // [OnRender]
  // --------------------------------------------------------------------------

  onRender() {
    this.dirty = false;
    if (this.renderer === null)
      return;
    this.renderer.render();
  }
}
ui.CivUI = CivUI;

$export[$as] = ui;

}).apply(this, typeof this.webciv === "object"
  ? [this.webciv, this.webciv, "ui"] : [require("./webciv-core"), module, "exports"]);
