Cabinet
=======

A blazing fast static file server loaded with useful features.

This project is based on connect middleware but with several improvements and additions, and can be used as a replacement of connect static and staticCache.

- Cache subsystem always fresh by relying on nodejs file watch mechanism (no need to restart the server after updating files).

- On the fly gzip of text file (js, css, templates, etc).
- On the fly less compilation of css files.
- On the fly javascript uglification & minification.

Since files are cached and always fresh, gzip, less and minification does not have any impact on the server performance.

Example for using with-in a express application:

    var cabinet = require('cabinet');

    app.configure(function(){
      app.use(cabinet.staticCache());
    });

    app.configure('development', function(){
      app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
      app.use(cabinet.static(__dirname + '/static', {
        less:{
          // Specify search paths for @import directives
          paths: ['.',__dirname + '/static/stylesheets'], 
        },
      }));
    });

    app.configure('production', function(){
      app.use(express.errorHandler());
      app.use(cabinet.static(__dirname + '/static', {
        less:{
          paths: ['.',__dirname + '/static/stylesheets'],
        },
        minjs:true
      }));
    });

