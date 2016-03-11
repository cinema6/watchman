'use strict';

var EventProcessor = require('./EventProcessor.js');

/**
* An EventProcessor used to process cwrx messages.
*
* @class CwrxEventProcessor
* @constructor
*/
function CwrxEventProcessor(config) {
    EventProcessor.apply(this, ['cwrx', config]);
}
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
CwrxEventProcessor.prototype.constructor = CwrxEventProcessor;

module.exports = CwrxEventProcessor;
