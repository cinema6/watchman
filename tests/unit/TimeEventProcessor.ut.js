'use strict';

var EventProcessor = require('../../src/event_processors/EventProcessor.js');
var TimeEventProcessor = require('../../src/event_processors/TimeEventProcessor.js');

describe('TimeEventProcessor.js', function() {
    var timeEventProcessor;

    beforeEach(function() {
        spyOn(EventProcessor.prototype, 'loadActions');
        timeEventProcessor = new TimeEventProcessor('config');
    });

    it('should be an EventProcessor', function() {
        expect(timeEventProcessor).toEqual(jasmine.any(EventProcessor));
    });

    describe('the constructor', function() {
        it('should call the super constructor', function() {
            expect(timeEventProcessor.config).toBe('config');
            expect(timeEventProcessor.name).toBe('time');
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
                expect(timeEventProcessor.recordToEvent(message)).toEqual(expected[index]);
            });
        });
    });
});
