'use strict';

var inherits = require('util').inherits;
var WritableStream = require('readable-stream').Writable;

function MockObjectStore() {
    WritableStream.call(this, { objectMode: true });

    this.error = null;
    this.items = [];
}
inherits(MockObjectStore, WritableStream);

MockObjectStore.prototype._write = function _write(chunk, encoding, callback) {
    var items = this.items;
    var error = this.error;

    process.nextTick(function() {
        items.push(chunk);

        callback(error);
    });
};

MockObjectStore.prototype.fail = function fail(reason) {
    this.error = reason;
};

module.exports = MockObjectStore;
