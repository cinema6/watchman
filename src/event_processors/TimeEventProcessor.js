'use strict';

var EventProcessor = require('./EventProcessor.js');

/**
* An EventProcessor used to process time messages.
*
* @class TimeEventProcessor
* @constructor
*/
function TimeEventProcessor(config) {
    EventProcessor.apply(this, ['time', config]);
}
TimeEventProcessor.prototype = Object.create(EventProcessor.prototype, {
    recordToEvent: {
        value: function(message) {
            return (message.type) ? {
                name: message.type,
                data: message.data || null
            } : null;
        }
    }
});
TimeEventProcessor.prototype.constructor = TimeEventProcessor;

module.exports = TimeEventProcessor;
