/*!
 * Cabinet virtual files
 * Copyright(c) 2012 Optimal Bits Sweden AB.
 * MIT Licensed
 */
"use strict";
 
var 
  async = require('async'),
  path = require('path'),
  fs = require('fs');

exports = module.exports = {};

/*
  A virtual is just an asynchronous function with a callback with the 
  following args:
  
  // err {Error}, data {String|Buffer}, files{Array} 
  function(err, data, files)
  
  The data will be cached, and the list of files will be "watched"
  for changes. If any of the files changes, the cached content will be
  refreshed.
*/
exports.manifest = function(cache, network, fallback){
  return function(cb){
    var i, files = [];
    
    for(i=0;i<cache.length;i++){
      files.push(path.join(this.root, cache[i]));
    }
    generateManifest(this.root, cache, network, fallback, function(err, res){
      cb(err, res, files);
    })
  }
}

//
// HTML5 application cache
//
function generateManifest(root, cache, network, fallback, cb){
  var 
    manifest = 'CACHE MANIFEST\n', 
    i;
  
  cache = cache || [];
  cache = cache instanceof Array? cache : [];
    
  async.reduce(cache, [0,0], function(memo, item, cb){    
    var file = path.join(root, item);
    fs.stat(file, function(err, stats){
        if(!err){
          var timestamp = stats.mtime.getTime();
          memo[0] += stats.size;
          memo[1] = memo[1] > timestamp ? memo[1] : timestamp;
        }
        cb(err, memo);
      });
    }, function(err, result){
      if(!err){
        manifest += '#' + result[0]+'.'+result[1] +'\n';
        manifest += 'CACHE:\n';
        for (i=0;i<cache.length;i++){
          manifest += cache[i] + '\n';
        }
        if (network && network.length){
          manifest += 'NETWORK:\n';
          for (i=0;i<network.length;i++){
            manifest += network[i] + '\n';
          }
        }

        if (fallback && fallback.length){
          manifest += 'FALLBACK:\n';
          for (i=0;i<fallback.length;i++){
            manifest += fallback[i] + '\n';
          }
        }
      }
      cb(err, manifest);
    });
}
