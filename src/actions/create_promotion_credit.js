'use strict';

var q               = require('q'),
    util            = require('util'),
    logger          = require('cwrx/lib/logger.js'),
    requestUtils    = require('cwrx/lib/requestUtils.js');

module.exports = function(config) {
    return function (event) {
        var log = logger.getLog();
        var appCreds = config.appCreds;
        var org = event.data.org;
        var promotion = event.data.promotion;
        
        if (!org || !promotion) {
            return q();
        }
        
        var amount;

        switch (promotion.type) {
            case 'signupReward':
                amount = promotion.data.rewardAmount;
                break;
            default:
                log.warn('Dont know how to get amount for promotion type %1 (id %2)',
                         promotion.type, promotion.id);
                return q();
        }
        
        return requestUtils.makeSignedRequest(appCreds, 'post', {
            url: config.cwrx.api.root + config.cwrx.api.transactions.endpoint,
            json: {
                amount: amount,
                org: org.id,
                promotion: promotion.id
            }
        })
        .then(function(resp) {
            if (resp.response.statusCode !== 201) {
                return q.reject({
                    message: 'Error creating transaction',
                    reason: { code: resp.response.statusCode, body: resp.body }
                });
            }
        
            log.info('Created transaction %1 (amount = %2) for promotion %3 for org %4',
                     resp.body.id, resp.body.amount, promotion.id, org.id);
        })
        .catch(function(error) {
            log.error('Error creating credit for promotion %1 for org %2: %3',
                      promotion.id, org.id, util.inspect(error));
        });
    };
};
