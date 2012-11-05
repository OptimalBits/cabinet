/*!
 * Cabinet directory watcher
 * Copyright(c) 2012 Optimal Bits Sweden AB.
 * MIT Licensed
 */

var async = require('async'),
       fs = require('fs'),
     path = require('path'),
EventEmitter = require('events').EventEmitter,
     util = require('util'),
minimatch = require('minimatch'),
        _ = require('underscore');

 /**
   Starts watching a directory structure. Everytime a file changes, 
   a callback is executed with the absolute path to the file, and an ETAG
   for the file.
   
   A dependency dictionary can be provided so that a file depending on other
   files also will generate an event and a new ETAG based on the dependencies.
 */
function Watcher(root, ignore, cb){
  EventEmitter.call(this);
  
  if(_.isFunction(ignore)){
    cb = ignore;
    ignore = undefined;
  }
  
  if(cb){
    this.on('changed', cb);
  }
  
  ignore = ignore || [];
  
  var self = this;
  
  self.globs = [];
  for(var i=0;i<ignore.length;i++){
    self.globs.push(minimatch.filter(ignore[i], {}));
  }
  
  this.filesMeta = {};
  // maps filenames and etags {filename: {etag:etag, stats: stats, watcher:FSWatcher}}
  
  // Traverse the directory structure and add directory (and file) watchers all along
  root = path.normalize(root);
  fs.stat(root, function(err, stats){
    if(stats){
      setObservers(self, root, self.filesMeta, stats, function(err){
        if(!err){
          for(var filepath in self.filesMeta){
            updateEtag(filepath, self.filesMeta);
          }
          self.emit('initialized');
        }else{
          throw err;
        }
      });
    }else{
      throw err;
    }
  })
}

util.inherits(Watcher, EventEmitter);

Watcher.prototype.isNotIgnored = function(path){
  for(var i=0;i<this.globs.length;i++){
    if(this.globs[i](path)){
      return false;
    }
  }
  return true;
}

// Dependent files should exist before calling this function.
Watcher.prototype.setDependencies = function(path, dependencies){
  if(this.filesMeta[path]){
    this.filesMeta[path].deps = dependencies instanceof Array ? dependencies : [dependencies];
  }else{
    throw new Error("Error setting dependencies for an invalid path: "+path);
  }
}

Watcher.prototype.setVirtual = function(path, dependencies){
  this.filesMeta[path] = {watcher:{close:function(){}}};
  this.setDependencies(path, dependencies);
}

function setFileObserver(watcher, filePath, filesMeta){
  var meta = filesMeta[filePath];
  meta.watcher = fs.watch(filePath, fileObserver(watcher, filePath, filesMeta));
}

function setObservers(watcher, filePath, filesMeta, stats, done){
  var obj = filesMeta[filePath] = {stats:stats};
  if(stats.isDirectory()){
    obj.watcher = fs.watch(filePath, directoryObserver(watcher, filePath, filesMeta));
    traverse(watcher, filePath, filesMeta, done);
  }else{ // When the directory watcher works properly in node, we can remove this.
    setFileObserver(watcher, filePath, filesMeta);
    done();
  }
}

function traverse(watcher, dir, filesMeta, cb){
  fs.readdir(dir, function(err, files){
    if(!err){
      async.forEach(files, function(file, done){
        if(watcher.isNotIgnored(file)){
          (function(filePath){
            fs.stat(filePath, function(err, stats){
              if(!err){
                setObservers(watcher, filePath, filesMeta, stats, done);
              }else{
                done(err);
              }
            })
          })(path.join(dir, file));
        }else{
          done();
        }
      },
      cb);
    }else{
      cb(err);
    }
  })
}

function generateEvents(watcher, files, filesMeta){
  var dependent = [];
  
  dependent = files.slice();

  //
  // Check if the given files are dependencies to other files
  //
  for(var filepath in filesMeta){
    var deps = filesMeta[filepath].deps;
    if(deps){
      for(var i=0; i < files.length; i++){
        if(deps.indexOf(files[i]) != -1){
          dependent.push(filepath);
          break;
        }
      }
    }
  }
  
  dependent = _.unique(dependent);

  for(var i=0; i<dependent.length;i++){
    var filepath = dependent[i],
      meta = filesMeta[filepath]
    
    if(meta && meta.stats){
      if(!filesMeta[filepath].stats.isDirectory()){
        var etag = updateEtag(filepath, filesMeta);
        watcher.emit('changed', filepath, etag);
      }
    }else if(meta && meta.watcher){
      meta.watcher.close();
      delete filesMeta[filepath];
      watcher.emit('deleted', filepath, etag);
    }else{
      var etag = updateEtag(filepath, filesMeta);
      watcher.emit('changed', filepath, etag);
    }
  }
}

function updateEtag(filename, filesMeta){
  var size = 0, mtime = 0, deps, meta;
  
  meta = filesMeta[filename];
  
  if(meta.stats){
    size = meta.stats.size;
    mtime = +meta.stats.mtime;
  }
  
  deps = meta.deps;
  if(deps){
    for(var i=0, len=deps.length;i<len;i++){
      size += meta.stats.size;
      mtime += +meta.stats.mtime;
    }
  }
  
  meta.etag = '"' + size + '-' + mtime + '"';
  
  return meta.etag;
}

function directoryObserver(watcher, dirname, filesMeta){
  return function(event, filename){
    //
    // A file may have been, added, deleted or renamed.
    // NOTE: We do not support generating events for delete files yet.
    //    
    if(!filename){
      // scan the dir in search for the changed file (or files)
      fs.readdir(dirname, function(err, files){
        if(!err){
          var filePaths = [];
          for(var i in files){
            filePaths.push(path.join(dirname, files[i]));
          }
          async.filter(filePaths, function(filename, cb){
            hasChanged(filename, filesMeta, function(isModified, stats){                
              if(isModified && stats){
                if(!filesMeta[filename]){
                  setObservers(watcher, filename, filesMeta, stats, function(){
                    watcher.emit('added', filename);
                  });
                }
                filesMeta[filename].stats = stats;
                cb(true);
              }else if(!stats){
                filesMeta[filename].watcher.close();
                delete filesMeta[filename];
                cb(true);
              }else{
                cb(false);
              }
            });
          }, function(results){
            generateEvents(watcher, results, filesMeta);
          })
        }
      })
    }else{
      generateEvents(watcher, [filename], filesMeta);
    }
  }
}

// We use this observer temporarily until the directory watcher can get 
// change events in directories as well as single files.
function fileObserver(watcher, filename, filesMeta){
  return function(event){  
    var meta = filesMeta[filename];
  
    if(meta.watcher){
      // reset watcher
      // we close this watcher and open a new one.
      // this is a workaround for node watch bugs.
      meta.watcher.close();
      setFileObserver(watcher, filename, filesMeta);
    } 
    hasChanged(filename, filesMeta, function(isModified, stats){
      if(isModified){  
        console.log(filename+" has been modified");
        meta.stats = stats;
        generateEvents(watcher, [filename], filesMeta);
      }
    });
  }
}

function hasChanged(filename, filesMeta, cb){
  fs.stat(filename, function(err, stats){
    if(stats){
      var meta = filesMeta[filename];
      if(!meta || !meta.stats){ 
        cb(true, stats); // new file
      }else if(+meta.stats.mtime !== +stats.mtime || 
               meta.stats.size !== stats.size){
        cb(true, stats); // modified
      }else{
        cb(false, stats); // not modified
      }
    }else{
      cb(true); // probably deleted
    }
  });
}

module.exports.Watcher = Watcher;

