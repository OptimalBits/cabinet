
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

var fs = require('fs'),
   path = require('path'),
   join = path.join,
   basename = path.basename,
   normalize = path.normalize,
   Cache = require('./cache'),
   Buffer = require('buffer').Buffer,
   parse = require('url').parse,
   mime = require('mime'),
   parseRange = require('range-parser'),
   zlib = require('zlib'),
   less = require('less'),
   uglify = require('uglify-js'),
   _ = require('underscore');
  
var gzippify = function(req, res, next, data, path){
  zlib.gzip(data, function(err, buffer){
    if(err){
      next(err);
    }else{
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Content-Length', buffer.length);
      req.emit('static', {data:buffer, path:path});
      res.write(buffer);
      res.end();
    }
  });
}

function provider(req, res, next, path, options){
  var type = mime.lookup(path);
  if(  (type == 'application/javascript') ||
       (type == 'text/css') ||
       (path.indexOf('.less') !=-1) ||
       (path.indexOf('.jade') !=-1)){
    fs.readFile(path, 'utf-8', function(err, data){
      if(err){
        next(err);
      }else{      
        if(path.match('.less')){
          var lessParser = new(less.Parser)(options.less);
          
          lessParser.parse(data, function(err, tree) {
            if(err){
              next(err);
            }else{
              res.setHeader("Content-type", "text/css");
              gzippify(req, res, next, tree.toCSS(), path);
            }
          });
        } else if((type == 'application/javascript') &&
				  (path.indexOf("min")==-1) &&
				  options.minjs) {
          // Uglify
          var jsp = uglify.parser, pro = uglify.uglify, ast = jsp.parse(data);
          ast = pro.ast_mangle(ast);
          ast = pro.ast_squeeze(ast);
          gzippify(req, res, next, pro.gen_code(ast), path);
        } else {
          gzippify(req, res, next, data, path);
        }
      }
    });
    return true;
  }else{
    return false;
  }
}

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

exports = module.exports = function static(root, options){
  var cache;
    
  options = options || {};

  // root required
  if (!root) throw new Error('static() root path required');
  options.root = root;
  
  // use cache
  if(options.cache){
    cache = new Cache(options.cache.maxObjects || 1024);
    cache.maxLen = options.cache.maxSize || 1024 * 256; // 256Kb max object size.
    
    cache.on('remove', function(entry, path){
      entry.watcher.close();
    });
  }

  return function static(req, res, next) {
    options.path = req.url;
    options.getOnly = true;
    
    send(req, res, next, options, cache);
  };
};

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
 * @api private
 */

var send = exports.send = function(req, res, next, options, cache){
  options = options || {};
  if (!options.path) throw new Error('path required');

  // setup
  var maxAge = options.maxAge || 0
    , ranges = req.headers.range
    , head = 'HEAD' == req.method
    , get = 'GET' == req.method
    , root = options.root ? normalize(options.root) : null
    , redirect = false === options.redirect ? false : true
    , getOnly = options.getOnly
    , hidden = options.hidden
    , done;

  // ignore non-GET requests
  if (getOnly && !get && !head) return next();

  // parse url
  var url = parse(options.path), type;
    
  var path = decode(url.pathname);

  // invalid request uri & null bytes
  if ((path == -1) || ~path.indexOf('\0')){
    return badRequest(res);
  }
  
  // when root is not given, consider .. malicious
  if (!root && ~path.indexOf('..')) return forbidden(res);

  // join / normalize from optional root dir
  path = normalize(join(root, path));

  // malicious path
  if (root && path.indexOf(root) != 0) return forbidden(res);

  // index.html support
  if (normalize('/') == path[path.length - 1]) path += 'index.html';

  // "hidden" file
  if (!hidden && '.' == basename(path)[0]) return next();

  if(!cache || !tryCache(req, res, path)){
    fs.stat(path, function(err, stat){
      // mime type
      type = mime.lookup(path);

      if (err) {
        var notFoundErrors = ['ENOENT', 'ENAMETOOLONG', 'ENOTDIR'];
        if (~notFoundErrors.indexOf(err.code)){
          return notFound(res, 404);
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

      // header fields
      if (!res.getHeader('Date')) res.setHeader('Date', new Date().toUTCString());
      if (!res.getHeader('Cache-Control')) res.setHeader('Cache-Control', 'public, max-age=' + (maxAge / 1000));
      if (!res.getHeader('Last-Modified')) res.setHeader('Last-Modified', stat.mtime.toUTCString());
      if (!res.getHeader('ETag')) res.setHeader('ETag', etag(stat));
      if (!res.getHeader('content-type')) {
        var charset = mime.charsets.lookup(type);
        res.setHeader('Content-Type', type + (charset ? '; charset=' + charset : ''));
      }
      res.setHeader('Accept-Ranges', 'bytes');

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

      if(!provider(req, res, next, path, options)){
        var stream = fs.createReadStream(path, opts);
        
		// Should we skip cache also when !req.headers.cookie? 
        if(cache && chunkSize < options.cache.maxSize){
          cacheFile(stream, res._headers, path);
        }
        
        stream.pipe(res);
      }
    });
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

  function etag(stat) {
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
	delete entry.headers['set-cookie'];
	
    if(Buffer.isBuffer(data)){
      entry.push(data);
      entry.complete = true;
      
      // Listen to file changes
      entry.watcher = fs.watch(path, function(){
        cache.remove(path);
      });
    } else {
      // store the chunks
      data.on('data', function(chunk){
        entry.push(chunk);
      });

      data.on('end', function(){
        entry.complete = true;
        
        // Listen to file changes
        entry.watcher = fs.watch(path, function(){
          cache.remove(path);
        });
      });
    }
  }
  
  /**
   * Tries to get a cached file.
   *
   * @param {} data
   * @param {Object} headers Response headers for the cached file.
   * @param {String} path to the file to be cached.
   * @api private
   */
   
  function tryCache(req, res, path){
    var hit = cache.get(path);
       
    // cache hit, doesnt support range requests yet
    if (hit && hit.complete && !ranges) {  
      var headers = _.clone(hit.headers);
            
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
            delete headers['content-length'];
            delete headers['content-type'];
            res.writeHead(304, headers);
            res.end();
          }else{
            res.writeHead(200, headers);
            
            function write(i) {
              while(i < hit.length){
                if(res.write(hit[i++]) === false){
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
      return true;
    }else{
      return false;
    }
  }

};
