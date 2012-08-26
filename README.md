#Cabinet

A fast static file server loaded with useful features.

Works as a drop-in replacement for connect's static module (also works on express).

The code is mostly based on the original work by TJ Holowaychuck, but with several improvements
and aditions:

- Built-in in-memory cache mechanism for very fast file serve.
- Cache always fresh by relying on nodejs file watch mechanism (no need to restart the server after updating files).
- Automatic coffee script compilation.
- Automatic compilation of less css files.
- Automatic javascript uglification & minification (using uglifyJS)
- On the fly gzip of text files (js, css, html, templates, etc).

Since files are cached and always fresh, compiled coffee script, gzip, less and minification do not have any impact on the server performance.

[![BuildStatus](https://secure.travis-ci.org/OptimalBits/cabinet.png?branch=master)](http://travis-ci.org/optimalbits/cabinet)

Install:

    npm install cabinet
	
Tests:

    npm test

Example for using within an express application:

    var cabinet = require('cabinet');

    app.configure('development', function(){
      app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
      app.use(cabinet(__dirname + '/static', {
        coffee:true,
        gzip:true,
        // Set LESS CSS options
        less:{
          // Specify search paths for @import directives
          paths: ['.',__dirname + '/static/stylesheets'], 
        },
		  // Activates in-memory cache
	    cache:{ 
	      maxSize: 1024, 
	      maxObjects:256
	    }
      }));
    });

    app.configure('production', function(){
      app.use(express.errorHandler());
      app.use(cabinet(__dirname + '/static', {
        coffee:true,
        gzip:true,
		    // Minimize javascript files.
		    minjs: true, 
        less:{
          paths: ['.',__dirname + '/static/stylesheets'],
        },
		// Activates in-memory cache
	    cache:{
	      maxSize: 1024, 
	      maxObjects:256
	    }
      }));
    });

##ROADMAP

- Deflate compression filter.
- HTML5 application cache manifest generation (with automatic revision generation).

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

