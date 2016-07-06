'use strict';

const ld = require('lodash');
const jsdom = require('jsdom');

class ChartComposer {
    constructor() {
        this.chartLibPath = require.resolve('chart.js/dist/Chart.min.js');
    }

    compose(chart, options) {
        // Need to disable animation and responsiveness to generate a static chart image
        ld.assign(chart.options, {
            animation: false,
            responsive: false
        });
        return new Promise((resolve, reject) => {
            jsdom.env('', [this.chartLibPath], (error, window) => {
                if(error) {
                    reject(error);
                } else {
                    // Create a canvas element
                    const canvas = window.document.createElement('canvas');
                    canvas.width = options.width;
                    canvas.height = options.height;
                    window.document.body.appendChild(canvas);

                    // Render the chart
                    new window.Chart(canvas, chart);
                    const data = canvas.toDataURL();
                    resolve(data);
                }
            });
        });
    }
}
module.exports = ChartComposer;
