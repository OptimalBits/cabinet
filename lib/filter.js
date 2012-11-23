/*!
 * Cabinet file filters
 * Copyright(c) 2012 Optimal Bits Sweden AB.
 * MIT Licensed
 */
 
 var 
   _ = require('underscore'),
   mime = require('mime'),
   fs = require('fs');
 
 module.exports.compileFilters = function(options){
   var results = [];
  
   compileFilter('mincss', options, results);
   compileFilter('less', options, results);
   compileFilter('stylus', options, results);
   compileFilter('coffee', options, results);
   compileFilter('typescript', options, results);
   compileFilter('minjs', options, results);
   compileFilter('gzip', options, results);
  
   return results;
 }

 module.exports.applyFilters = function(filters, req, res, next, path, options, cb){
   var 
     headers = _.clone(req.headers), 
     type = mime.lookup(path);

   applyFilter(filters, 0, headers, path, type, res, null, null, function(err, data, deps){
     if(!err && data){
       var length = typeof data === 'string' ? Buffer.byteLength(data) : data.length;
       res.setHeader('Content-Length', length);
       res.write(data);
       res.end();
     }
     cb(err, data, deps);
   })
 }

 var filters = {};
 
//
// Gzip
//
filters.gzip = function gzip(options){
  var zlib = require('zlib');
  
  return function(res, path, data, cb){
    zlib.gzip(data, function(err, compressed){
      if(err){
        cb(err);
      }else{
        res.setHeader('Content-Encoding', 'gzip');
        cb(err, compressed);
      }
    });
  }
}

filters.gzip.check = function(headers, path, type){
  var acceptEncoding = headers['accept-encoding'];
  type = headers['content-type'] || type;
  return ((type.match('text') || type.match('javascript')) &&
         acceptEncoding && acceptEncoding.match('gzip'));
}

//
// Plain CSS
//
filters.mincss = function css(options) {
  var
    less = require('less'),
    lessParser = new less.Parser();

    return function(res, path, data, cb){
      lessParser.parse(data, function(err, tree) {
        if(err){
          cb(err);
        }else{
          res.setHeader("Content-type", "text/css");
          cb(err, tree.toCSS({compress: true}));
        }
      });
    };
}

filters.mincss.check = function(headers, path, type) {
  return (!path.match(/(-|\.)min/)) && (path.match(/\.css$/));
}

//
// Less CSS
//
filters.less = function less(options){
  var 
    less = require('less'),
    lessParser = new(less.Parser)(options);
  
  return function(res, path, data, cb){
    lessParser.parse(data, function(err, tree) {
      if(err){
        cb(err);
      }else{
        res.setHeader("Content-type", "text/css");
        cb(err, tree.toCSS());
      }
    });
  };
}

filters.less.check = function (headers, path, type){
  return path.match(/\.less$/);
}

//
// Stylus CSS
//
filters.stylus = function stylus(options){
  var stylus = require('stylus');
  
  return function(res, path, data, cb){
    stylus(data)
      .set('paths', options.paths)
      .render(function(err, css){
        if(err){
          cb(err);
        }else{
          res.setHeader("Content-type", "text/css");
          cb(err, css);
        }
    });
  };
}

filters.stylus.check = function (headers, path, type){
  return path.match(/\.styl$/);
}

//
// Typescript
//
filters.typescript = function typescript(options){
  var tsc = require('./typescript-wrapper');
  
  return function(res, path, data, cb){
    res.setHeader("Content-type", "text/javascript");
    tsc.compile(path, data, options, cb);
  }
}

filters.typescript.check = function(headers, path, type){
  console.log( path.match(/\.ts$/));
  return path.match(/\.ts$/);
}

//
// Coffee Script
//
filters.coffee = function coffee(options){
  var coffee = require('coffee-script');
  
  return function(res, path, data, cb){
    res.setHeader("Content-type", "text/javascript");
    cb(null, coffee.compile(data));
  }
}

filters.coffee.check = function(headers, path, type){
  return path.match(/\.coffee$/);
}

//
// UglifyJS
//
filters.minjs = function minjs(options){
  var
    uglify = require('uglify-js'),
    jsp = uglify.parser, 
    pro = uglify.uglify;
    
  return function(res, path, data, cb){
    var ast = jsp.parse(data);
    ast = pro.ast_mangle(ast);
    ast = pro.ast_squeeze(ast);
    cb(null, pro.gen_code(ast));
  }
}

filters.minjs.check = function(headers, path, type){  
  return (!path.match(/(-|\.)min/)) && 
  		   (type.match('javascript') || headers['content-type'].match('javascript'));
}

//
// ----------------------------------------------------------------------------
//
function applyFilter(arr, index, headers, path, type, res, data, deps, cb){  
  var filter = arr[index++];
  
  if(!filter) return cb(null, data, deps);
  
  _.extend(headers, res._headers);
  if(filter.check(headers, path, type)){
    if(data){
      filter(res, path, data, function(err, data, deps){
        if(!err && data){
          applyFilter(arr, index, headers, path, type, res, data, deps, cb);
        }else{
          cb(err);
        }
      });
    }else{
      fs.readFile(path, 'utf-8', function(err, data){
        filter(res, path, data, function(err, data, deps){
          if(!err && data){
            applyFilter(arr, index, headers, path, type, res, data, deps, cb);
          }else{
            cb(err);
          }
        });
      });
    }
  }else{
    applyFilter(arr, index, headers, path, type, res, data, deps, cb);
  }
}

function compileFilter(name, options, results){
  if(options[name]){
    var f = filters[name](options[name]);
    f.check = filters[name].check;
    results.push(f);
  }
}

