'use strict';

const Showcase = require('../../../../lib/showcase');
const BeeswaxMiddleware = require('../../../../lib/BeeswaxMiddleware');
const logger = require('cwrx/lib/logger');
const util = require('util');
const rcKinesis = require('rc-kinesis');

module.exports = function factory(config) {
    const log = logger.getLog();
    const showcase = Showcase(config);
    const producer = new rcKinesis.JsonProducer(config.kinesis.producer.stream,
        config.kinesis.producer);
    const beeswax = new BeeswaxMiddleware(
        { apiRoot: config.beeswax.apiRoot, creds: config.state.secrets.beeswax},
        { creds: config.appCreds, api: config.cwrx.api }
    );

    // Return the action function
    return event => {
        const data = event.data;
        const campaign = data.campaign;

        return beeswax.reactivateCampaign(campaign).then(() =>
            showcase.rebalance(campaign.org)
        ).then(() =>
            producer.produce({
                type: 'reactivateCampaignSuccess',
                data: { campaign }
            })
        ).catch(error => {
            log.error(`There was a problem reactivating campaign ${campaign.id}: ` +
                `${util.inspect(error)}`);

            return producer.produce({
                type: 'reactivateCampaignFailure',
                data: {
                    campaign,
                    error: error.message
                }
            });
        });
    };
};
