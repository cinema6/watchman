'use strict';

var DuplexStream = require('readable-stream').Duplex;
var inherits = require('util').inherits;
var CwrxRequest = require('./CwrxRequest');
var ld = require('lodash');

function CwrxEntities(endpoint, appCreds) {
    DuplexStream.call(this, {
        objectMode: true,
        highWaterMark: 50
    }); // call super()

    this.__private__ = {
        request: new CwrxRequest(appCreds),
        endpoint: endpoint,
        length: 0
    };
}
inherits(CwrxEntities, DuplexStream);

CwrxEntities.prototype._read = function _read(size) {
    var self = this;
    var request = this.__private__.request;
    var endpoint = this.__private__.endpoint;

    request.get({
        url: endpoint,
        qs: {
            limit: size,
            skip: this.__private__.length,
            sort: 'created,1'
        }
    }).spread(function process(entities) {
        if (entities.length === 0) { return self.push(null); }

        self.__private__.length += entities.length;
        self.push(entities);
    }).catch(function emitError(reason) {
        self.emit('error', reason);
    });
};

CwrxEntities.prototype._write = function _write(chunk, encoding, callback) {
    var request = this.__private__.request;
    var options = ld.assign({}, chunk, { url: this.__private__.endpoint });

    request.post(options).then(function succeed() { return callback(); }).catch(callback);
};

CwrxEntities.prototype.emit = function emit(event, data) {
    switch (event) {
        case 'data':
            data.forEach(function(item) {
                return DuplexStream.prototype.emit.call(this, event, item);
            }, this);
            return this;
        default:
            return DuplexStream.prototype.emit.apply(this, arguments);
    }
};

module.exports = CwrxEntities;
