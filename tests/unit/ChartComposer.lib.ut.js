'use strict';

const ChartComposer = require('../../lib/ChartComposer.js');
const jsdom = require('jsdom');

describe('ChartComposer', function() {
    beforeEach(function() {
        this.composer = new ChartComposer();
        this.mockCanvas = {
            toDataURL: jasmine.createSpy('toDataURL')
        };
        this.mockWindow = {
            document: {
                createElement: jasmine.createSpy('createElement'),
                body: {
                    appendChild: jasmine.createSpy('appendChild')
                }
            },
            Chart: jasmine.createSpy('Chart')
        };
        spyOn(jsdom, 'env');
    });

    it('should exist', function() {
        expect(this.composer).toBeDefined();
        expect(this.composer).toEqual(jasmine.any(ChartComposer));
    });

    it('should be able to compose a chart', function(done) {
        jsdom.env.and.callFake((html, script, callback) => {
            callback(null, this.mockWindow);
        });
        this.mockWindow.document.createElement.and.returnValue(this.mockCanvas);
        this.mockCanvas.toDataURL.and.returnValue('data');

        this.composer.compose('options', {
            width: 100,
            height: 200
        }).then(data => {
            expect(jsdom.env).toHaveBeenCalledWith('', [require.resolve('chart.js/dist/Chart.min.js')], jasmine.any(Function));
            expect(this.mockWindow.document.createElement).toHaveBeenCalledWith('canvas');
            expect(this.mockCanvas.width).toBe(100);
            expect(this.mockCanvas.height).toBe(200);
            expect(this.mockWindow.document.body.appendChild).toHaveBeenCalledWith(this.mockCanvas);
            expect(this.mockWindow.Chart).toHaveBeenCalledWith(this.mockCanvas, 'options');
            expect(this.mockCanvas.toDataURL).toHaveBeenCalledWith();
            expect(data).toBe('data');
        }).then(done, done.fail);
    });

    it('should reject if composing a chart fails', function(done) {
        jsdom.env.and.callFake((html, script, callback) => {
            callback('epic fail');
        });

        this.composer.compose('options', 100, 200).then(done.fail, error => {
            expect(error).toBe('epic fail');
        }).then(done, done.fail);
    });
});
