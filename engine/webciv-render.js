// [WebCiv]
// A Strategy Game Engine in JavaScript.
//
// [License]
// MIT - See LICENSE.md file in the package.
(function($core, $export, $as) {
"use strict";

/* global document */
/* global Image */

const core = $core;
const render = Object.create(null);

const FAILED = core.FAILED;
const mindom = core.mindom;
const GameUtils = core.GameUtils;
const GameLimits = core.GameLimits;

const EdgeFlags = core.EdgeFlags;
const Observable = core.Observable;

const TerrainType = core.TerrainType;
const TerrainModifier = core.TerrainModifier;

const freeze = Object.freeze;

const RoadIndex = freeze([1, 3, 5, 7, 2, 4, 6, 8]);

const MaskTL = EdgeFlags.TopLeft     | EdgeFlags.Top    | EdgeFlags.Left;
const MaskTR = EdgeFlags.TopRight    | EdgeFlags.Top    | EdgeFlags.Right;
const MaskBL = EdgeFlags.BottomLeft  | EdgeFlags.Bottom | EdgeFlags.Left;
const MaskBR = EdgeFlags.BottomRight | EdgeFlags.Bottom | EdgeFlags.Right;

// Decrease the number of roads we render as it gets very messy when roads
// connect in all directions.
function simplifyRoadEdges(edges) {
  if ((edges & MaskTL) === MaskTL) edges ^= EdgeFlags.TopLeft;
  if ((edges & MaskTR) === MaskTR) edges ^= EdgeFlags.TopRight;
  if ((edges & MaskBL) === MaskBL) edges ^= EdgeFlags.BottomLeft;
  if ((edges & MaskBR) === MaskBR) edges ^= EdgeFlags.BottomRight;

  return edges;
}

function drawText(ctx, args) {
  if (args.font)
    ctx.font = args.font;

  if (args.center) {
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
  }

  if (args.stroke) {
    ctx.strokeStyle = args.stroke;
    ctx.strokeText(args.text, args.x, args.y);
  }

  if (args.fill) {
    ctx.fillStyle = args.fill;
    ctx.fillText(args.text, args.x, args.y);
  }
}

// ============================================================================
// [RenderUtils]
// ============================================================================

function makeTransitionData(sides) {
  const comb = [];                       // All possible combinations.
  const lut = [];                        // Lookup table, translates mask to index in `comb`.

  for (var i = 0; i < 256; i++) lut.push(-1);

  // Sides   - Defined as 1234 bits, thus `0...15`.
  // Corners - Defined as 5678 bits, thus `16...256`.
  for (var side = 0; side < sides.length; side++) {
    const effective = sides[side];

    for (var corner = 16; corner < 256; corner += 16) {
      var lutIndex = side | corner;
      var altIndex = side | (corner & effective);

      if (lut[altIndex] !== -1) {
        // Already in `PRE` table.
        lut[lutIndex] = lut[altIndex];
      }
      else {
        // New combination.
        const preIndex = comb.length;
        comb.push(altIndex);
        lut[lutIndex] = lut[altIndex] = preIndex;
      }
    }
  }

  return {
    PRE: new Int32Array(comb), // Preprocessing table.
    LUT: new Int32Array(lut)  // Render lookup table.
  };
}

const TerrainTransitions = makeTransitionData([
  EdgeFlags.Corners                            , // |       |
  EdgeFlags.BottomLeft | EdgeFlags.BottomRight , // |      T|
  EdgeFlags.TopLeft    | EdgeFlags.BottomLeft  , // |    R  |
  EdgeFlags.BottomLeft                         , // |    R T|
  EdgeFlags.TopLeft    | EdgeFlags.TopRight    , // |  B    |
  EdgeFlags.None                               , // |  B   T|
  EdgeFlags.TopLeft                            , // |  B R  |
  EdgeFlags.None                               , // |  B R T|
  EdgeFlags.TopRight   | EdgeFlags.BottomRight , // |L      |
  EdgeFlags.BottomRight                        , // |L     T|
  EdgeFlags.None                               , // |L   R  |
  EdgeFlags.None                               , // |L   R T|
  EdgeFlags.TopRight                           , // |L B    |
  EdgeFlags.None                               , // |L B   T|
  EdgeFlags.None                               , // |L B R  |
  EdgeFlags.None                                 // |L B R T|
]);
render.TerrainTransitions = TerrainTransitions;

const TerritoryTransitions = makeTransitionData([
  EdgeFlags.None                               , // |       |
  EdgeFlags.None                               , // |      T|
  EdgeFlags.None                               , // |    R  |
  EdgeFlags.TopRight                           , // |    R T|
  EdgeFlags.None                               , // |  B    |
  EdgeFlags.None                               , // |  B   T|
  EdgeFlags.BottomRight                        , // |  B R  |
  EdgeFlags.TopRight   | EdgeFlags.BottomRight , // |  B R T|
  EdgeFlags.None                               , // |L      |
  EdgeFlags.TopLeft                            , // |L     T|
  EdgeFlags.None                               , // |L   R  |
  EdgeFlags.TopLeft    | EdgeFlags.TopRight    , // |L   R T|
  EdgeFlags.BottomLeft                         , // |L B    |
  EdgeFlags.TopLeft    | EdgeFlags.BottomLeft  , // |L B   T|
  EdgeFlags.BottomLeft | EdgeFlags.BottomRight , // |L B R  |
  EdgeFlags.Corners                              // |L B R T|
]);
render.TerritoryTransitions = TerritoryTransitions;

const kDiv255 = 1.0 / 255.0;

/**
 * Graphics effects performed on images that contain only alpha channel.
 *
 * Explanation of arguments to various functions:
 *
 *   `dst`  - Destination, should be Float64Array or ImageData.
 *   `doff` - Destination offset
 *   `dw`   - Destination width
 *
 *   `src`  - Source, should be Float64Array or ImageData.
 *   `soff` - Source offset
 *   `sw`   - Source width
 *
 *   `w`    - Width of the operation
 *   `h`    - Height of the operation
 */
class AlphaGFX {
  static fromARGB32(dst, doff, dw, src, soff, sw, w, h) {
    var di = doff;
    var si = soff * 4 + 3; // Alpha component is at [3].

    const dRowInc = (dw - w);
    const sRowInc = (sw - w) * 4;

    for (var y = 0; y < h; y++, di += dRowInc, si += sRowInc) {
      for (var x = 0; x < w; x++, di++, si += 4) {
        dst[di] = src[si] * kDiv255;
      }
    }
    return dst;
  }

  static toARGB32(dst, doff, dw, src, soff, sw, w, h) {
    var di = doff * 4;
    var si = soff;

    const dRowInc = (dw - w) * 4;
    const sRowInc = (sw - w);

    for (var y = 0; y < h; y++, di += dRowInc, si += sRowInc) {
      for (var x = 0; x < w; x++, di += 4, si++) {
        dst[di + 0] = 0;
        dst[di + 1] = 0;
        dst[di + 2] = 0;
        dst[di + 3] = Math.floor(src[si] * 255);
      }
    }
    return dst;
  }

  static blur(dst, doff, dw, src, soff, sw, w, h, radius) {
    var x, y, i;
    var sum;

    const size = radius * 2 + 1;
    const rcp = 1.0 / size;
    const buf = new Float64Array(size);

    for (y = 0; y < h; y++) {
      var di = doff + y * dw;
      var si = soff + y * sw;

      var sx = si - radius;
      var sxMax = si + (w - 1);

      sum = 0;
      for (i = 0; i < size; i++, sx++) {
        const c = src[GameUtils.clamp(sx, si, sxMax)];
        sum += c;
        buf[i] = c;
      }

      i = 0;
      for (x = 0; x < w; x++, sx++) {
        const c = src[GameUtils.clamp(sx, si, sxMax)];
        dst[di + x] = Math.min(sum * rcp, 1.0);

        sum = sum + c - buf[i];
        buf[i] = c;
        if (++i >= size) i = 0;
      }
    }

    for (x = 0; x < w; x++) {
      var di = doff + x;

      var dy = di - radius * dw;
      var dyMax = di + (h - 1) * dw;

      sum = 0;
      for (i = 0; i < size; i++, dy += dw) {
        const c = dst[GameUtils.clamp(dy, di, dyMax)];
        sum += c;
        buf[i] = c;
      }

      i = 0;
      for (y = 0; y < h; y++, dy += dw) {
        const c = dst[GameUtils.clamp(dy, di, dyMax)];
        dst[di + y * dw] = Math.min(sum * rcp, 1.0);

        sum = sum + c - buf[i];
        buf[i] = c;
        if (++i >= size) i = 0;
      }
    }
    return dst;
  }

  static brighten(dst, doff, dw, src, soff, sw, w, h, amount) {
    var di = doff; dw -= w;
    var si = soff; sw -= w;

    for (var y = 0; y < h; y++, di += dw, si += sw)
      for (var x = 0; x < w; x++, di++, si++)
        dst[di] = GameUtils.clamp(src[si] * amount, 0.0, 1.0);

    return dst;
  }

  static invert(dst, doff, dw, src, soff, sw, w, h) {
    var di = doff; dw -= w;
    var si = soff; sw -= w;

    for (var y = 0; y < h; y++, di += dw, si += sw)
      for (var x = 0; x < w; x++, di++, si++)
        dst[di] = 1.0 - src[si];

    return dst;
  }

  static in(dst, doff, dw, src, soff, sw, w, h) {
    var di = doff; dw -= w;
    var si = soff; sw -= w;

    for (var y = 0; y < h; y++, di += dw, si += sw) {
      for (var x = 0; x < w; x++, di++, si++) {
        const sa = src[si];
        const da = dst[di];
        dst[di] = sa * da;
      }
    }
    return dst;
  }

  static out(dst, doff, dw, src, soff, sw, w, h) {
    var di = doff; dw -= w;
    var si = soff; sw -= w;

    for (var y = 0; y < h; y++, di += dw, si += sw) {
      for (var x = 0; x < w; x++, di++, si++) {
        const sa = src[si];
        const da = dst[di];
        dst[di] = sa * (1.0 - da);
      }
    }
    return dst;
  }
}

/**
 * Rendering utilities.
 */
class RenderUtils {
  static createCanvas(w, h) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    return canvas;
  }

  static parseColor(s) {
    // Parse "#RGB" and "#RRGGBB".
    const len = s.length;
    if (len >= 4 && s.charCodeAt(0) === 35) {
      if (len === 4 || len === 7) {
        var color = 0;
        var shift = len === 7 ? 4 : 8;

        for (var i = 1; i < len; i++) {
          var c = s.charCodeAt(i);
          if (c >= 48 && c <= 57)
            color = (color << shift) | (c - 48);
          else if (((c |= 0x20) >= 97 && c <= 102))
            color = (color << shift) | (c - 97 + 10);
          else
            FAILED(`Invalid color '${s}'`);
        }

        if (len === 4)
          color *= 0x11;
        return 0xFF000000 | color;
      }
    }

    FAILED(`Invalid color '${s}'`);
  }

  static colorizeImage(dst, dstX, dstY, src, color1, color2) {
    const w = src.width;
    const h = src.height;

    const imdata = src.getContext("2d").getImageData(0, 0, w, h);
    const pixels = imdata.data;
    const wh = w * h * 4;

    const c1 = RenderUtils.parseColor(color1);
    const c2 = RenderUtils.parseColor(color2);

    for (var i = 0; i < wh; i += 4) {
      var r = pixels[i + 0];
      var g = pixels[i + 1];
      var b = pixels[i + 2];
      var a = pixels[i + 3];

      if (r == 0x61 && g == 0xE3 && b == 0x65) {
        r = (c1 >>> 16) & 0xFF;
        g = (c1 >>>  8) & 0xFF;
        b = (c1 >>>  0) & 0xFF;
      }
      else if (r === 0x2C && g === 0x79 && b == 0x00) {
        r = (c2 >>> 16) & 0xFF;
        g = (c2 >>>  8) & 0xFF;
        b = (c2 >>>  0) & 0xFF;
      }

      pixels[i + 0] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = a;
    }

    dst.getContext("2d").putImageData(imdata, dstX, dstY);
    return dst;
  }

  static colorizeMulti(src, colors) {
    const dst = RenderUtils.createCanvas(src.width, src.height * colors.length);
    for (var i = 0; i < colors.length; i++) {
      const slot = colors[i];
      RenderUtils.colorizeImage(dst, 0, src.height * i, src, slot.primary, slot.secondary);
    }
    return dst;
  }

  static preprocessTransitions(src, table, invert) {
    const sqSize = 32;
    const sqHalf = 16; // Half width/height.

    const dst = RenderUtils.createCanvas(table.length * sqSize, sqSize);
    const ctx = dst.getContext("2d");

    for (var i = 0, dx = 0; i < table.length; i++, dx += sqSize) {
      var sides   = table[i] & EdgeFlags.Sides;
      var corners = table[i] & EdgeFlags.Corners;

      if (sides)
        ctx.drawImage(src, sides * sqSize, 0, sqSize, sqSize, dx, 0, sqSize, sqSize);

      if (corners & EdgeFlags.TopLeft    ) ctx.drawImage(src, 0     , 0     , sqHalf, sqHalf, dx         , 0     , sqHalf, sqHalf);
      if (corners & EdgeFlags.TopRight   ) ctx.drawImage(src, sqHalf, 0     , sqHalf, sqHalf, dx + sqHalf, 0     , sqHalf, sqHalf);
      if (corners & EdgeFlags.BottomLeft ) ctx.drawImage(src, 0     , sqHalf, sqHalf, sqHalf, dx         , sqHalf, sqHalf, sqHalf);
      if (corners & EdgeFlags.BottomRight) ctx.drawImage(src, sqHalf, sqHalf, sqHalf, sqHalf, dx + sqHalf, sqHalf, sqHalf, sqHalf);
    }

    if (invert) {
      ctx.globalCompositeOperation = "xor";
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, dst.width, dst.height);
    }

    return dst;
  }

  static generateSurroundings(src, info) {
    const sq = info.square;          // Size of one square (width and height).
    const scale = info.scale !== undefined ? info.scale : 1;

    var radius = info.radius;
    var iter = info.iterations || 1;

    const sw = src.width;                  // Source width;
    const sh = src.height;                 // Source height;
    const tw = sw / sq;                    // Number of tiles horizontally.
    const th = sh / sq;                    // Number of tiles vertically.

    const t0 = new Float64Array(sq * sq);  // Temporary buffer #0 for a single tile.
    const t1 = new Float64Array(sq * sq);  // Temporary buffer #1 for a single tile.

    const img = src.getContext("2d").getImageData(0, 0, sw, sh);
    const pix = img.data;

    for (var ty = 0; ty < th; ty++) {
      for (var tx = 0; tx < tw; tx++) {
        const soff = (ty * src.width + tx) * sq;
        AlphaGFX.fromARGB32(t0, 0, sq, pix, soff, sw, sq, sq);

        // ----------------- DST Do, Dw SRC So Sw    W/H   ...Additional -------
        if (info.invert)
          AlphaGFX.invert    (t1, 0, sq, t0, 0, sq, sq, sq);
        else
          AlphaGFX.brighten  (t1, 0, sq, t0, 0, sq, sq, sq, 1.0);

        for (var i = 0; i < iter; i++)
          AlphaGFX.blur      (t1, 0, sq, t1, 0, sq, sq, sq, Math.max(radius - iter, 1));

        if (info.invert)
          AlphaGFX.in        (t0, 0, sq, t1, 0, sq, sq, sq);
        else
          AlphaGFX.out       (t0, 0, sq, t1, 0, sq, sq, sq);

        AlphaGFX.brighten    (t0, 0, sq, t0, 0, sq, sq, sq, scale);
        // ---------------------------------------------------------------------

        AlphaGFX.toARGB32(pix, soff, sw, t0, 0, sq, sq, sq);
      }
    }
    const dst = RenderUtils.createCanvas(sw, sh);
    dst.getContext("2d").putImageData(img, 0, 0);
    return dst;
  }

  static generateTerritoryTransitions(table, colors) {
    // TODO: Hardcoded.
    const sqSize = 32;
    const sqHalf = sqSize * 0.5;

    const iw = sqSize * table.length;
    const ih = sqSize * colors.length;

    const img = RenderUtils.createCanvas(iw, ih);
    const ctx = img.getContext("2d");

    const imdata = ctx.getImageData(0, 0, iw, ih);
    const pixels = imdata.data;

    const radius = 16;
    const opacity = 255;

    var i, dx;

    const kDist = 4;

    function outerCorner(x, y) { return Math.min(x, y); }
    function innerCorner(x, y) { return Math.hypot(x, y); }

    // Generate transitions.
    for (i = 0, dx = 0; i < table.length; i++, dx += sqSize) {
      const edges = table[i];
      for (var ty = 0; ty < sqSize; ty++) {
        var p = ty * iw * 4 + dx * 4;
        for (var tx = 0; tx < sqSize; tx++, p += 4) {
          // Exploit the symmetry to simplify the generation logic. Normalize both
          // coordinates to 0..half and only "virtually" process the left-top part.
          var x = tx;
          var y = ty;
          var mask = 0;
          var dist = -1;

          if (x < sqHalf && y < sqHalf) {
            mask = edges & (EdgeFlags.Left | EdgeFlags.Top | EdgeFlags.TopLeft);
          }
          else if (x >= sqHalf && y < sqHalf) {
            mask = ((edges & EdgeFlags.Top        ) ? EdgeFlags.Top     : 0) |
                   ((edges & EdgeFlags.Right      ) ? EdgeFlags.Left    : 0) |
                   ((edges & EdgeFlags.TopRight   ) ? EdgeFlags.TopLeft : 0) ;
            x = sqSize - 1 - x;
          }
          else if (x < sqHalf && y >= sqHalf) {
            mask = ((edges & EdgeFlags.Bottom     ) ? EdgeFlags.Top     : 0) |
                   ((edges & EdgeFlags.Left       ) ? EdgeFlags.Left    : 0) |
                   ((edges & EdgeFlags.BottomLeft ) ? EdgeFlags.TopLeft : 0) ;
            y = sqSize - 1 - y;
          }
          else {
            mask = ((edges & EdgeFlags.Bottom     ) ? EdgeFlags.Top     : 0) |
                   ((edges & EdgeFlags.Right      ) ? EdgeFlags.Left    : 0) |
                   ((edges & EdgeFlags.BottomRight) ? EdgeFlags.TopLeft : 0) ;
            x = sqSize - 1 - x;
            y = sqSize - 1 - y;
          }

          if (x < radius && y < radius) {
            const bits = (~mask) & (EdgeFlags.Left | EdgeFlags.Top);
            if      (bits === (EdgeFlags.Left | EdgeFlags.Top)) dist = outerCorner(x, y);
            else if (bits === EdgeFlags.Left && ((mask & EdgeFlags.TopLeft) !== 0 && (y <= kDist && x <= kDist))) dist = outerCorner(x, y);
            else if (bits === EdgeFlags.Top  && ((mask & EdgeFlags.TopLeft) !== 0 && (x <= kDist && y <= kDist))) dist = outerCorner(x, y);
            else if (bits === EdgeFlags.Left) dist = x;
            else if (bits === EdgeFlags.Top ) dist = y;
            else if ((mask & EdgeFlags.TopLeft) === 0) dist = innerCorner(x, y);
          }
          else {
            if      ((mask & EdgeFlags.Left  ) === 0) dist = x;
            else if ((mask & EdgeFlags.Top   ) === 0) dist = y;
            else dist = 0;
          }

          var a = 0;
          if (dist >= 0) {
            dist = radius - dist;
            //if (dist > radius) {
            //  dist = radius;
              //dist = (dist > radius + 1) ? 0 : (radius + 1 - dist) * radius;
            //}

            const t = 1 - Math.pow((radius - dist) / radius, 0.3);
            a = Math.floor(opacity * t);
          }

          pixels[p + 0] = 0;
          pixels[p + 1] = 0;
          pixels[p + 2] = 0;
          pixels[p + 3] = a;
        }
      }
    }

    // Colorize transitions.
    const size = iw * sqSize;

    for (i = colors.length - 1; i >= 0; i--) {
      var srcIndex = 0;
      var dstIndex = i * size * 4;

      const ca = RenderUtils.parseColor(colors[i].primary);
      const cb = RenderUtils.parseColor(colors[i].primary);

      const ar = Math.min(((ca >> 16) & 0xFF) + 32, 255);
      const ag = Math.min(((ca >>  8) & 0xFF) + 32, 255);
      const ab = Math.min(((ca >>  0) & 0xFF) + 32, 255);

      const br = (cb >> 16) & 0xFF;
      const bg = (cb >>  8) & 0xFF;
      const bb = (cb >>  0) & 0xFF;

      for (dx = 0; dx < size; dx++, dstIndex += 4, srcIndex += 4) {
        const a = pixels[srcIndex + 3];
        pixels[dstIndex + 0] = a === 255 ? ar : br;
        pixels[dstIndex + 1] = a === 255 ? ag : bg;
        pixels[dstIndex + 2] = a === 255 ? ab : bb;
        pixels[dstIndex + 3] = a;
      }
    }

    ctx.putImageData(imdata, 0, 0);
    return img;
  }

  static createAtlasIndex(canvas, sqSize) {
    const bw = canvas.width;
    const bh = canvas.height;

    const tw = bw / sqSize;
    const th = bh / sqSize;

    if (!Number.isInteger(tw) || !Number.isInteger(th))
      FAILED(`BlendMap of size [${bw}, ${bh}] is not divisible by ${sqSize}`);

    // RGBA32 pixels.
    const data = canvas.getContext("2d").getImageData(0, 0, bw, bh).data;
    const index = [];
    const stride = (bw - sqSize) * 4;

    for (var ty = 0; ty < th; ty++) {
      var dOff = ty * bw;

      for (var tx = 0; tx < tw; tx++, dOff += sqSize) {
        var dPtr = dOff * 4 + 3; // Alpha is at [3]rd index.

        // Calculate bounding box of this square.
        var xMin = sqSize, xMax = 0;
        var yMin = sqSize, yMax = 0;
        for (var py = 0; py < sqSize; py++, dPtr += stride) {
          for (var px = 0; px < sqSize; px++, dPtr += 4) {
            if (data[dPtr] !== 0) {
              xMin = Math.min(xMin, px);
              yMin = Math.min(yMin, py);
              xMax = Math.max(xMax, px);
              yMax = Math.max(yMax, py);
            }
          }
        }

        var bboxW = xMax - xMin + 1;
        var bboxH = yMax - yMin + 1;

        if (xMin == sqSize || yMin === sqSize) {
          xMin = 0; bboxW = 0;
          yMin = 0; bboxH = 0;
        }

        index.push(xMin, yMin, bboxW, bboxH);
      }
    }

    return new Int32Array(index);
  }
}
render.RenderUtils = RenderUtils;

// ============================================================================
// [AssetStore]
// ============================================================================

/**
 * Asset store - can load assets provided by `GameDefs.assets`.
 */
class AssetStore extends Observable {
  constructor(info) {
    super();

    this.assets = [];                      // Assets array (not the same as `AssetStore.add(assets)`.
    this.images = [];                      // Images array.

    this.queuedCount = 0;                  // Number of files in the queue.
    this.loadedCount = 0;                  // Number of files loaded.
    this.failedCount = 0;                  // Number of files that failed to load.

    this.$running = false;                 // If the AssetStore is now fetching assets.
    this.$baseUrl = info.baseUrl || "";    // Base URL from where to start fetching assets.

    this.$slowLoadingTimerId = null;       // Triggered when loading takes noticeable time.
    this.$slowLoadingTimeout = info.slowLoadingTimeout || 0;

    this.$queued = new Map();
    this.$loaded = new Map();
  }

  isRunning() {
    return this.$running;
  }

  /**
   * Adds a list of assets to the loader.
   *
   * Each asset must be an `AssetInfo` instance or compatible.
   */
  add(assets) {
    for (var i = 0, len = assets.length; i < len; i++)
      this.$addAsset(assets[i]);
    return this;
  }

  /**
   * Update the image of the asset `#id`.
   */
  update(id, data) {
    if (id < 0 || id >= this.assets.length)
      FAILED(`Asset #${id} out of range`);

    const asset = this.assets[id];
    if (asset === null)
      FAILED(`Asset #${id} was not added to the AssetStore`);

    this.images[id] = data;
    asset.image = data;

    if (asset.type === "Atlas" || asset.type === "BlendMap")
      asset.index = RenderUtils.createAtlasIndex(data, 32);

    return this;
  }

  $addAsset(asset) {
    // Image reference name (used by the engine) and file name.
    const id = asset.id;
    const file = asset.file;
    const name = asset.name;

    // Verify the asset's ID.
    if (id < 0)
      FAILED(`Asset '${name}' identified as #${id} is invalid`);

    if (id > GameLimits.MaxAssets)
      FAILED(`Asset '${name}' identified as #${id} is too high (limit is ${GameLimits.MaxAssets})`);

    // Grow `assets` and `images` if necessary, otherwise the VM will create a
    // sparse array which will slow everything down. These arrays are accessed
    // by the renderer so their access can't be slow.
    while (this.assets.length <= id) this.assets.push(null);
    while (this.images.length <= id) this.images.push(null);

    // Verify that the asset having `id` was not registered before.
    if (this.assets[id] !== null)
      FAILED(`Asset '${name}' identified as #${id} already added to the store`);

    // Create the asset (this is different data that is given in `asset`).
    this.assets[id] = {
      image: null,                         // Asset image (actually it's a Canvas).
      index: null,                         // Atlas index (only created for BlendMap and Atlas assets)

      name : asset.name,                   // Asset name.
      file : asset.file,                   // Asset file.
      type : asset.type                    // Asset type.
    };

    // If the asset has no file associated then it means it's rendered by the app
    // or it's based on another asset. In any case we don't care as there is
    // nothing to load.
    if (!file) return;

    // A single file can be referenced multiple times in assets:
    //   1. If it has been already loaded, create record in map and images.
    //   2. If it's just queued at the moment, add this asset to the queue.
    const data = this.$loaded.get(file);
    if (data !== undefined) {
      this.update(id, data);
      return;
    }

    var refs = this.$queued.get(file);
    if (refs !== undefined) {
      refs.push(asset);
      return;
    }

    // If we reached here the image file was not queued nor loaded. So dispatch
    // the start event and use the browser to fetch the image from the server.
    refs = [asset];
    this.$queued.set(file, refs);

    if (!this.$running) {
      this.$running = true;
      this.emit("start");

      if (this.$slowLoadingTimeout !== 0)
        this.$slowLoadingTimerId = setTimeout(AssetStore.$onSlowLoadingTimeout, this.$slowLoadingTimeout, this);
    }

    this.$addToQueue(file, refs);
    return true;
  }

  $addToQueue(file, refs) {
    const image = new Image();
    image.onload = AssetStore.$onLoad;
    image.onerror = AssetStore.$onError;
    image.onabort = AssetStore.$onAbort;

    image.refs = refs;
    image.store = this;
    image.src = this.$baseUrl + "/" + file;

    this.queuedCount++;
    return image;
  }

  $removeFromQueue(image, file) {
    image.refs = null;
    image.store = null;

    image.onload = null;
    image.onerror = null;
    image.onabort = null;

    this.queuedCount--;
    this.$queued.delete(file);
  }

  $done() {
    // If there are still images to preload -> return.
    if (this.$queued.size !== 0) return;

    const timerId = this.$slowLoadingTimerId;
    if (timerId !== null) {
      clearInterval(timerId);
      this.$slowLoadingTimerId = null;
    }

    // If not -> dispatch "complete" event and stop.
    this.$running = false;
    this.emit("complete");
  }

  static $onLoad() {
    const image = this;

    const refs = this.refs;
    const self = this.store;

    const data = RenderUtils.createCanvas(image.width, image.height);
    data.getContext("2d").drawImage(image, 0, 0);

    const file = refs[0].file;
    self.$removeFromQueue(image, file);
    self.$loaded.set(file, data);
    self.loadedCount++;

    for (var i = 0; i < refs.length; i++) {
      const asset = refs[i];
      self.update(asset.id, data);
      self.emit("asset", asset);
    }

    self.$done();
  }

  static $onError() {
    const image = this;

    const refs = this.refs;
    const self = this.store;

    const file = refs[0].file;
    self.$removeFromQueue(image, file);
    self.failedCount++;

    for (var i = 0; i < refs.length; i++)
      self.emit("error", refs[i]);

    self.$done();
  }

  static $onAbort() {
    const image = this;

    const refs = this.refs;
    const self = this.store;

    const file = refs[0].file;
    self.$removeFromQueue(image, file);
    self.failedCount++;

    for (var i = 0; i < refs.length; i++)
      self.emit("error", refs[i]);

    self.$done();
  }

  static $onSlowLoadingTimeout(self) {
    self.$slowLoadingTimerId = null;
    self.emit("slowLoading");
  }
}
render.AssetStore = AssetStore;

// ============================================================================
// [Renderer]
// ============================================================================

const kGridShift = 3;                      // Shift to get an address to NxN grid.
const kGridSize = 1 << kGridShift;         // Size of NxN grid (4x4, 8x8, 16x16).

const kBlockShift = 5;                     // Shift to get an address to NxN block.
const kBlockSize = 1 << kBlockShift;       // Size of NxN block (32x32 is optimal).

/**
 * Renderer grid - grid of tiles.
 */
class RendererGrid {
  constructor() {
    this.worldX = 0;
    this.worldY = 0;

    this.blockX = 0;
    this.blockY = 0;

    this.blockIndex = 0;
  }
}

/**
 * Renderer tile - tile that contains information related to rendering. It
 * contains all transitions with neighboring tiles and masks of sides and
 * corners of modifiers, territory owners, and more...
 *
 * The reason this class exists is very simple - make `GameTile` simpler and
 * not connected to the renderer (so it can run on the server without any overhead).
 */
class RendererTile {
  constructor() {
    this.baseTexture = 0;                  // Base terrain texture.
    this.transitions = null;

    this.coverEdges = 0;                   // Cover edges.
    this.terrainEdges = 0;                 // Terrain edges.
    this.riverEdges = 0;                   // Terrain river edges (only 4 bits).
    this.roadEdges = 0;                    // Terrain road and railroad edges.
    this.territoryEdges = 0;               // Territory edges.
  }
}

/**
 * A canvas-based renderer.
 */
class Renderer {
  constructor(container) {
    this.game = null;                      // Game this renderer was attached to.
    this.map = null;                       // Game map, a shortcut to `game.map`.

    const canvasAttributes = {
      style: {
        position: "absolute",
        top: "0px",
        left: "0px"
      }
    };
    const sceneCanvas = mindom.create("canvas", canvasAttributes);
    const overlayCanvas = mindom.create("canvas", canvasAttributes);

    this.container = container;            // Game container (DIV).
    this.sceneCanvas = sceneCanvas;        // Scene element (CANVAS).
    this.overlayCanvas = overlayCanvas;    // Overlay element (CANVAS).

    this.sceneW = 0;                       // Scene width (in pixels).
    this.sceneH = 0;                       // Scene height (in pixels).

    this.tileSize = 32;                    // Tile width and height (in pixels).
    this.tileHalf = 16;                    // Half of the tile width and heigh (in pixels).

    this.worldX = 0;                       // World X offset for scrolling: 0 to `worldW - 1`.
    this.worldY = 0;                       // World Y offset for scrolling: 0 to `worldH - 1`.
    this.worldW = 0;                       // World width (in pixels).
    this.worldH = 0;                       // World height (in pixels).

    this.debug = 0;
    this._playerId = -1;                   // Render only view specific to playerId (-1 means all).

    this.$grid = [];                       // Maps a grid index to a `RendererGrid` object.
    this.$gridW = 0;                       // Grid width (number of `RendererGrid` objects horizontally).
    this.$gridH = 0;                       // Grid height (number of `RendererGrid` objects vertically).

    this.$tiles = [];                      // Renderer tiles (not the same as game tiles), see `RendererTile`.
    this.$tilesDirty = null;               // Dirty blocks (NxN) of `$tiles` (Int32Array).
    this.$tilesTmpArray = [];              // Temporary array used by tile updater to construct their transitions.

    this.$blocks = [];                     // Pre-rendered blocks of tiles (array of Canvas instances).
    this.$blocksDirty = null;              // Dirty blocks (NxN) of `$blocks` (Int32Array).

    this.dominanceById = [];               // Terrain dominance by ID (calculation based on terrains and assets).
    this.textureByDominance = [];
    this.blendmapByDominance = [];

    this.container.appendChild(this.sceneCanvas);
    this.container.appendChild(this.overlayCanvas);
    this.updateCanvasSize(container.clientWidth, container.clientHeight);
  }

  get playerId() {
    return this._playerId;
  }

  set playerId(id) {
    if (this._playerId !== id) {
      this._playerId = id;
      this.invalidateAll();
    }
  }

  updateCanvasSize(w, h) {
    this.sceneW = w;
    this.sceneH = h;

    this.sceneCanvas.width = w;
    this.sceneCanvas.height = h;

    this.overlayCanvas.width = w;
    this.overlayCanvas.height = h;
  }

  // TODO: Unfinished - must find invalid defs, must find the highest dominance.
  updateTerrainDominance() {
    const defs = this.game.defs;

    const assets = defs.assets;
    const terrains = defs.terrains;

    const dominanceById = [];
    const textureByDominance = [];
    const blendmapByDominance = [];

    for (var i = 0; i < terrains.length; i++) {
      const terrain = terrains[i];
      const asset = assets[terrain.assetId];
      const dominance = asset.dominance;

      dominanceById.push(dominance);

      // TODO: Skip ocean as coast is a special case.
      if (terrain.id === TerrainType.Ocean)
        continue;

      const assetId = terrain.assetId;
      textureByDominance[dominance] = assetId;
      blendmapByDominance[dominance] = assets[assetId].blendmapId;
    }

    this.dominanceById = dominanceById;
    this.textureByDominance = textureByDominance;
    this.blendmapByDominance = blendmapByDominance;
  }

  render() {
    const game = this.game;
    if (game === null) return;

    const x0 = this.worldX;
    const y0 = this.worldY;
    const rw = this.worldW;
    const rh = this.worldH;

    // Return if the game doesn't contain a map.
    if (rw === 0 || rh === 0) return;

    if (x0 >= rw || y0 >= rh)
      FAILED(`World coordinates [${x0} ${y0}] overflow world boundary [${rw} ${rh}]`);

    const x1 = x0 + this.sceneW;
    const y1 = y0 + this.sceneH;
    this.$updateMapArea(x0, y0, x1, y1);

    const ctx = this.sceneCanvas.getContext("2d");
    this.$renderMapArea(ctx, 0, 0, x0, y0, x1, y1);
  }

  onAttach(game) {
    this.game = game;
    this.map = game.map;

    game.on("mapResize"     , this.$onMapResize  , this);
    game.on("invalidateAll" , this.invalidateAll , this);
    game.on("invalidateTile", this.invalidateTile, this);
    game.on("invalidateRect", this.invalidateRect, this);

    this.$onMapResize();
    this.updateTerrainDominance();
  }

  onDetach() {
    const game = this.game;

    game.off("mapResize"     , this.$onMapResize  , this);
    game.off("invalidateAll" , this.invalidateAll , this);
    game.off("invalidateTile", this.invalidateTile, this);
    game.off("invalidateRect", this.invalidateRect, this);

    this.game = null;
    this.map = null;
    this.$onMapResize();
  }

  $onMapResize() {
    const game = this.game;
    const map = this.map;

    const w = map ? map.w : 0;
    const h = map ? map.h : 0;

    if (w && h) {
      const gridW = Math.floor((map.w + kGridSize - 1) / kGridSize);
      const gridH = Math.floor((map.h + kGridSize - 1) / kGridSize);

      this.worldX = 0;
      this.worldY = 0;
      this.worldW = this.tileSize * map.w;
      this.worldH = this.tileSize * map.h;

      this.$createGrid(gridW, gridH);
    }
    else {
      this.worldX = 0;
      this.worldY = 0;
      this.worldW = 0;
      this.worldH = 0;

      this.$deleteGrid();
    }
  }

  invalidateTile(mx, my) {
    this.invalidateRect(mx, my, 1, 1);
  }

  invalidateRect(rx, ry, rw, rh) {
    const map = this.map;
    const mw = map.w;
    const mh = map.h;

    var mx0 = rx - 1;
    var my0 = ry - 1;

    if (mx0 < 0 || mx0 >= mw) mx0 = GameUtils.repeat(mx0, mw);
    if (my0 < 0 || my0 >= mh) my0 = GameUtils.repeat(my0, mh);

    // [mx0, my0, mx1, my0] - Rectangle that describes all tiles on the map.
    const mx1 = mx0 + rw + 1;
    const my1 = my0 + rh + 1;

    // [dx0, dy0, dx1, dy0] - Rectangle that describes all bits in `$tilesDirty`.
    const dx0 = mx0 >> kGridShift;
    const dy0 = my0 >> kGridShift;
    const dx1 = mx1 >> kGridShift;
    const dy1 = my1 >> kGridShift;

    const gw = this.$gridW;
    const gh = this.$gridH;

    const tilesDirty = this.$tilesDirty;
    const blocksDirty = this.$blocksDirty;

    for (var gy = dy0; gy <= dy1; gy++) {
      const base = (gy >= gh ? gy - gh : gy) * gw;
      for (var gx = dx0; gx <= dx1; gx++) {
        const off = base + (gx >= gw ? gx - gw : gx);
        const idx = off >> 5;
        const bit = 1 << (off & 31);

        tilesDirty[idx] |= bit;
        blocksDirty[idx] |= bit;
      }
    }

    const ui = this.game.ui;
    if (ui) ui.makeDirty();
  }

  invalidateAll() {
    const map = this.map;
    this.invalidateRect(0, 0, map.w, map.h);
  }

  $createGrid(gridW, gridH) {
    if (this.$gridW === gridW && this.$gridH === gridH)
      return;

    this.$gridW = gridW;
    this.$gridH = gridH;

    const mapSize = this.map.tiles.length;
    const gridSize = gridW * gridH;

    // `1 >> 5 === 32` - 32 bits per one entry.
    const gridBitArraySize = (gridSize + 31) >>> 5;

    // Setup `$tilesDirty` bit-array.
    var tilesDirty = this.$tilesDirty;
    if (tilesDirty === null || tilesDirty.length !== gridBitArraySize) {
      tilesDirty = this.$tilesDirty = new Int32Array(gridBitArraySize);
    }
    tilesDirty.fill(0xFFFFFFFF);

    // Setup `$blocksDirty` bit-array.
    var blocksDirty = this.$blocksDirty;
    if (blocksDirty === null || blocksDirty.length !== gridBitArraySize)
      blocksDirty = this.$blocksDirty = new Int32Array(gridBitArraySize);
    blocksDirty.fill(0xFFFFFFFF);

    // Setup `$tiles` array of `RendererTile` instances.
    const tiles = this.$tiles;
    if (tiles.length !== mapSize) {
      tiles.length = Math.min(tiles.length, mapSize);
      while (tiles.length < mapSize) tiles.push(new RendererTile());
    }

    // Setup `$grid` array of `RendererGrid` instances and `$blocks`.
    const grid = this.$grid;
    const blocks = this.$blocks;

    grid.length = Math.min(grid.length, gridSize);
    while (grid.length < gridSize) grid.push(new RendererGrid());

    // Size of one cached block (in pixels).
    const tileSq = this.tileSize;        // Tile size (in pixels).
    const gridSq = kGridSize * tileSq;   // Grid size (in pixels).
    const blockSq = kBlockSize * tileSq; // Block size (in pixels).

    var gx = 0, gy = 0;                  // Current coodinates in grid.
    var bx = 0, by = 0;                  // Current coodinates in `renderedBlock`.

    var gridIndex = 0;                   // Current grid index.
    var blockIndex = 0;                  // Current block index.

    for (;;) {
      // NOTE: This seems tricky, but what we do here is to keep all blocks
      // that were created before and just add new ones if necessary. This
      // helps browser with allocation and deallocation of new <canvas>es.
      if (blockIndex >= blocks.length)
        blocks.push(RenderUtils.createCanvas(blockSq, blockSq));

      const gridEntry = grid[gridIndex];
      gridEntry.worldX = gx * gridSq;
      gridEntry.worldY = gy * gridSq;

      gridEntry.blockX = bx;
      gridEntry.blockY = by;
      gridEntry.blockIndex = blockIndex;

      if (++gridIndex >= gridSize)
        break;

      // Advance gx/gy.
      if (++gx >= gridW) {
        gx = 0;
        gy++;
      }

      // Advance bx/by.
      if ((bx += gridSq) >= blockSq) {
        bx = 0;
        if ((by += gridSq) >= blockSq) {
          by = 0;
          blockIndex++;
        }
      }
    }

    // Remove all cached blocks that we don't need atm.
    blocks.length = blockIndex + 1;
  }

  $deleteGrid() {
    this.$gridW = 0;
    this.$gridH = 0;

    this.$tiles.length = 0;
    this.$tilesDirty = null;

    this.$blocks.length = 0;
    this.$blocksDirty = null;
  }

  /**
   * Updates a map area from [x0, y0] to (x1, y1) for rendering.
   *
   * This function does the following:
   *
   *   1. Checks all dirty tiles within the grid of the given area and prepares
   *      them for rendering. This process updates all `RendererTile`s within
   *      all grids that intersect the given rectangle.
   *
   *   2. Renders terrain cache within the grid of the given area. This process
   *      is important as it's then used as a cache as terrain rendering is
   *      very expensive - more expensive when more blending per-tile is required.
   */
  $updateMapArea(x0, y0, x1, y1) {
    // Update the grid.
    const gridW = this.$gridW;
    const gridH = this.$gridH;

    const tileSize = this.tileSize;
    const gridSize = tileSize * kGridSize;

    const gridX0 = Math.floor(x0 / gridSize);
    const gridY0 = Math.floor(y0 / gridSize);

    var rectX0 = gridX0 * gridSize - x0;
    var rectY0 = gridY0 * gridSize - y0;

    var rectX1 = x1;
    var rectY1 = y1;

    var dy = rectY0;
    var gy = gridY0;

    const tilesDirty = this.$tilesDirty;
    const blocksDirty = this.$blocksDirty;

    for (;;) {
      var dx = rectX0;
      var gx = gridX0;

      var off = gy * gridW + gx;         // Offset to `$grid` and bit array.
      var idx = off >>> 5;               // Index in tilesDirty and blocksDirty.
      var bit = 1 << (off & 31);         // The bit we are interested in.

      // These two arrays are only accessed here and withing the secondary loop
      // in case that the `bit` reaches 32. This optimization should speed up
      // this loop in case that there is nothing to do, which is pretty common.
      var tilesMask = tilesDirty[idx];
      var blocksMask = blocksDirty[idx];

      for (;;) {
        if (tilesMask & bit) {
          this.$updateMapRect(gx * kGridSize, gy * kGridSize, kGridSize, kGridSize);
          tilesMask &= ~bit;
        }

        if (blocksMask & bit) {
          const grid = this.$grid[off];
          this.$renderTerrainCache(
            this.$blocks[grid.blockIndex], grid.blockX, grid.blockY,
            gx * kGridSize, gy * kGridSize, kGridSize, kGridSize);
          blocksMask &= ~bit;
        }

        // Advance X.
        dx += gridSize;
        if (dx >= rectX1) break;

        off++;
        bit <<= 1;

        if (++gx >= gridW) {
          gx = 0;
          off -= gridW;
        }
        else if (bit !== 0) {
          continue;
        }

        // Reflect all modifications.
        tilesDirty[idx] = tilesMask;
        blocksDirty[idx] = blocksMask;

        // Fetch next bits.
        idx = off >>> 5;
        bit = 1 << (off & 31);

        tilesMask = tilesDirty[idx];
        blocksMask = blocksDirty[idx];
      }

      // Reflect all modifications.
      tilesDirty[idx] = tilesMask;
      blocksDirty[idx] = blocksMask;

      // Advance Y.
      dy += gridSize;
      if (dy >= rectY1) break;

      off += gridW;
      if (++gy >= gridH) {
        gy = 0;
        off = gridX0;
      }
    }
  }

  /**
   * Called by `$updateMapArea` for every grid it intersects.
   */
  $updateMapRect(x, y, w, h) {
    const map = this.map;

    const mw = map.w;
    const mh = map.h;

    const txEnd = Math.min(x + w, mw);
    const tyEnd = Math.min(y + h, mh);

    const mapTiles = this.map.tiles;
    const rendererTiles = this.$tiles;

    var tileIndex = y * mw + x;
    const tileStride = mw - w;

    for (var ty = y; ty < tyEnd; ty++, tileIndex += tileStride)
      for (var tx = x; tx < txEnd; tx++, tileIndex++)
        this.$updateMapTile(tx, ty, mapTiles[tileIndex], rendererTiles[tileIndex]);
  }

  /**
   * Called by `$updateMapRect` for every tile in that rect.
   */
  $updateMapTile(x, y, mapTile, rendererTile) {
    const game = this.game;
    const map = this.map;
    const defs = game.defs;

    const w = map.w;
    const h = map.h;

    const sqSize = 32;

    const id = mapTile.id;
    const modifiers = mapTile.modifiers;

    const xPrev = map.normX(x - 1);
    const yPrev = map.normY(y - 1);
    const xNext = map.normX(x + 1);
    const yNext = map.normY(y + 1);

    const tlIndex = yPrev * w + xPrev; // Top left.
    const tcIndex = yPrev * w + x    ; // Top center.
    const trIndex = yPrev * w + xNext; // Top right.
    const mlIndex = y     * w + xPrev; // Middle left.
    const mrIndex = y     * w + xNext; // Middle right.
    const blIndex = yNext * w + xPrev; // Bottom left.
    const bcIndex = yNext * w + x    ; // Bottom center.
    const brIndex = yNext * w + xNext; // Bottom right.

    // Calculate covered edges.
    const playerId = this._playerId;
    if (playerId !== -1) {
      const bits = game.players[playerId].uncovered;
      const bpos = y * w + x;

      if (!(bits[bpos >>> 5] & (1 << (bpos & 0x1F)))) {
        rendererTile.coverEdges = 256;
      }
      else {
        const coverEdges = (!(bits[tlIndex >>> 5] & (1 << (tlIndex & 0x1F))) ? EdgeFlags.TopLeft     : 0) |
                           (!(bits[tcIndex >>> 5] & (1 << (tcIndex & 0x1F))) ? EdgeFlags.Top         : 0) |
                           (!(bits[trIndex >>> 5] & (1 << (trIndex & 0x1F))) ? EdgeFlags.TopRight    : 0) |
                           (!(bits[mlIndex >>> 5] & (1 << (mlIndex & 0x1F))) ? EdgeFlags.Left        : 0) |
                           (!(bits[mrIndex >>> 5] & (1 << (mrIndex & 0x1F))) ? EdgeFlags.Right       : 0) |
                           (!(bits[blIndex >>> 5] & (1 << (blIndex & 0x1F))) ? EdgeFlags.BottomLeft  : 0) |
                           (!(bits[bcIndex >>> 5] & (1 << (bcIndex & 0x1F))) ? EdgeFlags.Bottom      : 0) |
                           (!(bits[brIndex >>> 5] & (1 << (brIndex & 0x1F))) ? EdgeFlags.BottomRight : 0) ;
        rendererTile.coverEdges = coverEdges;
      }
    }
    else {
      rendererTile.coverEdges = 0;
    }

    const tiles = map.tiles;

    const tl = tiles[tlIndex];
    const tc = tiles[tcIndex];
    const tr = tiles[trIndex];
    const ml = tiles[mlIndex];
    const mr = tiles[mrIndex];
    const bl = tiles[blIndex];
    const bc = tiles[bcIndex];
    const br = tiles[brIndex];

    // Calculate terrain edges.
    const assets = defs.assets;
    const terrains = defs.terrains;
    const terrainInfo = terrains[id];

    const transitions = this.$tilesTmpArray;
    const dominanceById = this.dominanceById;

    var dominance = dominanceById[id];

    const terrainEdges = (tl.id === id ? EdgeFlags.TopLeft     : 0) |
                         (tc.id === id ? EdgeFlags.Top         : 0) |
                         (tr.id === id ? EdgeFlags.TopRight    : 0) |
                         (ml.id === id ? EdgeFlags.Left        : 0) |
                         (mr.id === id ? EdgeFlags.Right       : 0) |
                         (bl.id === id ? EdgeFlags.BottomLeft  : 0) |
                         (bc.id === id ? EdgeFlags.Bottom      : 0) |
                         (br.id === id ? EdgeFlags.BottomRight : 0) ;

    rendererTile.baseTexture = terrainInfo.assetId;
    rendererTile.terrainEdges = terrainEdges;

    // TODO: Adhoc, rewrite to some nicer form.
    if (terrainEdges !== 0xFF && id === TerrainType.Ocean) {
      //rendererTile.baseTexture = assets.byName("Texture.Desert").id;
      //dominance = 1;
      rendererTile.baseTexture = terrains[TerrainType.Desert].assetId;
      dominance = dominanceById[TerrainType.Desert];
    }

    var tlDom = dominanceById[tl.id]; // Top left.
    var tcDom = dominanceById[tc.id]; // Top center.
    var trDom = dominanceById[tr.id]; // Top right.
    var mlDom = dominanceById[ml.id]; // Middle left.
    var mrDom = dominanceById[mr.id]; // Middle right.
    var blDom = dominanceById[bl.id]; // Bottom left.
    var bcDom = dominanceById[bc.id]; // Bottom center.
    var brDom = dominanceById[br.id]; // Bottom right.

    for (var i = dominance + 1; i <= 8; i++) {
      const mask = (tlDom === i ? EdgeFlags.TopLeft     : 0) |
                   (tcDom === i ? EdgeFlags.Top         : 0) |
                   (trDom === i ? EdgeFlags.TopRight    : 0) |
                   (mlDom === i ? EdgeFlags.Left        : 0) |
                   (mrDom === i ? EdgeFlags.Right       : 0) |
                   (blDom === i ? EdgeFlags.BottomLeft  : 0) |
                   (bcDom === i ? EdgeFlags.Bottom      : 0) |
                   (brDom === i ? EdgeFlags.BottomRight : 0) ;
      if (mask)
        this.$addTransition(transitions,
          this.textureByDominance[i], this.blendmapByDominance[i], TerrainTransitions.LUT[mask], sqSize);
    }

    if (id === TerrainType.Ocean && terrainEdges !== 0xFF) {
      this.$addTransition(transitions,
        defs.assets.byName("Texture.Ocean").id,
        defs.assets.byName("BlendMap.Coast").id,
        TerrainTransitions.LUT[terrainEdges ^ 0xFF], sqSize);

      this.$addTransition(transitions,
        defs.assets.byName("Texture.Coast").id,
        defs.assets.byName("BlendMap.CoastLine").id,
        TerrainTransitions.LUT[terrainEdges ^ 0xFF], sqSize);
    }

    if (transitions.length !== 0) {
      rendererTile.transitions = new Int32Array(transitions);
      transitions.length = 0; // Important!
    }
    else {
      rendererTile.transitions = null;
    }

    // Calculate river edges.
    var riverEdges = 0;
    if (id === TerrainType.Ocean || (modifiers & TerrainModifier.kRiver) !== 0) {
      riverEdges = ((tc.modifiers & TerrainModifier.kRiver) ? EdgeFlags.Top    : 0) |
                   ((ml.modifiers & TerrainModifier.kRiver) ? EdgeFlags.Left   : 0) |
                   ((bc.modifiers & TerrainModifier.kRiver) ? EdgeFlags.Bottom : 0) |
                   ((mr.modifiers & TerrainModifier.kRiver) ? EdgeFlags.Right  : 0) ;

      // River connects to sea, so if this is a river terrain (and not ocean)
      // then also take nearby non-land tiles into consideration.
      if (id !== TerrainType.Ocean) {
        riverEdges |= ((tc.id === TerrainType.Ocean) ? EdgeFlags.Top    : 0) |
                      ((ml.id === TerrainType.Ocean) ? EdgeFlags.Left   : 0) |
                      ((bc.id === TerrainType.Ocean) ? EdgeFlags.Bottom : 0) |
                      ((mr.id === TerrainType.Ocean) ? EdgeFlags.Right  : 0) ;
      }
    }
    rendererTile.riverEdges = riverEdges;

    // Calculate road / railroad edges.
    var roadEdges = 0;
    if (modifiers & (TerrainModifier.kRoad | TerrainModifier.kRailroad)) {
      for (var i = 0; i < 2; i++) {
        const mask = i === 0 ? TerrainModifier.kRoad : TerrainModifier.kRailroad;

        // Don't calculate road/railroad edges if this tile doesn't have one.
        if (!(mapTile.modifiers & mask))
          continue;

        // The same algorithm as calculating terrain edges.
        const impr = ((tl.modifiers & mask) ? EdgeFlags.TopLeft     : 0) |
                     ((tc.modifiers & mask) ? EdgeFlags.Top         : 0) |
                     ((tr.modifiers & mask) ? EdgeFlags.TopRight    : 0) |
                     ((ml.modifiers & mask) ? EdgeFlags.Left        : 0) |
                     ((mr.modifiers & mask) ? EdgeFlags.Right       : 0) |
                     ((bl.modifiers & mask) ? EdgeFlags.BottomLeft  : 0) |
                     ((bc.modifiers & mask) ? EdgeFlags.Bottom      : 0) |
                     ((br.modifiers & mask) ? EdgeFlags.BottomRight : 0) ;

        // Road mask     - 0x00FF.
        // Railroad mask - 0xFF00.
        roadEdges |= i === 0 ? impr : (impr << 8);
      }
    }
    rendererTile.roadEdges = roadEdges;

    // Calculate territory edges.
    const territory = mapTile.territory;
    var territoryEdges = 0;

    if (territory !== -1) {
      territoryEdges = (tl.territory === territory ? EdgeFlags.TopLeft     : 0) |
                       (tc.territory === territory ? EdgeFlags.Top         : 0) |
                       (tr.territory === territory ? EdgeFlags.TopRight    : 0) |
                       (ml.territory === territory ? EdgeFlags.Left        : 0) |
                       (mr.territory === territory ? EdgeFlags.Right       : 0) |
                       (bl.territory === territory ? EdgeFlags.BottomLeft  : 0) |
                       (bc.territory === territory ? EdgeFlags.Bottom      : 0) |
                       (br.territory === territory ? EdgeFlags.BottomRight : 0) ;
    }
    rendererTile.territoryEdges = territoryEdges;
  }

  $addTransition(transitions, tex, msk, idx, sqSize) {
    const assets = this.game.assetStore.assets[msk];
    const index = assets.index;
    const offset = idx * sqSize;

    if (index) {
      idx *= 4;
      transitions.push(tex, msk, offset, index[idx], index[idx + 1], index[idx + 2], index[idx + 3]);
    }
    else {
      transitions.push(tex, msk, offset, 0, 0, sqSize, sqSize);
    }
  }

  $renderMapArea(ctx, cx, cy, x0, y0, x1, y1) {
    this.$renderMapTerrain(ctx, cx, cy, x0, y0, x1, y1);
    this.$renderMapObjects(ctx, cx, cy, x0, y0, x1, y1);

    if (this.debug)
      this.$renderDebugObjects(ctx, cx, cy, x0, y0, x1, y1);
  }

  $renderMapTerrain(ctx, cx, cy, x0, y0, x1, y1) {
    const gridSize = this.tileSize * kGridSize;

    // Initialize the first grid offsets.
    const gxInit = Math.floor(x0 / gridSize);
    const gyInit = Math.floor(y0 / gridSize);

    const gridW = this.$gridW;
    const gridH = this.$gridH;

    // Adjust the input coordinates here according to `cx` and `cy` as it's
    // much easier to just adjust it instead of messing with them within the loop.
    const dxInit = cx - x0 + gxInit * gridSize;
    const dyInit = cy - y0 + gyInit * gridSize;

    const rw = x1 - x0;
    const rh = y1 - y0;

    x1 = cx + rw; x0 = cx;
    y1 = cy + rh; y0 = cy;

    // Initial grid-y coordinates.
    var dy = dyInit;
    var gy = gyInit;

    // Initial grid clipping in vertical direction.
    var gridClipY0 = dy - y0;
    var gridClipY1 = Math.min(rh, gridSize);

    const blocks = this.$blocks;

    ctx.globalCompositeOperation = "copy";
    for (;;) {
      // Initial grid-x coordinates.
      var dx = dxInit;
      var gx = gxInit;

      // Initial grid clipping in horizontal direction.
      var gridClipX0 = dx - x0;
      var gridClipX1 = Math.min(rw, gridSize);

      for (;;) {
        const grid = this.$grid[gy * gridW + gx];

        const clipW = gridClipX1 - gridClipX0;
        const clipH = gridClipY1 - gridClipY0;

        // 6 OPERATIONS TO DO A NON-BLENDING BLIT!
        ctx.save();
        ctx.beginPath();
        ctx.rect(dx, dy, clipW, clipH);
        ctx.clip();
        ctx.drawImage(blocks[grid.blockIndex], grid.blockX, grid.blockY, clipW, clipH, dx, dy, clipW, clipH);
        ctx.restore();

        dx += gridSize;
        if (dx >= x1) break;

        gridClipX0 = 0;
        gridClipX1 = Math.min(x1 - dx, gridSize);

        if (++gx >= gridW) gx = 0;
      }

      dy += gridSize;
      if (dy >= y1) break;

      gridClipY0 = 0;
      gridClipY1 = Math.min(y1 - dy, gridSize);
      if (++gy >= gridH) gy = 0;
    }
    ctx.globalCompositeOperation = "source-over";
  }

  $renderMapObjects(ctx, cx, cy, x0, y0, x1, y1) {
    const tileSize = this.tileSize;
    const tileHalf = this.tileHalf;

    // Initialize the first tile offsets.
    const txInit = Math.floor(x0 / tileSize);
    const tyInit = Math.floor(y0 / tileSize);

    // Adjust the input coordinates here according to `cx` and `cy` as it's
    // much easier to just adjust it instead of messing with them within the loop.
    const dxInit = cx - x0 + txInit * tileSize;
    const dyInit = cy - y0 + tyInit * tileSize;

    const rw = x1 - x0;
    const rh = y1 - y0;

    const mapW = this.map.w;
    const mapH = this.map.h;

    const mapTiles = this.map.tiles;
    const rendererTiles = this.$tiles;

    x1 = cx + rw; x0 = cx;
    y1 = cy + rh; y0 = cy;

    // Initial tile-y coordinates.
    var dy = dyInit;
    var ty = tyInit;

    // Game-data and assets.
    const game = this.game;
    const defs = game.defs;

    const assets = defs.assets;
    const images = game.assetStore.images;

    const miscImg = images[assets.byName("Misc").id];
    const unitsImg = images[assets.byName("Units").id];

    const coverImg = images[assets.byName("Texture.Covered").id];
    const coverBM = images[assets.byName("BlendMap.Covered").id];

    const territoryImg = images[assets.byName("BlendMap.Territory").id];

    for (;;) {
      // Initial grid-x coordinates.
      var dx = dxInit;
      var tx = txInit;

      for (;;) {
        const tileIndex = ty * mapW + tx;

        const mTile = mapTiles[tileIndex];
        const rTile = rendererTiles[tileIndex];

        const coverEdges = rTile.coverEdges;

        if (coverEdges === 256) {
          const texX = Math.floor((this.worldX + dx) % 256);
          const texY = Math.floor((this.worldY + dy) % 256);

          // Fully covered tile.
          ctx.drawImage(coverImg, texX, texY, tileSize, tileSize, dx, dy, tileSize, tileSize);
        }
        else {
          // Fully or partially uncovered tile.
          const id = mTile.id;
          const modifiers = mTile.modifiers;

          if (id !== TerrainType.Ocean) {
            // Irrigation.
            if (modifiers & TerrainModifier.kIrrigation) {
              ctx.drawImage(miscImg, 0, 128, tileSize, tileSize, dx, dy, tileSize, tileSize);
            }

            // Roads / Railroads.
            if (modifiers & (TerrainModifier.kRoad | TerrainModifier.kRailroad)) {
              var roadEdges = rTile.roadEdges;
              if (roadEdges === 0) {
                const index = (modifiers & TerrainModifier.kRailroad) ? 64 : 32;
                ctx.drawImage(miscImg, 0, index, tileSize, tileSize, dx, dy, tileSize, tileSize);
              }
              else {
                // Don't render roads connections under railroad connections.
                roadEdges &= ~(roadEdges >> 8);

                // TODO: This logic cannot be here.
                // Decrease the number of roads we render as it gets very messy when roads
                // connect in all directions.
                if (roadEdges & 0xFF) {
                  const edges = simplifyRoadEdges(roadEdges);
                  for (var i = 0; i < 8; i++) {
                    if (edges & (1 << i))
                      ctx.drawImage(miscImg, RoadIndex[i] * tileSize, 32, tileSize, tileSize, dx, dy, tileSize, tileSize);
                  }
                }

                roadEdges >>>= 8;
                if (roadEdges) {
                  const edges = roadEdges;
                  for (var i = 0; i < 8; i++) {
                    if (edges & (1 << i))
                      ctx.drawImage(miscImg, RoadIndex[i] * tileSize, 64, tileSize, tileSize, dx, dy, tileSize, tileSize);
                  }
                }
                else if (modifiers & (TerrainModifier.kRailroad)) {
                  ctx.drawImage(miscImg, 0, 64, tileSize, tileSize, dx, dy, tileSize, tileSize);
                }
              }
            }
          }

          // Render resource.
          const resource = mTile.resource;
          const resInfo = resource !== -1 ? defs.resources[resource] : null;

          if (resInfo)
            ctx.drawImage(miscImg, resInfo.assetX * tileSize, resInfo.assetY * tileSize, tileSize, tileSize, dx, dy, tileSize, tileSize);

          // Render city and units.
          const city = mTile.city;
          const units = mTile.units;

          if (city !== null) {
            // City rendering.
            const player = city.player;
            const colorSlot = player.colorSlot;
            const colors = defs.colors[colorSlot];
            ctx.drawImage(unitsImg, 0, colorSlot * tileSize, tileSize, tileSize, dx, dy, tileSize, tileSize);

            // TODO: City walls - Anything in a city that requires special rendering
            // should be configurable in defs, this is so bound to the "civ" game.
            if (city.hasBuilding("City Walls"))
              ctx.drawImage(miscImg, 32, 128, tileSize, tileSize, dx, dy, tileSize, tileSize);

            // Defended city.
            if (units)
              ctx.drawImage(miscImg, 64, 128, tileSize, tileSize, dx, dy, tileSize, tileSize);

            ctx.font = "bold 16px helvetica";
            ctx.textBaseline = "middle";
            ctx.textAlign = "center";

            const text = String(city.size);
            const tx = dx + tileHalf;
            const ty = dy + tileHalf + 1;

            ctx.lineWidth = 2;
            ctx.strokeStyle = colors.textStroke;
            ctx.strokeText(text, tx, ty);

            ctx.fillStyle = colors.text;
            ctx.fillText(text, tx, ty);
          }
          else if (units !== null) {
            // Unit rendering.
            const unit = units;
            const stacked = unit.next !== null;

            const player = unit.player;
            const colorSlot = player.colorSlot;

            const tx = (unit.id + 1) * tileSize;
            const ty = colorSlot * tileSize;

            ctx.drawImage(unitsImg, tx, ty, tileSize, tileSize, dx, dy, tileSize, tileSize);
            if (stacked)
              ctx.drawImage(unitsImg, tx, ty, tileSize, tileSize, dx - 2, dy - 2, tileSize, tileSize);
          }

          // Cover edges.
          if (coverEdges !== 0) {
            const texX = Math.floor((this.worldX + dx) % 256);
            const texY = Math.floor((this.worldY + dy) % 256);

            this.$renderTransition(ctx, dx, dy, coverImg, texX, texY, coverBM, TerrainTransitions.LUT[coverEdges] * tileSize, 0, tileSize);
          }

          // Territory.
          const territory = mTile.territory;
          if (territory !== -1) {
            const territoryEdges = rTile.territoryEdges;
            if (territoryEdges !== 0xFF) {
              ctx.drawImage(territoryImg, tileSize * TerritoryTransitions.LUT[territoryEdges], tileSize * territory, tileSize, tileSize, dx, dy, tileSize, tileSize);
            }
          }
        }

        dx += tileSize;
        if (dx >= x1) break;

        if (++tx >= mapW) tx = 0;
      }

      dy += tileSize;
      if (dy >= y1) break;

      if (++ty >= mapH) ty = 0;
    }
  }

  $renderDebugObjects(ctx, cx, cy, x0, y0, x1, y1) {
    const tileSize = this.tileSize;
    const tileHalf = this.tileHalf;

    // Initialize the first tile offsets.
    const txInit = Math.floor(x0 / tileSize);
    const tyInit = Math.floor(y0 / tileSize);

    // Adjust the input coordinates here according to `cx` and `cy` as it's
    // much easier to just adjust it instead of messing with them within the loop.
    const dxInit = cx - x0 + txInit * tileSize;
    const dyInit = cy - y0 + tyInit * tileSize;

    const rw = x1 - x0;
    const rh = y1 - y0;

    const mapW = this.map.w;
    const mapH = this.map.h;

    const mapTiles = this.map.tiles;
    const rendererTiles = this.$tiles;

    x1 = cx + rw; x0 = cx;
    y1 = cy + rh; y0 = cy;

    // Initial tile-y coordinates.
    var dy = dyInit;
    var ty = tyInit;

    // Game-data and assets.
    const game = this.game;
    const defs = game.defs;

    const icons = defs.icons;
    const assets = defs.assets;

    const images = game.assetStore.images;
    const miscImg = images[assets.byName("Misc").id];

    const debug = this.debug;

    for (;;) {
      // Initial grid-x coordinates.
      var dx = dxInit;
      var tx = txInit;

      for (;;) {
        const tileIndex = ty * mapW + tx;

        const mTile = mapTiles[tileIndex];
        const rTile = rendererTiles[tileIndex];

        if (rTile.coverEdges !== 256) {
          switch (debug) {
            case 1: {
              drawText(ctx, {
                x: dx + tileHalf,
                y: dy + tileHalf,
                center: true,
                fill: "#FFFFFF",
                stroke: "#000000",
                font: "bold 9px sans",
                text: String(mTile.deepness)
              });
              break;
            }

            case 2: {
              drawText(ctx, {
                x: dx + tileHalf,
                y: dy + tileHalf,
                center: true,
                fill: mTile.continentId !== -1 ? "#FFFFFF" : "#4FDFFF",
                stroke: "#000000",
                font: "bold 9px sans",
                text: mTile.continentId !== -1 ? String(mTile.continentId) : String(mTile.oceanId)
              });
              break;
            }
            
            case 3: {
              if (mTile.preventCity) {
                drawText(ctx, {
                  x: dx + tileHalf,
                  y: dy + tileHalf,
                  center: true,
                  fill: "#FFFFFF",
                  stroke: "#000000",
                  font: "bold 9px sans",
                  text: String(mTile.preventCity)
                });
              }
              break;
            }

            case 4: {
              const terrainInfo = defs.terrains[mTile.id];
              var rposX = 0;
              var rposY = 0;

              const o = {};
              game.calcTile(o, mTile);

              for (var r = 0; r < 3; r++) {
                const count = r === 0 ? o.food       :
                              r === 1 ? o.production :
                                        o.commerce   ;

                const icon  = r === 0 ? icons.byName("Food")       :
                              r === 1 ? icons.byName("Production") :
                                        icons.byName("Commerce")   ;

                for (var i = 0; i < count; i++) {
                  ctx.drawImage(miscImg, icon.assetX * 32, icon.assetY * 32, icon.width, icon.height, dx + rposX * 5, dy + rposY * 10, 14, 14);
                  if (++rposX == 6) { rposX = 0; rposY++; }
                }
              }
              break;
            }
          }
        }

        dx += tileSize;
        if (dx >= x1) break;

        if (++tx >= mapW) tx = 0;
      }

      dy += tileSize;
      if (dy >= y1) break;

      if (++ty >= mapH) ty = 0;
    }
  }

  /**
   * Renders a terrain cache.
   *
   * This function is generic, but is normally called to render a whole grid
   * of tiles that form a single block used by the renderer. It renders terrain
   * without any tiles on top of them. This is an essencial function for caching.
   */
  $renderTerrainCache(dst, cx, cy, x, y, w, h) {
    const map = this.map;

    const mw = map.w;
    const mh = map.h;

    const txEnd = Math.min(x + w, mw);
    const tyEnd = Math.min(y + h, mh);

    const tileSize = this.tileSize;
    const worldOffsetX = x * tileSize - cx;
    const worldOffsetY = y * tileSize - cy;

    const game = this.game;
    const assets = game.defs.assets;
    const images = game.assetStore.images;
    const miscImg = images[assets.byName("Misc").id];

    const mapTiles = map.tiles;
    const rendererTiles = this.$tiles;

    const ctx = dst.getContext("2d");

    for (var ty = y, dy = cy; ty < tyEnd; ty++, dy += tileSize) {
      const worldY = dy + worldOffsetY;
      const textureY = worldY & 255;

      var tileIndex = ty * mw + x;
      for (var tx = x, dx = cx; tx < txEnd; tx++, dx += tileSize) {
        const worldX = dx + worldOffsetX;
        const textureX = worldX & 255;

        const mapTile = mapTiles[tileIndex];
        const rendererTile = rendererTiles[tileIndex];

        const id = mapTile.id;
        const modifiers = mapTile.modifiers;
        const terrainEdges = rendererTile.terrainEdges;

        // Render base terrain texture (without any transitions).
        ctx.drawImage(images[rendererTile.baseTexture], textureX, textureY, tileSize, tileSize, dx, dy, tileSize, tileSize);

        // Render all transitions calculated by `$updateMapTile()`.
        const transitions = rendererTile.transitions;
        if (transitions !== null) {
          for (var i = 0, len = transitions.length; i < len; i += 7) {
            const tex = images[transitions[i]];
            const msk = images[transitions[i + 1]];
            const offset = transitions[i + 2];

            const bboxX = transitions[i + 3];
            const bboxY = transitions[i + 4];
            const bboxW = transitions[i + 5];
            const bboxH = transitions[i + 6];

            // Ideally this should be just a single call to the rendering context :(
            ctx.globalCompositeOperation = "xor";
            ctx.drawImage(msk, offset + bboxX, bboxY, bboxW, bboxH, dx + bboxX, dy + bboxY, bboxW, bboxH);

            ctx.globalCompositeOperation = "destination-over";
            ctx.drawImage(tex, textureX + bboxX, textureY + bboxY, bboxW, bboxH, dx + bboxX, dy + bboxY, bboxW, bboxH);
          }

          // Restore the composite operation to default.
          ctx.globalCompositeOperation = "source-over";
        }

        // River.
        if (id === TerrainType.Ocean) {
          if (terrainEdges !== 0xFF) {
            const riverEdges = rendererTile.riverEdges;
            if (riverEdges !== 0) {
              if (riverEdges & EdgeFlags.Top   ) ctx.drawImage(miscImg, 16 * tileSize, 0, tileSize, tileSize, dx, dy, tileSize, tileSize);
              if (riverEdges & EdgeFlags.Right ) ctx.drawImage(miscImg, 17 * tileSize, 0, tileSize, tileSize, dx, dy, tileSize, tileSize);
              if (riverEdges & EdgeFlags.Bottom) ctx.drawImage(miscImg, 18 * tileSize, 0, tileSize, tileSize, dx, dy, tileSize, tileSize);
              if (riverEdges & EdgeFlags.Left  ) ctx.drawImage(miscImg, 19 * tileSize, 0, tileSize, tileSize, dx, dy, tileSize, tileSize);
            }
          }
        }
        else {
          if (modifiers & TerrainModifier.kRiver) {
            const riverEdges = rendererTile.riverEdges;
            ctx.drawImage(miscImg, (riverEdges & 0xF) * tileSize, 0, tileSize, tileSize, dx, dy, tileSize, tileSize);

            this.$renderTransition(ctx, dx, dy,
              images[assets.byName("Texture.RiverCoast").id], textureX, textureY,
              images[assets.byName("BlendMap.RiverCoast").id], (riverEdges & 0xF) * tileSize, 0,
              tileSize, tileSize);
          }
        }

        tileIndex++;
      }
    }
  }

  $renderTransition(ctx, dx, dy, tex, tx, ty, msk, mx, my, sq) {
    ctx.globalCompositeOperation = "xor";
    ctx.drawImage(msk, mx, my, sq, sq, dx, dy, sq, sq);

    ctx.globalCompositeOperation = "destination-over";
    ctx.drawImage(tex, tx, ty, sq, sq, dx, dy, sq, sq);

    ctx.globalCompositeOperation = "source-over";
  }
}
render.Renderer = Renderer;

$export[$as] = render;

}).apply(null, typeof this.webciv === "object"
  ? [this.webciv, this.webciv, "render"] : [require("./webciv-core"), module, "exports"]);
