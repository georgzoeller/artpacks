// Generated by CoffeeScript 1.7.0
(function() {
  var ArtPackArchive, ArtPacks, Buffer, EventEmitter, ZIP, arrayBufferToString, binaryXHR, fs, getFrames, getPixels, graycolorize, path, savePixels, splitNamespace,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  ZIP = require('zip');

  path = require('path');

  fs = require('fs');

  binaryXHR = require('binary-xhr');

  EventEmitter = (require('events')).EventEmitter;

  Buffer = (require('native-buffer-browserify')).Buffer;

  getFrames = require('mcmeta');

  getPixels = require('get-pixels');

  savePixels = require('save-pixels');

  graycolorize = require('graycolorize');

  arrayBufferToString = function(arrayBuffer) {
    return String.fromCharCode.apply(null, new Uint8Array(arrayBuffer));
  };

  ArtPacks = (function(_super) {
    __extends(ArtPacks, _super);

    function ArtPacks(packs) {
      var pack, _i, _len;
      this.packs = [];
      this.pending = {};
      this.blobURLs = {};
      this.shouldColorize = {
        'grass_top': true,
        'leaves_oak': true
      };
      this.setMaxListeners(0);
      for (_i = 0, _len = packs.length; _i < _len; _i++) {
        pack = packs[_i];
        this.addPack(pack);
      }
    }

    ArtPacks.prototype.addPack = function(x, name) {
      var pack, packIndex, rawZipArchiveData, url;
      if (name == null) {
        name = void 0;
      }
      if (x instanceof ArrayBuffer) {
        rawZipArchiveData = x;
        this.packs.push(new ArtPackArchive(rawZipArchiveData, name != null ? name : "(" + rawZipArchiveData.byteLength + " raw bytes)"));
        this.refresh();
        this.emit('loadedRaw', rawZipArchiveData);
        return this.emit('loadedAll');
      } else if (typeof x === 'string') {
        url = x;
        if (typeof XMLHttpRequest === "undefined" || XMLHttpRequest === null) {
          throw new Error("artpacks unsupported addPack url " + x + " without XMLHttpRequest");
        }
        this.pending[url] = true;
        packIndex = this.packs.length;
        this.packs[packIndex] = null;
        this.emit('loadingURL', url);
        return binaryXHR(url, (function(_this) {
          return function(err, packData) {
            var e;
            if (_this.packs[packIndex] !== null) {
              console.log("artpacks warning: index " + packIndex + " occupied, expected to be empty while loading " + url);
            }
            if (err || !packData) {
              console.log("artpack failed to load \#" + packIndex + " - " + url + ": " + err);
              _this.emit('failedURL', url, err);
              delete _this.pending[url];
              return;
            }
            try {
              _this.packs[packIndex] = new ArtPackArchive(packData, url);
              _this.refresh();
            } catch (_error) {
              e = _error;
              console.log("artpack failed to parse \#" + packIndex + " - " + url + ": " + e);
              _this.emit('failedURL', url, e);
            }
            delete _this.pending[url];
            console.log('artpacks loaded pack:', url);
            _this.emit('loadedURL', url);
            if (Object.keys(_this.pending).length === 0) {
              return _this.emit('loadedAll');
            }
          };
        })(this));
      } else {
        pack = x;
        this.emit('loadedPack', pack);
        this.emit('loadedAll');
        this.packs.push(pack);
        return this.refresh();
      }
    };

    ArtPacks.prototype.swap = function(i, j) {
      var temp;
      if (i === j) {
        return;
      }
      temp = this.packs[i];
      this.packs[i] = this.packs[j];
      this.packs[j] = temp;
      return this.refresh();
    };

    ArtPacks.prototype.colorize = function(img, onload, onerror) {
      return getPixels(img.src, function(err, pixels) {
        var img2;
        if (err) {
          return onerror(err, img);
        }
        if (this.colorMap == null) {
          this.colorMap = graycolorize.generateMap(120 / 360, 0.7);
        }
        graycolorize(pixels, this.colorMap);
        img2 = new Image();
        img2.src = savePixels(pixels, 'canvas').toDataURL();
        img2.onload = function() {
          return onload(img2);
        };
        return img2.onerror = function(err) {
          return onerror(err, img2);
        };
      });
    };

    ArtPacks.prototype.getTextureImage = function(name, onload, onerror) {
      var img, load;
      img = new Image();
      load = (function(_this) {
        return function() {
          var url;
          url = _this.getTexture(name);
          if (url == null) {
            return onerror("no such texture in artpacks: " + name, img);
          }
          img.src = url;
          img.onload = function() {
            var json;
            if (_this.shouldColorize[name]) {
              return _this.colorize(img, onload, onerror);
            }
            if (img.height === img.width) {
              return onload(img);
            } else {
              json = _this.getMeta(name, 'textures');
              console.log('.mcmeta=', json);
              return getPixels(img.src, function(err, pixels) {
                var frameImgs, frames, loaded;
                if (err) {
                  return onerror(err, img);
                }
                frames = getFrames(pixels, json);
                loaded = 0;
                frameImgs = [];
                return frames.forEach(function(frame) {
                  var frameImg;
                  frameImg = new Image();
                  frameImg.src = frame.image;
                  frameImg.onerror = function(err) {
                    return onerror(err, img, frameImg);
                  };
                  return frameImg.onload = function() {
                    frameImgs.push(frameImg);
                    if (frameImgs.length === frames.length) {
                      if (frameImgs.length === 1) {
                        return onload(frameImgs[0]);
                      } else {
                        return onload(frameImgs);
                      }
                    }
                  };
                });
              });
            }
          };
          return img.onerror = function(err) {
            return onerror(err, img);
          };
        };
      })(this);
      if (this.isQuiescent()) {
        return load();
      } else {
        return this.on('loadedAll', load);
      }
    };

    ArtPacks.prototype.getTexture = function(name) {
      return this.getURL(name, 'textures');
    };

    ArtPacks.prototype.getSound = function(name) {
      return this.getURL(name, 'sounds');
    };

    ArtPacks.prototype.getURL = function(name, type) {
      var blob, url;
      url = this.blobURLs[type + ' ' + name];
      if (url != null) {
        return url;
      }
      blob = this.getBlob(name, type);
      if (blob == null) {
        return void 0;
      }
      url = URL.createObjectURL(blob);
      this.blobURLs[type + ' ' + name] = url;
      return url;
    };

    ArtPacks.prototype.mimeTypes = {
      textures: 'image/png',
      sounds: 'audio/ogg'
    };

    ArtPacks.prototype.getBlob = function(name, type) {
      var arrayBuffer;
      arrayBuffer = this.getArrayBuffer(name, type, false);
      if (arrayBuffer == null) {
        return void 0;
      }
      return new Blob([arrayBuffer], {
        type: this.mimeTypes[type]
      });
    };

    ArtPacks.prototype.getArrayBuffer = function(name, type, isMeta) {
      var arrayBuffer, pack, _i, _len, _ref;
      _ref = this.packs.slice(0).reverse();
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        pack = _ref[_i];
        if (!pack) {
          continue;
        }
        arrayBuffer = pack.getArrayBuffer(name, type, isMeta);
        if (arrayBuffer != null) {
          return arrayBuffer;
        }
      }
      return void 0;
    };

    ArtPacks.prototype.getMeta = function(name, type) {
      var arrayBuffer, decodedString, encodedString, json;
      arrayBuffer = this.getArrayBuffer(name, type, true);
      if (arrayBuffer == null) {
        return void 0;
      }
      encodedString = arrayBufferToString(arrayBuffer);
      decodedString = decodeURIComponent(escape(encodedString));
      json = JSON.parse(decodedString);
      return json;
    };

    ArtPacks.prototype.refresh = function() {
      var url, _i, _len, _ref;
      _ref = this.blobURLs;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        url = _ref[_i];
        URL.revokeObjectURL(url);
      }
      this.blobURLs = [];
      return this.emit('refresh');
    };

    ArtPacks.prototype.clear = function() {
      this.packs = [];
      return this.refresh();
    };

    ArtPacks.prototype.getLoadedPacks = function() {
      var pack, ret, _i, _len, _ref;
      ret = [];
      _ref = this.packs.slice(0).reverse();
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        pack = _ref[_i];
        if (pack != null) {
          ret.push(pack);
        }
      }
      return ret;
    };

    ArtPacks.prototype.isQuiescent = function() {
      return this.getLoadedPacks().length > 0 && Object.keys(this.pending).length === 0;
    };

    return ArtPacks;

  })(EventEmitter);

  splitNamespace = function(name) {
    var a, namespace;
    a = name.split(':');
    if (a.length > 1) {
      namespace = a[0], name = a[1];
    }
    if (namespace == null) {
      namespace = '*';
    }
    return [namespace, name];
  };

  ArtPackArchive = (function() {
    function ArtPackArchive(packData, name) {
      this.name = name != null ? name : void 0;
      if (packData instanceof ArrayBuffer) {
        packData = new Uint8Array(packData);
      }
      this.zip = new ZIP.Reader(packData);
      this.zipEntries = {};
      this.zip.forEach((function(_this) {
        return function(entry) {
          return _this.zipEntries[entry.getName()] = entry;
        };
      })(this));
      this.namespaces = this.scanNamespaces();
      this.namespaces.push('foo');
    }

    ArtPackArchive.prototype.toString = function() {
      var _ref;
      return (_ref = this.name) != null ? _ref : 'ArtPack';
    };

    ArtPackArchive.prototype.scanNamespaces = function() {
      var namespaces, parts, zipEntryName, _i, _len, _ref;
      namespaces = {};
      _ref = Object.keys(this.zipEntries);
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        zipEntryName = _ref[_i];
        parts = zipEntryName.split(path.sep);
        if (parts.length < 2) {
          continue;
        }
        if (parts[0] !== 'assets') {
          continue;
        }
        if (parts[1].length === 0) {
          continue;
        }
        namespaces[parts[1]] = true;
      }
      return Object.keys(namespaces);
    };

    ArtPackArchive.prototype.nameToPath = {
      textures: function(fullname) {
        var a, basename, category, namespace, partname, pathRP, _ref, _ref1;
        a = fullname.split('/');
        if (a.length > 1) {
          category = a[0], partname = a[1];
        }
        category = (_ref = {
          undefined: 'blocks',
          'i': 'items'
        }[category]) != null ? _ref : category;
        if (partname == null) {
          partname = fullname;
        }
        _ref1 = splitNamespace(partname), namespace = _ref1[0], basename = _ref1[1];
        pathRP = "assets/" + namespace + "/textures/" + category + "/" + basename + ".png";
        console.log('artpacks texture:', fullname, [category, namespace, basename]);
        return pathRP;
      },
      sounds: function(fullname) {
        var name, namespace, pathRP, _ref;
        _ref = splitNamespace(fullname), namespace = _ref[0], name = _ref[1];
        return pathRP = "assets/" + namespace + "/sounds/" + name + ".ogg";
      }
    };

    ArtPackArchive.prototype.getArrayBuffer = function(name, type, isMeta) {
      var found, namespace, pathRP, tryPath, tryPaths, zipEntry, _i, _len;
      if (isMeta == null) {
        isMeta = false;
      }
      pathRP = this.nameToPath[type](name);
      if (isMeta) {
        pathRP += '.mcmeta';
      }
      found = false;
      if (pathRP.indexOf('*') === -1) {
        tryPaths = [pathRP];
      } else {
        tryPaths = (function() {
          var _i, _len, _ref, _results;
          _ref = this.namespaces;
          _results = [];
          for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            namespace = _ref[_i];
            _results.push(pathRP.replace('*', namespace));
          }
          return _results;
        }).call(this);
      }
      for (_i = 0, _len = tryPaths.length; _i < _len; _i++) {
        tryPath = tryPaths[_i];
        zipEntry = this.zipEntries[tryPath];
        if (zipEntry != null) {
          return zipEntry.getData();
        }
      }
      return void 0;
    };

    ArtPackArchive.prototype.getFixedPathArrayBuffer = function(path) {
      var _ref;
      return (_ref = this.zipEntries[path]) != null ? _ref.getData() : void 0;
    };

    ArtPackArchive.prototype.getPackLogo = function() {
      var arrayBuffer, blob;
      if (this.logoURL) {
        return this.logoURL;
      }
      arrayBuffer = this.getFixedPathArrayBuffer('pack.png');
      if (arrayBuffer != null) {
        blob = new Blob([arrayBuffer], {
          type: 'image/png'
        });
        return this.logoURL = URL.createObjectURL(blob);
      } else {
        return this.logoURL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVQYV2N48uTJfxBmgDEAg3wOrbpADeoAAAAASUVORK5CYII=';
      }
    };

    ArtPackArchive.prototype.getPackJSON = function() {
      var arrayBuffer, str;
      if (this.json != null) {
        return this.json;
      }
      arrayBuffer = this.getFixedPathArrayBuffer('pack.mcmeta');
      if (arrayBuffer == null) {
        return {};
      }
      str = arrayBufferToString(arrayBuffer);
      return this.json = JSON.parse(str);
    };

    ArtPackArchive.prototype.getDescription = function() {
      var _ref, _ref1, _ref2;
      return (_ref = (_ref1 = this.getPackJSON()) != null ? (_ref2 = _ref1.pack) != null ? _ref2.description : void 0 : void 0) != null ? _ref : this.name;
    };

    return ArtPackArchive;

  })();

  module.exports = function(opts) {
    return new ArtPacks(opts);
  };

}).call(this);
