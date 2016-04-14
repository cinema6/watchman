'use strict';

var Q = require('q');
var handlebars = require('handlebars');
var logger = require('cwrx/lib/logger.js');

/**
* This action write an entry to the configured log file.
*
* Supported options:
*   text - The text to write to the log file. Supports handlebars notation for including messages
*          from the data object. This option defaults to an empty string.
*   level - The log level to use when writing text. This option can be either trace, info, warn, or
*           error. This option defaults to trace.
*
* Required data:
*   There is no required data for this action. However, if you reference data from the text option
*   it should be present.
*/
module.exports = function logFactory() {
    return function logAction(event) {
        var data = event.data;
        var options = event.options;

        var text = options.text || '';
        var level = options.level || 'trace';

        if(['trace', 'info', 'warn', 'error'].indexOf(level) === -1) {
            return Q.reject('invalid log level');
        } else {
            var log = logger.getLog();
            log[level](handlebars.compile(text)(data));
            return Q.resolve();
        }
    };
};
