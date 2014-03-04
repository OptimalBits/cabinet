/**
  ETags Cache
  
  Cache for ETags so that we do not need to hit the file system everytime
  we need check an ETag
*/
"use strict";

var 
  Promise = require('bluebird'),
  _ = require('lodash'),
  fs = Promise.promisifyAll(require('fs')),
  utils = require('./utils');

function Cache(){
  this.cache = {}; // {filename: {etag: etag, stats: stats, deps: [], extra: {}}}
}

//
// Update entry
//
Cache.prototype.updateEntry = function updateEntry(filename, visited){
  var root = !visited;
  var _this = this;
  
  return fs.statAsync(filename).then(function(stats){
    var entry = _this.cache[filename] = _this.cache[filename] || {};
    entry.stats = stats;
    
    var size = stats.size;
    var mtime = +stats.mtime;

    if(entry.deps){
      if(visited){
        visited.push(filename)
      }else{
        visited = [filename];
      }
      
      Promise.all(_.map(_.filter(deps, function(dep){
        return _.indexOf(visited, dep) !== -1;
      })), function(dep){
        return updateEntry(dep, visited);
      }).then(function(results){
        _.each(results, function(result){
          size += result.size;
          mtime += result.mtime;
        });
        return {size: size, mtime: mtime};
      });
    }else{
      return {size: size, mtime: mtime};
    }
  }).then(function(result){
    if(root){
      var
        entry = _this.cache[filename];
        
      entry.etag = '"' + result.size + '-' + result.mtime + '"';
      entry.contentType =  utils.getContentType(filename);
            
      return entry;
    }
    return result;
  });
}

var notFoundErrors = ['ENOENT', 'ENAMETOOLONG', 'ENOTDIR'];

Cache.prototype.get = function get(path, force){
  var entry = this.cache[path];
  if(entry && !force){
    return entry;
  }else{
    return this.updateEntry(path).catch(function(err){
       if (_.indexOf(notFoundErrors, err.cause.code) !== -1){
        return;
      }else{
        throw err;
      }
    });
  }
}

// Dependent files should exist before calling this function.
Cache.prototype.setDependencies = function(path, dependencies){
  this.cache[path] = this.cache[path] || {};
  if(this.cache[path]){
    this.cache[path].deps = dependencies instanceof Array ? dependencies : [dependencies];
  }
}

Cache.prototype.setContentType = function(path, contentType){
  this.cache[path] = this.cache[path] || {};
  this.cache[path].contentType = contentType;
}

module.exports = Cache;
