'use strict';

var JsonProducer = require('rc-kinesis').JsonProducer;
var Q = require('q');
var enums = require('cwrx/lib/enums.js');
var logger = require('cwrx/lib/logger.js');

module.exports = function(config) {
    return function (event) {
        var data = event.data;
        var campaign = data.campaign;
        var log = logger.getLog();
        var producerConfig = config.kinesis.producer;
        var watchmanProducer = new JsonProducer(producerConfig.stream, producerConfig);

        function campaignEnded() {
            if(campaign && campaign.cards && campaign.cards.length > 0 &&
                    campaign.cards[0].campaign && campaign.cards[0].campaign.endDate) {
                var endDate = new Date(campaign.cards[0].campaign.endDate);
                return (endDate < Date.now());
            } else {
                return false;
            }
        }

        function campaignReachedBudget() {
            if(data.analytics && data.analytics.summary && data.analytics.summary.totalSpend &&
                    campaign && campaign.pricing && campaign.pricing.budget) {
                var budget = parseInt(parseFloat(campaign.pricing.budget) * 1000, 10);
                var spend = parseInt(parseFloat(data.analytics.summary.totalSpend) *  1000, 10);
                return (spend >= budget);
            } else {
                return false;
            }
        }

        return Q.resolve().then(function() {
            if(campaignEnded() && campaign.status !== enums.Status.Expired) {
                log.info('Campaign %1 (%2) ended at %3', campaign.name, campaign.id,
                    campaign.cards[0].campaign.endDate);
                return watchmanProducer.produce({
                    type: 'campaignExpired',
                    data: {
                        campaign: campaign,
                        date: new Date()
                    }
                });
            } else if(campaignReachedBudget() && campaign.status !== enums.Status.OutOfBudget) {
                log.info('Campaign %1 (%2) reached budget of %3', campaign.name, campaign.id,
                    campaign.pricing.budget);
                return watchmanProducer.produce({
                    type: 'campaignReachedBudget',
                    data: {
                        campaign: campaign,
                        date: new Date()
                    }
                });
            }
        });
    };
};
