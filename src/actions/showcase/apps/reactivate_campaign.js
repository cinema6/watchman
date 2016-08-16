'use strict';

const Showcase = require('../../../../lib/showcase');
const BeeswaxMiddleware = require('../../../../lib/BeeswaxMiddleware');
const logger = require('cwrx/lib/logger');
const util = require('util');

module.exports = function factory(config) {
    const log = logger.getLog();
    const showcase = Showcase(config);
    const beeswax = new BeeswaxMiddleware(
        { apiRoot: config.beeswax.apiRoot, creds: config.state.secrets.beeswax},
        { creds: config.appCreds, api: config.cwrx.api }
    );

    return event => {
        const data = event.data;
        const campaign = data.campaign;

        return beeswax.reactivateCampaign(campaign).then(() =>
            showcase.rebalance(campaign.org)
        ).catch(error => {
            log.error(`There was a problem reactivating campaign ${campaign.id}: ` +
                `${util.inspect(error)}`);
        });
    };
};
