
/*!
 * Connect - Cache
 * Copyright(c) 2011 Sencha Inc.
 * Copyright(c) 2012 Optimal Bits Sweden AB.
 * MIT Licensed
 */

/**
 * Expose `Cache`.
 */

module.exports = Cache;

var EventEmitter = require('events').EventEmitter;

/**
 * LRU cache store.
 *
 * @param {Number} limit
 * @api private
 */

function Cache(limit) {
  this.store = {};
  this.keys = [];
  this.limit = limit;
}

//
// Mix in an EventEmitter
//
Cache.prototype = EventEmitter.prototype;

/**
 * Touch `key`, promoting the object.
 *
 * @param {String} key
 * @param {Number} i
 * @api private
 */

Cache.prototype.touch = function(key, i){
  this.keys.splice(i,1);
  this.keys.push(key);
};

/**
 * Remove `key`.
 *
 * @param {String} key
 * @api private
 */

Cache.prototype.remove = function(key){
  this.emit('remove', key, this.store[key]);
  delete this.store[key];
};

/**
 * Get the object stored for `key`.
 *
 * @param {String} key
 * @return {Array}
 * @api private
 */

Cache.prototype.get = function(key){
  return this.store[key];
};

/**
 * Add a cache `key`.
 *
 * @param {String} key
 * @return {Array}
 * @api private
 */

Cache.prototype.add = function(key){
  // initialize store
  var len = this.keys.push(key);

  // limit reached, invalid LRU
  if (len > this.limit) {
    this.remove(this.keys.shift());
  }

  var arr = this.store[key] = [];
  arr.createdAt = new Date;
  return arr;
};
