'use strict';

var EventProcessor = require('./EventProcessor.js');
var util = require('util');

/**
* An EventProcessor used to process time messages.
*
* @class TimeEventProcessor
* @constructor
*/
function TimeEventProcessor(config) {
    EventProcessor.apply(this, ['time', config]);
}

util.inherits(TimeEventProcessor, EventProcessor);

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

module.exports = TimeEventProcessor;
