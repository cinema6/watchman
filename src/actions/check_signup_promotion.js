'use strict';

var q               = require('q'),
    util            = require('util'),
    urlUtils        = require('url'),
    rcKinesis       = require('rc-kinesis'),
    logger          = require('cwrx/lib/logger.js'),
    requestUtils    = require('cwrx/lib/requestUtils.js');

function sendRequest(creds, method, opts) {
    return requestUtils.makeSignedRequest(creds, method, opts).then(function(resp) {
        if (resp.response.statusCode !== 200) {
            return q.reject({
                message: 'Error calling ' + method.toUpperCase() + ' ' + opts.url,
                reason: { code: resp.response.statusCode, body: resp.body }
            });
        }
        return resp.body;
    });
}

// Check if a user signed up with a promotion; if so, add the promotion to their org's promotions
// array and publish a 'promotionFulfilled' event.
module.exports = function(config) {
    return function (event) {
        var log = logger.getLog();
        var appCreds = config.appCreds;
        var producerConfig = config.kinesis.producer;
        var watchmanProducer = new rcKinesis.JsonProducer(producerConfig.stream, producerConfig);
        var user = event.data.user;
        
        if (!user || !user.promotion) {
            return q();
        }
        
        // Fetch the user's org + promotion
        var orgUrl = urlUtils.resolve(config.cwrx.api.root, config.cwrx.api.orgs.endpoint),
            promUrl = urlUtils.resolve(config.cwrx.api.root,config.cwrx.api.promotions.endpoint);

        return q.all([
            sendRequest(appCreds, 'get', { url: urlUtils.resolve(orgUrl, user.org) }),
            sendRequest(appCreds, 'get', { url: urlUtils.resolve(promUrl, user.promotion) }),
        ])
        .spread(function(org, promotion) {
            org.promotions = org.promotions || [];

            // Warn and exit if org already has this same promotion
            var existing = org.promotions.filter(function(promWrapper) {
                return promWrapper.id === promotion.id;
            })[0];
            if (!!existing) {
                log.warn('Org %1 already has signup promotion %2, not re-applying',
                         org.id, promotion.id);
                return q();
            }
            
            // Add the new promotion to the org's promotions array and PUT the org
            org.promotions.push({ id: promotion.id, date: new Date() });
            
            return sendRequest(appCreds, 'put', {
                url: urlUtils.resolve(orgUrl, org.id),
                json: org
            })
            .then(function(updated) {
                org = updated;
                
                log.info('Applied signup promotion %1 from user %2 to org %3',
                         promotion.id, user.id, org.id);
                
                // Produce promotionFulfilled event so credit can be created
                return watchmanProducer.produce({
                    type: 'promotionFulfilled',
                    data: {
                        org: org,
                        promotion: promotion
                    }
                });
            });
        })
        .catch(function(error) {
            log.error('Error checking signup promotion on user %1: %2', util.inspect(error));
        });
    };
};
