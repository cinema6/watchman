'use strict';

var EventProcessor = require('./EventProcessor.js');
var util = require('util');

/**
* An EventProcessor used to process cwrx messages.
*
* @class CwrxEventProcessor
* @constructor
*/
function CwrxEventProcessor(config) {
    EventProcessor.apply(this, ['cwrx', config]);
}

util.inherits(CwrxEventProcessor, EventProcessor);

CwrxEventProcessor.prototype = Object.create(EventProcessor.prototype, {
    recordToEvent: {
        value: function(message) {
            return (message.type) ? {
                name: message.type,
                data: message.data || null
            } : null;
        }
    }
});

module.exports = CwrxEventProcessor;
