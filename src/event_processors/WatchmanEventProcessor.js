'use strict';

var EventProcessor = require('./EventProcessor.js');
var util = require('util');

/**
* An EventProcessor used to process watchman messages.
*
* @class WatchmanEventProcessor
* @constructor
*/
function WatchmanEventProcessor(config) {
    EventProcessor.apply(this, ['watchman', config]);
}

util.inherits(WatchmanEventProcessor, EventProcessor);

WatchmanEventProcessor.prototype = Object.create(EventProcessor.prototype, {
    recordToEvent: {
        value: function(message) {
            return (message.type) ? {
                name: message.type,
                data: message.data || null
            } : null;
        }
    }
});

module.exports = WatchmanEventProcessor;
