'use strict';

var ActionsReporter = require('../../lib/ActionsReporter.js');
var CwrxEventProcessor = require('../../src/event_processors/CwrxEventProcessor.js');
var EventProcessor = require('../../src/event_processors/EventProcessor.js');

describe('CwrxEventProcessor.js', function() {
    var cwrxEventProcessor;

    beforeEach(function() {
        spyOn(ActionsReporter.prototype, 'autoflush');
        spyOn(EventProcessor.prototype, 'loadActions');
        cwrxEventProcessor = new CwrxEventProcessor('config');
    });

    it('should be an EventProcessor', function() {
        expect(cwrxEventProcessor).toEqual(jasmine.any(EventProcessor));
    });

    describe('the constructor', function() {
        it('should call the super constructor', function() {
            expect(cwrxEventProcessor.config).toBe('config');
            expect(cwrxEventProcessor.name).toBe('cwrx');
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
                expect(cwrxEventProcessor.recordToEvent(message)).toEqual(expected[index]);
            });
        });
    });
});
