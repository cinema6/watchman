'use strict';

var EventProcessor = require('./EventProcessor.js');

/**
* An EventProcessor used to process watchman messages.
*
* @class WatchmanRecordProcessor
* @constructor
*/
function WatchmanEventProcessor(config) {
    EventProcessor.apply(this, ['watchman', config]);
}
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
WatchmanEventProcessor.prototype.constructor = WatchmanEventProcessor;

module.exports = WatchmanEventProcessor;
