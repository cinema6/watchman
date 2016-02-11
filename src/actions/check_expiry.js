'use strict';

var JsonProducer = require('../producers/JsonProducer.js');
var Q = require('q');
var logger = require('cwrx/lib/logger.js');

module.exports = function(data, options, config) {
    var log = logger.getLog();
    var producerConfig = config.kinesis.producer;
    var watchmanProducer = new JsonProducer(producerConfig.stream, producerConfig);

    return Q.resolve().then(function() {
        if(data.campaign && data.campaign.cards && data.campaign.cards.length > 0 &&
                data.campaign.cards[0].campaign && data.campaign.cards[0].campaign.endDate) {
            var endDate = new Date(data.campaign.cards[0].campaign.endDate);
            if(endDate < Date.now()) {
                log.trace('Campaign %1 ended at %2', data.campaign.id, endDate);
                return watchmanProducer.produce({
                    type: 'campaignExpired',
                    data: {
                        campaign: data.campaign
                    }
                });
            }
        }
    });
};
