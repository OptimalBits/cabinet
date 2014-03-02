/*!
 * Connect - Cache
 * Copyright(c) 2011 Sencha Inc.
 * Copyright(c) 2012 Optimal Bits Sweden AB.
 * MIT Licensed
 */
"use strict";

var Promise = require('bluebird');

/**
 * Expose `Cache`.
 */

module.exports = Cache;

var EventEmitter = require('events').EventEmitter;
var Util = require('util');

/**
 * LRU cache store.
 *
 * @param {Number} maxNumObjects
 * @api private
 */

function Cache(maxNumObjects) {
  EventEmitter.call(this);
  
  this.store = {};
  this.keys = [];
  this.maxNumObjects = maxNumObjects;
}

//
// Mix in an EventEmitter
//
Util.inherits(Cache, EventEmitter);


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

  // maxNumObjects reached, invalid LRU
  if (len > this.maxNumObjects) {
    this.remove(this.keys.shift());
  }
  
  var deferred = Promise.defer();

  this.store[key] = deferred;
  deferred.createdAt = new Date;
  return deferred;
};
