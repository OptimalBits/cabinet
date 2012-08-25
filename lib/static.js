
/*!
 * Connect - staticProvider
 * Copyright(c) 2010 Sencha Inc.
 * Copyright(c) 2011 TJ Holowaychuk*
 * Copyright(c) 2012 Optimal Bits Sweden AB.
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var fs = require('fs')
  , path = require('path')
  , join = path.join
  , basename = path.basename
  , normalize = path.normalize
  , Cache = require('./cache')
  , utils = require('./utils')
  , Buffer = require('buffer').Buffer
  , parse = require('url').parse
  , mime = require('mime')
  , parseRange = require('range-parser')
  , zlib = require('zlib')
  , less = require('less')
  , uglify = require('uglify-js');
  
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
    cache.maxLen = options.maxLength || 1024 * 256; // 256Kb max object size.
    cache.fileWatchers = {};
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
 * Respond with 416  "Requested Range Not Satisfiable"
 *
 * @param {ServerResponse} res
 * @api private
 */

function invalidRange(res) {
  var body = 'Requested Range Not Satisfiable';
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Length', body.length);
  res.statusCode = 416;
  res.end(body);
}

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
    , fn = options.callback
    , hidden = options.hidden
    , done;

  // replace next() with callback when available
  if (fn) next = fn;

  // ignore non-GET requests
  if (getOnly && !get && !head) return next();

  // parse url
  var url = parse(options.path), type;
    
  var path = utils.decode(url.pathname);

  // invalid request uri & null bytes
  if ((path == -1) || ~path.indexOf('\0')){
    return utils.badRequest(res);
  }
  
  // when root is not given, consider .. malicious
  if (!root && ~path.indexOf('..')) return utils.forbidden(res);

  // join / normalize from optional root dir
  path = normalize(join(root, path));

  // malicious path
  if (root && 0 != path.indexOf(root)) return fn
    ? fn(new Error('Forbidden'))
    : utils.forbidden(res);

  // index.html support
  if (normalize('/') == path[path.length - 1]) path += 'index.html';

  // "hidden" file
  if (!hidden && '.' == basename(path)[0]) return next();

  fs.stat(path, function(err, stat){
    // mime type
    type = mime.lookup(path);

    // ignore ENOENT
    if (err) {
      var notFoundErrors = ['ENOENT', 'ENAMETOOLONG', 'ENOTDIR'];
      if (~notFoundErrors.indexOf(err.code)){
        return utils.notFound(res, 404);
      }else{
        return utils.respond(res, 500, err.msg);
      } 
      
      // Obsolete??
      if (fn) return fn(err);
      return 'ENOENT' == err.code
        ? next()
        : next(err);

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
    if (!res.getHeader('ETag')) res.setHeader('ETag', utils.etag(stat));
    if (!res.getHeader('content-type')) {
      var charset = mime.charsets.lookup(type);
      res.setHeader('Content-Type', type + (charset ? '; charset=' + charset : ''));
    }
    res.setHeader('Accept-Ranges', 'bytes');

    // conditional GET support
    if (utils.conditionalGET(req)) {
      if (!utils.modified(req, res)) {
        req.emit('static');
        return utils.notModified(res);
      }
    }

    var opts = {};
    var chunkSize = stat.size;

    // we have a Range request
    if (ranges) {
      ranges = parseRange(stat.size, ranges);
      
      // unsatisfiable
      if (-1 == ranges) {
        res.setHeader('Content-Range', 'bytes */' + stat.size);
        return utils.respond(res, 416);
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
      // stream
      var stream = fs.createReadStream(path, opts);
	    cache && cacheFile(stream, res._headers, path);
      stream.pipe(res);

      // callback
      if (fn) {
        function callback(err) { done || fn(err); done = true }
        req.on('close', callback);
        stream.on('end', callback);
      }
    }
  });
  
  var cacheFile = function(data, headers, path){
    var arr = cache.add(path);
    arr.push(headers);
    
    if(Buffer.isBuffer(data)){
      arr.push(data);
      arr.complete = true;
        
      watchers[path] && watchers[path].close();
      var watcher = fs.watch(msg.path, function(){
        cache.remove(path);
      });
      watchers[path] = watcher;
    } else {
      // store the chunks
      data.on('data', function(chunk){
        arr.push(chunk);
      });

      data.on('end', function(){
        arr.complete = true;
        watchers[path] && watchers[path].close();
        var watcher = fs.watch(msg.path, function(){
          cache.remove(path);
        });
        watchers[path] = watcher;
      });
    }
  }
  
  var tryCache = function(path){
    var hit = cache.get(path);
     
    // cache hit, doesnt support range requests
    if (hit && hit.complete && !ranges) {
      header = utils.merge({}, hit[0]);
      header.Age = (new Date - new Date(header.date)) / 1000 | 0;
      header.date = new Date().toUTCString();

      // conditional GET support
      if (utils.conditionalGET(req)) {
        if (!utils.modified(req, res, header)) {
          header['content-length'] = 0;
          res.writeHead(304, header);
          return res.end();
        }
      }
      
      // HEAD support
      if ('HEAD' == req.method) {
        header['content-length'] = 0;
        res.writeHead(200, header);
        return res.end();
      }

      // respond with cache
      res.writeHead(200, header);

      // backpressure
      function write(i) {
        var buf = hit[i];
        if (!buf) return res.end();
        if (false === res.write(buf)) {
          res.once('drain', function(){
            write(++i);
          });
        } else {
          write(++i);
        }
      }
      return write(1);
    }
    
  }
  
};
