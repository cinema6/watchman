'use strict';

var JsonProducer = require('../producers/JsonProducer.js');
var Q = require('q');
var logger = require('cwrx/lib/logger.js');

module.exports = function(data, options, config) {
    var log = logger.getLog();
    var producerConfig = config.kinesis.producer;
    var watchmanProducer = new JsonProducer(producerConfig.stream, producerConfig);

    function campaignEnded() {
        if(data.campaign && data.campaign.cards && data.campaign.cards.length > 0 &&
                data.campaign.cards[0].campaign && data.campaign.cards[0].campaign.endDate) {
            var endDate = new Date(data.campaign.cards[0].campaign.endDate);
            return (endDate < Date.now());
        } else {
            return false;
        }
    }

    function campaignReachedBudget() {
        if(data.analytics && data.analytics.summary && data.analytics.summary.totalSpend &&
                data.campaign && data.campaign.pricing && data.campaign.pricing.budget) {
            var budget = parseInt(parseFloat(data.campaign.pricing.budget) * 1000, 10);
            var spend = parseInt(parseFloat(data.analytics.summary.totalSpend) *  1000, 10);
            return (spend >= budget);
        } else {
            return false;
        }
    }

    return Q.resolve().then(function() {
        if(campaignEnded() && data.campaign.status !== 'expired') {
            log.trace('Campaign %1 ended at %2', data.campaign.id,
                data.campaign.cards[0].campaign.endDate);
            return watchmanProducer.produce({
                type: 'campaignExpired',
                data: {
                    campaign: data.campaign
                }
            });
        } else if(campaignReachedBudget() && data.campaign.status !== 'outOfBudget') {
            log.trace('Campaign %1 reached budget of %2', data.campaign.id,
                data.campaign.pricing.budget);
            return watchmanProducer.produce({
                type: 'campaignReachedBudget',
                data: {
                    campaign: data.campaign
                }
            });
        }
    });
};
