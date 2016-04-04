'use strict';

var ReadableStream = require('readable-stream').Readable;
var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;

function ObjectSource() {
    EventEmitter.call(this);

    this.isDone = false;
    this.items = [];
    this.error = null;
}
inherits(ObjectSource, EventEmitter);

ObjectSource.prototype.add = function add(items, done) {
    this.items.push.apply(this.items, items);

    if (items.length > 0) {
        this.emit('add', items);
    }

    if (done) { this.done(); }
};

ObjectSource.prototype.pull = function pull() {
    var item;

    if (this.error) { throw this.error; }

    if (this.items.length === 0) { return null; }

    item = this.items.shift();

    if (this.items.length === 0 && this.isDone) { this.emit('done'); }

    return item;
};

ObjectSource.prototype.done = function done() {
    this.isDone = true;

    if (this.items.length === 0) { this.emit('done'); }
};

ObjectSource.prototype.fail = function fail(reason) {
    this.error = reason;
};

function MockObjectStream() {
    ReadableStream.call(this, { objectMode: true });

    this.source = new ObjectSource();
}
inherits(MockObjectStream, ReadableStream);

MockObjectStream.prototype._read = function _read() {
    var self = this;
    var item = pull();

    function pull() {
        try { return self.source.pull(); } catch (error) { self.emit('error', error); }
    }

    if (item || this.source.isDone) {
        process.nextTick(function() {
            self.push(item);
        });
    } else {
        this.source.once('add', function() {
            self.push(pull());
        });
    }
};

module.exports = MockObjectStream;
