'use strict';

var clone = require('lodash/clone');
var defaults = require('lodash/defaultsDeep');
var requestUtils = require('cwrx/lib/requestUtils');
var inherits = require('util').inherits;
var inspect = require('util').inspect;

function RequestError(cause) {
    this.name = 'RequestError';
    this.message = inspect(cause);
    this.cause = cause;
}
inherits(RequestError, Error);

function StatusCodeError(statusCode, message) {
    this.name = 'StatusCodeError';
    this.message = statusCode + ' - ' + inspect(message);
    this.statusCode = statusCode;
}
inherits(StatusCodeError, Error);

function CwrxRequest(appCreds) {
    this.creds = Object.freeze(clone(appCreds));
}

CwrxRequest.prototype.send = function send(method/*, options*/) {
    var options = defaults((typeof arguments[1] === 'string') ? {
        url: arguments[1]
    } : clone(arguments[1]), {
        json: true
    });

    return requestUtils.makeSignedRequest(this.creds, method, options)
        .catch(function makeRequestError(reason) {
            throw new RequestError(reason);
        })
        .then(function makeResponse(data) {
            var response = data.response;
            var body = data.body;
            var statusCode = response.statusCode;

            if (/^2/.test(statusCode)) {
                return [body, response];
            }

            throw new StatusCodeError(statusCode, body);
        });
};

['get', 'post', 'put', 'delete'].forEach(function makeShorthandMethod(method) {
    CwrxRequest.prototype[method] = function send(options) {
        return this.send(method, options);
    };
});

module.exports = CwrxRequest;
