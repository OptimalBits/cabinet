Cabinet  [![BuildStatus](https://secure.travis-ci.org/OptimalBits/cabinet.png?branch=master)](http://travis-ci.org/optimalbits/cabinet)
=

A fast static file server loaded with useful features.

Works as a drop-in replacement for connect's static module (also works on express).

The code is based on the original work by TJ Holowaychuck, but with several improvements and additions:

- Built-in in-memory cache mechanism for very fast file serve.
- Built-in ETAG caching for super fast 304 responses.
- Cache always fresh by relying on nodejs file watch mechanism (no need to restart the server after updating files).
- Supports automatic compilation of typescript, coffeescript, less css, and stylus.
- Typescript dependency watcher: generates new ETAGs if any dependency changes.
- Automatic concatenation of typescript and AMD javascript into optimized single files.
- Automatic javascript uglification & minification (using uglifyJS).
- Automatic minimization of CSS and LESS CSS files.
- On the fly gzip of text files (js, css, html, templates, etc).
- Support for virtual files, for example HTML5 application cache manifest.

Since files are cached and always fresh, compiled coffee script, gzip, less and minification do not have any impact on the server performance.

Follow [optimalbits](http://twitter.com/optimalbits) for news and updates regarding this library.

Install:

    npm install cabinet
	
Tests:

    npm test
    
Example for using within an express application:

    var cabinet = require('cabinet');

    app.configure('development', function(){
      app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
      app.use(cabinet(__dirname + '/static', {
        ignore: ['.git', '*.txt', 'node_modules'],
        coffee:true,
        typescript: {
          module: 'amd',
          concatenate: false
        },
        gzip:true,
        // Set LESS CSS options
        less:{
          // Specify search paths for @import directives
          paths: ['.',__dirname + '/static/stylesheets'], 
        },
		  // Activates in-memory cache
	    cache:{ 
	      maxSize: 16384, // 16Kb pero object 
	      maxObjects:256
	    }
      }));
    });

    app.configure('production', function(){
      app.use(express.errorHandler());
      app.use(cabinet(__dirname + '/static', {
        ignore: ['.git', '*.txt', 'node_modules'],
        coffee:true,
        gzip:true,
		    // Minimize javascript files.
		    minjs: true, 
        less:{
          paths: ['.',__dirname + '/static/stylesheets'],
        },
		    // Activates in-memory cache
	      cache:{
	        maxSize: 16384, // 16Kb per object
	        maxObjects:256
	      }
      }));
    });


###Virtuals    

It is possible to define virtual files in cabinet. A virtual file is the result of some processing. For example, an application manifest file is a virtual file that is generated
on the fly with the given files and with an always and up-to-date timestamp (the timestamp is re-generated when any of the files in the manifest changes). 
Virtual files are also cached as normal files and therefore they are served very fast. 

Example of a file server for serving an application cache manifest:

    app.use(cabinet(__dirname + '/static', 
    {
      gzip:true,
      minjs:true,
      cache:{
        maxSize: 1024, 
        maxObjects:256
      }
    },
    {
      '/example.appcache':cabinet.virtuals.manifest(['foo.txt', 'bar.txt'], ['*'], ['/ /fallback'])
    }));
    
Accessing  */example.appcache* will generate the following manifest:

    CACHE MANIFEST
    #465398.1347735807000
    CACHE:
    foo.txt
    bar.txt
    NETWORK:
    *
    FALLBACK:
    / /fallback    
    
The timestamp (#465398.1347735807000) will be automatically updated if foo.txt or bar.txt changes,
so that the browser will invalidate its application cache when needed.

A virtual is just an asynchronous function without parameters with the following callback signature:

    function(err, data, files)

__Arguments__

    err   {Error} Some error object describing an error. 
    data  {String|Buffer} The data that is going to be served when the virtual file is accessed.
    files {Array} Array of files to listen for changes. This is used when enabling the cache. If any
    of the files changes, the cache will invalidate the entry containing the virtual.
    
Example of a (very) dummy virtual:

    function dummy(name){
      return function(cb){
        cb(null, 'My name is '+name, []);
      }
    }


## Directory Watcher
Cabinet includes a directory watcher that is used to keep the cache always fresh as well as to compute new ETAG values for files and virtual files based on their dependencies. So files depending on other files will automatically get new ETAGS based on all their dependencies.

In some platforms such as Mac OSX, there is a known error due to limits in the amount of allowed open files: 

      Error: watch EMFILE

To avoid this error use ulimit, for example to allow 4096 open files:

    ulimit -n 4096

  
## Typescript

Cabinet support on-the-fly compilation and optimization of typescript source files. The file watcher will listen for changes in the source files and their dependencies, therefore always delivering 
the latest code. Compilation is expensive, so in a production server the cache should be enabled
for optimal performance.


## Reference
    cabinet(root, [options, virtuals])

__Arguments__
 
    root     {String} Path to the root directory for the served files.
    options  {Object} options object (see options)
    virtuals {Object} Object mapping paths to virtuals.
    
    
##Options

Most options are directly inherited from *connect's* options. Besides those we have the options related
to the provided filters:

- `ignore`   Specifies an array of files or directories to ignore, supports fnmatch syntax.
- `cache`    Enables caching. Accepts an object with the parameters:  maxSize (per object in bytes) and maxObjects.
- `maxAge`   Browser cache maxAge in milliseconds. defaults to 0
- `hidden`   Allow transfer of hidden files. defaults to false
- `redirect` Redirect to trailing "/" when the pathname is a dir
- `gzip`     Enables gzip compression if the browser supports it (only affect ascii files).
- `minjs`    Enables UglifyJS javascript minification.
- `less`     Enables LESS CSS compilation. Accepts an object with options to the less compilation, as for example *paths*, which specifies paths where to find included files.
- `coffee`   Enables coffee script compilation of .coffee files.
- `typescript` Enables typescript compilation of .ts files. Accepted parameters are:
    - target , target version of the produced javascript (ES3 (default) or ES5)
    - module, module system to use for the generated javascript (commonjs or amd (default))
    - concatenate, boolean describing if the compiled code should be concatenated with its dependencies or not (default true)
    - keepComments, boolean describing if the compiled code should keep comments (default false)
 

##Roadmap

- Deflate compression filter.


##License 

(The MIT License)

Copyright (c) 2012 Optimal Bits Sweden AB <manuel@optimalbits.com>
Copyright (c) 2011 TJ Holowaychuk
Copyright (c) 2010 Sencha Inc.

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

