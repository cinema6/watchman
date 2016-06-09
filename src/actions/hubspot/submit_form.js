var Q = require('q');
var ld = require('lodash');
var logger = require('cwrx/lib/logger.js');
var requestUtils = require('cwrx/lib/requestUtils.js');
var url = require('url');

module.exports = function factory() {
    'use strict';
    var log = logger.getLog();

    return function action(event) {
        var data = event.data;
        var options = event.options;
        var body = { };
        var context = { };

        if(!options.portal) {
            return Q.reject('Must provide a portal id.');
        }
        if(!options.form) {
            return Q.reject('Must provide a form id.');
        }
        if(!data.user) {
            return Q.reject('Data must contain a user.');
        }

        ld.assignIn(body, {
            firstname: data.user.firstName,
            lastname: data.user.lastName,
            email: data.user.email
        });

        if(data.hubspot && data.hubspot.hutk) {
            context.hutk = data.hubspot.hutk;
        }
        /* jshint camelcase:false */
        body.hs_context = JSON.stringify(context);
        /* jshint camelcase:true */

        return requestUtils.qRequest('post', {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            uri: 'https://forms.hubspot.com/uploads/form/v2/' +
                options.portal + '/' + options.form,
            body: url.format({ query: body }).slice(1)
        }).then(function(response) {
            var statusCode = response.response.statusCode;

            if(statusCode === 204 || statusCode === 302) {
                log.info('Successfully submitted form %1 to portal %2 for user %3',
                    options.form, options.portal, data.user.id);
            } else {
                log.error('Error submitting form %1 to portal %2 for user %3, ' +
                    'code: %4 body: %5', options.form, options.portal, data.user.id,
                    statusCode, response.body);
            }
        });
    };
};
