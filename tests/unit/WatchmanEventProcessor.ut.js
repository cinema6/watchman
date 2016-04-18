'use strict';

var ActionsReporter = require('../../lib/ActionsReporter.js');
var EventProcessor = require('../../src/event_processors/EventProcessor.js');
var WatchmanEventProcessor = require('../../src/event_processors/WatchmanEventProcessor.js');

describe('WatchmanEventProcessor.js', function() {
    var watchmanEventProcessor;

    beforeEach(function() {
        spyOn(ActionsReporter.prototype, 'autoflush');
        spyOn(EventProcessor.prototype, 'loadActions');
        watchmanEventProcessor = new WatchmanEventProcessor('config');
    });

    it('should be an EventProcessor', function() {
        expect(watchmanEventProcessor).toEqual(jasmine.any(EventProcessor));
    });

    describe('the constructor', function() {
        it('should call the super constructor', function() {
            expect(watchmanEventProcessor.config).toBe('config');
            expect(watchmanEventProcessor.name).toBe('watchman');
        });
    });

    describe('the recordToEvent method', function() {
        it('should correctly map messages', function() {
            var input = [
                { type: 'tick' },
                { type: 'other' },
                { type: 'foo', data: 'data' },
                { type: null }
            ];
            var expected = [
                { name: 'tick', data: null },
                { name: 'other', data: null },
                { name: 'foo', data: 'data' },
                null
            ];
            input.forEach(function(message, index) {
                expect(watchmanEventProcessor.recordToEvent(message)).toEqual(expected[index]);
            });
        });
    });
});
