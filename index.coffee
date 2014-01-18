
ZIP = require 'zip'
path = require 'path'
fs = require 'fs'
binaryXHR = require 'binary-xhr'
EventEmitter = (require 'events').EventEmitter

class ArtPacks extends EventEmitter
  constructor: (packs) ->
    @packs = []
    @pending = {}
    @blobURLs = {}

    for pack in packs
      @addPack pack

  addPack: (x, name=undefined) ->
    if x instanceof ArrayBuffer
      rawZipArchiveData = x
      @packs.push new ArtPackArchive(rawZipArchiveData, name ? "(#{rawZipArchiveData.byteLength} raw bytes)")
      @emit 'loadedRaw', rawZipArchiveData
      @emit 'loadedAll'
    else if typeof x == 'string'
      url = x
      @pending[url] = true
      packIndex = @packs.length
      @packs[packIndex] = null # save place while loading
      @emit 'loadingURL', url
      binaryXHR url, (err, packData) =>
        if @packs[packIndex] != null
          console.log "artpacks warning: index #{packIndex} occupied, expected to be empty while loading #{url}"

        if err || !packData
          console.log "artpack failed to load \##{packIndex} - #{url}: #{err}"
          @emit 'failedURL', url, err
          delete @pending[url]
          return
          # @packs[packIndex] stays null

        try
          @packs[packIndex] = new ArtPackArchive(packData, url)
        catch e
          console.log "artpack failed to parse \##{packIndex} - #{url}: #{e}"
          @emit 'failedURL', url, e
          # fallthrough

        delete @pending[url]

        @emit 'loadedURL', url
        @emit 'loadedAll' if Object.keys(@pending).length == 0
    else
      pack = x
      @emit 'loadedPack', pack
      @emit 'loadedAll'
      @packs.push pack  # assumed to be ArtPackArchive

  getTexture: (name) -> @getURL name, 'textures'
  getSound: (name) -> @getURL name, 'sounds'

  getURL: (name, type) ->
    # already have URL?
    url = @blobURLs[type + ' ' + name]
    return url if url?

    # get a blob
    blob = @getBlob(name, type)
    return undefined if not blob?

    # create URL and return
    url = URL.createObjectURL(blob)
    @blobURLs[type + ' ' + name] = url
    return url

  getBlob: (name, type) ->
    for pack in @packs    # search packs in order
      continue if !pack
      blob = pack.getBlob(name, type)
      return blob if blob?

    return undefined

  # revoke all URLs to reload from packs list
  refresh: () ->
    for url in @blobURLs
      URL.revokeObjectURL(url)
    @blobURLs = []

  # delete all loaded packs
  clear: () ->
    @packs = []
    @refresh()

  getLoadedPacks: () ->
    ret = []
    for pack in @packs
      ret.push pack if pack?
    return ret

# optional 'namespace:' prefix (as in namespace:foo), defaults to anything
splitNamespace = (name) ->
  a = name.split ':'
  [namespace, name] = a if a.length > 1
  namespace ?= '*'

  return [namespace, name]


class ArtPackArchive
  # Load pack given binary data + optional informative name
  constructor: (packData, @name=undefined) ->
    if packData instanceof ArrayBuffer
      # convert browser ArrayBuffer to NodeJS Buffer so ZIP recognizes it as data
      packData = new Buffer(new Uint8Array(packData))
    @zip = new ZIP.Reader(packData)

    @zipEntries = {}
    @zip.forEach (entry) =>
      @zipEntries[entry.getName()] = entry

    @namespaces = @scanNamespaces()
    @namespaces.push 'foo'  # test

  toString: () -> @name ? 'ArtPack'  # TODO: get name from pack.txt

  # Get list of "namespaces" with a resourcepack
  # all of assets/<foo>
  scanNamespaces: () -> # TODO: only if RP
    namespaces = {}

    for zipEntryName in Object.keys(@zipEntries)
      parts = zipEntryName.split(path.sep)
      continue if parts.length < 2
      continue if parts[0] != 'assets'
      continue if parts[1].length == 0

      namespaces[parts[1]] = true

    return Object.keys(namespaces)

  nameToPath:
    textures: (fullname) ->
      a = fullname.split '/'
      [category, partname] = a if a.length > 1
      # optional category/ prefix, defaults to blocks, i/ shortcut
      category = {undefined:'blocks', 'i':'items'}[category] ? category
      partname ?= fullname

      [namespace, basename] = splitNamespace partname

      pathRP = "assets/#{namespace}/textures/#{category}/#{basename}.png"
      console.log fullname,[category,namespace,basename]
      
      return pathRP

    sounds: (fullname) ->
      [namespace, name] = splitNamespace fullname
      # TODO: optional categories to search all

      pathRP = "assets/#{namespace}/sounds/#{name}.ogg"

  mimeTypes:
    textures: 'image/png'
    sounds: 'audio/ogg'

  getArrayBuffer: (name, type) ->
    pathRP = @nameToPath[type](name)

    found = false

    # expand namespace wildcard, if any
    if pathRP.indexOf('*') == -1
      tryPaths = [pathRP]
    else
      tryPaths = (pathRP.replace('*', namespace) for namespace in @namespaces)

    for tryPath in tryPaths
      zipEntry = @zipEntries[tryPath]
      if zipEntry?
        #console.log 'FOUND',pathRP,'AT',zipEntry.entryName
        #console.log zipEntry
        data = zipEntry.getData()
        #console.log "decompressed #{zipEntry.entryName} to #{data.length}"

        return data

    return undefined # not found

  getBlob: (name, type) ->
    arrayBuffer = @getArrayBuffer name, type
    return undefined if not arrayBuffer?

    return new Blob [arrayBuffer], {type: @mimeTypes[type]}

module.exports = (opts) ->
  return new ArtPacks(opts)


