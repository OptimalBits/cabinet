/*!
 * Cabinet
 * Copyright(c) 2012 Optimal Bits Sweden AB.
 * Copyright(c) 2011 TJ Holowaychuk*
 * Copyright(c) 2010 Sencha Inc.
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var
  Filter = require('./filter'),
  Cache = require('./cache'),
  Watcher = require('./watcher').Watcher,
  fs = require('fs'),
  Stream = require('stream'),
  path = require('path'),
  join = path.join,
  basename = path.basename,
  normalize = path.normalize,
  relative = path.relative,
  Buffer = require('buffer').Buffer,
  parse = require('url').parse,
  mime = require('mime'),
  parseRange = require('range-parser'),
  _ = require('underscore'),
  winston = require('winston');

/**
 * Static file server with the given `root` path.
 *
 * Examples:
 *
 *     var oneDay = 86400000;
 *
 *     connect(
 *       connect.static(__dirname + '/public')
 *     ).listen(3000);
 *
 *     connect(
 *       connect.static(__dirname + '/public', { maxAge: oneDay })
 *     ).listen(3000);
 *
 * Options:
 *
 *    - `cache`    Enables caching.
 *    - `maxAge`   Browser cache maxAge in milliseconds. defaults to 0
 *    - `hidden`   Allow transfer of hidden files. defaults to false
 *    - `redirect`   Redirect to trailing "/" when the pathname is a dir
 *
 * @param {String} root
 * @param {Object} options
 * @return {Function}
 * @api public
 */

exports = module.exports = function(root, options, virtuals, cacheListener){
  var cache, watcher;
  
  if(_.isFunction(options)){
    cacheListener = options;
    options = undefined;
  }
  if(_.isFunction(virtuals)){
    cacheListener = virtuals;
    virtuals = undefined;
  }
  
  watcher = new Watcher(root);
  watcher.on('initialized', function(){
    winston.info("Directory watcher over "+root+" initialized");
  })
  
  if(cacheListener){
    watcher.on('changed', function(filename){
      cacheListener(relative(root, filename));
    });
  }

  options = options || {};
  if(options.cache){
    options.cache.maxObjects = options.cache.maxObjects || 256;
    options.cache.maxSize = options.cache.maxSize || 1024 * 256;
  }

  // root required
  if (!root) throw new Error('static() root path required');
  options.root = root;
  
  // use cache
  if(options.cache){
    cache = new Cache(options.cache.maxObjects || 1024);
    cache.maxLen = options.cache.maxSize || 1024 * 256; // 256Kb max object size.
    
    watcher.on('changed', function(path){
      cache.remove(path);
    })
    
    cache.on('remove', function(path){
      winston.debug("cached entry removed for path:"+path);
    });
  }
  
  return function static(req, res, next) {	
    send(req, res, next, options, cache, virtuals, watcher);
  };
};

/**
 * Expose virtuals module.
 */
 exports.virtuals = require('./virtuals');
 
/**
 * Expose mime module.
 */

exports.mime = mime;

/**
 * Attempt to tranfer the requested file to `res`.
 *
 * @param {ServerRequest}
 * @param {ServerResponse}
 * @param {Function} next
 * @param {Object} options
 * @param {Cache} cache
 * @param {Object} virtuals
 * @api private
 */

var send = exports.send = function(req, res, next, options, cache, virtuals, watcher){
  options = options || {};
  
  var 
    head = (req.method === 'HEAD'), 
    get = (req.method === 'GET');
      
  // ignore non-GET requests
  if (!get && !head) return next();

  // setup
  var maxAge = options.maxAge || 0,
      ranges = req.headers.range,
      root = options.root ? normalize(options.root) : null,
      redirect = false === options.redirect ? false : true,
      hidden = options.hidden,
      filters = Filter.compileFilters(options);
      
  this.root = root // Expose root to virtuals / filters.
    
  // parse url
  var url = parse(req.url),
    path = decode(url.pathname);

  // invalid request uri & null bytes
  if ((path == -1) || ~path.indexOf('\0')){
    return badRequest(res);
  }
  
  // when root is not given, consider .. malicious
  if (!root && ~path.indexOf('..')) return forbidden(res);

  // Check if there is a virtual path matching the path
  if(tryVirtuals(req, res, path)) return;

  // join / normalize from optional root dir
  path = normalize(join(root, path));
  
  // Get cached stats object from directory watcher
  var fileMeta = watcher.filesMeta[path];
    
  // Use the cached etag in the watcher if available.
  if(fileMeta){
    setResponseHeaders(res, fileMeta.stats, fileMeta.etag);
    
    if(isConditional(req) && !isModified(req, res)) {
      return notModified(res);
    }
  }

  if(!tryCache(req, res, path)){
    // malicious path
    if (root && path.indexOf(root) != 0) return forbidden(res);

    // index.html support
    if (normalize('/') == path[path.length - 1]) path += 'index.html';

    // "hidden" file
    if (!hidden && '.' == basename(path)[0]) return next();
    
    fs.stat(path, function(err, stat){
      if (err){
        var notFoundErrors = ['ENOENT', 'ENAMETOOLONG', 'ENOTDIR'];
        if (~notFoundErrors.indexOf(err.code)){
          return next();
        }else{
          return respond(res, 500, err.msg);
        }

      // redirect directory in case index.html is present
      } else if (stat.isDirectory()) {
        if (!redirect) return next();
        res.statusCode = 301;
        res.setHeader('Location', url.pathname + '/');
        res.end('Redirecting to ' + url.pathname + '/');
        return;
      }
      
      // Response headers
      setResponseHeaders(res, stat);
      
      // conditional GET support
      if (isConditional(req) && !isModified(req, res)) {
        return notModified(res);
      }

      // Handle Range requests
      var opts = {};
      var chunkSize = stat.size;

      if (ranges) {
        ranges = parseRange(stat.size, ranges);
        
        // unsatisfiable
        if (-1 == ranges) {
          res.setHeader('Content-Range', 'bytes */' + stat.size);
          return respond(res, 416);
        }
      
        // valid (syntactically invalid ranges are treated as a regular response)
        if (-2 != ranges) {
          opts.start = ranges[0].start;
          opts.end = ranges[0].end;
      
          // Content-Range
          chunkSize = opts.end - opts.start + 1;
          res.statusCode = 206;
          res.setHeader('Content-Range', 'bytes '
            + opts.start
            + '-'
            + opts.end
            + '/'
            + stat.size);
        }
      }

      res.setHeader('Content-Length', chunkSize);

      // transfer
      if (head) return res.end();
      
      Filter.applyFilters(filters, req, res, next, path, options, function(err, data, deps){
        watcher.setDependencies(path, deps);
        
        if(err || !data){
          data = fs.createReadStream(path, opts);
          data.pipe(res);
        }
        
        if(cache && chunkSize < options.cache.maxSize){
          // Should we avoid caching when req.headers.cookie or set-cookie?
          cacheFile(data, res._headers, path);
        }
      });      
    });
  }
  
  /**
   * Set response header fields, most
   * fields may be pre-defined.
   *
   * @param {Object} stat
   * @api private
   */
  function setResponseHeaders(res, stat, etag){
    if (!res.getHeader('Accept-Ranges')) res.setHeader('Accept-Ranges', 'bytes');
    if (!res.getHeader('ETag')) res.setHeader('ETag', etag || getEtag(stat));
    if (!res.getHeader('Date')) res.setHeader('Date', new Date().toUTCString());
    if (!res.getHeader('Cache-Control')) res.setHeader('Cache-Control', 'public, max-age=' + (maxAge / 1000));
    if (!res.getHeader('Last-Modified')) res.setHeader('Last-Modified', stat.mtime.toUTCString());
    if (!res.getHeader('content-type')) {
      var 
        type = mime.lookup(path), 
        charset = mime.charsets.lookup(type);
        
      res.setHeader('Content-Type', type + (charset ? '; charset=' + charset : ''));
    }
  }
  
  /**
   * decodeURIComponent.
   *
   * Allows V8 to only deoptimize this fn instead of all
   * of send().
   *
   * @param {String} path
   * @api private
   */
  function decode(path){
    try {
      return decodeURIComponent(path);
    } catch (err) {
      return -1;
    }
  };
  
  /**
   * Return an ETag in the form of `"<size>-<mtime>"`
   * from the given `stat`.
   *
   * @param {Object} stat
   * @return {String}
   * @api public
   */

  function getEtag(stat) {
    return '"' + stat.size + '-' + Number(stat.mtime) + '"';
  };
  
  /**
   * Check if `req` is a conditional GET request.
   *
   * @param {IncomingMessage} req
   * @return {Boolean}
   * @api public
   */

  function isConditional(req) {
    return req.headers['if-modified-since'] || req.headers['if-none-match'];
  };
  
  /**
   * Check `req` and `res` to see if it has been modified.
   *
   * @param {IncomingMessage} req
   * @param {ServerResponse} res
   * @return {Boolean}
   * @api public
   */
  function isModified(req, res, headers) {
    var headers = headers || res._headers || {}
      , modifiedSince = req.headers['if-modified-since']
      , lastModified = headers['last-modified']
      , noneMatch = req.headers['if-none-match']
      , etag = headers['etag'];

    if (noneMatch) noneMatch = noneMatch.split(/ *, */);

    // check If-None-Match
    if (noneMatch && etag && ~noneMatch.indexOf(etag)) {
      return false;
    }

    // check If-Modified-Since
    if (modifiedSince && lastModified) {
      modifiedSince = new Date(modifiedSince);
      lastModified = new Date(lastModified);
      // Ignore invalid dates
      if (!isNaN(modifiedSince.getTime())) {
        if (lastModified <= modifiedSince) return false;
      }
    }
  
    return true;
  };
  
  /**
   * Strip `Content-*` headers from `res`.
   *
   * @param {ServerResponse} res
   * @api public
   */

  function removeContentHeaders(res){
    Object.keys(res._headers).forEach(function(field){
      if (field.indexOf('content') == 0) {
        res.removeHeader(field);
      }
    });
  };
  
  
  /**
   * Respond
   *
   * @param {ServerResponse} res
   * @param {Number} code
   * @param {String} msg
   * @api public
   */
   
  function respond(res, code, msg){
    msg && res.setHeader('Content-Type', 'text/plain');
    msg && res.setHeader('Content-Length', msg.length);
    
    res.statusCode = code;
    res.end(msg);
   }
   
   /**
    * Respond with 304 "Not Modified".
    *
    * @param {ServerResponse} res
    * @param {Object} headers
    * @api public
    */

   function notModified(res) {
     removeContentHeaders(res);
     res.statusCode = 304;
     res.end();
   };
 
   /**
    * Respond with 404 "Not Found".
    *
    * @param {ServerResponse} res
    * @api public
    */
   function notFound(res) {
     respond(res, 404, 'Not Found');
   };
   
   /**
    * Respond with 403 "Forbidden".
    *
    * @param {ServerResponse} res
    * @api public
    */

   function forbidden(res) {
    respond(res, 403, 'Forbidden')
   };

  /**
   * Respond with 400 "Bad Request".
   *
   * @param {ServerResponse} res
   * @api public
   */

  function badRequest(res) {
    respond(res, 400, 'Bad Request');
  };
  
  /**
   * Respond with 416  "Requested Range Not Satisfiable"
   *
   * @param {ServerResponse} res
   * @api private
   */

  function invalidRange(res) {
    respond(res, 416, 'Requested Range Not Satisfiable');
  }
  
  /**
   * Caches a file into the memory cache.
   *
   * @param {Stream} data
   * @param {Object} headers Response headers for the cached file.
   * @param {String} path to the file to be cached.
   * @api private
   */
   
  function cacheFile(data, headers, path){
    var entry = cache.add(path);
    entry.headers = _.clone(headers);

    // This is to avoid problems when using it together with session middleware.
    delete entry.headers['set-cookie'];
	
    if(data instanceof Stream){
      //
      // store the chunks
      //
      data.on('data', function(chunk){
        entry.push(chunk);
      });

      data.on('end', function(){
        entry.complete = true;
      }); 
    } else {
      entry.push(data);
      entry.complete = true;      
    }
    return entry;
  }
  
  /**
   * Sends a cache entry.
   *
   * @param {ServerRequest} Server Request.
   * @param {ServerResponse} Server response.
   * @param {Object} Entry to be sent to the client.
   * @api private
   */
  function sendEntry(req, res, entry){
    var headers = _.clone(entry.headers);
            
    headers.Age = (new Date - new Date(headers.date)) / 1000 | 0;
    headers.date = new Date().toUTCString();

    switch(req.method){
      case 'HEAD':
        headers['content-length'] = 0;
        res.writeHead(200, headers);
        res.end();
      break;
      case 'GET':
        if (isConditional(req) && !isModified(req, res, headers)) {
          notModified(res);
        }else{
          res.writeHead(200, headers);
            
          function write(i) {
            while(i < entry.length){
              if(res.write(entry[i++]) === false){
                res.once('drain', function(){
                  write(i);
                });
                return;
              }
            }
            res.end();
          }            
          write(0);
        }
      break;
      default:
        respond(req, 500, 'Not Supported')
    }
  }
  
  /**
   * Tries to send a cached file.
   *
   * @param {ServerRequest} Server Request.
   * @param {ServerResponse} Server response.
   * @param {String} path to the file to be cached.
   * @api private
   */
   
  function tryCache(req, res, path){
    if(!cache) return false;
    
    var hit = cache.get(path);
    winston.debug("cache hit:"+path);
       
    // cache hit, doesnt support range requests yet
    if (hit && hit.complete && !ranges) {  
      sendEntry(req, res, hit);
      return true;
    }else{
      return false;
    }
  }
  
  /**
   * Tries to match a virtual file.
   *
   * @param {ServerRequest} Server Request.
   * @param {ServerResponse} Server response.
   * @param {String} path to the file to be cached.
   * @api private
   */
  function tryVirtuals(req, res, path){
    var entry;
    if(virtuals && virtuals[path]){
      if(!tryCache(req, res, path)){
        virtuals[path].call(this, function(err, data, files){
          watcher.setVirtual(path, files);
          
          var length = typeof data === 'string' ? Buffer.byteLength(data) : data.length;
          
          setResponseHeaders(res, {size:length, mtime:new Date()});
          if(cache){
            entry = cacheFile(data, res._headers, path);
          }else{
            entry = [];
            entry.headers = _.clone(res._headers);
            entry.push(data);
          }
          sendEntry(req, res, entry);
        });
      }
      return true;
    }
    return false;
  }
  
  function removeChangedFiles(cache, files){
    var watchers = [], i;
    
    files = files instanceof Array? files : [files];

    for(i=0;i<files.length;i++){
      var path = files[i];
      try{
        winston.debug("Listening for changes:"+path);
        watchers.push(fs.watch(path, {persistent: false}, function(){
          cache.remove(path);
        }));
      }catch(err){
        winston.error("Error starting to watch file:"+path+" "+err);
      }
    }
    return watchers;
  }
};
