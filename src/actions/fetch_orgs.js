'use strict';

var CwrxEntities = require('../../lib/CwrxEntities');
var resolveURL = require('url').resolve;
var q = require('q');
var JsonProducer = require('rc-kinesis').JsonProducer;
var hl = require('highland');

module.exports = function fetchOrgsFactory(config) {
    return function fetchOrgs(event) {
        return new q.Promise(function fetch(resolve, reject) {
            var options = event.options;
            var data = event.data;
            var date = data.date;
            var watchmanStreamConfig = config.kinesis.producer;
            var prefix = options.prefix ? (options.prefix + '_') : '';
            var orgsEndpoint = resolveURL(config.cwrx.api.root, config.cwrx.api.orgs.endpoint);
            var orgs = new CwrxEntities(orgsEndpoint, config.appCreds);
            var watchmanStream = new JsonProducer(watchmanStreamConfig.stream, watchmanStreamConfig)
                .createWriteStream();

            return hl(orgs.on('error', reject))
                .flatten()
                .map(function createStreamData(org) {
                    return {
                        type: prefix + 'orgPulse',
                        data: {
                            org: org,
                            date: date
                        }
                    };
                })
                .errors(reject)
                .pipe(watchmanStream.on('error', reject).on('finish', resolve));
        });
    };
};
