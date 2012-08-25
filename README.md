#Cabinet

A fast static file server loaded with useful features.

Works as a drop-in replacement for connect's static module (also works on express).

The code is mostly based on the original work by TJ Holowaychuck, but with several improvements
and aditions:

- Built-in in-memory cache mechanism for very fast file serve.
- Cache always fresh by relying on nodejs file watch mechanism (no need to restart the server after updating files).
- On the fly gzip of text files (js, css, html, templates, etc).
- On the fly less compilation of css files.
- On the fly javascript uglification & minification (using uglifyJS)

Since files are cached and always fresh, gzip, less and minification do not have any impact 
on the server performance.

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
        less:{
          // Specify search paths for @import directives
          paths: ['.',__dirname + '/static/stylesheets'], 
        },
      }));
    });

    app.configure('production', function(){
      app.use(express.errorHandler());
      app.use(cabinet(__dirname + '/static', {
        less:{
          paths: ['.',__dirname + '/static/stylesheets'],
        },
        minjs:true // Minimize javascript files.
      }));
    });


##ROADMAP

- plugin architecture for adding more file processors.
- HTML5 application cache manifest generation (with automatic revision generation).


