/*!
 * Cabinet typescript compiler wrapper
 * Copyright(c) 2012 Optimal Bits Sweden AB.
 * MIT Licensed
 */
 
 var 
   path = require('path'),
   fs = require('fs'), 
   uuid = require('node-uuid'),
   exec = require('child_process').exec,
   requirejs = require('requirejs'),
   ts_deps = require('./typescript-deps');
   
 //
 // Typescript compiler wrapper
 //

module.exports.compile = function(filepath, data, options, cb){
  if(typeof options === 'function'){
    cb = options;
    options = undefined;
  }

  options = options || {};
  options.target = options.target || 'ES3';
  options.module = options.module || 'amd';
  options.concatenate = options.concatenate || true;
  options.keepComments = options.keepComments || false;

  var 
    basePath = path.dirname(filepath),
    baseName = path.basename(filepath, '.ts'),
    tmpPath = options.tmpPath || '',
    outFile;
  
  if(options.out){
    outFile = options.outFile = path.join(tmpPath, uuid.v1())+'.js';
    options.outFile = outFile;
    options.concatenate = false;
  }else{
    outFile = path.join(basePath, baseName)+'.js';
  }

  // Get the given typescript sourcefile dependencies
  ts_deps.resolve(filepath, data, function(deps){
    // Call compiler on tmp file, and produce a compiled file
    console.log(getOptionsString(options))
    exec('tsc'+getOptionsString(options)+' '+filepath, {cwd:basePath}, function (err, stdout, stderr) {
      if(err) {
        console.log('typescript compiler:' + err);
        cb(null, data, deps);
      }else{
        if(options.concatenate){
          try{
            requirejs.optimize({
              baseUrl: basePath, 
              name: baseName, 
              optimize:'none',
              out: outFile}, function(result){
                console.log(result);
                readOutput(outFile, deps, cb);
              });
          }catch(e){
            console.log("Error optimizing:"+basePath+" "+e);
            cb(e);
          }
        }else{
          readOutput(outFile, deps, cb);
        }
      }
    });
  });
}

function readOutput(outFile, deps, cb){
  fs.readFile(outFile, function(err, data){
    fs.unlink(outFile, function(){});
    if(data){
      data = data.toString();
    }
    cb(err, data, deps);
  });
}

function getOptionsString(options){
  var optionsString = '';
  
  if(options.target){
    optionsString += ' --target '+options.target;
  }
  if(options.module){
    optionsString += ' --module '+options.module;
  }
  if(options.outFile){
    optionsString += ' --out '+options.outFile;
  }
  if(options.keepComments){
    optionsString += ' -c ';
  }

  return optionsString;
}




