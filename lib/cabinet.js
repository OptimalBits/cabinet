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
  winston = require('winston'),
  util = require('util');

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
 *    - `debug`    Enables debug logging via winston
 *
 * @param {String} root
 * @param {Object} options
 * @return {Function}
 * @api public
 */

exports = module.exports = function(root, options, virtuals, fileChangeListener){
"use_strict";

  var cache, watcher;

  if(_.isFunction(options)){
    fileChangeListener = options;
    options = undefined;
  }
  if(_.isFunction(virtuals)){
    fileChangeListener = virtuals;
    virtuals = undefined;
  }

  options = options || {};

  watcher = new Watcher(root, options.ignore);
  watcher.on('initialized', function(){
    winston.info("Directory watcher initialized: "+path.normalize(root));
  })

  if(fileChangeListener){
    watcher.on('changed', function(filename){
      fileChangeListener(relative(root, filename));
    });
  }

  if(options.cache){
    options.cache.maxObjects = options.cache.maxObjects || 256;
    options.cache.maxSize = options.cache.maxSize || 1024 * 256; // 256Kb max object size.
  }

  // root required
  if (!root) throw new Error('static() root path required');
  
  options.root = normalize(root);

  // use cache
  if(options.cache){
    cache = new Cache(options.cache.maxObjects);

    watcher.on('changed', function(path){
      cache.remove(path);
    })

    cache.on('remove', function(path){
      if (options.debug){
        winston.debug("cached entry removed for path:"+path);
      }
    });
    
    winston.info("File cache initialized");
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
"use strict";
  options = options || {};

  var
    head = (req.method === 'HEAD'),
    get = (req.method === 'GET');

  // ignore non-GET requests
  if (!get && !head) return next();

  // setup
  var maxAge = options.maxAge || 0,
      root = options.root,
      redirect = false === options.redirect ? false : true,
      hidden = options.hidden,
      filters = Filter.compileFilters(options);

  // parse url
  var 
    url = parse(req.url),
    path = decode(url.pathname);

  // invalid request uri & null bytes
  if ((path == -1) || ~path.indexOf('\0')){
    return badRequest(res);
  }
  
  // Check if there is a virtual path matching the path
  if(tryVirtuals(req, res, path)) return;

  // join / normalize from optional root dir
  path = normalize(join(root, path));

  // index.html support
  if (normalize('/') == path[path.length - 1]) path += 'index.html';

  // Get cached stats object from directory watcher
  getFileMeta(watcher, path, next, function(err, fileMeta){
    var stats = fileMeta.stats;

    if(err){
      respond(res, 500, err.msg);
    } else {
      setResponseHeaders(res, stats, fileMeta.etag, fileMeta.contentType);

      if(fresh(req, res)){
        return notModified(res);
      }

      if(!tryCache(req, res, path)){
        // malicious path
        if (root && path.indexOf(root) != 0) return forbidden(res);

        // "hidden" file
        if (!hidden && '.' == basename(path)[0]) return next();

        // redirect directory in case index.html is present
        if(stats.isDirectory()){
          if (!redirect) return next();
          res.statusCode = 301;
          res.setHeader('Location', url.pathname + '/');
          res.end('Redirecting to ' + url.pathname + '/');
          return;
        }

        // Handle Range requests
        var opts = {};
        var chunkSize = stats.size;

        if(req.headers.range) {
          var ranges = parseRange(stats.size, req.headers.range);
     
          switch(ranges){
            case -1:
              // unsatisfiable
              res.setHeader('Content-Range', 'bytes */' + stats.size);
              return respond(res, 416);
            case -2: 
              // error
              break;

            default:
              // valid (syntactically invalid ranges are treated as a regular response)
              options.debug && winston.debug('range request:'+req.headers.range);
              options.debug && winston.debug('ranges:'+ranges);
              
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
                + stats.size);
          }
        }

        res.setHeader('Content-Length', chunkSize);

        // transfer
        if (head) return res.end();

        Filter.applyFilters(filters, req, res, next, path, options, function(err, data, deps){
          watcher.setDependencies(path, deps);
          watcher.setContentType(path, res._headers['content-type']);
          if(err || !data){
            data = stream(req, res, path, opts);
            data.pipe(res);
          }

          if(cache && chunkSize < options.cache.maxSize){
            // Should we avoid caching when req.headers.cookie or set-cookie?
            cacheFile(data, res._headers, path);
          }
        });
      }
    }
  });
  
  function stream(req, res, path, opts){

    var stream = fs.createReadStream(path, opts);
    
    // socket closed, done with the fd
    req.on('close', stream.destroy.bind(stream));

    stream.on('error', function(err){
      // no hope in responding
      if(res._header) {
        winston.error(err.stack);
        req.destroy();
        return;
      }

      res.statusCode = 500;
      res.end(err.message);
    });
    
    return stream;
  };

  function getFileMeta(watcher, path, next, cb){
    var fileMeta = watcher.filesMeta[path];

    if(!fileMeta){
      watcher.updateMeta(path, function(err){
        if(err){
          var notFoundErrors = ['ENOENT', 'ENAMETOOLONG', 'ENOTDIR'];
          if (~notFoundErrors.indexOf(err.code)){
            return next();
          }else{
            cb(err);
          }
        }else{
          cb(null, watcher.filesMeta[path]);
        }
      })
    }else{
      cb(null, fileMeta);
    }
  }

  /**
   * Set response header fields, most
   * fields may be pre-defined.
   *
   * @param {Object} stat
   * @api private
   */
  function setResponseHeaders(res, stat, etag, contentType){
    if (!res.getHeader('Accept-Ranges')) res.setHeader('Accept-Ranges', 'bytes');
    if (!res.getHeader('ETag')) res.setHeader('ETag', etag || getEtag(stat));
    if (!res.getHeader('Date')) res.setHeader('Date', new Date().toUTCString());
    if (!res.getHeader('Cache-Control')) res.setHeader('Cache-Control', 'public, max-age=' + (maxAge / 1000));
    if (!res.getHeader('Last-Modified')) res.setHeader('Last-Modified', stat.mtime.toUTCString());
    
    contentType && res.setHeader('Content-Type', contentType);
    
    if (!res.getHeader('content-type')) {
      var
        type = mime.lookup(path),
        charset = mime.charsets.lookup(type);
      
      res.setHeader('Content-Type', type + (charset ? '; charset=' + charset : ''));
    }
  }

  /**
   * Check freshness of `req` and `res` headers.
   *
   * When the cache is "fresh" __true__ is returned,
   * otherwise __false__ is returned to indicate that
   * the cache is now stale.
   *
   * @param {Object} req
   * @param {Object} res
   * @return {Boolean}
   * @api public
   */

  function fresh(req, res) {
    // defaults
    var etagMatches = true;
    var notModified = true;

    // fields
    var modifiedSince = req.headers['if-modified-since'];
    var noneMatch = req.headers['if-none-match'];
    var lastModified = res._headers['last-modified'];
    var etag = res._headers['etag'];

    // unconditional request
    if (!modifiedSince && !noneMatch) return false;

    // parse if-none-match
    if (noneMatch) noneMatch = noneMatch.split(/ *, */);

    // if-none-match
    if (noneMatch) etagMatches = ~noneMatch.indexOf(etag) || '*' == noneMatch[0];

    // if-modified-since
    if (modifiedSince) {
      modifiedSince = new Date(modifiedSince);
      lastModified = new Date(lastModified);
      notModified = lastModified <= modifiedSince;
    }

    return !! (etagMatches && notModified);
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
      
      data.on('error', function(err){
        cache.remove(path);
      });
    } else {
      entry.push(data);
      entry.complete = true;
    }
    return entry;
  }

  /**
   * Sends a cached entry.
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
    
    // cache hit, doesnt support range requests yet
    if (hit && hit.complete && !req.headers.range) {
      options.debug && winston.debug("cache hit:"+path);

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
        virtuals[path].call(root, function(err, data, files){
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
};
