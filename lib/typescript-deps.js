/*!
 * Cabinet typescript dependency resolver.
 * Copyright(c) 2012 Optimal Bits Sweden AB.
 * MIT Licensed
 */
 /**
   Returns in the callback an array with all the file dependencies
   for the given typescript input. Dependencies are determined
   by traversing the reference paths in every .ts file.
 */ 
"use strict"; 
 var 
   fs = require('fs'),
   path = require('path'),
   _ = require('underscore'),
   async = require('async');
 
 module.exports.resolve = function(filepath, src, cb){
   var 
     dirname = path.dirname(filepath),
     files = get_deps(dirname, src),
     deps = {};
     
     deps[filepath] = true;
     
   resolve_recur(dirname, files, deps, function(deps){
     cb(_.keys(deps));
   });
 }
 
 function resolve_recur(dirname, files, deps, cb){
   var newDeps = [];
   
   if(files.length > 0){
     async.forEachSeries(files, function(file, done){
       fs.readFile(file, function(err, src){
         if(!err && src){
           deps[file] = true;
           newDeps.push.apply(newDeps, get_deps(dirname, src));
         } 
         // ignore the error, since we can continue processing other files...
         done();
       })
     }, function(){
       newDeps = _.difference(newDeps, _.keys(deps));
       resolve_recur(dirname, newDeps, deps, cb);
     });
   }else{
     cb(deps);
   }
 }
 
 /**
   Returns an array of dependencies for the input source data.
 */
 function get_deps(dirname, src){
   var 
     re = /\s*\/\/\/\s*<reference\s+path="([^"\n]+)"\s*\/>|\s*import\s+[^"\n]+\s*=\s*module\(["']([^"\n]+)['"]\)/gi,
     deps = [],
     match;
   
   while(match = re.exec(src)){
     var moduleName;
     if(match[1]){
       moduleName = match[1];
     } 
     if(match[2]){
       moduleName = match[2]+'.ts';
     };
     deps.push(path.resolve(dirname, moduleName));
   }
   return _.unique(deps);
 }
 