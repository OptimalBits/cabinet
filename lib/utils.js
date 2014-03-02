"use strict";

var mime = require('mime');

module.exports.getContentType = function(path){
  var
    type = mime.lookup(path),
    charset = mime.charsets.lookup(type);

  return type + (charset ? '; charset=' + charset : '');
}
